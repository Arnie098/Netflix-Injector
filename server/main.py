from fastapi import FastAPI
from routers import licenses, cookies
import uvicorn
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from utils.limiter import limiter

app = FastAPI(
    title="Netflix Injector API",
    description="Secure Backend for Netflix Injector",
    version="1.0.0"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(licenses.router)
app.include_router(cookies.router)

@app.get("/")
async def root():
    return {"status": "online", "message": "Netflix Injector API is running"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
