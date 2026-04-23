from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials

from app.models.user import SignupRequest, LoginRequest, AuthResponse
from app.services import auth_service
from app.services.auth_dependency import bearer_scheme

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=AuthResponse)
def signup(req: SignupRequest):
    ok, msg, user = auth_service.signup(req.name, req.email, req.password)
    if not ok:
        return AuthResponse(success=False, message=msg)

    _, _, _, token = auth_service.login(req.email, req.password)
    return AuthResponse(success=True, message=msg, token=token, user=user)


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest):
    ok, msg, user, token = auth_service.login(req.email, req.password)
    if not ok:
        return AuthResponse(success=False, message=msg)
    return AuthResponse(success=True, message=msg, token=token, user=user)


@router.post("/logout", response_model=AuthResponse)
def logout(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    auth_service.revoke_token(credentials.credentials)
    return AuthResponse(success=True, message="Logged out successfully")
