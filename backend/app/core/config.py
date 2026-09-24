from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables only (never from the client).

    Secrets (service role key, JWT secret, game-server secret) live exclusively in the
    Vercel project environment. `.env` is for local development and is git-ignored.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    version: str = "0.1.0"

    # Comma-separated list of exact origins allowed by CORS. Never "*".
    allowed_origins: str = "http://localhost:5173,http://localhost:4173"

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = Field(default="", repr=False)
    supabase_jwt_secret: str = Field(default="", repr=False)
    game_server_secret: str = Field(default="", repr=False)
    guest_token_secret: str = Field(default="", repr=False)
    # Public WebSocket URL of the realtime game server, handed to clients with join tokens.
    realtime_url: str = "ws://localhost:8787/ws"

    rate_limit_per_minute: int = 120
    max_body_bytes: int = 64 * 1024

    @field_validator("allowed_origins")
    @classmethod
    def no_wildcard(cls, v: str) -> str:
        if "*" in v:
            raise ValueError("wildcard CORS origins are not allowed")
        return v

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
