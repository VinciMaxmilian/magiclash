import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.security.rate_limit import InMemoryRateLimiter

ORIGIN = "https://magiclash.example"


def make_settings(**overrides) -> Settings:
    base = {
        "env": "test",
        "allowed_origins": f"{ORIGIN},http://localhost:5173",
        "rate_limit_per_minute": 10_000,
        "max_body_bytes": 1024,
        "game_server_secret": "test-game-secret-0123456789abcdef",
        "guest_token_secret": "test-guest-secret-0123456789abcdef",
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app(make_settings()))


@pytest.fixture
def make_client():
    def _make(settings: Settings | None = None, limiter=None) -> TestClient:
        return TestClient(create_app(settings or make_settings(), limiter=limiter or InMemoryRateLimiter(10_000)))

    return _make
