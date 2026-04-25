import ipaddress
import os
import re
from urllib.parse import urlparse

from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ConfigurationError, OperationFailure
from typing import List

_RUNNING_IN_DOCKER = os.path.exists("/.dockerenv")

_LOCALHOST_RE = re.compile(
    r"(?<=[@/])(?:localhost|127\.0\.0\.1)(?=[\:/])"
)


def _rewrite_uri(uri: str) -> str:
    """Replace localhost / 127.0.0.1 with host.docker.internal when inside Docker.

    This lets the backend container reach tunnels (e.g. an AWS SSM port-forward)
    that the host has opened on its own loopback interface.
    """
    if not _RUNNING_IN_DOCKER:
        return uri
    return _LOCALHOST_RE.sub("host.docker.internal", uri)


def _extract_hosts(uri: str) -> List[str]:
    """Return the host portion(s) from a mongodb:// URI (without port)."""
    try:
        parsed = urlparse(uri)
    except Exception:
        return []
    netloc = parsed.netloc.split("@", 1)[-1]
    hosts: List[str] = []
    for pair in netloc.split(","):
        host = pair.rsplit(":", 1)[0].strip("[]")
        if host:
            hosts.append(host)
    return hosts


def _is_private_ip(host: str) -> bool:
    try:
        return ipaddress.ip_address(host).is_private and not ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _diagnose(uri: str, raw_error: str) -> str:
    """Return a human-friendly hint for common Docker/VPN/SSM misconfigurations."""
    hosts = _extract_hosts(uri)
    hints: List[str] = []

    if _RUNNING_IN_DOCKER and any(_is_private_ip(h) for h in hosts):
        hints.append(
            "The backend is running inside Docker but the URI points at a private IP "
            "(e.g. 10.x.x.x). Docker Desktop does NOT propagate the host's VPN routes "
            "into containers, so that address is unreachable from here. Run the backend "
            "directly on your host (uvicorn) while the VPN is connected, or use an SSM "
            "port-forward to 127.0.0.1 and connect to that instead."
        )

    if any(h in ("127.0.0.1", "localhost", "host.docker.internal") for h in hosts) and "Connection refused" in raw_error:
        hints.append(
            "Connection was refused on loopback. If you are using an SSM port-forward, "
            "make sure the session is still active AND that the port in your connection "
            "string matches `localPortNumber` in the `aws ssm start-session` command."
        )

    if hints:
        return " | ".join(hints)
    return ""


def test_mongo_connection(uri: str, timeout_ms: int = 15000) -> tuple[bool, str, List[str]]:
    """
    Attempt to connect to a MongoDB instance and return (success, message, databases).
    """
    rewritten = _rewrite_uri(uri)
    try:
        client = MongoClient(
            rewritten,
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
        hint = _diagnose(rewritten, str(e))
        msg = f"Could not connect to MongoDB server: {e}"
        if hint:
            msg = f"{msg}\nHint: {hint}"
        return False, msg, []
    except OperationFailure as e:
        client.close()
        return False, f"Authentication failed: {e}", []
    except Exception as e:
        client.close()
        return False, f"Connection error: {e}", []

    return True, "Connection successful", get_databases(rewritten)


def get_databases(uri: str) -> List[str]:
    client = MongoClient(uri)
    return client.list_database_names()