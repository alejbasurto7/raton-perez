# Ratón Pérez 🐭🦷

A tiny, kid-friendly **iOS Progressive Web App** that lets a child receive a magical
phone call from **Ratón Pérez** (the Spanish "tooth mouse", the local version of the
tooth fairy) after losing a tooth.

## How it works

1. **Pick a name** — the app opens to a list of names: **Sam, Daniel, Ben**.
2. **Incoming call** — the screen becomes an iOS-style incoming call from *Ratón Pérez*
   (cute mouse photo, ringtone, vibration). Decline or **Answer**.
3. **On the call** — Ratón Pérez talks to the child by name in a warm, scripted
   conversation about the lost tooth. He **speaks in Spanish** (using the device's
   built-in voice) while **English captions** appear on screen. **Tap anywhere on the
   screen** to move through the chat — a discreet tap lets the parent keep the
   conversation going without the child noticing.
4. **End call** — a red button is always available to hang up and return to the names.

Everything is gentle and positive — no scary sounds or visuals, no microphone, no
network, no data collection. It works fully offline once installed.

## Tech

- Plain **HTML + CSS + JavaScript**, no build step or dependencies.
- **Web Speech API** (`speechSynthesis`) for the Spanish voice, with a graceful
  text-only fallback if the device has no Spanish voice.
- A **service worker** (`sw.js`) precaches all assets for offline use.
- The character is the provided artwork in `assets/raton-perez.png`; app icons in
  `icons/` are cropped from it.

## Run locally

Serve the folder over HTTP (a service worker needs `http`/`https`, not `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

> The Spanish voice and audio unlock require a real user tap — that's the **Answer**
> button. On iOS, audio/speech only starts after that gesture, which is by design.

## Install on an iPhone

PWAs install on iOS via Safari over **HTTPS**:

1. Open the deployed HTTPS URL (see below) in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Launch it from the new home-screen icon — it runs full-screen like a native app
   and works offline.

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` publishes the site to **GitHub Pages** on every push to
the project branch. To enable it once: in the repo, go to **Settings → Pages → Build
and deployment → Source → GitHub Actions**. After the first run, your install URL is:

```
https://<your-username>.github.io/<repo-name>/
```

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Markup for the three screens + iOS/PWA meta tags |
| `styles.css` | iOS-call-style UI, safe-area handling, animations |
| `app.js` | State machine, scripted dialogue, speech, timer, haptics |
| `assets/raton-perez.png` | The Ratón Pérez character image |
| `manifest.webmanifest` | PWA manifest |
| `sw.js` | Service worker (offline cache) |
| `icons/` | App icons (192, 512, apple-touch) |

## Customizing

- **Names:** edit the three `.name-btn` buttons in `index.html`.
- **Dialogue:** edit the `SCRIPT` array in `app.js` (each line has Spanish `es` spoken
  text and English `en` caption; `{name}` is replaced with the chosen name).
