"""Translate Guard — backend translation cascade.

No agent-side hooks or tools: the desktop half calls ``dashboard/plugin_api.py``
through ``ctx.rest``. Present so the plugin manager can load the package.
"""

from __future__ import annotations

PLUGIN_ID = "translate-guard"


def register(ctx):
    """Present so the plugin manager can load the package; nothing to hook."""
    return None
