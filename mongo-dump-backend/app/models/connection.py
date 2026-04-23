from pydantic import BaseModel, Field
from typing import Optional, List

class ConnectionRequest(BaseModel):
    source_uri: str = Field(..., min_length=1, description="Source MongoDB URI")
    target_uri: str = Field(..., min_length=1, description="Target MongoDB URI")


class ConnectionStatus(BaseModel):
    success: bool
    source: str
    source_databases: Optional[List[str]] = None
    target: str
    target_databases: Optional[List[str]] = None
    message: str
