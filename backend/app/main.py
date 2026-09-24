from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health, internal, leaderboard, online, profiles
from app.repositories.supabase import SupabaseClient, SupabaseGateway
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.security.errors import install_error_handlers
from app.security.middleware import BodySizeLimitMiddleware, RateLimitMiddleware, SecurityHeadersMiddleware
from app.security.rate_limit import InMemoryRateLimiter, RateLimiter


def create_app(
    settings: Settings | None = None,
    limiter: RateLimiter | None = None,
    supabase: SupabaseGateway | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if app.state.supabase is None and settings.supabase_url and settings.supabase_service_role_key:
            app.state.supabase = SupabaseClient(settings)
        yield
        if isinstance(app.state.supabase, SupabaseClient):
            await app.state.supabase.aclose()

    app = FastAPI(
        lifespan=lifespan,
        title="MagiClash API",
        version=settings.version,
        # Interactive docs only outside production.
        docs_url=None if settings.is_production else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/api/openapi.json",
    )
    app.state.settings = settings
    app.state.supabase = supabase

    # add_middleware wraps: the LAST added runs FIRST.
    # Request order: body limit → security headers → CORS → rate limit → routes.
    app.add_middleware(RateLimitMiddleware, limiter=limiter or InMemoryRateLimiter(settings.rate_limit_per_minute))
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_credentials=False,  # auth uses bearer tokens, not cookies
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
        max_age=600,
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        BodySizeLimitMiddleware,
        max_bytes=settings.max_body_bytes,
        overrides={"/api/profiles/me/avatar": 600 * 1024},
    )

    install_error_handlers(app)
    app.include_router(health.router, prefix="/api")
    app.include_router(profiles.router, prefix="/api")
    app.include_router(online.router, prefix="/api")
    app.include_router(internal.router, prefix="/api")
    app.include_router(leaderboard.router, prefix="/api")
    return app


app = create_app()
