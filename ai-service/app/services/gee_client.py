"""Google Earth Engine (GEE) client for the SIH 26009 platform.

Earth Engine initialisation is *lazy* and *thread safe*: the FastAPI process
boots instantly and only authenticates against GEE the first time a route or
script actually needs it. This keeps `/health` fast and lets the service start
even when EE credentials are temporarily unavailable.

The quota project defaults to `gen-lang-client-0167226131` (see `app/config.py`).
"""

from __future__ import annotations

import logging
import threading
from typing import Any

import ee

from app.config import get_settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_initialized: bool = False
_init_error: str | None = None


class GEEInitializationError(RuntimeError):
    """Raised when Earth Engine cannot be initialised."""


def initialize_gee(project: str | None = None, force: bool = False) -> bool:
    """Initialise the Earth Engine API exactly once.

    Args:
        project: Optional cloud project override. Defaults to `GEE_PROJECT`.
        force: Re-initialise even if already initialised (useful for tests).

    Returns:
        True if the session is initialised and ready to use.

    Raises:
        GEEInitializationError: if the GEE session could not be established.
    """
    global _initialized, _init_error

    if _initialized and not force:
        return True

    with _lock:
        if _initialized and not force:
            return True

        settings = get_settings()
        project_id = project or settings.gee_project

        try:
            if settings.gee_service_account_keyfile:
                credentials = ee.ServiceAccountCredentials(
                    email=None,  # derived from the key file
                    key_file=settings.gee_service_account_keyfile,
                    project=project_id,
                )
                ee.Initialize(credentials, project=project_id)
            else:
                ee.Initialize(project=project_id)

            _initialized = True
            _init_error = None
            logger.info("Earth Engine initialised with project '%s'", project_id)
        except Exception as exc:  # noqa: BLE001 - surfaced to callers verbatim
            _initialized = False
            _init_error = str(exc)
            logger.exception("Earth Engine initialisation failed for project '%s'", project_id)
            raise GEEInitializationError(
                f"Earth Engine initialisation failed for project '{project_id}': {exc}"
            ) from exc

        return _initialized


def get_ee(project: str | None = None) -> Any:
    """Return the initialised `ee` module, initialising it on first use."""
    initialize_gee(project=project)
    return ee


def gee_status() -> dict[str, Any]:
    """Non-throwing health probe describing the current GEE session."""
    settings = get_settings()
    status: dict[str, Any] = {
        "project": settings.gee_project,
        "initialized": _initialized,
        "error": _init_error,
    }

    if not _initialized:
        try:
            initialize_gee()
            status["initialized"] = True
            status["error"] = None
        except GEEInitializationError as exc:
            status["initialized"] = False
            status["error"] = str(exc)

    return status


def reset_gee_state() -> None:
    """Reset the cached initialisation state (test helper)."""
    global _initialized, _init_error
    with _lock:
        _initialized = False
        _init_error = None
