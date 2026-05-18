"""Google Drive connector — lists files in folders and exports their text content."""
from __future__ import annotations

import base64
import json
import logging
import time
from datetime import datetime
from typing import Any

import httpx

logger = logging.getLogger(__name__)

GDRIVE_API_BASE = "https://www.googleapis.com/drive/v3"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

# MIME types we can export as plain text via the Drive export API
_EXPORTABLE_AS_TEXT = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
}

# MIME types we download directly as text
_TEXT_MIME_PREFIXES = ("text/",)


class GDriveConnector:
    kind = "gdrive"

    async def fetch_pages(
        self,
        *,
        config: dict[str, Any],
        secret: dict[str, Any],
        since: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Fetch files from Google Drive folders and/or explicit file IDs.

        config shape:
            {
                "folder_ids": ["1abc...", ...],
                "file_ids": ["2def...", ...],
                "mime_types": ["application/pdf", "text/plain"]  # optional filter
            }
        secret shape:
            {"service_account_json": "{...json string of service account key...}"}

        When `since` is provided only files modified on or after that timestamp
        are returned from folder listings (incremental sync).
        """
        sa_json_str = secret.get("service_account_json", "")
        if not sa_json_str:
            raise ValueError("Google Drive connector requires 'service_account_json' in secret")

        try:
            sa_info = json.loads(sa_json_str)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid service_account_json: {exc}") from exc

        token = await _get_oauth_token(sa_info)
        headers = {"Authorization": f"Bearer {token}"}

        allowed_mimes = set(config.get("mime_types", []))
        pages: list[dict[str, Any]] = []
        seen_ids: set[str] = set()

        async with httpx.AsyncClient(timeout=60.0) as client:
            # Files from folders
            for folder_id in config.get("folder_ids", []):
                folder_files = await _list_folder_files(client, headers, folder_id, since=since)
                for f in folder_files:
                    if f["id"] in seen_ids:
                        continue
                    if allowed_mimes and f.get("mimeType") not in allowed_mimes:
                        continue
                    seen_ids.add(f["id"])
                    doc = await _file_to_doc(client, headers, f)
                    if doc:
                        pages.append(doc)

            # Explicit file IDs
            for file_id in config.get("file_ids", []):
                if file_id in seen_ids:
                    continue
                seen_ids.add(file_id)
                meta = await _get_file_meta(client, headers, file_id)
                if not meta:
                    continue
                if allowed_mimes and meta.get("mimeType") not in allowed_mimes:
                    continue
                doc = await _file_to_doc(client, headers, meta)
                if doc:
                    pages.append(doc)

        return pages


# ─── Helpers ───────────────────────────────────────────────────────────────


async def _get_oauth_token(sa_info: dict[str, Any]) -> str:
    """Exchange a service account key for a short-lived OAuth2 bearer token."""
    import math

    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
    except ImportError as exc:
        raise ImportError(
            "cryptography package is required for Google Drive connector JWT signing"
        ) from exc

    now = int(time.time())
    header = base64.urlsafe_b64encode(
        json.dumps({"alg": "RS256", "typ": "JWT"}).encode()
    ).rstrip(b"=").decode()

    claim_set = {
        "iss": sa_info["client_email"],
        "scope": "https://www.googleapis.com/auth/drive.readonly",
        "aud": GOOGLE_TOKEN_URL,
        "iat": now,
        "exp": now + 3600,
    }
    payload = base64.urlsafe_b64encode(
        json.dumps(claim_set).encode()
    ).rstrip(b"=").decode()

    signing_input = f"{header}.{payload}".encode()

    private_key = serialization.load_pem_private_key(
        sa_info["private_key"].encode(), password=None
    )
    signature = private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    sig_b64 = base64.urlsafe_b64encode(signature).rstrip(b"=").decode()

    jwt = f"{header}.{payload}.{sig_b64}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": jwt,
            },
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


async def _list_folder_files(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    folder_id: str,
    *,
    since: datetime | None = None,
) -> list[dict[str, Any]]:
    """List all non-trashed files directly in a Drive folder."""
    files: list[dict[str, Any]] = []
    page_token: str | None = None

    while True:
        query = f"'{folder_id}' in parents and trashed = false"
        if since:
            query += f" and modifiedTime > '{since.isoformat()}'"
        params: dict[str, Any] = {
            "q": query,
            "fields": "nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime)",
            "pageSize": 100,
        }
        if page_token:
            params["pageToken"] = page_token

        try:
            resp = await client.get(f"{GDRIVE_API_BASE}/files", headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            logger.warning("Failed to list Drive folder %s: %s", folder_id, exc)
            break

        files.extend(data.get("files", []))
        page_token = data.get("nextPageToken")
        if not page_token:
            break

    return files


async def _get_file_meta(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    file_id: str,
) -> dict[str, Any] | None:
    """Fetch file metadata from Drive."""
    try:
        resp = await client.get(
            f"{GDRIVE_API_BASE}/files/{file_id}",
            headers=headers,
            params={"fields": "id, name, mimeType, webViewLink, modifiedTime"},
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        logger.warning("Failed to get Drive file meta %s: %s", file_id, exc)
        return None


async def _file_to_doc(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    file_meta: dict[str, Any],
) -> dict[str, Any] | None:
    """Download or export a Drive file and return a {title, content, source_url, doc_updated_at} dict."""
    file_id = file_meta["id"]
    title = file_meta.get("name", "Untitled")
    mime_type = file_meta.get("mimeType", "")
    source_url = file_meta.get("webViewLink", f"https://drive.google.com/file/d/{file_id}/view")
    doc_updated_at = file_meta.get("modifiedTime")

    # Google Workspace docs: export as text
    if mime_type in _EXPORTABLE_AS_TEXT:
        export_mime = _EXPORTABLE_AS_TEXT[mime_type]
        try:
            resp = await client.get(
                f"{GDRIVE_API_BASE}/files/{file_id}/export",
                headers=headers,
                params={"mimeType": export_mime},
            )
            resp.raise_for_status()
            content = resp.text
        except httpx.HTTPStatusError as exc:
            logger.warning("Failed to export Drive file %s: %s", file_id, exc)
            return None
        return {"title": title, "content": content, "source_url": source_url, "doc_updated_at": doc_updated_at}

    # Plain text files: download directly
    if any(mime_type.startswith(prefix) for prefix in _TEXT_MIME_PREFIXES):
        try:
            resp = await client.get(
                f"{GDRIVE_API_BASE}/files/{file_id}",
                headers=headers,
                params={"alt": "media"},
            )
            resp.raise_for_status()
            content = resp.text
        except httpx.HTTPStatusError as exc:
            logger.warning("Failed to download Drive file %s: %s", file_id, exc)
            return None
        return {"title": title, "content": content, "source_url": source_url, "doc_updated_at": doc_updated_at}

    # PDFs and other binary formats: store metadata only (full parsing out of scope for v1)
    logger.info(
        "Drive file %s (%s) is binary type %s — storing title/URL only", file_id, title, mime_type
    )
    return {
        "title": title,
        "content": f"[Binary file: {mime_type}. Download from {source_url}]",
        "source_url": source_url,
        "doc_updated_at": doc_updated_at,
    }
