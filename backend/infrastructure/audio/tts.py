"""
infrastructure/audio/tts.py

Ruki's voice: Google Cloud Text-to-Speech, authenticated with the SAME Vertex
AI Application Default Credentials (service-account JSON via
GOOGLE_APPLICATION_CREDENTIALS) the LLM layer uses — synthesis bills to the
project's GCP credit pool, no extra API key.

Why si-LK: the Sinhala (Sri Lanka) voices render native Sinhala script
correctly AND read embedded English words gracefully, so mixed Tanglish
catalog strings ("Aiyo! 5 Red Roses Bouquet ekak") no longer produce the
breaking pronunciations browser-native synthesis gave us. The voice profile
is a FEMALE variant to match the Ruki persona.

Setup note: the Cloud Text-to-Speech API (texttospeech.googleapis.com) must be
enabled on the GCP project — one click at
https://console.cloud.google.com/apis/library/texttospeech.googleapis.com

Uses the REST endpoint via httpx + google-auth (both already installed as
google-genai dependencies) instead of pulling in the google-cloud-texttospeech
client library.

Resilience contract: synthesize_speech raises TTSUnavailableError on ANY
failure — the frontend catches the non-200 and falls back to browser-native
synthesis, so voice mode keeps working even if the API is disabled or offline.
"""

import os
import re
import sys
import time
import base64
import asyncio
import hashlib
import logging
from typing import Optional

import httpx

logger = logging.getLogger("kapruka-tts")

# ── Configuration (env-overridable) ──────────────────────────────────────────
# si-LK ships Standard voices; -A is the female profile. If Google later adds
# Neural2/Wavenet si-LK variants, point TTS_VOICE_NAME at one — no code change.
TTS_LANGUAGE_CODE = os.getenv("TTS_LANGUAGE_CODE", "si-LK")
TTS_VOICE_NAME = os.getenv("TTS_VOICE_NAME", "si-LK-Standard-A")
TTS_SPEAKING_RATE = float(os.getenv("TTS_SPEAKING_RATE", "0.97"))
TTS_TIMEOUT_SECONDS = float(os.getenv("TTS_TIMEOUT_SECONDS", "15.0"))

_TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize"
_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]

# Cloud TTS caps input at 5000 BYTES. Sinhala script is 3 bytes/char in UTF-8,
# so cap conservatively by characters.
_MAX_CHARS = 1200


class TTSUnavailableError(RuntimeError):
    """Raised when real synthesis fails — callers fall back to browser TTS."""


# ── Text sanitisation ─────────────────────────────────────────────────────────

def sanitize_for_speech(text: str) -> str:
    """Serialize a raw chat chunk into safely speakable plain text.

    Strips the SSE control tokens (<<PRODUCTS>>: payloads etc.), markdown
    syntax, URLs, and emoji/pictographs (which TTS reads as literal names),
    while preserving BOTH English letters and native Sinhala script
    (U+0D80–U+0DFF) so mixed Tanglish strings survive intact.
    """
    if not text:
        return ""

    clean = text
    # Control tokens and their payloads: <<PRODUCTS>>:{...} / <<LOGISTICS>> etc.
    clean = re.sub(r"<<[A-Z_]+>>:?\S*", " ", clean)
    # URLs — reading them aloud is noise.
    clean = re.sub(r"https?://\S+", " ", clean)
    # Markdown decorations.
    clean = re.sub(r"[*_#`~\[\]()>|]", " ", clean)
    # Emoji & pictographs (keep letters, digits, Sinhala block, punctuation).
    clean = re.sub(
        r"[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F900-\U0001F9FF←-⇿✀-➿]",
        " ",
        clean,
    )
    # Collapse whitespace.
    clean = re.sub(r"\s+", " ", clean).strip()

    if len(clean) > _MAX_CHARS:
        # Cut on a sentence boundary where possible so speech doesn't stop mid-word.
        cut = clean[:_MAX_CHARS]
        last_stop = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "), cut.rfind("। "))
        clean = cut[: last_stop + 1] if last_stop > 200 else cut

    return clean


# ── ADC access-token cache ────────────────────────────────────────────────────

_token_cache: dict = {"token": None, "expiry": 0.0}
_token_lock = asyncio.Lock()


def _refresh_token_sync() -> tuple[str, float]:
    """Fetch a fresh OAuth2 access token from ADC. Runs in a worker thread."""
    import google.auth
    from google.auth.transport.requests import Request

    credentials, _project = google.auth.default(scopes=_SCOPES)
    credentials.refresh(Request())
    expiry_ts = credentials.expiry.timestamp() if credentials.expiry else time.time() + 3000
    return credentials.token, expiry_ts


async def _get_access_token() -> str:
    async with _token_lock:
        # 60s safety margin so a token never expires mid-request.
        if _token_cache["token"] and time.time() < _token_cache["expiry"] - 60:
            return _token_cache["token"]
        try:
            token, expiry = await asyncio.to_thread(_refresh_token_sync)
        except Exception as e:
            raise TTSUnavailableError(f"ADC credentials unavailable for TTS: {e}") from e
        _token_cache["token"] = token
        _token_cache["expiry"] = expiry
        return token


# ── Synthesis result cache (identical phrases are common: confirmations etc.) ─

_AUDIO_CACHE_MAX = 128
_audio_cache: dict[str, bytes] = {}


def _cache_key(text: str) -> str:
    return hashlib.sha256(
        f"{TTS_LANGUAGE_CODE}|{TTS_VOICE_NAME}|{TTS_SPEAKING_RATE}|{text}".encode("utf-8")
    ).hexdigest()


# ── HTTP client (Windows IPv4 pin, same rationale as the LLM client) ─────────

_http_client: Optional[httpx.AsyncClient] = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        transport = None
        if sys.platform == "win32":
            # httpx dual-stack connect stalls ~20s on IPv6 on this host —
            # bind the source to IPv4, exactly like infrastructure/llm/client.py.
            transport = httpx.AsyncHTTPTransport(local_address="0.0.0.0")
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(TTS_TIMEOUT_SECONDS),
            transport=transport,
        )
    return _http_client


async def close_http_client() -> None:
    """Dispose the shared client on app shutdown."""
    global _http_client
    if _http_client is not None:
        try:
            await _http_client.aclose()
        except Exception as e:
            logger.warning("Error closing TTS http client: %s", e)
        _http_client = None


# ── Core synthesis ────────────────────────────────────────────────────────────

async def _synthesize_once(text: str, token: str, voice_name: Optional[str]) -> bytes:
    """One REST call to Cloud TTS. Returns MP3 bytes; raises httpx errors."""
    voice: dict = {"languageCode": TTS_LANGUAGE_CODE, "ssmlGender": "FEMALE"}
    if voice_name:
        voice["name"] = voice_name

    payload = {
        "input": {"text": text},
        "voice": voice,
        "audioConfig": {
            "audioEncoding": "MP3",
            "speakingRate": TTS_SPEAKING_RATE,
        },
    }

    client = _get_http_client()
    resp = await client.post(
        _TTS_ENDPOINT,
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    resp.raise_for_status()
    audio_b64 = resp.json().get("audioContent", "")
    if not audio_b64:
        raise TTSUnavailableError("Cloud TTS returned an empty audioContent.")
    return base64.b64decode(audio_b64)


async def synthesize_speech(text: str) -> bytes:
    """Synthesize `text` into MP3 bytes with Ruki's female si-LK voice.

    Handles mixed Sinhala/English input, caches identical phrases, and retries
    once WITHOUT the explicit voice name if the named profile is rejected
    (region rollouts of si-LK voices vary) — the languageCode + FEMALE gender
    pair then lets Google pick the closest available female Sinhala voice.

    Raises TTSUnavailableError on any failure.
    """
    clean = sanitize_for_speech(text)
    if not clean:
        raise TTSUnavailableError("Nothing speakable in the supplied text.")

    key = _cache_key(clean)
    cached = _audio_cache.get(key)
    if cached is not None:
        return cached

    token = await _get_access_token()

    try:
        audio = await _synthesize_once(clean, token, TTS_VOICE_NAME)
    except httpx.HTTPStatusError as e:
        body = e.response.text[:400]
        if e.response.status_code in (400, 404) and TTS_VOICE_NAME:
            # Named voice not available — fall back to gender+locale selection.
            logger.warning(
                "Voice '%s' rejected (%s). Retrying with gender-only selection. Body: %s",
                TTS_VOICE_NAME, e.response.status_code, body,
            )
            try:
                audio = await _synthesize_once(clean, token, None)
            except Exception as e2:
                raise TTSUnavailableError(f"Cloud TTS synthesis failed: {e2}") from e2
        elif e.response.status_code == 403:
            raise TTSUnavailableError(
                "Cloud Text-to-Speech API is not enabled on this project — enable "
                "texttospeech.googleapis.com in the GCP console. " + body
            ) from e
        else:
            raise TTSUnavailableError(f"Cloud TTS HTTP {e.response.status_code}: {body}") from e
    except httpx.HTTPError as e:
        raise TTSUnavailableError(f"Cloud TTS network error: {e}") from e

    if len(_audio_cache) >= _AUDIO_CACHE_MAX:
        _audio_cache.pop(next(iter(_audio_cache)))
    _audio_cache[key] = audio
    return audio
