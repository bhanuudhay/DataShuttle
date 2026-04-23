import logging
import threading
import time
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

from app.services.connection_service import _rewrite_uri

logger = logging.getLogger(__name__)

_TTL_SECONDS = 3600  # auto-evict idle connections after 1 hour


class _PoolEntry:
    __slots__ = ("client", "last_used")

    def __init__(self, client: MongoClient):
        self.client = client
        self.last_used = time.monotonic()

    def touch(self):
        self.last_used = time.monotonic()


class ConnectionPool:
    """
    Per-user MongoClient cache. Each user can have one source and one target
    client alive at the same time, keyed as  "<user_id>:source" / "<user_id>:target".
    """

    def __init__(self):
        self._pool: dict[str, _PoolEntry] = {}
        self._lock = threading.Lock()

    def _key(self, user_id: str, role: str) -> str:
        return f"{user_id}:{role}"

    def put(self, user_id: str, role: str, uri: str, timeout_ms: int = 15000) -> MongoClient:
        key = self._key(user_id, role)
        uri = _rewrite_uri(uri)
        client = MongoClient(
            uri,
            serverSelectionTimeoutMS=timeout_ms,
            connectTimeoutMS=timeout_ms,
        )
        with self._lock:
            old = self._pool.pop(key, None)
            if old:
                try:
                    old.client.close()
                except Exception:
                    pass
            self._pool[key] = _PoolEntry(client)
        logger.info("Pool: stored %s client for user %s", role, user_id)
        return client

    def get(self, user_id: str, role: str) -> MongoClient | None:
        key = self._key(user_id, role)
        with self._lock:
            entry = self._pool.get(key)
        if entry is None:
            return None
        entry.touch()
        return entry.client

    def alive(self, user_id: str, role: str) -> bool:
        client = self.get(user_id, role)
        if client is None:
            return False
        try:
            client.admin.command("ping")
            return True
        except (ConnectionFailure, Exception):
            self.remove(user_id, role)
            return False

    def remove(self, user_id: str, role: str):
        key = self._key(user_id, role)
        with self._lock:
            entry = self._pool.pop(key, None)
        if entry:
            try:
                entry.client.close()
            except Exception:
                pass
            logger.info("Pool: removed %s client for user %s", role, user_id)

    def remove_user(self, user_id: str):
        self.remove(user_id, "source")
        self.remove(user_id, "target")

    def cleanup_stale(self):
        now = time.monotonic()
        stale_keys: list[str] = []
        with self._lock:
            for key, entry in self._pool.items():
                if now - entry.last_used > _TTL_SECONDS:
                    stale_keys.append(key)
            for key in stale_keys:
                entry = self._pool.pop(key, None)
                if entry:
                    try:
                        entry.client.close()
                    except Exception:
                        pass
        if stale_keys:
            logger.info("Pool: cleaned up %d stale connection(s)", len(stale_keys))


pool = ConnectionPool()
