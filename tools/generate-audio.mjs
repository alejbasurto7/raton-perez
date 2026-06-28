#!/usr/bin/env node
/* Pre-generate Ratón Pérez voice clips with ElevenLabs.
 *
 * Reads data/script.json, synthesizes one MP3 per (line, name) combination, and
 * writes them plus audio/manifest.json. Run once (or whenever the script/voice
 * changes); the resulting files ship with the app so playback is offline and
 * never depends on the device's robotic Web Speech voice.
 *
 * Usage:
 *   export ELEVENLABS_API_KEY=...        # required, never commit a key
 *   node tools/generate-audio.mjs        # generate missing clips
 *   node tools/generate-audio.mjs --force        # regenerate everything
 *   node tools/generate-audio.mjs --voice <id>   # override voiceId from JSON
 *
 * Requires Node 18+ (global fetch). No npm dependencies.
 */

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { constants as FS } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildTtsRequest, ttsUrl } from "./elevenlabs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SCRIPT_PATH = join(ROOT, "data", "script.json");
const AUDIO_DIR = join(ROOT, "audio");
const MANIFEST_PATH = join(AUDIO_DIR, "manifest.json");

// ----- Shared helpers (key/slug must match resolveClipSrc/clipKey in app.js) -----
const slug = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
const clipKey = (i, line, name) => (line.hasName ? `${i}|${slug(name)}` : String(i));
const clipFile = (i, line, name) =>
  line.hasName ? `line-${pad(i)}--${slug(name)}.mp3` : `line-${pad(i)}.mp3`;
const pad = (i) => String(i).padStart(2, "0");
const fill = (text, name) => text.replace(/\{name\}/g, name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function exists(p) {
  try { await access(p, FS.F_OK); return true; } catch { return false; }
}

function parseArgs(argv) {
  const out = { force: false, voice: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--force") out.force = true;
    else if (argv[i] === "--voice") out.voice = argv[++i];
  }
  return out;
}

async function synthesize(apiKey, voiceId, text) {
  const res = await fetch(ttsUrl(voiceId), {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg"
    },
    body: JSON.stringify(buildTtsRequest(text))
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status} ${res.statusText}: ${detail.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("ERROR: set ELEVENLABS_API_KEY before running (export ELEVENLABS_API_KEY=...).");
    process.exit(1);
  }

  const script = JSON.parse(await readFile(SCRIPT_PATH, "utf8"));
  const voiceId = args.voice || script.voiceId;
  if (!voiceId || voiceId === "REPLACE_WITH_ELEVENLABS_VOICE_ID") {
    console.error("ERROR: no voiceId. Set it in data/script.json or pass --voice <id>.");
    process.exit(1);
  }

  await mkdir(AUDIO_DIR, { recursive: true });

  // Build the full job list (the ~13 clips).
  const jobs = [];
  script.lines.forEach((line, i) => {
    if (line.hasName) {
      for (const name of script.names) jobs.push({ i, line, name });
    } else {
      jobs.push({ i, line, name: null });
    }
  });

  const clips = {};
  let made = 0, skipped = 0;
  for (const { i, line, name } of jobs) {
    const file = clipFile(i, line, name);
    const rel = `audio/${file}`;
    const abs = join(AUDIO_DIR, file);
    clips[clipKey(i, line, name)] = rel;

    if (!args.force && (await exists(abs))) {
      console.log(`skip   ${rel} (exists)`);
      skipped++;
      continue;
    }

    const text = name ? fill(line.es, name) : line.es;
    process.stdout.write(`gen    ${rel} ... `);
    const audio = await synthesize(apiKey, voiceId, text);
    await writeFile(abs, audio);
    console.log(`${audio.length} bytes`);
    made++;
    await sleep(350); // be gentle with rate limits
  }

  const manifest = {
    version: 1,
    scriptVersion: script.version,
    voiceId,
    format: "mp3",
    clips
  };
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`\nDone. ${made} generated, ${skipped} skipped, ${Object.keys(clips).length} clips in manifest.`);
  console.log("Reminder: bump CACHE in sw.js so clients pick up the new audio.");
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});
