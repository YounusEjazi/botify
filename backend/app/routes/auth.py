"""Auth routes: register + login + account management."""
from __future__ import annotations

import bcrypt
import hashlib
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from typing import Annotated

from ..db import get_db
from ..models import Tenant, User

router = APIRouter(prefix="/api/users", tags=["auth"])


def _digest(password: str) -> bytes:
    # SHA-256 before bcrypt avoids the 72-byte truncation limit.
    return hashlib.sha256(password.encode()).digest()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_digest(password), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(_digest(password), hashed.encode())


def _current_user(x_user_id: str | None, db: Session) -> User:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.scalar(select(User).where(User.id == x_user_id))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserOut(BaseModel):
    id: str
    email: str


class UserDetailOut(BaseModel):
    id: str
    email: str
    created_at: datetime
    tenant_count: int


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut(id=user.id, email=user.email)


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email))
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return UserOut(id=user.id, email=user.email)


@router.get("/me", response_model=UserDetailOut)
def get_me(
    db: Annotated[Session, Depends(get_db)],
    x_user_id: Annotated[str | None, Header()] = None,
):
    user = _current_user(x_user_id, db)
    from sqlalchemy import func
    count = db.scalar(select(func.count(Tenant.id)).where(Tenant.owner_id == user.id)) or 0
    return UserDetailOut(
        id=user.id,
        email=user.email,
        created_at=user.created_at,
        tenant_count=count,
    )


@router.post("/me/password", status_code=204)
def change_password(
    body: ChangePasswordRequest,
    db: Annotated[Session, Depends(get_db)],
    x_user_id: Annotated[str | None, Header()] = None,
):
    user = _current_user(x_user_id, db)
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=403, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    user.hashed_password = hash_password(body.new_password)
    db.commit()


@router.delete("/me", status_code=204)
def delete_me(
    db: Annotated[Session, Depends(get_db)],
    x_user_id: Annotated[str | None, Header()] = None,
):
    user = _current_user(x_user_id, db)
    # Delete all tenants owned by this user. Cascades to documents/chunks/etc
    # via existing FK relationships on Tenant.
    tenants = list(db.scalars(select(Tenant).where(Tenant.owner_id == user.id)).all())
    for tenant in tenants:
        db.delete(tenant)
    db.delete(user)
    db.commit()
