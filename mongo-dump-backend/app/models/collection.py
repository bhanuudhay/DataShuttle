from pydantic import BaseModel, Field


class CollectionListResponse(BaseModel):
    success: bool
    collections: list[dict]
    message: str


class CreateCollectionRequest(BaseModel):
    db_name: str
    collection_name: str = Field(..., min_length=1, max_length=128)


class CreateCollectionResponse(BaseModel):
    success: bool
    collection_name: str
    message: str


class CopyCollectionRequest(BaseModel):
    source_db: str
    target_db: str
    source_collection: str
    target_collection: str


class CopyAllRequest(BaseModel):
    source_db: str
    target_db: str


class DropCollectionRequest(BaseModel):
    db_name: str
    collection_name: str


class RenameCollectionRequest(BaseModel):
    db_name: str
    old_name: str
    new_name: str = Field(..., min_length=1, max_length=128)


class BulkDropCollectionRequest(BaseModel):
    db_name: str
    collection_names: list[str] = Field(..., min_length=1)


class BackupRequest(BaseModel):
    source_db: str


class CollectionActionResponse(BaseModel):
    success: bool
    message: str


class PreviewRequest(BaseModel):
    db_name: str
    collection_name: str
    role: str = "source"
    limit: int = Field(default=10, ge=1, le=50)
