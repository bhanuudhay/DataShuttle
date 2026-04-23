import json
import threading
from typing import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed, wait, FIRST_COMPLETED
from bson import json_util
from pymongo import MongoClient, InsertOne

SYSTEM_DBS = {"admin", "local", "config"}

BATCH_SIZE = 5000
MAX_WRITE_WORKERS = 8
MAX_COLLECTION_WORKERS = 4


def _bson_to_json(doc: dict) -> dict:
    """Convert a BSON document to a JSON-safe dict."""
    return json.loads(json_util.dumps(doc))


class MongoService:
    """Thin wrapper around a MongoClient for common database operations."""

    def __init__(self, client: MongoClient):
        self._client = client

    # ── databases ──────────────────────────────────────────────

    def list_databases(self, exclude_system: bool = True) -> list[str]:
        names = self._client.list_database_names()
        if exclude_system:
            names = [n for n in names if n not in SYSTEM_DBS]
        return names

    def create_database(self, db_name: str) -> str:
        db = self._client[db_name]
        sentinel = db["_init"].insert_one({"_placeholder": True})
        db["_init"].delete_one({"_id": sentinel.inserted_id})
        return db_name

    # ── collections ────────────────────────────────────────────

    def list_collections(self, db_name: str) -> list[str]:
        db = self._client[db_name]
        return [c for c in db.list_collection_names() if not c.startswith("_")]

    def create_collection(self, db_name: str, collection_name: str) -> str:
        db = self._client[db_name]
        db.create_collection(collection_name)
        return collection_name

    def drop_collection(self, db_name: str, collection_name: str) -> None:
        self._client[db_name].drop_collection(collection_name)

    def rename_collection(self, db_name: str, old_name: str, new_name: str) -> str:
        self._client[db_name][old_name].rename(new_name)
        return new_name

    def get_collection_size(self, db_name: str, collection_name: str) -> int:
        return self._client[db_name][collection_name].estimated_document_count()

    # ── preview ─────────────────────────────────────────────────

    def preview_documents(self, db_name: str, collection_name: str, limit: int = 10) -> list[dict]:
        col = self._client[db_name][collection_name]
        docs = list(col.find().limit(limit))
        return [_bson_to_json(d) for d in docs]

    # ── collection stats ────────────────────────────────────────

    def get_collection_stats(self, db_name: str, collection_name: str) -> dict:
        db = self._client[db_name]
        col = db[collection_name]
        stats = db.command("collStats", collection_name)
        indexes = list(col.list_indexes())
        return {
            "name": collection_name,
            "count": stats.get("count", 0),
            "size": stats.get("size", 0),
            "avgObjSize": stats.get("avgObjSize", 0),
            "storageSize": stats.get("storageSize", 0),
            "totalIndexSize": stats.get("totalIndexSize", 0),
            "indexCount": len(indexes),
            "indexes": [
                {"name": idx["name"], "keys": _bson_to_json(dict(idx["key"]))}
                for idx in indexes
            ],
        }

    def get_database_stats(self, db_name: str) -> dict:
        db = self._client[db_name]
        stats = db.command("dbStats")
        return {
            "db": db_name,
            "collections": stats.get("collections", 0),
            "dataSize": stats.get("dataSize", 0),
            "storageSize": stats.get("storageSize", 0),
            "indexSize": stats.get("indexSize", 0),
            "objects": stats.get("objects", 0),
        }

    # ── copy ───────────────────────────────────────────────────

    @staticmethod
    def copy_collection(
        source_client: MongoClient,
        target_client: MongoClient,
        source_db: str,
        target_db: str,
        source_collection: str,
        target_collection: str,
        drop_existing: bool = True,
        on_progress: Callable[[dict], None] | None = None,
    ) -> int:
        """
        Copy documents from source to target using parallel batch writes.
        Cursor reads and bulk_write I/O overlap via a thread pool.
        Returns total docs copied.
        """
        src_col = source_client[source_db][source_collection]
        tgt_col = target_client[target_db][target_collection]

        total = src_col.estimated_document_count()

        if drop_existing and target_collection in target_client[target_db].list_collection_names():
            target_client[target_db].drop_collection(target_collection)
            tgt_col = target_client[target_db][target_collection]

        if on_progress:
            on_progress({
                "collection": source_collection,
                "target_collection": target_collection,
                "total": total,
                "copied": 0,
                "status": "started",
            })

        if total == 0:
            if on_progress:
                on_progress({
                    "collection": source_collection,
                    "target_collection": target_collection,
                    "total": 0,
                    "copied": 0,
                    "status": "done",
                })
            return 0

        copied = 0

        def write_batch(ops):
            tgt_col.bulk_write(ops, ordered=False)
            return len(ops)

        def _drain(futures, at_least_one=False):
            """Collect completed futures and report progress. Returns remaining futures."""
            nonlocal copied
            if at_least_one:
                done, not_done = wait(futures, return_when=FIRST_COMPLETED)
            else:
                done = [f for f in futures if f.done()]
                not_done = [f for f in futures if not f.done()]
            for f in done:
                copied += f.result()
            if done and on_progress:
                on_progress({
                    "collection": source_collection,
                    "target_collection": target_collection,
                    "total": total,
                    "copied": copied,
                    "status": "copying",
                })
            return list(not_done) if at_least_one else not_done

        with ThreadPoolExecutor(max_workers=MAX_WRITE_WORKERS) as executor:
            pending: list = []
            batch: list[InsertOne] = []

            for doc in src_col.find({}, batch_size=BATCH_SIZE, no_cursor_timeout=True):
                doc.pop("_id", None)
                batch.append(InsertOne(doc))

                if len(batch) >= BATCH_SIZE:
                    pending.append(executor.submit(write_batch, batch))
                    batch = []

                    # Opportunistically collect any completed futures
                    pending = _drain(pending)

                    # Back-pressure: if too many in-flight writes, block until one finishes
                    if len(pending) >= MAX_WRITE_WORKERS * 2:
                        pending = _drain(pending, at_least_one=True)

            if batch:
                pending.append(executor.submit(write_batch, batch))

            for f in as_completed(pending):
                copied += f.result()
                if on_progress:
                    on_progress({
                        "collection": source_collection,
                        "target_collection": target_collection,
                        "total": total,
                        "copied": copied,
                        "status": "copying",
                    })

        if on_progress:
            on_progress({
                "collection": source_collection,
                "target_collection": target_collection,
                "total": total,
                "copied": copied,
                "status": "done",
            })

        return copied

    @staticmethod
    def copy_all_collections(
        source_client: MongoClient,
        target_client: MongoClient,
        source_db: str,
        target_db: str,
        drop_existing: bool = True,
        on_progress: Callable[[dict], None] | None = None,
    ) -> dict:
        """Copy every non-empty collection from source_db into target_db using parallel threads."""
        db = source_client[source_db]
        collections = [
            c for c in db.list_collection_names()
            if not c.startswith("_") and db[c].estimated_document_count() > 0
        ]
        results: dict[str, int] = {}
        completed = 0
        lock = threading.Lock()

        if on_progress:
            on_progress({
                "type": "overall",
                "total_collections": len(collections),
                "completed_collections": 0,
                "current": None,
                "status": "started",
            })

        def copy_one(col: str) -> tuple[str, int]:
            nonlocal completed
            count = MongoService.copy_collection(
                source_client=source_client,
                target_client=target_client,
                source_db=source_db,
                target_db=target_db,
                source_collection=col,
                target_collection=col,
                drop_existing=drop_existing,
                on_progress=on_progress,
            )
            with lock:
                completed += 1
                results[col] = count
                if on_progress:
                    on_progress({
                        "type": "overall",
                        "total_collections": len(collections),
                        "completed_collections": completed,
                        "current": col,
                        "status": "progress",
                    })
            return col, count

        with ThreadPoolExecutor(max_workers=MAX_COLLECTION_WORKERS) as executor:
            futures = [executor.submit(copy_one, col) for col in collections]
            for f in as_completed(futures):
                f.result()

        if on_progress:
            on_progress({
                "type": "overall",
                "total_collections": len(collections),
                "completed_collections": len(collections),
                "current": None,
                "status": "done",
            })

        return results
