from datetime import datetime, timezone
from bson import ObjectId
from app.config.database import db

history_collection = db["copy_history"]


def record_copy(
    user_id: str,
    source_db: str,
    target_db: str,
    collection_name: str,
    target_collection: str,
    doc_count: int,
    duration_ms: int,
) -> str:
    result = history_collection.insert_one({
        "user_id": user_id,
        "source_db": source_db,
        "target_db": target_db,
        "collection": collection_name,
        "target_collection": target_collection,
        "doc_count": doc_count,
        "duration_ms": duration_ms,
        "created_at": datetime.now(timezone.utc),
    })
    return str(result.inserted_id)


def get_history(user_id: str, limit: int = 50) -> list[dict]:
    cursor = (
        history_collection
        .find({"user_id": user_id})
        .sort("created_at", -1)
        .limit(limit)
    )
    results = []
    for doc in cursor:
        doc["_id"] = str(doc["_id"])
        doc["created_at"] = doc["created_at"].isoformat()
        results.append(doc)
    return results
