from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import StrictModel
from app.core.game_ids import CharacterId


USERNAME_PATTERN = r"^[A-Za-z0-9_]{3,16}$"
RESERVED_USERNAMES = {
    "admin", "administrator", "root", "system", "support", "moderator", "mod", "staff",
    "magiclash", "official", "null", "undefined", "guest", "server", "bot", "cpu",
}


class ProfileUpdate(StrictModel):
    username: str | None = Field(default=None, pattern=USERNAME_PATTERN)
    favorite_character: CharacterId | None = None
    avatar_id: CharacterId | None = None

    @field_validator("username")
    @classmethod
    def not_reserved(cls, v: str | None) -> str | None:
        if v is not None and (v.lower() in RESERVED_USERNAMES or v.lower().startswith("player_")):
            raise ValueError("username is reserved")
        return v


class Stats(BaseModel):
    matches: int = 0
    wins: int = 0
    losses: int = 0
    kos: int = 0
    deaths: int = 0
    damage_dealt: int = 0


class Rating(BaseModel):
    queue: str
    rating: int
    matches: int
    wins: int
    losses: int


class PublicProfile(BaseModel):
    username: str
    avatar_id: str
    avatar_url: str | None
    favorite_character: str
    created_at: str
    stats: Stats
    ratings: list[Rating] = []


class MyProfile(PublicProfile):
    id: str
    email: str | None
    settings: dict = {}
