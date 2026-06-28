# Voice generation tools

These scripts pre-generate Ratón Pérez's voice clips with [ElevenLabs](https://elevenlabs.io)
so the app plays warm, natural audio instead of the device's robotic Web Speech
voice. The generated MP3s ship with the app and play offline. They are **build-time**
tools — they are never loaded by the browser.

## One-time setup

1. Pick a voice in the ElevenLabs Voice Library. Audition warm, soft, young-sounding
   voices that read Spanish well under the `eleven_multilingual_v2` model — that
   timbre is what makes Ratón Pérez sound *gently* mouse-like without being squeaky.
   Copy its **Voice ID**.
2. Put the Voice ID in `data/script.json` (`"voiceId"`), or pass `--voice <id>` each run.
3. Get your ElevenLabs API key and export it (never commit it):

   ```sh
   export ELEVENLABS_API_KEY=sk_...
   ```

## Generate

Requires Node 18+ (uses the global `fetch`). No npm install needed.

```sh
node tools/generate-audio.mjs            # generate any missing clips
node tools/generate-audio.mjs --force    # regenerate every clip
node tools/generate-audio.mjs --voice <id>   # override the voiceId from script.json
```

This writes `audio/line-*.mp3` (13 clips: 4 name-free lines + 3 name-bearing
lines × 3 names) and `audio/manifest.json`, which maps each `(line, name)` to its
file. Re-running skips clips that already exist unless `--force` is passed, so you
don't re-spend credits.

## After regenerating

**Bump `CACHE` in `sw.js`** (e.g. `raton-perez-v2` → `v3`) whenever the audio,
`data/script.json`, or `app.js` changes. The service worker precaches by cache
name, so without a bump returning visitors keep the old clips.

## Voice tuning

Settings live in one place: `tools/elevenlabs.mjs` (`DEFAULT_VOICE_SETTINGS`).
Current values — `stability 0.5`, `similarity_boost 0.8`, `style 0.0`,
`use_speaker_boost true` — favor a warm, steady, natural read.

We intentionally do **not** pitch-shift the audio: a global pitch-up reintroduces
the chipmunk/robotic artifact we're trying to escape. The "mouse" quality should
come from voice choice. If you ever want a subtle lift, do it with a
formant-preserving tool (`rubberband`), keep it tiny (≤ +1 semitone), and never use
`asetrate`.

## Forward-compatibility

`tools/elevenlabs.mjs` (`buildTtsRequest`) is deliberately framework-free so a
future serverless TTS proxy — for custom names, editable scripts, or other
languages — can import it and produce byte-identical audio. On the client, the
single swap point is `resolveClipSrc()` in `app.js`.
