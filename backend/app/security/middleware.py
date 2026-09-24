import hashlib
import logging
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import log_event
from app.security.rate_limit import RateLimiter

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Cache-Control": "no-store",
}


def client_ip(request: Request) -> str:
    # Each trusted proxy (Render's load balancer) APPENDS the address it saw. Entries to the left
    # of those were sent by the client and can be forged, so they are never used for rate limits.
    settings = getattr(request.app.state, "settings", None)
    hops = getattr(settings, "trusted_proxy_hops", 1)
    parts = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    if hops > 0 and parts:
        return parts[-hops] if len(parts) >= hops else parts[0]
    return request.client.host if request.client else "unknown"


def ip_hash(ip: str) -> str:
    """IPs are personal data: logs keep only a short hash."""
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request.state.request_id = uuid.uuid4().hex
        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        response.headers["X-Request-ID"] = request.state.request_id
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, limiter: RateLimiter) -> None:
        super().__init__(app)
        self.limiter = limiter

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method == "OPTIONS":
            return await call_next(request)
        ip = client_ip(request)
        if not self.limiter.allow(ip):
            log_event("RATE_LIMIT", logging.WARNING, ip=ip_hash(ip), path=request.url.path)
            return JSONResponse({"error": "rate_limited"}, status_code=429, headers={"Retry-After": "10"})
        return await call_next(request)


class _BodyTooLarge(Exception):
    pass


class BodySizeLimitMiddleware:
    """Rejects bodies above `max_bytes`. Checks Content-Length AND the real stream, since
    a client can lie about Content-Length or use chunked encoding."""

    def __init__(self, app: ASGIApp, max_bytes: int, overrides: dict[str, int] | None = None) -> None:
        self.app = app
        self.default_max = max_bytes
        # Exact-path overrides for the few endpoints that legitimately take bigger bodies.
        self.overrides = overrides or {}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        max_bytes = self.overrides.get(scope.get("path", ""), self.default_max)
        headers = dict(scope.get("headers") or [])
        declared = headers.get(b"content-length")
        if declared is not None:
            try:
                too_big = int(declared) > max_bytes
            except ValueError:
                too_big = True
            if too_big:
                await JSONResponse({"error": "payload_too_large"}, status_code=413)(scope, receive, send)
                return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > max_bytes:
                    raise _BodyTooLarge
            return message

        started = False

        async def tracked_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracked_send)
        except Exception as exc:  # may arrive wrapped in an ExceptionGroup (anyio task groups)
            if not _contains(exc, _BodyTooLarge):
                raise
            if not started:
                await JSONResponse({"error": "payload_too_large"}, status_code=413)(scope, receive, send)


def _contains(exc: BaseException, kind: type[BaseException]) -> bool:
    if isinstance(exc, kind):
        return True
    if isinstance(exc, BaseExceptionGroup):
        return any(_contains(e, kind) for e in exc.exceptions)
    return False
