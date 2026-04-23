from pydantic import BaseModel
from typing import Optional


class SessionSaveRequest(BaseModel):
    source_uri: str
    target_uri: str
    source_db: Optional[str] = None
    target_db: Optional[str] = None
    source_databases: Optional[list[str]] = None
    target_databases: Optional[list[str]] = None


class SessionResponse(BaseModel):
    active: bool
    source_uri: Optional[str] = None
    target_uri: Optional[str] = None
    source_db: Optional[str] = None
    target_db: Optional[str] = None
    source_databases: Optional[list[str]] = None
    target_databases: Optional[list[str]] = None
    source_alive: bool = False
    target_alive: bool = False
