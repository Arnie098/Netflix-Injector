from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import List, Optional
from utils.supabase_client import supabase_injector

router = APIRouter(
    prefix="/v1/cookies",
    tags=["cookies"]
)

class ReportCookieRequest(BaseModel):
    cookie_id: int
    reason: str

@router.post("/report")
async def report_cookie(request: ReportCookieRequest):
    # In a real scenario, validate the reporting user has a valid license first
    # For now, just mark the cookie or log the report
    try:
        # Example: Decrement score or update status
        # For this MVP, we'll just log it. 
        # Ideally, call an RPC 'report_broken_cookie'
        return {"status": "received", "message": "Report logged"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stats")
async def get_stats():
    # Admin only endpoint ideally
    try:
        response = supabase_injector.table("cookie_sessions").select("count", count="exact").execute()
        return {"total_cookies": response.count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
