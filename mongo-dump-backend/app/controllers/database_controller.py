import asyncio

from fastapi import APIRouter, Depends, HTTPException, status

from app.models.database import (
    CreateDatabaseRequest,
    CreateDatabaseResponse,
    DatabaseListResponse,
)
from app.services.auth_dependency import get_current_user
from app.services.connection_pool import pool
from app.services.mongo_service import MongoService

router = APIRouter(prefix="/api", tags=["database"])


def _get_service(user: dict, role: str) -> MongoService:
    client = pool.get(user["sub"], role)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No active {role} connection. Connect first.",
        )
    return MongoService(client)


@router.get("/databases/target", response_model=DatabaseListResponse)
async def list_target_databases(user: dict = Depends(get_current_user)):
    svc = _get_service(user, "target")
    dbs = await asyncio.to_thread(svc.list_databases)
    return DatabaseListResponse(success=True, databases=dbs, message="OK")


@router.get("/databases/source", response_model=DatabaseListResponse)
async def list_source_databases(user: dict = Depends(get_current_user)):
    svc = _get_service(user, "source")
    dbs = await asyncio.to_thread(svc.list_databases)
    return DatabaseListResponse(success=True, databases=dbs, message="OK")


@router.post("/database/create", response_model=CreateDatabaseResponse)
async def create_database(
    req: CreateDatabaseRequest,
    user: dict = Depends(get_current_user),
):
    svc = _get_service(user, "target")
    await asyncio.to_thread(svc.create_database, req.db_name)
    return CreateDatabaseResponse(
        success=True,
        db_name=req.db_name,
        message=f"Database '{req.db_name}' created successfully",
    )
