# Voice generation tools

These scripts pre-generate Ratón Pérez's voice clips so the app plays a warm,
natural voice instead of the device's robotic Web Speech voice. The generated
MP3s ship with the app and play offline. This is a **build-time** tool — the
browser never loads it.

We use [edge-tts](https://github.com/rany2/edge-tts): Microsoft Edge's neural
voices, **free and with no API key**. It's only needed when you (re)generate the
clips; the shipped app needs no network.

## Generate the clips

```sh
pip install edge-tts                 # one-time, free, no account
python3 tools/generate_audio.py      # writes audio/*.mp3 + audio/manifest.json
```

Options:

```sh
python3 tools/generate_audio.py --force                  # regenerate everything
python3 tools/generate_audio.py --voice es-MX-DaliaNeural --pitch +12Hz
```

This produces 13 clips (4 name-free lines + 3 name-bearing lines × 3 names) and
`audio/manifest.json`, which maps each `(line, name)` to its file. Re-running
skips clips that already exist unless `--force` is passed.

> **Run this on a normal computer.** Microsoft's free endpoint blocks
> datacenter/cloud IPs, so generation typically fails with a `403` from cloud
> sandboxes/CI. From a home machine it just works.

## After generating

1. Commit the new `audio/*.mp3` and `audio/manifest.json`.
2. **Bump `CACHE` in `sw.js`** (e.g. `raton-perez-v2` → `v3`). The service worker
   precaches by cache name, so without a bump returning visitors keep old clips.

The app degrades gracefully in the meantime: if a clip is missing it falls back
to the browser's Web Speech voice, so nothing breaks before you generate.

## Voice & "mouse" tuning

All knobs live in one place, `data/script.json`:

| Field   | Default              | Notes |
|---------|----------------------|-------|
| `voice` | `es-ES-ElviraNeural` | Warm female Spain-Spanish neural voice. |
| `pitch` | `+18Hz`              | Modest lift → gentle, slightly mouse-like but still natural. Raise toward `+30Hz` for squeakier, lower toward `+0Hz` for plain. |
| `rate`  | `-4%`               | Slightly slower for clarity for young listeners. |

List every available voice with `edge-tts --list-voices`. Some good Spanish
alternatives:

- `es-ES-ElviraNeural` — female, Spain (default)
- `es-ES-AlvaroNeural` — male, Spain
- `es-MX-DaliaNeural` — female, Mexico
- `es-MX-JorgeNeural` — male, Mexico

Pitch is applied by edge-tts itself (no ffmpeg needed), so the timbre stays
natural rather than chipmunk-like.

## Forward-compatibility

The single client swap point is `resolveClipSrc()` in `app.js`. A future feature
(custom names, editable scripts, other languages) can add a small backend that
runs edge-tts on demand — still free — and returns a URL; only `resolveClipSrc()`
changes, while `playClip()`, the avatar animation, and the service worker stay
as-is.
