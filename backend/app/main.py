"""FastAPI app entry point.

Run locally:
    cd backend
    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import init_db
from .routes import admin, public

settings = get_settings()
logging.basicConfig(level=settings.log_level)

app = FastAPI(
    title="Bot-ify",
    version="0.1.0",
    description="Multi-tenant chatbot backend. Turn any business into a bot.",
)

# CORS — per-tenant Origin enforcement happens inside the public routes; this
# middleware just allows the browser preflight to succeed for any origin.
# Tighten if you serve only known dashboards.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(public.router)
app.include_router(admin.router)
