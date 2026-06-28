/* Ratón Pérez — tooth fairy call PWA
 * Vanilla JS state machine: picker -> incoming -> call -> goodbye -> picker
 * Ratón Pérez speaks Spanish via the device's speech synthesis; English captions on screen.
 */
(function () {
  "use strict";

  // ----- Scripted conversation. {name} is replaced with the chosen name. -----
  const SCRIPT = [
    { es: "¡Hola {name}! Soy Ratón Pérez. ¿Me oyes bien?",
      en: "Hi {name}! It's Ratón Pérez. Can you hear me?" },
    { es: "¡Me han dicho que se te ha caído un diente! ¡Qué noticia tan maravillosa!",
      en: "I heard you lost a tooth! What wonderful news!" },
    { es: "Estoy dando saltitos de alegría con mi colita. ¡Estoy muy feliz por ti!",
      en: "I'm hopping with joy and wagging my little tail. I'm so happy for you!" },
    { es: "Cuando te duermas esta noche, pasaré por tu almohada a buscar tu dientecito.",
      en: "Tonight while you sleep, I'll visit your pillow to collect your little tooth." },
    { es: "Lo guardaré en mi castillo de dientes, donde todos brillan como estrellitas.",
      en: "I'll keep it in my castle of teeth, where they all shine like little stars." },
    { es: "Sigue cepillándote, {name}, para que tus dientes estén fuertes y bonitos.",
      en: "Keep brushing, {name}, so your teeth stay strong and beautiful." },
    { es: "Tengo que seguir mi ronda. ¡Dulces sueños, {name}! ¡Hasta muy pronto!",
      en: "I must continue my rounds. Sweet dreams, {name}! See you very soon!" }
  ];

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
    liveAvatar.classList.remove("is-speaking");
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
    speak(fill(line.es), () => {
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
