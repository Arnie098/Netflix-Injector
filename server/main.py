from fastapi import FastAPI
from routers import licenses, cookies, analytics, admin
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from utils.limiter import limiter

from fastapi.staticfiles import StaticFiles
import os

app = FastAPI(
    title="Netflix Injector API",
    description="Secure Backend for Netflix Injector",
    version="1.0.0"
)

# Mount the admin dashboard static files
# On Render, we'll copy the dist folder into the server directory during build
dashboard_path = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(dashboard_path):
    app.mount("/admin", StaticFiles(directory=dashboard_path, html=True), name="admin")

# Enable CORS for the admin dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your specific domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(licenses.router)
app.include_router(cookies.router)
app.include_router(analytics.router)
app.include_router(admin.router)

@app.get("/")
async def root():
    return {"status": "online", "message": "Netflix Injector API is running"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
