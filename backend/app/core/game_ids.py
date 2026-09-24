"""Character and stage ids accepted by the API. Keep in sync with shared/src/data/index.ts
(CHARACTER_ORDER / STAGE_ORDER) and the profiles check constraints in supabase/migrations."""

from typing import Literal

CharacterId = Literal[
    "knight",
    "barbarian",
    "archer",
    "fire_mage",
    "ice_mage",
    "lightning_mage",
    # Temporada 1
    "hunter",
    "brawler",
    "vampire",
    "dhampir",
    "summoner",
]

StageId = Literal[
    "castle_courtyard",
    "enchanted_forest",
    "frozen_fortress",
    "wizard_tower",
    "ancient_ruins",
    "volcanic_keep",
    # Temporada 1
    "throne_hall",
    "hunters_library",
]

STAGES: list[str] = list(StageId.__args__)  # type: ignore[attr-defined]
