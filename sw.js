/* Service worker — cache-first precache so the app opens offline after first load. */
const CACHE = "raton-perez-v2";
const ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "data/script.json",
  "assets/raton-perez.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png"
];

// Pre-generated voice clips. Cached best-effort: if they haven't been generated
// yet (tools/generate-audio.mjs), a missing file must NOT fail the whole install.
const AUDIO_ASSETS = [
  "audio/manifest.json",
  "audio/line-00--sam.mp3",
  "audio/line-00--daniel.mp3",
  "audio/line-00--ben.mp3",
  "audio/line-01.mp3",
  "audio/line-02.mp3",
  "audio/line-03.mp3",
  "audio/line-04.mp3",
  "audio/line-05--sam.mp3",
  "audio/line-05--daniel.mp3",
  "audio/line-05--ben.mp3",
  "audio/line-06--sam.mp3",
  "audio/line-06--daniel.mp3",
  "audio/line-06--ben.mp3"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(ASSETS).then(() =>
        // Best-effort: cache whatever audio exists, ignore any that 404.
        Promise.all(AUDIO_ASSETS.map((url) => cache.add(url).catch(() => {})))
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("index.html"));
    })
  );
});
