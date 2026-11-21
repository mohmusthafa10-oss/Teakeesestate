import importlib, sys, os
# Expose this package as top‑level 'app' for legacy absolute imports.
# This allows imports like 'from app.api.routes import ...' to resolve when the
# project is run with the repository root on PYTHONPATH (e.g., via uvicorn
# backend.app.main:app).

module_name = __name__  # 'backend.app'
if 'app' not in sys.modules:
    sys.modules['app'] = importlib.import_module(module_name)
