/* Ratón Pérez — tooth fairy call PWA
 * Vanilla JS state machine: picker -> incoming -> call -> goodbye -> picker
 * Ratón Pérez speaks Spanish via the device's speech synthesis; English captions on screen.
 */
(function () {
  "use strict";

  // ----- Scripted conversation. {name} is replaced with the chosen name. -----
  // The authoritative copy lives in data/script.json (shared with the audio
  // generator). This inline copy is a fallback if that fetch ever fails offline.
  const SCRIPT_FALLBACK = [
    { es: "¡Hola {name}! Soy Ratón Pérez. ¿Me oyes bien?",
      en: "Hi {name}! It's Ratón Pérez. Can you hear me?", hasName: true },
    { es: "¡Me han dicho que se te ha caído un diente! ¡Qué noticia tan maravillosa!",
      en: "I heard you lost a tooth! What wonderful news!", hasName: false },
    { es: "Estoy dando saltitos de alegría con mi colita. ¡Estoy muy feliz por ti!",
      en: "I'm hopping with joy and wagging my little tail. I'm so happy for you!", hasName: false },
    { es: "Cuando te duermas esta noche, pasaré por tu almohada a buscar tu dientecito.",
      en: "Tonight while you sleep, I'll visit your pillow to collect your little tooth.", hasName: false },
    { es: "Lo guardaré en mi castillo de dientes, donde todos brillan como estrellitas.",
      en: "I'll keep it in my castle of teeth, where they all shine like little stars.", hasName: false },
    { es: "Sigue cepillándote, {name}, para que tus dientes estén fuertes y bonitos.",
      en: "Keep brushing, {name}, so your teeth stay strong and beautiful.", hasName: true },
    { es: "Tengo que seguir mi ronda. ¡Dulces sueños, {name}! ¡Hasta muy pronto!",
      en: "I must continue my rounds. Sweet dreams, {name}! See you very soon!", hasName: true }
  ];
  // Mutable so loadData() can swap in data/script.json once fetched.
  let SCRIPT = SCRIPT_FALLBACK;

  // ----- Elements -----
  const screens = {
    picker: document.getElementById("screen-picker"),
    incoming: document.getElementById("screen-incoming"),
    call: document.getElementById("screen-call")
  };
  const captionEl = document.getElementById("caption");
  const continueBtn = document.getElementById("btn-continue");
  const timerEl = document.getElementById("call-timer");
  const goodbyeEl = document.getElementById("goodbye");
  const liveAvatar = document.getElementById("call-avatar-live");

  // ----- State -----
  let chosenName = "";
  let lineIndex = 0;
  let timerId = null;
  let ringTimers = [];
  let spanishVoice = null;
  let clipManifest = null;   // { clips: { "0|sam": "audio/...", "1": "audio/..." } }
  let currentAudio = null;   // the HTMLAudioElement currently playing a clip
  let warmAudio = null;      // single element unlocked by the Answer gesture (iOS)

  // ----- Speech synthesis -----
  const synth = window.speechSynthesis || null;

  function loadVoice() {
    if (!synth) return;
    const voices = synth.getVoices() || [];
    // Prefer es-ES, then any Spanish voice.
    spanishVoice =
      voices.find(v => /^es[-_]ES/i.test(v.lang)) ||
      voices.find(v => /^es[-_]/i.test(v.lang)) ||
      voices.find(v => /^es\b/i.test(v.lang)) ||
      null;
  }
  if (synth) {
    loadVoice();
    synth.addEventListener("voiceschanged", loadVoice);
  }

  function speak(text, onDone) {
    if (!synth) { if (onDone) onDone(); return; }
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "es-ES";
      if (spanishVoice) u.voice = spanishVoice;
      u.rate = 0.95;
      u.pitch = 1.25; // higher pitch => cuter, friendlier mouse
      u.onstart = () => liveAvatar.classList.add("is-speaking");
      u.onend = () => { liveAvatar.classList.remove("is-speaking"); if (onDone) onDone(); };
      u.onerror = () => { liveAvatar.classList.remove("is-speaking"); if (onDone) onDone(); };
      synth.speak(u);
    } catch (e) {
      if (onDone) onDone();
    }
  }

  function stopSpeech() {
    if (synth) { try { synth.cancel(); } catch (e) {} }
    if (currentAudio) {
      try { currentAudio.onended = currentAudio.onerror = null; currentAudio.pause(); } catch (e) {}
      currentAudio = null;
    }
    liveAvatar.classList.remove("is-speaking");
  }

  // ----- Pre-generated audio clips (ElevenLabs) -----
  // Authoritative script + clip manifest live as static JSON so the app is fully
  // offline once the service worker has cached them. Falls back silently to the
  // inline SCRIPT and the Web Speech engine if either fetch fails.
  async function loadData() {
    try {
      const r = await fetch("data/script.json", { cache: "no-cache" });
      if (r.ok) {
        const data = await r.json();
        if (data && Array.isArray(data.lines) && data.lines.length) SCRIPT = data.lines;
      }
    } catch (e) { /* keep SCRIPT_FALLBACK */ }
    try {
      const r = await fetch("audio/manifest.json", { cache: "no-cache" });
      if (r.ok) clipManifest = await r.json();
    } catch (e) { /* no clips -> Web Speech fallback */ }
  }

  // Key must match clipKey() in tools/generate-audio.mjs.
  function clipKey(i, name) {
    const line = SCRIPT[i];
    if (line && line.hasName) return i + "|" + String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
    return String(i);
  }

  // The single forward-compat seam: today a static path from the manifest;
  // later this can return a serverless endpoint URL with no other client change.
  function resolveClipSrc(i, name) {
    if (!clipManifest || !clipManifest.clips) return null;
    return clipManifest.clips[clipKey(i, name)] || null;
  }

  // Play a pre-generated clip, mirroring speak()'s contract (avatar animation +
  // single onDone). Falls back to Web Speech if there's no clip or playback fails.
  function playClip(i, name, onDone) {
    const src = resolveClipSrc(i, name);
    if (!src) { speak(fill(SCRIPT[i].es), onDone); return; }

    stopSpeech(); // cancel any pending synth/audio first

    const a = warmAudio || (warmAudio = new Audio());
    currentAudio = a;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      a.onended = a.onerror = a.onplaying = null;
      liveAvatar.classList.remove("is-speaking");
      if (currentAudio === a) currentAudio = null;
      if (onDone) onDone();
    };
    const fallback = () => {
      if (settled) return;
      settled = true;
      a.onended = a.onerror = a.onplaying = null;
      liveAvatar.classList.remove("is-speaking");
      if (currentAudio === a) currentAudio = null;
      speak(fill(SCRIPT[i].es), onDone); // keep the contract via the TTS path
    };

    a.onplaying = () => liveAvatar.classList.add("is-speaking");
    a.onended = finish;
    a.onerror = fallback;
    try {
      a.muted = false;
      a.src = src;
      a.currentTime = 0;
      const p = a.play();
      if (p && p.catch) p.catch(fallback); // autoplay/gesture block or decode fail
    } catch (e) {
      fallback();
    }
  }

  // ----- Ringtone & haptics (best-effort, never required) -----
  let audioCtx = null;
  function ringPulse() {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === "suspended") audioCtx.resume();
      const now = audioCtx.currentTime;
      [880, 1100].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        const t = now + i * 0.18;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g).connect(audioCtx.destination);
        o.start(t);
        o.stop(t + 0.18);
      });
    } catch (e) { /* ignore */ }
  }

  function startRinging() {
    if (navigator.vibrate) { try { navigator.vibrate([400, 200, 400, 200, 400]); } catch (e) {} }
    // Audio can't start without a gesture on iOS; we still try (harmless if blocked).
    ringPulse();
    const id = setInterval(() => {
      ringPulse();
      if (navigator.vibrate) { try { navigator.vibrate([400, 200, 400]); } catch (e) {} }
    }, 3000);
    ringTimers.push(id);
  }

  function stopRinging() {
    ringTimers.forEach(clearInterval);
    ringTimers = [];
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch (e) {} }
  }

  // ----- Screen management -----
  function show(name) {
    Object.values(screens).forEach(s => s.classList.remove("is-active"));
    screens[name].classList.add("is-active");
  }

  // ----- Call timer -----
  function startTimer() {
    let seconds = 0;
    timerEl.textContent = "00:00";
    timerId = setInterval(() => {
      seconds++;
      const m = String(Math.floor(seconds / 60)).padStart(2, "0");
      const s = String(seconds % 60).padStart(2, "0");
      timerEl.textContent = m + ":" + s;
    }, 1000);
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  // ----- Conversation flow -----
  function fill(text) { return text.replace(/\{name\}/g, chosenName); }

  function setCaption(text) {
    captionEl.textContent = text;          // atomic swap — old text gone immediately
    captionEl.style.animation = "none";    // restart the fade-in for each new line
    void captionEl.offsetHeight;           // force reflow so the layer repaints clean
    captionEl.style.animation = "";
  }

  function playLine(i) {
    continueBtn.hidden = true;
    const line = SCRIPT[i];
    setCaption(fill(line.en));
    playClip(i, chosenName, () => {
      if (i < SCRIPT.length - 1) {
        continueBtn.hidden = false;
      } else {
        endConversation();
      }
    });
  }

  function nextLine() {
    if (lineIndex < SCRIPT.length - 1) {
      lineIndex++;
      playLine(lineIndex);
    }
  }

  function endConversation() {
    continueBtn.hidden = true;
    goodbyeEl.hidden = false;
    // Auto-hang up shortly after the goodbye card appears.
    setTimeout(() => { if (!goodbyeEl.hidden) hangUp(); }, 3500);
  }

  // ----- Transitions -----
  function pickName(name) {
    chosenName = name;
    show("incoming");
    startRinging();
  }

  function answer() {
    stopRinging();
    // The Answer tap is the user gesture that unlocks audio/TTS on iOS.
    if (synth) { try { synth.resume(); } catch (e) {} }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    // Warm up the speech engine with a silent utterance so the first real line speaks.
    if (synth) { try { synth.speak(new SpeechSynthesisUtterance("")); } catch (e) {} }
    // Unlock an HTMLAudioElement during this gesture so the first clip plays on iOS.
    try {
      if (!warmAudio) warmAudio = new Audio();
      warmAudio.muted = true;
      const p = warmAudio.play();
      if (p && p.then) p.then(() => warmAudio.pause()).catch(() => {});
    } catch (e) {}

    lineIndex = 0;
    goodbyeEl.hidden = true;
    show("call");
    startTimer();
    playLine(0);
  }

  function hangUp() {
    stopSpeech();
    stopTimer();
    stopRinging();
    goodbyeEl.hidden = true;
    chosenName = "";
    lineIndex = 0;
    show("picker");
  }

  // ----- Wire up events -----
  document.querySelectorAll(".name-btn").forEach(btn => {
    btn.addEventListener("click", () => pickName(btn.dataset.name));
  });
  document.getElementById("btn-answer").addEventListener("click", answer);
  document.getElementById("btn-decline").addEventListener("click", hangUp);
  document.getElementById("btn-end").addEventListener("click", hangUp);
  continueBtn.addEventListener("click", nextLine);

  // Load the script + clip manifest up front (well before the user can answer).
  loadData();

  // Pause speech if the app is backgrounded.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopSpeech();
  });

  // ----- Service worker -----
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
