"""Tenant resolution, CORS-style origin checking, and admin authentication.

Tenants are resolved from one of three places, in order:
  1. X-Tenant-Slug header (preferred, set by widget)
  2. ?tenant= query param (useful for dev)
  3. Origin header lookup (fallback — slower, scans allowed_origins)

Origin enforcement is the real security boundary for the public API: the widget
key in the script tag is a tenant identifier, not a secret. Each chat request
must come from an Origin that the tenant has registered.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import Tenant


def resolve_tenant(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    x_tenant_slug: Annotated[str | None, Header()] = None,
) -> Tenant:
    """FastAPI dependency: returns the tenant or raises 404."""
    slug = x_tenant_slug or request.query_params.get("tenant")

    if slug:
        tenant = db.scalar(select(Tenant).where(Tenant.slug == slug))
        if tenant:
            return tenant

    # Fallback: try to identify tenant by origin
    origin = request.headers.get("origin") or request.headers.get("referer", "").split("/", 3)[:3]
    if isinstance(origin, list):
        origin = "/".join(origin) if origin else None
    if origin:
        # Linear scan, fine for hundreds of tenants. At scale, index allowed_origins.
        for tenant in db.scalars(select(Tenant)).all():
            if origin in tenant.allowed_origins:
                return tenant

    raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tenant not found")


def enforce_origin(request: Request, tenant: Tenant) -> None:
    """Raise 403 if the request's Origin isn't on the tenant's allowlist.

    Skipped for non-browser callers (no Origin header) — typically server-to-
    server with an admin key. Those go through admin auth instead.
    """
    origin = request.headers.get("origin")
    if origin is None:
        return  # not a browser request

    # Allow "*" as a permissive wildcard during dev. Don't ship that.
    if "*" in tenant.allowed_origins:
        return

    if origin not in tenant.allowed_origins:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail=f"Origin {origin!r} not allowed for tenant {tenant.slug!r}",
        )


def require_admin(authorization: Annotated[str | None, Header()] = None) -> None:
    """Dashboard endpoints require this. Expects: Authorization: Bearer <ADMIN_API_KEY>."""
    expected = get_settings().admin_api_key
    if not expected or not authorization:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Admin key required")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or token != expected:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid admin key")
