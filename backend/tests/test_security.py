import json
import logging

import pytest
from fastapi import Body
from pydantic import ValidationError

from app.core.config import Settings
from app.core.logging import JsonFormatter, redact
from app.schemas.common import StrictModel
from app.security.rate_limit import InMemoryRateLimiter
from tests.conftest import ORIGIN, make_settings


# ── Headers ─────────────────────────────────────────────────────────────────


def test_security_headers_present(client):
    r = client.get("/api/health")
    for h in [
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Strict-Transport-Security",
        "Content-Security-Policy",
        "X-Request-ID",
    ]:
        assert h in r.headers, h
    assert r.headers["X-Frame-Options"] == "DENY"


# ── CORS ────────────────────────────────────────────────────────────────────


def test_cors_allows_configured_origin(client):
    r = client.options(
        "/api/health", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "GET"}
    )
    assert r.headers.get("access-control-allow-origin") == ORIGIN


def test_cors_rejects_unknown_origin(client):
    r = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in r.headers


def test_wildcard_cors_is_refused_by_config():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, allowed_origins="*")


# ── Payload limits and validation ───────────────────────────────────────────


def test_oversized_body_rejected_by_content_length(make_client):
    c = make_client()
    r = c.post("/api/health", content=b"x" * 5000, headers={"Content-Type": "application/json"})
    assert r.status_code == 413


def test_oversized_chunked_body_rejected():
    from fastapi import Request
    from fastapi.testclient import TestClient

    from app.main import create_app

    app = create_app(make_settings())

    @app.post("/api/sink-test")
    async def sink(request: Request):  # reads the whole body like any JSON endpoint would
        return {"n": len(await request.body())}

    def gen():
        for _ in range(10):
            yield b"x" * 500

    c = TestClient(app)
    r = c.post("/api/sink-test", content=gen(), headers={"Content-Type": "application/octet-stream"})
    assert r.status_code == 413
    assert c.post("/api/sink-test", content=b"x" * 100).json() == {"n": 100}


def test_validation_errors_do_not_echo_input():
    from fastapi.testclient import TestClient

    from app.main import create_app

    class Payload(StrictModel):
        username: str

    app = create_app(make_settings())

    @app.post("/api/echo-test")
    async def echo(p: Payload = Body(...)):  # pragma: no cover - only validation path is hit
        return {"ok": True}

    c = TestClient(app)
    secret = "<script>alert(1)</script>"
    r = c.post("/api/echo-test", json={"username": 1, "evil": secret})
    assert r.status_code == 422
    assert secret not in r.text
    assert r.json()["error"] == "invalid_request"


def test_strict_models_reject_unknown_fields():
    class Payload(StrictModel):
        username: str

    with pytest.raises(ValidationError):
        Payload(username="knight", is_admin=True)


# ── Rate limiting ───────────────────────────────────────────────────────────


def test_rate_limit_returns_429(make_client):
    c = make_client(limiter=InMemoryRateLimiter(per_minute=60, burst=3))
    codes = [c.get("/api/health").status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200]
    assert 429 in codes[3:]


def test_rate_limit_ignores_forged_forwarded_for(make_client):
    # Behind Render the proxy appends the real address; a client-chosen first entry must not
    # buy a fresh bucket.
    c = make_client(limiter=InMemoryRateLimiter(per_minute=60, burst=3))
    codes = [
        c.get("/api/health", headers={"X-Forwarded-For": f"10.9.9.{i}, 203.0.113.7"}).status_code
        for i in range(5)
    ]
    assert 429 in codes[3:]


def test_rate_limit_refills_over_time():
    t = [0.0]
    lim = InMemoryRateLimiter(per_minute=60, burst=1, clock=lambda: t[0])
    assert lim.allow("a")
    assert not lim.allow("a")
    t[0] += 1.1
    assert lim.allow("a")
    assert lim.allow("b")  # keys are independent


# ── Production hardening ────────────────────────────────────────────────────


def test_docs_disabled_in_production(make_client):
    c = make_client(settings=make_settings(env="production"))
    assert c.get("/api/docs").status_code == 404
    assert c.get("/api/openapi.json").status_code == 404


def test_secrets_not_in_settings_repr():
    s = make_settings(supabase_service_role_key="super-secret-value", game_server_secret="gs-secret")
    assert "super-secret-value" not in repr(s)
    assert "gs-secret" not in repr(s)


# ── Log redaction ───────────────────────────────────────────────────────────


def test_redact_sensitive_keys_and_tokens():
    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
    data = {
        "password": "hunter2",
        "nested": {"refresh_token": "abc", "note": f"token is {jwt}"},
        "headers": {"Authorization": "Bearer abc.def.ghi"},
        "ok": "visible",
    }
    out = redact(data)
    dumped = json.dumps(out)
    assert "hunter2" not in dumped
    assert jwt not in dumped
    assert "abc.def.ghi" not in dumped
    assert out["ok"] == "visible"


def test_json_formatter_redacts_messages():
    rec = logging.LogRecord("t", logging.INFO, __file__, 1, "login with Bearer secret.token.value", None, None)
    rec.data = {"password": "p"}
    line = JsonFormatter().format(rec)
    assert "secret.token.value" not in line
    assert '"p"' not in line


def test_allowed_origins_tolerate_paste_mistakes(make_client):
    s = make_settings(allowed_origins=' "https://magiclash.netlify.app/" , http://localhost:5173/')
    assert s.origins == ["https://magiclash.netlify.app", "http://localhost:5173"]
    c = make_client(settings=s)
    ok = c.options("/api/health", headers={"Origin": "https://magiclash.netlify.app", "Access-Control-Request-Method": "GET"})
    assert ok.status_code == 200 and ok.headers["access-control-allow-origin"] == "https://magiclash.netlify.app"
    bad = c.options("/api/health", headers={"Origin": "https://evil.netlify.app", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers
