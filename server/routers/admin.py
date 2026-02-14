from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
import logging
from utils.supabase_client import supabase_audit

router = APIRouter(
    prefix="/v1/admin",
    tags=["admin"]
)

logger = logging.getLogger("admin")

@router.get("/captures")
async def list_captures(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    domain: Optional[str] = None
):
    """List audit captures with pagination and optional filtering."""
    try:
        start = (page - 1) * page_size
        end = start + page_size - 1

        query = supabase_audit.table("audit_captures").select("*", count="exact").order("timestamp", descending=True).range(start, end)
        
        if domain:
            query = query.ilike("domain", f"%{domain}%")

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
    domain: Optional[str] = None
):
    """List extracted credentials with pagination."""
    try:
        start = (page - 1) * page_size
        end = start + page_size - 1

        query = supabase_audit.table("extracted_credentials").select("*", count="exact").order("timestamp", descending=True).range(start, end)
        
        if domain:
            query = query.ilike("domain", f"%{domain}%")

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
async def delete_capture(capture_id: str):
    """Delete a specific capture record. Note: Associated credentials should be handled by DB cascade or manually."""
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

@router.patch("/credentials/{cred_id}")
async def update_credential(cred_id: int, updates: dict):
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
