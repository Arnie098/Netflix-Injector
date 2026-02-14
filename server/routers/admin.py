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
