"""Database engine and session management."""
from __future__ import annotations

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


_settings = get_settings()

# For SQLite we need check_same_thread=False to use connections across threads;
# Postgres doesn't need it. Detect via URL scheme.
_connect_args: dict = {}
if _settings.database_url.startswith("sqlite"):
    _connect_args["check_same_thread"] = False

engine = create_engine(
    _settings.database_url,
    connect_args=_connect_args,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a DB session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Called at app startup; for production use Alembic."""
    # Import models so they register with Base.metadata before create_all runs.
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_columns()


def _ensure_columns() -> None:
    """Idempotent column-add for fields introduced after the first create_all.

    Replaces having to write a real migration in dev. For production, use Alembic.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "tenants" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("tenants")}

    is_pg = _settings.database_url.startswith("postgresql")
    bin_type = "BYTEA" if is_pg else "BLOB"
    json_type = "JSONB" if is_pg else "JSON"

    with engine.begin() as conn:
        if "llm_api_key_encrypted" not in cols:
            conn.execute(text(f"ALTER TABLE tenants ADD COLUMN llm_api_key_encrypted {bin_type}"))
        if "embedding_config" not in cols:
            conn.execute(text(
                f"ALTER TABLE tenants ADD COLUMN embedding_config {json_type} "
                f"NOT NULL DEFAULT '{{}}'::{json_type}"
                if is_pg else
                f"ALTER TABLE tenants ADD COLUMN embedding_config {json_type} NOT NULL DEFAULT '{{}}'"
            ))
        if "embedding_api_key_encrypted" not in cols:
            conn.execute(text(f"ALTER TABLE tenants ADD COLUMN embedding_api_key_encrypted {bin_type}"))
        if "retrieval_config" not in cols:
            conn.execute(text(
                f"ALTER TABLE tenants ADD COLUMN retrieval_config {json_type} "
                f"NOT NULL DEFAULT '{{}}'::{json_type}"
                if is_pg else
                f"ALTER TABLE tenants ADD COLUMN retrieval_config {json_type} NOT NULL DEFAULT '{{}}'"
            ))
        if "rerank_api_key_encrypted" not in cols:
            conn.execute(text(f"ALTER TABLE tenants ADD COLUMN rerank_api_key_encrypted {bin_type}"))
        if is_pg:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            chunk_cols = {c["name"] for c in inspector.get_columns("chunks")}
            if "embedding_vec" not in chunk_cols:
                conn.execute(text("ALTER TABLE chunks ADD COLUMN embedding_vec vector"))
