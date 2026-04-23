from fastapi import APIRouter, Depends

from app.models.session import SessionSaveRequest, SessionResponse
from app.services import session_service
from app.services.auth_dependency import get_current_user
from app.services.connection_pool import pool

router = APIRouter(prefix="/api", tags=["session"])


@router.post("/session", response_model=SessionResponse)
def save_session(req: SessionSaveRequest, user: dict = Depends(get_current_user)):
    user_id = user["sub"]

    pool.put(user_id, "source", req.source_uri)
    pool.put(user_id, "target", req.target_uri)

    data = req.model_dump()
    session_service.save_session(user_id, data)

    return SessionResponse(
        active=True,
        source_uri=req.source_uri,
        target_uri=req.target_uri,
        source_db=req.source_db,
        target_db=req.target_db,
        source_databases=req.source_databases,
        target_databases=req.target_databases,
        source_alive=pool.alive(user_id, "source"),
        target_alive=pool.alive(user_id, "target"),
    )


@router.get("/session", response_model=SessionResponse)
def get_session(user: dict = Depends(get_current_user)):
    user_id = user["sub"]
    data = session_service.get_session(user_id)

    if data is None:
        return SessionResponse(active=False)

    source_alive = pool.alive(user_id, "source")
    target_alive = pool.alive(user_id, "target")

    if not source_alive and data.get("source_uri"):
        try:
            pool.put(user_id, "source", data["source_uri"])
            source_alive = pool.alive(user_id, "source")
        except Exception:
            source_alive = False

    if not target_alive and data.get("target_uri"):
        try:
            pool.put(user_id, "target", data["target_uri"])
            target_alive = pool.alive(user_id, "target")
        except Exception:
            target_alive = False

    return SessionResponse(
        active=True,
        source_uri=data.get("source_uri"),
        target_uri=data.get("target_uri"),
        source_db=data.get("source_db"),
        target_db=data.get("target_db"),
        source_databases=data.get("source_databases"),
        target_databases=data.get("target_databases"),
        source_alive=source_alive,
        target_alive=target_alive,
    )


@router.delete("/session", response_model=SessionResponse)
def clear_session(user: dict = Depends(get_current_user)):
    user_id = user["sub"]
    pool.remove_user(user_id)
    session_service.clear_session(user_id)
    return SessionResponse(active=False)
