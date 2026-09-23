import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import log_event


def _rid(request: Request) -> str:
    return getattr(request.state, "request_id", "")


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Never echo the submitted input back (FastAPI's default does).
        details = [
            {"loc": [str(p) for p in e.get("loc", [])], "msg": e.get("msg", ""), "type": e.get("type", "")}
            for e in exc.errors()
        ][:20]
        log_event("INVALID_ACTION", logging.INFO, path=request.url.path, errors=len(details))
        return JSONResponse(
            {"error": "invalid_request", "details": details, "request_id": _rid(request)}, status_code=422
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = exc.detail if isinstance(exc.detail, str) else "error"
        if exc.status_code == 404:
            code = "not_found"
        return JSONResponse(
            {"error": code, "request_id": _rid(request)},
            status_code=exc.status_code,
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        logging.getLogger("magiclash").exception("unhandled error", extra={"data": {"path": request.url.path}})
        return JSONResponse({"error": "internal_error", "request_id": _rid(request)}, status_code=500)
