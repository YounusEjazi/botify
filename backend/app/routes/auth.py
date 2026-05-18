"""Auth routes: register + login."""
from __future__ import annotations

import bcrypt
import hashlib

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User

router = APIRouter(prefix="/api/users", tags=["auth"])


def _digest(password: str) -> bytes:
    # SHA-256 before bcrypt avoids the 72-byte truncation limit.
    return hashlib.sha256(password.encode()).digest()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_digest(password), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(_digest(password), hashed.encode())


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str


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
