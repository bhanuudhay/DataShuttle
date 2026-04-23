import asyncio
import json
import queue
import threading
import time
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.models.collection import (
    CollectionListResponse,
    CreateCollectionRequest,
    CreateCollectionResponse,
    CopyCollectionRequest,
    CopyAllRequest,
    DropCollectionRequest,
    BulkDropCollectionRequest,
    RenameCollectionRequest,
    BackupRequest,
    CollectionActionResponse,
    PreviewRequest,
)
from app.services.auth_dependency import get_current_user
from app.services.connection_pool import pool
from app.services import session_service
from app.services.mongo_service import MongoService

router = APIRouter(prefix="/api", tags=["collection"])


# ── helpers ──────────────────────────────────────────────────────

def _clients(user: dict):
    user_id = user["sub"]
    src = pool.get(user_id, "source")
    tgt = pool.get(user_id, "target")
    if not src or not tgt:
        data = session_service.get_session(user_id)
        if data:
            if not src and data.get("source_uri"):
                try:
                    pool.put(user_id, "source", data["source_uri"])
                    src = pool.get(user_id, "source")
                except Exception:
                    pass
            if not tgt and data.get("target_uri"):
                try:
                    pool.put(user_id, "target", data["target_uri"])
                    tgt = pool.get(user_id, "target")
                except Exception:
                    pass
    if not src or not tgt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active source/target connection. Connect first.",
        )
    return src, tgt


def _single_client(user: dict, role: str):
    user_id = user["sub"]
    client = pool.get(user_id, role)
    if not client:
        data = session_service.get_session(user_id)
        uri_key = f"{role}_uri"
        if data and data.get(uri_key):
            try:
                pool.put(user_id, role, data[uri_key])
                client = pool.get(user_id, role)
            except Exception:
                pass
    if not client:
        raise HTTPException(status_code=400, detail=f"No active {role} connection.")
    return client


def _sse_stream(progress_queue: queue.Queue, idle_timeout: int = 600):
    last_event_time = time.monotonic()
    while True:
        try:
            msg = progress_queue.get(timeout=5)
        except queue.Empty:
            if time.monotonic() - last_event_time > idle_timeout:
                yield f"data: {json.dumps({'status': 'timeout'})}\n\n"
                return
            yield ": heartbeat\n\n"
            continue
        last_event_time = time.monotonic()
        yield f"data: {json.dumps(msg)}\n\n"
        if msg.get("status") == "done" and msg.get("type") == "overall":
            return
        if msg.get("status") == "done" and msg.get("type") is None and msg.get("collection"):
            pass
        if msg.get("type") == "finish":
            return


# ── list collections ─────────────────────────────────────────────

@router.get("/collections/source", response_model=CollectionListResponse)
async def list_source_collections(
    db_name: str = Query(...),
    user: dict = Depends(get_current_user),
):
    client = _single_client(user, "source")
    svc = MongoService(client)
    names = await asyncio.to_thread(svc.list_collections, db_name)
    cols = []
    for n in names:
        if n.startswith("_init"):
            continue
        size = await asyncio.to_thread(svc.get_collection_size, db_name, n)
        if size > 0:
            cols.append({"name": n, "count": size})
    return CollectionListResponse(success=True, collections=cols, message="OK")


@router.get("/collections/target", response_model=CollectionListResponse)
async def list_target_collections(
    db_name: str = Query(...),
    user: dict = Depends(get_current_user),
):
    client = _single_client(user, "target")
    svc = MongoService(client)
    names = await asyncio.to_thread(svc.list_collections, db_name)
    cols = []
    for n in names:
        if n.startswith("_init"):
            continue
        size = await asyncio.to_thread(svc.get_collection_size, db_name, n)
        if size > 0:
            cols.append({"name": n, "count": size})
    return CollectionListResponse(success=True, collections=cols, message="OK")


# ── document preview ─────────────────────────────────────────────

@router.post("/collection/preview")
async def preview_collection(
    req: PreviewRequest,
    user: dict = Depends(get_current_user),
):
    client = _single_client(user, req.role)
    svc = MongoService(client)
    docs = await asyncio.to_thread(svc.preview_documents, req.db_name, req.collection_name, req.limit)
    return {"success": True, "documents": docs, "count": len(docs)}


# ── collection & database stats ──────────────────────────────────

@router.get("/collection/stats")
async def collection_stats(
    db_name: str = Query(...),
    collection_name: str = Query(...),
    role: str = Query("source"),
    user: dict = Depends(get_current_user),
):
    client = _single_client(user, role)
    svc = MongoService(client)
    stats = await asyncio.to_thread(svc.get_collection_stats, db_name, collection_name)
    return {"success": True, **stats}


@router.get("/database/stats")
async def database_stats(
    db_name: str = Query(...),
    role: str = Query("source"),
    user: dict = Depends(get_current_user),
):
    client = _single_client(user, role)
    svc = MongoService(client)
    stats = await asyncio.to_thread(svc.get_database_stats, db_name)
    return {"success": True, **stats}


# ── CRUD ─────────────────────────────────────────────────────────

@router.post("/collection/create", response_model=CreateCollectionResponse)
async def create_collection(
    req: CreateCollectionRequest,
    user: dict = Depends(get_current_user),
):
    client = _single_client(user, "target")
    svc = MongoService(client)
    await asyncio.to_thread(svc.create_collection, req.db_name, req.collection_name)
    return CreateCollectionResponse(
        success=True,
        collection_name=req.collection_name,
        message=f"Collection '{req.collection_name}' created",
    )


@router.post("/collection/drop", response_model=CollectionActionResponse)
async def drop_collection(
    req: DropCollectionRequest,
    user: dict = Depends(get_current_user),
):
    client = _single_client(user, "target")
    svc = MongoService(client)
    await asyncio.to_thread(svc.drop_collection, req.db_name, req.collection_name)
    return CollectionActionResponse(
        success=True,
        message=f"Collection '{req.collection_name}' dropped",
    )


@router.post("/collection/drop-many", response_model=CollectionActionResponse)
async def drop_many_collections(
    req: BulkDropCollectionRequest,
    user: dict = Depends(get_current_user),
):
    client = _single_client(user, "target")
    svc = MongoService(client)
    for name in req.collection_names:
        await asyncio.to_thread(svc.drop_collection, req.db_name, name)
    return CollectionActionResponse(
        success=True,
        message=f"Dropped {len(req.collection_names)} collection(s)",
    )


@router.post("/collection/rename", response_model=CollectionActionResponse)
async def rename_collection(
    req: RenameCollectionRequest,
    user: dict = Depends(get_current_user),
):
    client = _single_client(user, "target")
    svc = MongoService(client)
    await asyncio.to_thread(svc.rename_collection, req.db_name, req.old_name, req.new_name)
    return CollectionActionResponse(
        success=True,
        message=f"Collection renamed to '{req.new_name}'",
    )


# ── copy single ──────────────────────────────────────────────────

@router.post("/collection/copy")
async def copy_collection_endpoint(
    req: CopyCollectionRequest,
    user: dict = Depends(get_current_user),
):
    src, tgt = _clients(user)
    progress_q: queue.Queue = queue.Queue()

    def on_progress(info: dict):
        progress_q.put(info)

    def run():
        try:
            MongoService.copy_collection(
                source_client=src,
                target_client=tgt,
                source_db=req.source_db,
                target_db=req.target_db,
                source_collection=req.source_collection,
                target_collection=req.target_collection,
                drop_existing=True,
                on_progress=on_progress,
            )
        except Exception as e:
            progress_q.put({"status": "error", "message": str(e)})
        finally:
            progress_q.put({"type": "finish"})

    threading.Thread(target=run, daemon=True).start()

    return StreamingResponse(
        _sse_stream(progress_q),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── copy all ─────────────────────────────────────────────────────

@router.post("/collection/copy-all")
async def copy_all_collections(
    req: CopyAllRequest,
    user: dict = Depends(get_current_user),
):
    src, tgt = _clients(user)
    progress_q: queue.Queue = queue.Queue()

    def on_progress(info: dict):
        progress_q.put(info)

    def run():
        try:
            MongoService.copy_all_collections(
                source_client=src,
                target_client=tgt,
                source_db=req.source_db,
                target_db=req.target_db,
                drop_existing=True,
                on_progress=on_progress,
            )
        except Exception as e:
            progress_q.put({"status": "error", "message": str(e)})

    threading.Thread(target=run, daemon=True).start()

    return StreamingResponse(
        _sse_stream(progress_q),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── backup ───────────────────────────────────────────────────────

@router.post("/backup")
async def backup_database(
    req: BackupRequest,
    user: dict = Depends(get_current_user),
):
    src, tgt = _clients(user)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_db_name = f"{req.source_db}_backup_{timestamp}"

    svc = MongoService(tgt)
    await asyncio.to_thread(svc.create_database, backup_db_name)

    progress_q: queue.Queue = queue.Queue()

    def on_progress(info: dict):
        progress_q.put(info)

    def run():
        try:
            MongoService.copy_all_collections(
                source_client=src,
                target_client=tgt,
                source_db=req.source_db,
                target_db=backup_db_name,
                drop_existing=False,
                on_progress=on_progress,
            )
        except Exception as e:
            progress_q.put({"status": "error", "message": str(e)})
        finally:
            progress_q.put({"type": "backup_done", "backup_db": backup_db_name, "status": "done"})

    threading.Thread(target=run, daemon=True).start()

    def _stream():
        last_event_time = time.monotonic()
        while True:
            try:
                msg = progress_q.get(timeout=5)
            except queue.Empty:
                if time.monotonic() - last_event_time > 600:
                    yield f"data: {json.dumps({'status': 'timeout'})}\n\n"
                    return
                yield ": heartbeat\n\n"
                continue
            last_event_time = time.monotonic()
            yield f"data: {json.dumps(msg)}\n\n"
            if msg.get("type") == "backup_done":
                return
            if msg.get("status") == "done" and msg.get("type") == "overall":
                return

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
