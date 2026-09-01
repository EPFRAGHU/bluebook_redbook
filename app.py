"""Compatibility entry point so a bare `gunicorn app:app` also works.

Render blueprints normally start the app via the `startCommand` in render.yaml
(`gunicorn backend.main:app ...`). If a service is created from the repo root
without that command, Render falls back to `gunicorn app:app`; this module
re-exports the FastAPI app from backend/main.py so that path resolves too.
"""

from backend.main import app

__all__ = ["app"]
