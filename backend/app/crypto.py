"""Fernet-based symmetric encryption for storing tenant integration secrets.

Secrets at rest:
  encrypted = fernet.encrypt(json.dumps(secret).encode())
  secret    = json.loads(fernet.decrypt(encrypted).decode())

Rotating the key requires re-encrypting all rows; build a migration when needed.
"""
from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from cryptography.fernet import Fernet

from .config import get_settings


@lru_cache
def _fernet() -> Fernet:
    key = get_settings().encryption_key
    if not key:
        raise RuntimeError(
            "ENCRYPTION_KEY is not set. Generate one with:\n"
            "  python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        )
    # Accept either raw bytes or string.
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_dict(data: dict[str, Any]) -> bytes:
    return _fernet().encrypt(json.dumps(data).encode("utf-8"))


def decrypt_dict(blob: bytes | None) -> dict[str, Any]:
    if not blob:
        return {}
    return json.loads(_fernet().decrypt(blob).decode("utf-8"))
