"""
POLYESTER TITAN AI - Python FastAPI Trading Companion Service
Modular backend intended to run in a Python 3.11+ environment with official polyester-sdk.

SECURITY:
- Testnet only.
- Never prints credentials or private keys in logs.
- Automatic trading is disabled by default.
- Never submits orders during startup or health check.
"""

import os
import logging
import asyncio
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# Safe Logging setup - Never print API credentials or private keys
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [PolyesterTitanFastAPI] %(message)s"
)
logger = logging.getLogger("PolyesterTitanFastAPI")

app = FastAPI(
    title="POLYESTER TITAN AI - Trading Engine Companion",
    description="Python FastAPI trading backend for Polyester Testnet with official SDK integration",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

POLYESTER_API_HOST = os.getenv("POLYESTER_API_HOST", "https://api-testnet.polyester.com").rstrip("/")
POLYESTER_API_KEY_ID = os.getenv("POLYESTER_API_KEY_ID")
POLYESTER_API_PRIVATE_KEY = os.getenv("POLYESTER_API_PRIVATE_KEY")
POLYESTER_ACCOUNT_ID = os.getenv("POLYESTER_ACCOUNT_ID")

AUTO_TRADING_ENABLED = False  # Strictly disabled in Phase 2B
EMERGENCY_HALT = False

class HealthResponse(BaseModel):
    service: str
    status: str
    target_host: str
    testnet_enforced: bool
    credentials_present: Dict[str, bool]
    sdk_status: str
    auto_trading_enabled: bool
    emergency_halt: bool

@app.get("/health", response_model=HealthResponse)
async def health_check():
    sdk_status = "disconnected"
    try:
        from polyester import AsyncPolyester, POLYESTER_TESTNET_ENVIRONMENT
        # Test SDK async context initialization
        async with AsyncPolyester(
            environment=POLYESTER_TESTNET_ENVIRONMENT,
            api_key_id=POLYESTER_API_KEY_ID,
            api_private_key=POLYESTER_API_PRIVATE_KEY
        ) as client:
            if not POLYESTER_API_KEY_ID or not POLYESTER_API_PRIVATE_KEY:
                sdk_status = "credentials_missing"
            else:
                sdk_status = "connected"
    except Exception as exc:
        msg = str(exc).lower()
        if "401" in msg or "unauthorized" in msg:
            sdk_status = "unauthorized"
        elif "403" in msg or "cloudflare" in msg:
            sdk_status = "blocked"
        elif "429" in msg or "rate limit" in msg:
            sdk_status = "rate_limited"
        else:
            sdk_status = "unavailable"

    return HealthResponse(
        service="polyester-titan-fastapi",
        status="healthy",
        target_host=POLYESTER_API_HOST,
        testnet_enforced=True,
        credentials_present={
            "api_key_id": bool(POLYESTER_API_KEY_ID),
            "api_private_key": bool(POLYESTER_API_PRIVATE_KEY),
            "account_id": bool(POLYESTER_ACCOUNT_ID)
        },
        sdk_status=sdk_status,
        auto_trading_enabled=AUTO_TRADING_ENABLED,
        emergency_halt=EMERGENCY_HALT
    )

@app.get("/markets")
async def get_markets():
    try:
        from polyester import AsyncPolyester, POLYESTER_TESTNET_ENVIRONMENT
        async with AsyncPolyester(
            environment=POLYESTER_TESTNET_ENVIRONMENT,
            api_key_id=POLYESTER_API_KEY_ID,
            api_private_key=POLYESTER_API_PRIVATE_KEY
        ) as client:
            if hasattr(client, 'market_overview') and hasattr(client.market_overview, 'list_market_overview'):
                res = await client.market_overview.list_market_overview()
                return {"markets": res, "status": "verified", "source": "official_sdk"}
    except Exception as exc:
        logger.warning(f"SDK market fetch warning: {type(exc).__name__}")
    
    return {
        "markets": [],
        "source": POLYESTER_API_HOST,
        "status": "unavailable",
        "message": "Awaiting active testnet feed via SDK."
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
