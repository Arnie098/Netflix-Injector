"""
Admin Tools API - License Management & Cookie Pool Management
"""
from fastapi import APIRouter, HTTPException, Query, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List
from pydantic import BaseModel
import os
import logging
import string
import random
from utils.supabase_client import supabase_injector

router = APIRouter(
    prefix="/v1/admin",
    tags=["admin-tools"]
)

logger = logging.getLogger("admin_tools")
security = HTTPBearer()


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    expected_key = os.getenv("ADMIN_API_KEY", "admin_secret_key_123")
    if credentials.credentials != expected_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API Key",
        )
    return credentials.credentials


# ============================================================
# LICENSE MANAGEMENT
# ============================================================

class CreateLicenseRequest(BaseModel):
    prefix: str = "PHC"
    count: int = 1
    expiration_days: Optional[int] = None


class UpdateLicenseRequest(BaseModel):
    is_active: Optional[bool] = None
    hardware_id: Optional[str] = None  # Set to "" to clear binding
    expiration_date: Optional[str] = None


@router.get("/licenses")
async def list_licenses(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    status_filter: Optional[str] = None,  # "active", "inactive", "bound", "unbound"
    token: str = Depends(verify_token)
):
    """List all license keys with pagination and filtering."""
    try:
        start = (page - 1) * page_size
        end = start + page_size - 1

        query = supabase_injector.table("licenses").select("*", count="exact").order("created_at", desc=True).range(start, end)

        if search:
            query = query.or_(f"license_key.ilike.%{search}%,hardware_id.ilike.%{search}%")

        if status_filter == "active":
            query = query.eq("is_active", True)
        elif status_filter == "inactive":
            query = query.eq("is_active", False)
        elif status_filter == "bound":
            query = query.neq("hardware_id", None).neq("hardware_id", "")
        elif status_filter == "unbound":
            query = query.is_("hardware_id", "null")

        response = query.execute()

        return {
            "data": response.data,
            "total": response.count,
            "page": page,
            "page_size": page_size
        }
    except Exception as e:
        logger.error(f"LIST_LICENSES_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/licenses")
async def create_licenses(body: CreateLicenseRequest, token: str = Depends(verify_token)):
    """Generate and insert new license keys."""
    try:
        chars = string.ascii_uppercase + string.digits
        created = []

        for _ in range(min(body.count, 50)):  # Cap at 50 per request
            p1 = ''.join(random.choices(chars, k=4))
            p2 = ''.join(random.choices(chars, k=4))
            p3 = ''.join(random.choices(chars, k=4))
            key = f"{body.prefix}-{p1}-{p2}-{p3}"

            record = {"license_key": key, "is_active": True}

            if body.expiration_days:
                from datetime import datetime, timedelta
                exp = datetime.utcnow() + timedelta(days=body.expiration_days)
                record["expiration_date"] = exp.isoformat()

            response = supabase_injector.table("licenses").insert(record).execute()
            if response.data:
                created.append(response.data[0])

        return {"created": len(created), "licenses": created}
    except Exception as e:
        logger.error(f"CREATE_LICENSES_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/licenses/{license_id}")
async def update_license(license_id: int, body: UpdateLicenseRequest, token: str = Depends(verify_token)):
    """Update a license (activate/deactivate, reset HWID, set expiration)."""
    try:
        updates = {}
        if body.is_active is not None:
            updates["is_active"] = body.is_active
        if body.hardware_id is not None:
            updates["hardware_id"] = body.hardware_id if body.hardware_id != "" else None
        if body.expiration_date is not None:
            updates["expiration_date"] = body.expiration_date

        if not updates:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        response = supabase_injector.table("licenses").update(updates).eq("id", license_id).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="License not found")

        return {"status": "success", "data": response.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"UPDATE_LICENSE_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/licenses/{license_id}")
async def delete_license(license_id: int, token: str = Depends(verify_token)):
    """Permanently delete a license key."""
    try:
        response = supabase_injector.table("licenses").delete().eq("id", license_id).execute()
        return {"status": "success", "message": f"License {license_id} deleted"}
    except Exception as e:
        logger.error(f"DELETE_LICENSE_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# COOKIE POOL MANAGEMENT
# ============================================================

class AddCookieRequest(BaseModel):
    cookies: str  # JSON string of cookie array
    description: str = ""


@router.get("/cookie-pool")
async def list_cookie_pool(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    country: Optional[str] = None,
    token: str = Depends(verify_token)
):
    """List all cookies in the pool with pagination."""
    try:
        start = (page - 1) * page_size
        end = start + page_size - 1

        query = supabase_injector.table("cookie_sessions").select("*", count="exact").order("id", desc=True).range(start, end)

        if search:
            query = query.ilike("description", f"%{search}%")

        if country:
            query = query.ilike("description", f"%COUNTRY: {country}%")

        response = query.execute()

        return {
            "data": response.data,
            "total": response.count,
            "page": page,
            "page_size": page_size
        }
    except Exception as e:
        logger.error(f"LIST_COOKIE_POOL_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cookie-pool/stats")
async def cookie_pool_stats(token: str = Depends(verify_token)):
    """Get cookie pool statistics."""
    try:
        total_res = supabase_injector.table("cookie_sessions").select("id", count="exact").execute()
        total = total_res.count or 0

        return {
            "total": total,
        }
    except Exception as e:
        logger.error(f"COOKIE_POOL_STATS_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cookie-pool")
async def add_cookie(body: AddCookieRequest, token: str = Depends(verify_token)):
    """Add a new cookie to the pool."""
    try:
        record = {
            "cookies": body.cookies,
            "description": body.description
        }

        response = supabase_injector.table("cookie_sessions").insert(record).execute()

        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to insert cookie")

        return {"status": "success", "data": response.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ADD_COOKIE_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/cookie-pool/{cookie_id}")
async def delete_cookie(cookie_id: int, token: str = Depends(verify_token)):
    """Remove a cookie from the pool."""
    try:
        response = supabase_injector.table("cookie_sessions").delete().eq("id", cookie_id).execute()
        return {"status": "success", "message": f"Cookie {cookie_id} deleted"}
    except Exception as e:
        logger.error(f"DELETE_COOKIE_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cookie-pool/bulk-delete")
async def bulk_delete_cookies(payload: dict, token: str = Depends(verify_token)):
    """Delete multiple cookies from the pool."""
    try:
        ids = payload.get("ids", [])
        if not ids:
            return {"status": "skipped", "message": "No IDs provided"}

        supabase_injector.table("cookie_sessions").delete().in_("id", ids).execute()
        return {"status": "success", "message": f"Deleted {len(ids)} cookies"}
    except Exception as e:
        logger.error(f"BULK_DELETE_COOKIES_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
