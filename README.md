# TxHermesTranslateMessage — Translate Guard

**Auto-translate outgoing messages in Hermes Agent — write in your language, send in theirs.**

Translate Guard is a Hermes Agent plugin (agent half + desktop half in one package) that
rewrites your composer draft through a cascade of public translation engines right before
sending. The chat stores the translated message; the original stays available, and the edit
composer can flip between the two.

> **English** · [Русский](README.ru.md) · [中文](README.zh.md)

---

## What it does

| Surface | Behaviour |
|---|---|
| Composer (▾ next to the send button) | Menu with the **auto-translate** switch and the target language (English / 中文) |
| Send | The draft is translated through the engine cascade, then sent. The chat shows the translation |
| Edit composer | A small translate icon appears next to its send button; clicking swaps the editor text between the original and the translation |
| Settings ▸ Plugins ▸ Translate Guard | Mirrors the switch and language, shows live engine health (circuit breakers), and clears the translation cache |

Default state: **auto-translate on**, target language **English**. Chinese is one click away.

## Installation

### From the desktop app (recommended)

1. Copy this repository link:

   ```
   https://github.com/syntaxerror64/TxHermesTranslateMessage
   ```

2. In Hermes Agent open **Capabilities ▸ Plugins** (or **Settings ▸ Plugins**).
3. Paste the link into the plugin **import** field and confirm.
4. Enable **Translate Guard** when the install finishes.

The app clones the repository, scans it, and installs both halves as **one** plugin entry.

### From the CLI

```bash
hermes plugins install https://github.com/syntaxerror64/TxHermesTranslateMessage
hermes plugins enable translate-guard
```

Then restart the app, or run **⌘K → Reload desktop plugins**, so the desktop half is
materialized.

## Usage

- The **▾** button sits to the right of the send button in the composer.
- Click it to toggle **Auto-translate** or switch the target language.
- With auto-translate on, whatever you type is translated before it leaves your machine's
  composer — the chat keeps the translated text.
- After sending, open the message in the **edit composer**: the translate icon next to its
  send button flips between the translation and the original.

## Translation engines

Requests go through a cascade; the first engine that answers wins, and a failing engine is
skipped for the rest of its back-off window:

1. **Google** (translate.google.com)
2. **Mozhi** (six mirrors)
3. **SimplyTranslate**
4. **Lingva**
5. **MyMemory** (free tier has a daily character quota; the quota error is handled and the
   engine is paused instead of failing the request)

No API key is required. The first engine that answers is reported in the settings page, and a
successful translation is cached for 7 days, so repeating a message costs nothing.
**Settings ▸ Plugins ▸ Translate Guard ▸ Clear cache** drops the cache when you want the engines
asked again.

## Privacy

The text you send is transmitted to the public translation engine that answers the request
(Google, Mozhi, SimplyTranslate, Lingva or MyMemory). Nothing else leaves the machine: no
accounts, no telemetry, no plugin-side storage of your conversations. If that is not acceptable
for a message, turn auto-translate off before sending.

## How the plugin is built

```
plugin.yaml              ← Hermes plugin manifest
__init__.py              ← agent-side entry point (registers the dashboard API)
dashboard/manifest.json  ← dashboard/API declaration (hidden tab, REST only)
dashboard/plugin_api.py  ← FastAPI router: POST /translate (+ /health, /engines)
desktop/plugin.js        ← desktop half: composer menu, send middleware, edit toggle, settings page
```

The desktop half is not copied by hand: the app materializes `plugins/translate-guard/desktop/`
into its own `desktop-plugins/` directory with a `.hermes-package.json` marker, which is what
keeps the plugin a **single** entry in the plugins list.

### HTTP API

`POST /api/plugins/translate-guard/translate`

```json
{ "text": "привет, как дела?", "to": "en" }
```

```json
{ "text": "hi, how are you?", "engine": "google", "ms": 412, "cached": false }
```

`GET /api/plugins/translate-guard/health` — engine circuit-breaker state.

## Requirements

- Hermes Agent with plugin support (desktop app or CLI).
- Python 3.10+ (uses the Hermes runtime; `httpx` and `fastapi` ship with it).
- Network access to the translation engines listed above.

## Troubleshooting

**The menu does not open.** Update the plugin and run **⌘K → Reload desktop plugins** (or
restart the app). Older builds shipped a trigger guard that stopped the menu from opening.

**Messages go out untranslated.** The plugin fails open on purpose: if the backend does not
answer within the timeout, the message is sent as written and a warning toast appears. Check
that the Hermes backend is running (the desktop log shows `ECONNREFUSED 127.0.0.1:9119` while
it restarts) and try again.

**The cache button returns 404 after updating the plugin.** The backend mounts a plugin's
routes once, at startup, and does not rescan an already-mounted plugin. Restart the app (or the
Hermes backend) after updating, then the new route is live.

**Translation is slow or empty.** One engine may be rate-limited or down; the cascade skips it
and moves on. The settings page shows which engines are open. MyMemory's free daily quota is
exhausted fastest.

## Uninstall

```bash
hermes plugins remove translate-guard
```

Then remove the stale `desktop-plugins/translate-guard/` directory if the app leaves it behind,
and restart.

## License

MIT — see [LICENSE](LICENSE).

---

[Русская версия](README.ru.md) · [中文版本](README.zh.md)
