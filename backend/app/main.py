from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.security.errors import install_error_handlers
from app.security.middleware import BodySizeLimitMiddleware, RateLimitMiddleware, SecurityHeadersMiddleware
from app.security.rate_limit import InMemoryRateLimiter, RateLimiter


def create_app(settings: Settings | None = None, limiter: RateLimiter | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging()

    app = FastAPI(
        title="MagiClash API",
        version=settings.version,
        # Interactive docs only outside production.
        docs_url=None if settings.is_production else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/api/openapi.json",
    )
    app.state.settings = settings

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
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes)

    install_error_handlers(app)
    app.include_router(health.router, prefix="/api")
    return app


app = create_app()
