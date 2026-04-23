from pydantic import BaseModel, Field


class CreateDatabaseRequest(BaseModel):
    db_name: str = Field(..., min_length=1, max_length=64)


class DatabaseListResponse(BaseModel):
    success: bool
    databases: list[str]
    message: str


class CreateDatabaseResponse(BaseModel):
    success: bool
    db_name: str
    message: str
