from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.controllers.auth_controller import router as auth_router
from app.controllers.connection_controller import router as connection_router
from app.controllers.session_controller import router as session_router
from app.controllers.database_controller import router as database_router
from app.controllers.collection_controller import router as collection_router

app = FastAPI(
    title="DataShuttle API",
    description="Backend API for DataShuttle",
    version="0.1.0",
)

import os

ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS", "http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(connection_router)
app.include_router(session_router)
app.include_router(database_router)
app.include_router(collection_router)


@app.get("/")
def health_check():
    return {"status": "ok", "service": "datashuttle-backend"}
