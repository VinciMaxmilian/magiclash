from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    """Base for every request body: unknown fields are rejected, strings are trimmed."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class HealthResponse(BaseModel):
    status: str
    version: str
    env: str
