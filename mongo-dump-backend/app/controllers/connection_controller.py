import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.models.connection import ConnectionRequest, ConnectionStatus
from app.services.connection_service import test_mongo_connection
from app.services.auth_dependency import get_current_user
from app.services.connection_pool import pool

router = APIRouter(prefix="/api", tags=["connection"])


@router.post("/test-connection", response_model=ConnectionStatus)
async def test_connection(req: ConnectionRequest, user: dict = Depends(get_current_user)):
    if req.source_uri.strip() == req.target_uri.strip():
        raise HTTPException(
            status_code=400,
            detail="Source and target URIs cannot be the same.",
        )

    source_task = asyncio.to_thread(test_mongo_connection, req.source_uri)
    target_task = asyncio.to_thread(test_mongo_connection, req.target_uri)

    (source_ok, source_msg, source_databases), (target_ok, target_msg, target_databases) = await asyncio.gather(
        source_task, target_task
    )

    logging.info(f"Source: {source_msg} | Target: {target_msg}")

    all_ok = source_ok and target_ok

    if all_ok:
        user_id = user["sub"]
        await asyncio.gather(
            asyncio.to_thread(pool.put, user_id, "source", req.source_uri),
            asyncio.to_thread(pool.put, user_id, "target", req.target_uri),
        )

    return ConnectionStatus(
        success=all_ok,
        source="Connected successfully" if source_ok else f"Connection failed: {source_msg}",
        source_databases=source_databases,
        target="Connected successfully" if target_ok else f"Connection failed: {target_msg}",
        target_databases=target_databases,
        message="Connection established" if all_ok else "Connection failed",
    )
