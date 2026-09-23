from fastapi import APIRouter, Request

from app.core.config import Settings
from app.schemas.common import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    s: Settings = request.app.state.settings
    return HealthResponse(status="ok", version=s.version, env=s.env)
