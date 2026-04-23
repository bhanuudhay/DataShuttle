import os
import re

from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ConfigurationError, OperationFailure
from typing import List

_RUNNING_IN_DOCKER = os.path.exists("/.dockerenv")

_LOCALHOST_RE = re.compile(
    r"(?<=[@/])(?:localhost|127\.0\.0\.1)(?=[\:/])"
)


def _rewrite_uri(uri: str) -> str:
    """Replace localhost / 127.0.0.1 with host.docker.internal when inside Docker."""
    if not _RUNNING_IN_DOCKER:
        return uri
    return _LOCALHOST_RE.sub("host.docker.internal", uri)


def test_mongo_connection(uri: str, timeout_ms: int = 15000) -> tuple[bool, str]:
    """
    Attempt to connect to a MongoDB instance and return (success, message).
    """
    uri = _rewrite_uri(uri)
    try:
        client = MongoClient(
            uri,
            serverSelectionTimeoutMS=timeout_ms,
            connectTimeoutMS=timeout_ms,
            socketTimeoutMS=timeout_ms,
        )
    except ConfigurationError as e:
        return False, f"URI configuration error: {e}", []
    except Exception as e:
        return False, f"Failed to parse URI: {e}", []

    try:
        client.admin.command("ping")
    except ConnectionFailure as e:
        client.close()
        return False, f"Could not connect to MongoDB server: {e}", []
    except OperationFailure as e:
        client.close()
        return False, f"Authentication failed: {e}", []
    except Exception as e:
        client.close()
        return False, f"Connection error: {e}", []

    return True, "Connection successful", get_databases(uri)


def get_databases(uri: str) -> List[str]:
    client = MongoClient(uri)
    return client.list_database_names()