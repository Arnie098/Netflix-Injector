from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional
from utils.supabase_client import supabase
from utils.limiter import limiter

router = APIRouter(
    prefix="/v1/license",
    tags=["license"]
)

class LicenseCheckRequest(BaseModel):
    license_key: str
    hardware_id: str
    country_filter: Optional[str] = None

class LicenseCheckResponse(BaseModel):
    valid: bool
    message: str
    data: Optional[dict] = None

@router.post("/verify", response_model=LicenseCheckResponse)
@limiter.limit("5/minute")
async def verify_license(request: Request, body: LicenseCheckRequest):
    try:
        # Call the Supabase RPC function 'claim_license'
        response = supabase.rpc("claim_license", {
            "p_license_key": body.license_key,
            "p_hardware_id": body.hardware_id,
            "p_include_account": True, # Always try to get account if valid
        }).execute()
        
        result = response.data
        
        if not result:
             return LicenseCheckResponse(valid=False, message="Invalid license or server error")

        # The RPC returns JSON structure, we pass it through
        # But for security, we might want to strip sensitive info if needed
        # For now, we trust the RPC to return what the client needs
        
        is_success = result.get("success", False)
        message = result.get("message", "Unknown error")
        
        return LicenseCheckResponse(
            valid=is_success,
            message=message,
            data=result
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
