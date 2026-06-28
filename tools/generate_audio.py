#!/usr/bin/env python3
"""Pre-generate Ratón Pérez voice clips with edge-tts (free, no API key).

Reads data/script.json, synthesizes one MP3 per (line, name) combination using
Microsoft Edge's free neural voices, and writes them plus audio/manifest.json.
The resulting files ship with the app so playback is offline and never depends
on the device's robotic Web Speech voice.

Usage:
    pip install edge-tts          # one-time, free, no account
    python3 tools/generate_audio.py            # generate missing clips
    python3 tools/generate_audio.py --force    # regenerate everything
    python3 tools/generate_audio.py --voice es-MX-DaliaNeural   # override voice

Voice / pitch / rate defaults live in data/script.json and are easy to retune.

Note: Microsoft's free endpoint blocks datacenter/cloud IPs, so this must be run
from a normal computer (it won't work from most cloud sandboxes). Requires
Python 3.8+.
"""

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    sys.exit("Missing dependency. Run:  pip install edge-tts")

ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = ROOT / "data" / "script.json"
AUDIO_DIR = ROOT / "audio"
MANIFEST_PATH = AUDIO_DIR / "manifest.json"


def slug(name: str) -> str:
    """Match clipKey()/slug in app.js: lowercase, strip non-alphanumerics."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def clip_file(i: int, line: dict, name) -> str:
    return f"line-{i:02d}--{slug(name)}.mp3" if line.get("hasName") else f"line-{i:02d}.mp3"


def clip_key(i: int, line: dict, name) -> str:
    return f"{i}|{slug(name)}" if line.get("hasName") else str(i)


def fill(text: str, name) -> str:
    return text.replace("{name}", name) if name else text


def build_jobs(script: dict):
    """Expand the script into the ~13 (line, name) clip jobs."""
    jobs = []
    for i, line in enumerate(script["lines"]):
        if line.get("hasName"):
            for name in script["names"]:
                jobs.append((i, line, name))
        else:
            jobs.append((i, line, None))
    return jobs


async def synth(text: str, voice: str, rate: str, pitch: str, out: Path):
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(str(out))


async def main():
    parser = argparse.ArgumentParser(description="Generate Ratón Pérez voice clips with edge-tts.")
    parser.add_argument("--force", action="store_true", help="regenerate clips that already exist")
    parser.add_argument("--voice", help="override the voice name from script.json")
    parser.add_argument("--pitch", help="override the pitch from script.json (e.g. +18Hz)")
    parser.add_argument("--rate", help="override the rate from script.json (e.g. -4%%)")
    args = parser.parse_args()

    script = json.loads(SCRIPT_PATH.read_text(encoding="utf-8"))
    voice = args.voice or script.get("voice", "es-ES-ElviraNeural")
    pitch = args.pitch or script.get("pitch", "+0Hz")
    rate = args.rate or script.get("rate", "+0%")

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    clips = {}
    made = skipped = 0
    for i, line, name in build_jobs(script):
        rel = f"audio/{clip_file(i, line, name)}"
        dest = ROOT / rel
        clips[clip_key(i, line, name)] = rel

        if dest.exists() and not args.force:
            print(f"skip   {rel} (exists)")
            skipped += 1
            continue

        text = fill(line["es"], name)
        print(f"gen    {rel} ... ", end="", flush=True)
        try:
            await synth(text, voice, rate, pitch, dest)
        except Exception as exc:  # noqa: BLE001 - surface a friendly hint
            print("FAILED")
            sys.exit(
                f"\nedge-tts failed: {exc}\n"
                "If this is a 403, Microsoft is blocking this network (common on\n"
                "cloud/datacenter IPs). Run from a normal home computer instead."
            )
        print(f"{dest.stat().st_size} bytes")
        made += 1

    manifest = {
        "version": 1,
        "scriptVersion": script.get("version", 1),
        "voice": voice,
        "format": "mp3",
        "clips": clips,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"\nDone. {made} generated, {skipped} skipped, {len(clips)} clips in manifest.")
    print("Reminder: bump CACHE in sw.js so clients pick up the new audio.")


if __name__ == "__main__":
    asyncio.run(main())
