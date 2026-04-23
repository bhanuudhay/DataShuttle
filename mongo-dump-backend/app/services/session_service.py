import json
from app.config.redis import redis_client

_SESSION_TTL = 86400  # 24 hours


def _key(user_id: str) -> str:
    return f"session:{user_id}"


def save_session(user_id: str, data: dict) -> None:
    redis_client.setex(_key(user_id), _SESSION_TTL, json.dumps(data))


def get_session(user_id: str) -> dict | None:
    raw = redis_client.get(_key(user_id))
    if raw is None:
        return None
    return json.loads(raw)


def clear_session(user_id: str) -> None:
    redis_client.delete(_key(user_id))
