from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from utils.supabase_client import supabase

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
async def verify_license(request: LicenseCheckRequest):
    try:
        # Call the Supabase RPC function 'claim_license'
        response = supabase.rpc("claim_license", {
            "p_license_key": request.license_key,
            "p_hardware_id": request.hardware_id,
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
