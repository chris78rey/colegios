from __future__ import annotations

import json
import webbrowser
from contextlib import ExitStack
from dataclasses import dataclass
from pathlib import Path

import requests
from requests import HTTPError

from .models import BatchPlan


@dataclass(slots=True)
class ApiSession:
    api_base: str
    email: str
    role: str
    organization_id: str | None


def login_to_api(api_base: str, email: str, password: str) -> ApiSession:
    normalized_base = normalize_api_base(api_base)
    response = requests.post(
        f"{normalized_base}/v1/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    user = payload.get("user") or {}
    return ApiSession(
        api_base=normalized_base,
        email=str(user.get("email") or email),
        role=str(user.get("role") or ""),
        organization_id=user.get("organizationId"),
    )


def upload_batch_to_api(session: ApiSession, plan: BatchPlan) -> dict:
    if not session.organization_id:
        raise ValueError("La cuenta no tiene organizacion asociada.")

    ready_documents = [
        document
        for document in plan.documents
        if document.status == "READY" and document.pdf_path and Path(document.pdf_path).exists()
    ]
    if not ready_documents:
        raise ValueError("No hay PDFs generados para subir.")

    manifest = {
        "batch_id": plan.batch_id,
        "source_excel": plan.source_excel,
        "headers": plan.headers,
        "missing_columns": plan.missing_columns,
        "rows": plan.rows,
        "documents": [
          {
              "row_index": document.row_index,
              "group_key": document.group_key,
              "template_name": document.template_name,
              "template_path": document.template_path,
              "output_name": document.output_name,
              "status": document.status,
              "rendered_html_path": document.rendered_html_path,
              "pdf_path": document.pdf_path,
              "error": document.error,
          }
          for document in plan.documents
        ],
    }

    data = {
        "organizationId": session.organization_id,
        "uploadedByEmail": session.email,
        "sourceExcel": Path(plan.source_excel).name,
        "manifest": json.dumps(manifest, ensure_ascii=True),
    }

    with ExitStack() as stack:
        files = []
        for document in ready_documents:
            pdf_path = Path(document.pdf_path)
            handle = stack.enter_context(pdf_path.open("rb"))
            files.append(("files", (pdf_path.name, handle, "application/pdf")))

        response = requests.post(
            f"{session.api_base}/v1/desktop-batches/import",
            data=data,
            files=files,
            timeout=180,
        )
    try:
        response.raise_for_status()
    except HTTPError as error:
        detail = _extract_error_detail(response)
        if detail:
            raise HTTPError(f"{error}\nDetalle API: {detail}", response=response) from error
        raise
    return response.json()


def open_web_history_from_desktop(
    api_base: str,
    email: str,
    password: str,
    batch_id: str | None = None,
) -> str:
    normalized_base = normalize_api_base(api_base)
    response = requests.post(
        f"{normalized_base}/v1/auth/desktop-web-link",
        json={
            "email": email,
            "password": password,
            "batchId": batch_id or "",
        },
        timeout=30,
    )
    try:
        response.raise_for_status()
    except HTTPError as error:
        detail = _extract_error_detail(response)
        if detail:
            raise HTTPError(f"{error}\nDetalle API: {detail}", response=response) from error
        raise
    payload = response.json()
    web_url = str(payload.get("url") or "").strip()
    if not web_url:
        raise ValueError("La API no devolvio una URL valida para abrir la web.")
    webbrowser.open(web_url)
    return web_url


def normalize_api_base(api_base: str) -> str:
    value = str(api_base or "").strip().rstrip("/")
    if not value:
        raise ValueError("Debes escribir la direccion del sistema.")
    if not value.startswith("http://") and not value.startswith("https://"):
        value = f"http://{value}"
    return value


def _extract_error_detail(response: requests.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return response.text.strip()

    if isinstance(payload, dict):
        error = str(payload.get("error") or "").strip()
        file_name = str(payload.get("file") or "").strip()
        if error and file_name:
            return f"{error} ({file_name})"
        if error:
            return error
        return json.dumps(payload, ensure_ascii=True)

    return str(payload).strip()
