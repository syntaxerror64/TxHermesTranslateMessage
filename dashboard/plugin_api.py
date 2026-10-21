"""Translate Guard — cascading translation backend.

Ported from TweetTranslator (core/translator.js + core/config.js): Google gtx →
Mozhi (6 public instances, yandex→duckduckgo fallback) → SimplyTranslate →
Lingva → MyMemory. One engine dying is normal; the cascade guarantees a
translation or a hard error the UI can show.

Exposed to the desktop half via ctx.rest() under /api/plugins/translate-guard/.
"""

from __future__ import annotations

import re
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# --------------------------------------------------------------------------- #
# Engines (ports of CONFIG.APIS from TweetTranslator/core/config.js)
# --------------------------------------------------------------------------- #

GOOGLE_URL = "https://translate.googleapis.com/translate_a/single"

MOZHI_INSTANCES = [
    "https://mozhi.pussthecat.org",
    "https://mozhi.r4fo.com",
    "https://mzh.dc09.xyz",
    "https://mozhi.adminforge.de",
    "https://mozhi.bloat.cat",
    "https://mozhi.ducks.party",
]
MOZHI_ENGINE = "yandex"
MOZHI_FALLBACK_ENGINE = "duckduckgo"

SIMPLY_URL = "https://simplytranslate.org/api/translate/"
LINGVA_URL = "https://translate.plausibility.cloud"
MYMEMORY_URL = "https://api.mymemory.translated.net/get"

# MyMemory requires an explicit langpair (no auto-detect); the user of this
# plugin writes Russian, so that is the assumed source for the last resort.
MYMEMORY_SOURCE = "ru"

TIMEOUTS = {  # per-attempt, seconds — from TweetTranslator CONFIG
    "google": 2.0,
    "mozhi": 2.0,
    "simply": 1.5,
    "lingva": 1.5,
    "mymemory": 1.8,
}

# Circuit breaker per engine key (TweetTranslator thresholds).
BREAKER: dict[str, dict[str, Any]] = {
    "google": {"fails": 0, "open_until": 0.0, "threshold": 5, "reset_ms": 15000},
    "mozhi": {"fails": 0, "open_until": 0.0, "threshold": 3, "reset_ms": 20000},
    "simply": {"fails": 0, "open_until": 0.0, "threshold": 3, "reset_ms": 30000},
    "lingva": {"fails": 0, "open_until": 0.0, "threshold": 2, "reset_ms": 30000},
    "mymemory": {"fails": 0, "open_until": 0.0, "threshold": 1, "reset_ms": 120000},
}

_MOZHI_ERROR_RE = re.compile(r"QUERY\.LENGTH|LIMIT\.EXCEEDED|MAX\.ALLOWED", re.I)
_MYMEMORY_QUOTA_RE = re.compile(
    r"MYMEMORY WARNING|YOU USED ALL|QUERY\.LENGTH|LIMIT\.EXCEEDED|MAX\.ALLOWED", re.I
)

# --------------------------------------------------------------------------- #
# Preprocessor — protect URLs, @handles, $tickers with §N§ placeholders
# (TweetTranslator TextPreprocessor, minus the Twitter-crypto glossary which
# made sense for tweets but would corrupt ordinary chat prompts).
# --------------------------------------------------------------------------- #

_PP_TOKEN_RE = re.compile(
    r"(\$[A-Za-z][A-Za-z0-9]{0,15}"
    r"|@[A-Za-z_][A-Za-z0-9_]{0,14}"
    r"|https?://[^\s<>\"]{3,}"
    r"|\bt\.co/[A-Za-z0-9]+"
    r"|\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:/[^\s<>\"]*)?)",
    re.I,
)
_PP_PLACEHOLDER_RE = re.compile(r"§\s*(\d+)\s*§")


def _preprocess(text: str) -> tuple[str, list[str]]:
    placeholders: list[str] = []

    def _sub(match: re.Match) -> str:
        placeholders.append(match.group(0))
        return f"§{len(placeholders) - 1}§"

    return _PP_TOKEN_RE.sub(_sub, text), placeholders


def _postprocess(translated: str, placeholders: list[str]) -> str:
    result = translated
    if placeholders:
        restored: set[int] = set()

        def _restore(match: re.Match) -> str:
            idx = int(match.group(1))
            if idx < len(placeholders):
                restored.add(idx)
                return placeholders[idx]
            return match.group(0)

        result = _PP_PLACEHOLDER_RE.sub(_restore, result)
        # Engines sometimes drop placeholders entirely — re-attach at the end.
        result += " " + " ".join(p for i, p in enumerate(placeholders) if i not in restored)

    result = re.sub(r"  +", " ", result)
    result = re.sub(r" ([.,;:!?)])", r"\1", result)
    return result.strip()


# --------------------------------------------------------------------------- #
# Cache (7-day TTL, TweetTranslator CACHE.TTL_MS) — in-process, bounded.
# --------------------------------------------------------------------------- #

_CACHE: dict[str, tuple[float, str]] = {}
_CACHE_MAX = 5000
_CACHE_TTL_S = 7 * 24 * 3600


def _cache_get(key: str) -> str | None:
    hit = _CACHE.get(key)
    if not hit:
        return None
    expires, value = hit
    if time.time() > expires:
        _CACHE.pop(key, None)
        return None
    return value


def _cache_put(key: str, value: str) -> None:
    if len(_CACHE) >= _CACHE_MAX:
        # Drop the oldest ~10% by insertion order (dicts preserve it).
        for old in list(_CACHE)[: _CACHE_MAX // 10]:
            _CACHE.pop(old, None)
    _CACHE[key] = (time.time() + _CACHE_TTL_S, value)


# --------------------------------------------------------------------------- #
# Engine implementations
# --------------------------------------------------------------------------- #


class _RateLimited(Exception):
    pass


def _breaker_open(key: str) -> bool:
    b = BREAKER[key]
    return time.time() * 1000 < b["open_until"]


def _breaker_fail(key: str) -> None:
    b = BREAKER[key]
    b["fails"] += 1
    if b["fails"] >= b["threshold"]:
        b["open_until"] = time.time() * 1000 + b["reset_ms"]


def _breaker_ok(key: str) -> None:
    BREAKER[key]["fails"] = 0
    BREAKER[key]["open_until"] = 0.0


async def _google(client: httpx.AsyncClient, text: str, to_lang: str) -> str:
    resp = await client.get(
        GOOGLE_URL,
        params={"client": "gtx", "sl": "auto", "tl": to_lang, "dt": "t", "q": text},
    )
    if resp.status_code == 429:
        raise _RateLimited("google 429")
    resp.raise_for_status()
    data = resp.json()
    if not data or not isinstance(data[0], list):
        raise ValueError("google: invalid response")
    return "".join(seg[0] for seg in data[0] if seg and seg[0])


async def _mozhi(client: httpx.AsyncClient, text: str, to_lang: str) -> str:
    last_error: Exception | None = None
    for base in MOZHI_INSTANCES:
        for engine in (MOZHI_ENGINE, MOZHI_FALLBACK_ENGINE):
            try:
                resp = await client.get(
                    f"{base}/api/translate",
                    params={"engine": engine, "from": "auto", "to": to_lang, "text": text},
                )
                if resp.status_code == 429:
                    raise _RateLimited(f"mozhi {base} 429")
                if resp.status_code >= 500:
                    last_error = ValueError(f"mozhi {base} HTTP {resp.status_code}")
                    continue  # retry same instance with the fallback engine
                resp.raise_for_status()
                data = resp.json()
                translated = (
                    data.get("translated-text")
                    or data.get("translated_text")
                    or data.get("translatedText")
                    or data.get("translation")
                )
                if not translated:
                    raise ValueError(f"mozhi {base}: no translation")
                if _MOZHI_ERROR_RE.search(translated) and len(translated) < 200:
                    raise ValueError(f"mozhi {base}: {translated[:80]}")
                return translated
            except _RateLimited:
                raise
            except Exception as exc:  # instance down — try the next one
                last_error = exc
    raise last_error or ValueError("mozhi: all instances failed")


async def _simply(client: httpx.AsyncClient, text: str, to_lang: str) -> str:
    resp = await client.get(
        SIMPLY_URL,
        params={"engine": "google", "from": "auto", "to": to_lang, "text": text},
    )
    if resp.status_code == 429:
        raise _RateLimited("simply 429")
    resp.raise_for_status()
    data = resp.json()
    translated = data.get("translated_text") or data.get("translated-text")
    if not translated:
        raise ValueError("simply: no translation")
    return translated


async def _lingva(client: httpx.AsyncClient, text: str, to_lang: str) -> str:
    from urllib.parse import quote
    resp = await client.get(f"{LINGVA_URL}/api/v1/auto/{to_lang}/{quote(text, safe='')}")
    if resp.status_code == 429:
        raise _RateLimited("lingva 429")
    resp.raise_for_status()
    translated = resp.json().get("translation")
    if not translated:
        raise ValueError("lingva: no translation")
    return translated


async def _mymemory(client: httpx.AsyncClient, text: str, to_lang: str) -> str:
    resp = await client.get(
        MYMEMORY_URL,
        params={"q": text, "langpair": f"{MYMEMORY_SOURCE}|{to_lang}"},
    )
    if resp.status_code == 429:
        raise _RateLimited("mymemory 429")
    resp.raise_for_status()
    data = resp.json()
    payload = data.get("responseData") or {}
    translated = payload.get("translatedText")
    if not translated:
        raise ValueError("mymemory: no translation")
    if _MYMEMORY_QUOTA_RE.search(translated):
        raise _RateLimited("mymemory quota")
    return translated


# Cascade order mirrors TweetTranslator: google → mozhi → simply → lingva → mymemory.
_ENGINES = [
    ("google", _google),
    ("mozhi", _mozhi),
    ("simply", _simply),
    ("lingva", _lingva),
    ("mymemory", _mymemory),
]

# Chunk long text at sentence boundaries so URL-length-limited engines survive.
_CHUNK_RE = re.compile(r"(?<=[.!?…\n])\s+")
_CHUNK_MAX = 2500


def _chunks(text: str) -> list[str]:
    if len(text) <= _CHUNK_MAX:
        return [text]
    parts: list[str] = []
    current = ""
    for piece in _CHUNK_RE.split(text):
        if current and len(current) + len(piece) + 1 > _CHUNK_MAX:
            parts.append(current)
            current = piece
        else:
            current = f"{current} {piece}".strip()
    if current:
        parts.append(current)
    return parts


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #


class TranslateRequest(BaseModel):
    text: str
    to: str = "en"


class TranslateResponse(BaseModel):
    text: str
    engine: str
    ms: int
    cached: bool


async def _cascade(text: str, to_lang: str) -> tuple[str, str]:
    """Try every working engine in order; raise with the last error if all fail."""
    errors: list[str] = []
    async with httpx.AsyncClient(
        timeout=max(TIMEOUTS.values()), follow_redirects=True
    ) as client:
        for key, fn in _ENGINES:
            if _breaker_open(key):
                errors.append(f"{key}: breaker open")
                continue
            started = time.perf_counter()
            try:
                result = await fn(client, text, to_lang)
            except _RateLimited as exc:
                _breaker_fail(key)
                errors.append(f"{key}: {exc}")
                continue
            except Exception as exc:
                _breaker_fail(key)
                errors.append(f"{key}: {exc}")
                continue
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            if elapsed_ms > TIMEOUTS[key] * 1000 * 2:  # suspiciously slow — discourage reuse
                _breaker_fail(key)
            else:
                _breaker_ok(key)
            return result, key
    raise RuntimeError("; ".join(errors) or "no engines configured")


@router.post("/translate", response_model=TranslateResponse)
async def translate(req: TranslateRequest) -> TranslateResponse:
    text = req.text.strip()
    if not text:
        return TranslateResponse(text="", engine="none", ms=0, cached=False)
    to_lang = (req.to or "en").split("-")[0].lower()

    cache_key = f"{to_lang}:{text}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return TranslateResponse(text=cached, engine="cache", ms=0, cached=True)

    started = time.perf_counter()
    results: list[str] = []
    engine_used = "none"
    errors: list[str] = []
    for chunk in _chunks(text):
        clean, placeholders = _preprocess(chunk)
        try:
            translated, engine_used = await _cascade(clean, to_lang)
        except RuntimeError as exc:
            # Keep already-translated chunks; fail only when nothing came through.
            if results:
                errors.append(str(exc))
                break
            raise HTTPException(status_code=502, detail=f"all engines failed: {exc}") from exc
        results.append(_postprocess(translated, placeholders))

    merged = " ".join(r for r in results if r).strip() or text
    ms = int((time.perf_counter() - started) * 1000)
    _cache_put(cache_key, merged)
    return TranslateResponse(text=merged, engine=engine_used, ms=ms, cached=False)


@router.post("/cache/clear")
async def clear_cache() -> dict[str, int]:
    """Drop every cached translation — the settings page button."""
    removed = len(_CACHE)
    _CACHE.clear()
    return {"cleared": removed}


@router.get("/engines")
async def engines() -> dict[str, Any]:
    """Breaker state per engine — surfaced on the settings page."""
    return {
        key: {
            "state": "open" if _breaker_open(key) else "closed",
            "failures": b["fails"],
            "reset_ms": b["reset_ms"],
        }
        for key, b in BREAKER.items()
    }
