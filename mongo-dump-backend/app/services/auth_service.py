from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt, JWTError
from pymongo.errors import DuplicateKeyError

from app.config.database import users_collection
from app.config.redis import redis_client
from app.config.settings import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRY_MINUTES


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRY_MINUTES)
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expire,
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    redis_client.setex(f"token:{token}", JWT_EXPIRY_MINUTES * 60, user_id)
    return token


def decode_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        stored = redis_client.get(f"token:{token}")
        if not stored:
            return None
        return payload
    except JWTError:
        return None


def revoke_token(token: str) -> None:
    redis_client.delete(f"token:{token}")


def signup(name: str, email: str, password: str) -> tuple[bool, str, dict | None]:
    hashed = hash_password(password)
    try:
        result = users_collection.insert_one({
            "name": name,
            "email": email,
            "password": hashed,
            "created_at": datetime.now(timezone.utc),
        })
        user = {
            "id": str(result.inserted_id),
            "name": name,
            "email": email,
        }
        return True, "Account created successfully", user
    except DuplicateKeyError:
        return False, "An account with this email already exists", None


def login(email: str, password: str) -> tuple[bool, str, dict | None, str | None]:
    user_doc = users_collection.find_one({"email": email})
    if not user_doc:
        return False, "Invalid email or password", None, None

    if not verify_password(password, user_doc["password"]):
        return False, "Invalid email or password", None, None

    user_id = str(user_doc["_id"])
    token = create_token(user_id, email)
    user = {
        "id": user_id,
        "name": user_doc["name"],
        "email": user_doc["email"],
    }
    return True, "Login successful", user, token
