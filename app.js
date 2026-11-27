// Tarot Sanctuary Core Logic

/* ============================================================
   Sound FX — synthesized with Web Audio API (no asset files)
   ============================================================ */
const AudioFX = (function () {
  let ctx = null;
  let noiseBuffer = null;
  let master = null;
  let enabled = true;

  // ทุกเสียงวิ่งผ่าน master gain ตัวเดียว เพื่อปรับความดังรวมโดยไม่เสียบาลานซ์ระหว่างเสียง
  // ต่อท้ายด้วย compressor กันเสียงแตก (clipping) เวลาหลายโน้ตซ้อนกัน เช่น chime 4 ตัว
  function getMaster(ac) {
    if (master && master.context === ac) return master;
    const gain = ac.createGain();
    // 6 ทำให้ peak ของเสียงดังสุด ~ -6 dBFS: ชัดบนลำโพงมือถือโดยไม่แตก
    gain.gain.value = 6;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -4;
    comp.knee.value = 4;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    gain.connect(comp);
    comp.connect(ac.destination);
    master = gain;
    return master;
  }

  try {
    enabled = localStorage.getItem("tarot_sound_on") !== "0";
  } catch (e) { /* storage may be blocked */ }

  function getCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, dur, opts) {
    if (!enabled) return;
    const ac = getCtx();
    if (!ac) return;
    const o = Object.assign({ type: "sine", gain: 0.08, when: 0, sweepTo: 0 }, opts || {});
    const t0 = ac.currentTime + o.when;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(freq, t0);
    if (o.sweepTo) osc.frequency.exponentialRampToValueAtTime(o.sweepTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(getMaster(ac));
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function getNoise(ac) {
    if (!noiseBuffer || noiseBuffer.sampleRate !== ac.sampleRate) {
      const len = Math.floor(ac.sampleRate * 0.5);
      noiseBuffer = ac.createBuffer(1, len, ac.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  function noiseBurst(dur, opts) {
    if (!enabled) return;
    const ac = getCtx();
    if (!ac) return;
    const o = Object.assign({ freq: 1400, q: 0.9, gain: 0.045, when: 0, sweepTo: 0 }, opts || {});
    const t0 = ac.currentTime + o.when;
    const src = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const g = ac.createGain();
    src.buffer = getNoise(ac);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(o.freq, t0);
    filter.Q.value = o.q;
    if (o.sweepTo) filter.frequency.exponentialRampToValueAtTime(o.sweepTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(getMaster(ac));
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  return {
    get enabled() { return enabled; },
    setEnabled(value) {
      enabled = !!value;
      try { localStorage.setItem("tarot_sound_on", enabled ? "1" : "0"); } catch (e) { /* ignore */ }
    },
    unlock() { if (enabled) getCtx(); },
    tap() { tone(880, 0.06, { type: "triangle", gain: 0.03 }); },
    shuffle() {
      for (let i = 0; i < 7; i++) {
        // เสียงสับไพ่เป็นย่านสูง ซึ่งลำโพงมือถือ reproduce ได้ดี แต่เดิมเบาเกินไปจนแทบไม่ได้ยิน
        noiseBurst(0.05, { freq: 900 + Math.random() * 1800, gain: 0.06, when: i * 0.055 });
      }
    },
    flip() {
      noiseBurst(0.16, { freq: 2200, sweepTo: 500, gain: 0.045 });
      tone(1318.5, 0.5, { gain: 0.055, when: 0.1 });
      tone(1760, 0.6, { gain: 0.03, when: 0.13 });
    },
    chime() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        tone(f, 0.9, { gain: 0.05 - i * 0.008, when: i * 0.06 });
      });
    },
    success() {
      tone(659.25, 0.18, { gain: 0.06 });
      tone(987.77, 0.35, { gain: 0.055, when: 0.12 });
    }
  };
})();

function haptic(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) { /* unsupported */ }
}

const prefersReducedMotion = typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function spawnMagicParticles(targetEl, count = 10) {
  if (prefersReducedMotion || !targetEl) return;
  const rect = targetEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = ["#f7dc6f", "#f5b041", "#fdebd0", "#d7bde2"];

  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "magic-particle";
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
    const dist = 28 + Math.random() * 42;
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    p.style.background = colors[i % colors.length];
    p.style.boxShadow = `0 0 4px ${colors[i % colors.length]}`;
    p.style.setProperty("--px", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--py", `${Math.sin(angle) * dist - 14}px`);
    document.body.appendChild(p);
    p.addEventListener("animationend", () => p.remove(), { once: true });
    setTimeout(() => { if (p.parentNode) p.remove(); }, 800);
  }
}

function attachCardTilt(cardContainer) {
  if (prefersReducedMotion || !cardContainer) return;
  const inner = cardContainer.querySelector(".tarot-card-inner");
  if (!inner) return;
  let rafId = null;
  let latestEvent = null;

  const updateTilt = () => {
    rafId = null;
    if (!latestEvent || !inner.classList.contains("flipped")) return;
    const rect = cardContainer.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (latestEvent.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (latestEvent.clientY - rect.top) / rect.height));
    const tiltX = ((0.5 - y) * 14).toFixed(2);
    const tiltY = ((x - 0.5) * 16).toFixed(2);
    inner.style.setProperty("--tilt-x", `${tiltX}deg`);
    inner.style.setProperty("--tilt-y", `${tiltY}deg`);
    inner.style.setProperty("--glare-x", `${(x * 100).toFixed(1)}%`);
    inner.style.setProperty("--glare-y", `${(y * 100).toFixed(1)}%`);
    inner.style.setProperty("--glare-opacity", "1");
  };

  cardContainer.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || !inner.classList.contains("flipped")) return;
    inner.classList.add("tilting");
    latestEvent = e;
    if (!rafId) rafId = requestAnimationFrame(updateTilt);
  });

  cardContainer.addEventListener("pointerleave", () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    inner.classList.remove("tilting");
    inner.style.setProperty("--tilt-x", "0deg");
    inner.style.setProperty("--tilt-y", "0deg");
    inner.style.setProperty("--glare-opacity", "0");
  });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

document.addEventListener("DOMContentLoaded", () => {
  // Prevent browser from overriding custom scroll on reload
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  // App State
  let currentMode = "daily";
  let requiredCards = 1;
  let selectedCards = [];
  let isShuffling = false;
  let isRevealing = false;
  let reversedMode = false;
  let lastReading = null;
  // cache รูปผลทำนาย — เตรียมไว้ล่วงหน้าเพื่อให้กดแชร์แล้วชีตแชร์เปิดทันที (iOS ต้องการจังหวะกดจริง)
  let shareImageCache = { key: "", result: null, promise: null };
  let warmShareTimer = 0;

  try {
    reversedMode = localStorage.getItem("tarot_reversed_mode") === "1";
  } catch (e) { /* ignore */ }

  // Merchant Info
  const merchantName = "Tarot Sanctuary";

  // Persistence Helpers (Hold active reading until user shuffles again)
  const READING_TTL_MS = 2 * 60 * 60 * 1000; // หมดอายุหลังจาก 2 ชั่วโมง

  function saveActiveReading(mode, pickedCards, question) {
    try {
      const data = {
        mode,
        cardIds: pickedCards.map(c => c.id),
        reversedFlags: pickedCards.map(c => !!c.isReversed),
        question: question || "",
        timestamp: Date.now()
      };
      localStorage.setItem(`tarot_reading_${mode}`, JSON.stringify(data));
      localStorage.setItem("tarot_current_mode", mode);
    } catch (e) {
      console.warn("Could not save reading:", e);
    }
  }

  function getActiveReading(mode) {
    try {
      const str = localStorage.getItem(`tarot_reading_${mode}`);
      if (!str) return null;
      const data = JSON.parse(str);

      // ถ้าไม่มี timestamp หรือเก่ากว่า 2 ชั่วโมง → ล้างทิ้ง เริ่มใหม่
      if (!data.timestamp || Date.now() - data.timestamp > READING_TTL_MS) {
        localStorage.removeItem(`tarot_reading_${mode}`);
        return null;
      }

      const cards = cardsFromStored(data);
      if (cards.length) {
        return { ...data, cards };
      }
    } catch (e) {
      console.error("Error reading saved tarot reading:", e);
    }
    return null;
  }

  function clearActiveReading(mode) {
    localStorage.removeItem(`tarot_reading_${mode}`);
  }

  // แปลง cardIds + reversedFlags ที่เก็บไว้ กลับเป็นข้อมูลไพ่เต็ม
  function cardsFromStored(data) {
    if (!data || !Array.isArray(data.cardIds) || !data.cardIds.length) return [];
    const cards = data.cardIds.map((id, idx) => {
      const found = TAROT_CARDS.find(c => c.id == id);
      if (!found) return null;
      return { ...found, isReversed: !!(data.reversedFlags && data.reversedFlags[idx]) };
    }).filter(Boolean);
    return cards.length === data.cardIds.length ? cards : [];
  }

  /* ============================================================
     ไพ่ประจำวัน — เปิดได้วันละครั้ง (นับตามวันที่ในเครื่อง)
     ============================================================ */
  const DAILY_LOCK_KEY = "tarot_daily_lock";

  function todayKey(date = new Date()) {
    const pad = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function getDailyLock() {
    try {
      const data = JSON.parse(localStorage.getItem(DAILY_LOCK_KEY) || "null");
      if (!data || data.date !== todayKey()) return null;
      const cards = cardsFromStored(data);
      return cards.length ? { ...data, cards } : null;
    } catch (e) {
      return null;
    }
  }

  function saveDailyLock(pickedCards, question) {
    try {
      localStorage.setItem(DAILY_LOCK_KEY, JSON.stringify({
        date: todayKey(),
        cardIds: pickedCards.map(c => c.id),
        reversedFlags: pickedCards.map(c => !!c.isReversed),
        question: question || "",
        timestamp: Date.now()
      }));
    } catch (e) { /* ignore */ }
  }

  // DOM Elements
  const modeCards = document.querySelectorAll(".mode-card");
  const questionBox = document.getElementById("question-box");
  const userQuestion = document.getElementById("user-question");
  const deckArea = document.getElementById("deck-area");
  const instructionText = document.getElementById("instruction-text");
  const fannedDeck = document.getElementById("fanned-deck");
  const selectedCounterSpan = document.getElementById("selected-counter");
  const requiredCounterSpan = document.getElementById("required-counter");
  const btnShuffle = document.getElementById("btn-shuffle");
  const btnReveal = document.getElementById("btn-reveal");
  const resultSection = document.getElementById("result-section");
  const cardsShowcase = document.getElementById("cards-showcase");
  const readingDetails = document.getElementById("reading-details");
  const btnReset = document.getElementById("btn-reset-reading");
  const btnSaveImage = document.getElementById("btn-save-image");
  const btnShareImage = document.getElementById("btn-share-image");
  const btnSizeStory = document.getElementById("btn-size-story");
  const btnSizeFeed = document.getElementById("btn-size-feed");
  const dailyLockBadge = document.getElementById("daily-lock-badge");
  const btnUnlockDaily = document.getElementById("btn-unlock-daily");
  const dailyUnlockConfirm = document.getElementById("daily-unlock-confirm");
  const btnDailyUnlockOk = document.getElementById("btn-daily-unlock-ok");
  const btnDailyUnlockCancel = document.getElementById("btn-daily-unlock-cancel");
  const btnSoundToggle = document.getElementById("btn-sound-toggle");
  const toggleReversed = document.getElementById("toggle-reversed");
  const btnSaveQR = document.getElementById("btn-save-qr");

  // State
  let isDeckFanned = false; // Deck must be shuffled before cards can be picked
  let dailyUnlockPrompted = false; // ปุ่มปลดล็อกไพ่ประจำวันจะโผล่เมื่อกด "ดูรอบใหม่" ขณะยังล็อกอยู่
  let pointerDownX = 0;
  let scrollStartLeft = 0;
  let wasSwiping = false;

  /* ============================================================
     Scroll-linked Depth — ไพ่กลางจอขยาย/ลอยขึ้น ริมขอบย่อลง
     คุมด้วย requestAnimationFrame ให้ลื่นตามนิ้วจริง
     ============================================================ */
  const DEPTH_MIN_SCALE = 0.9;   // ริมขอบย่อลง 10% — พอให้รู้สึกถึงระยะ แต่ไม่ย่อจนดูเป็นการ์ดคนละขนาด
  const DEPTH_LIFT_PX = 12;      // ใบกลางจอลอยขึ้นเบาๆ ประมาณ 1 ใน 10 ของความสูงการ์ด
  const DEPTH_FOCUS_CURVE = 1.4; // โค้งนุ่ม: ใบข้างเคียงได้รับ effect ต่อเนื่อง ไม่เป็นโพรงแคบๆ ใบเดียว
  const DEPTH_EASE = 0.3;        // ตามนิ้วหน่วงนิดเดียว (≈2-3 เฟรม) พอให้เนียน ไม่ดูลอยตามไม่ทัน
  let depthRafId = null;
  let depthLastTime = 0;
  const depthValues = new Map(); // card -> { scale, lift }

  function resetDeckDepth() {
    if (depthRafId !== null) {
      cancelAnimationFrame(depthRafId);
      depthRafId = null;
    }
    depthLastTime = 0;
    depthValues.clear();
    fannedDeck.querySelectorAll(".deck-card").forEach(card => {
      card.style.removeProperty("--depth-scale");
      card.style.removeProperty("--depth-lift");
    });
  }

  function paintDeckDepth(now) {
    depthRafId = null;
    if (prefersReducedMotion) return;
    if (!fannedDeck.classList.contains("scrollable")) return;

    const cards = Array.from(fannedDeck.querySelectorAll(".deck-card"));
    if (!cards.length) return;

    const deckRect = fannedDeck.getBoundingClientRect();
    const viewHalf = deckRect.width / 2;
    if (!viewHalf) return;
    const viewCenter = deckRect.left + viewHalf;

    const time = typeof now === "number" ? now : performance.now();
    const dt = depthLastTime ? Math.min(64, Math.max(8, time - depthLastTime)) : 16.7;
    depthLastTime = time;
    // ตามเป้าหมายแบบนุ่มและคงความเร็วเดิมไม่ว่าเฟรมจะ 60 หรือ 120Hz
    const follow = 1 - Math.pow(1 - DEPTH_EASE, dt / 16.7);

    // อ่านตำแหน่งทุกใบก่อน แล้วค่อยเขียนทีเดียว (ลด reflow กลางลูป)
    // จุดกึ่งกลางการ์ดไม่ขยับจาก scale/translate ที่เราตั้ง (origin = กึ่งกลาง)
    const centers = cards.map(card => {
      const rect = card.getBoundingClientRect();
      return rect.left + rect.width / 2;
    });

    let settled = true;

    cards.forEach((card, i) => {
      const distance = Math.min(1, Math.abs((centers[i] - viewCenter) / viewHalf));
      const focus = Math.pow(1 - distance, DEPTH_FOCUS_CURVE); // 1 = กลางจอ, 0 = ริมขอบ
      const targetScale = DEPTH_MIN_SCALE + (1 - DEPTH_MIN_SCALE) * focus;
      const targetLift = -DEPTH_LIFT_PX * focus;

      let state = depthValues.get(card);
      if (!state) {
        // ใบที่เพิ่งเกิด: เริ่มที่เป้าหมายเลย ไม่ต้องกระตุกจาก 1
        state = { scale: targetScale, lift: targetLift };
        depthValues.set(card, state);
      }

      state.scale += (targetScale - state.scale) * follow;
      state.lift += (targetLift - state.lift) * follow;

      if (Math.abs(targetScale - state.scale) < 0.0015 && Math.abs(targetLift - state.lift) < 0.08) {
        state.scale = targetScale;
        state.lift = targetLift;
      } else {
        settled = false;
      }

      card.style.setProperty("--depth-scale", state.scale.toFixed(3));
      card.style.setProperty("--depth-lift", `${state.lift.toFixed(1)}px`);
    });

    // ยังตามไม่ถึงเป้า → วาดต่อในเฟรมถัดไป แม้นิ้วหยุดแล้ว
    if (!settled) scheduleDeckDepthPaint();
  }

  function scheduleDeckDepthPaint() {
    if (depthRafId !== null) return;
    depthRafId = requestAnimationFrame(paintDeckDepth);
  }

  fannedDeck.addEventListener("scroll", scheduleDeckDepthPaint, { passive: true });

  window.addEventListener("resize", () => {
    if (!fannedDeck.classList.contains("scrollable")) {
      resetDeckDepth();
      return;
    }
    scheduleDeckDepthPaint();
  });

  fannedDeck.addEventListener("pointerdown", (e) => {
    pointerDownX = e.clientX;
    scrollStartLeft = fannedDeck.scrollLeft;
    wasSwiping = false;
  });

  fannedDeck.addEventListener("pointermove", (e) => {
    if (Math.abs(e.clientX - pointerDownX) > 10 || Math.abs(fannedDeck.scrollLeft - scrollStartLeft) > 8) {
      wasSwiping = true;
    }
  });

  fannedDeck.addEventListener("scroll", () => {
    if (Math.abs(fannedDeck.scrollLeft - scrollStartLeft) > 8) {
      wasSwiping = true;
    }
  }, { passive: true });

  // Initialize
  syncSoundToggleUI();
  if (toggleReversed) toggleReversed.checked = reversedMode;

  // Sound toggle
  function syncSoundToggleUI() {
    if (!btnSoundToggle) return;
    btnSoundToggle.textContent = AudioFX.enabled ? "🔊" : "🔇";
    btnSoundToggle.setAttribute("aria-pressed", String(AudioFX.enabled));
    btnSoundToggle.title = AudioFX.enabled ? "ปิดเสียงประกอบ" : "เปิดเสียงประกอบ";
  }

  if (btnSoundToggle) {
    btnSoundToggle.addEventListener("click", () => {
      AudioFX.setEnabled(!AudioFX.enabled);
      syncSoundToggleUI();
      haptic(10);
      if (AudioFX.enabled) AudioFX.chime();
      showToast(AudioFX.enabled ? "🔊 เปิดเสียงประกอบแล้ว" : "🔇 ปิดเสียงประกอบแล้ว");
    });
  }

  // Reversed mode toggle
  if (toggleReversed) {
    toggleReversed.addEventListener("change", () => {
      reversedMode = toggleReversed.checked;
      try {
        localStorage.setItem("tarot_reversed_mode", reversedMode ? "1" : "0");
      } catch (e) { /* ignore */ }
      haptic(8);
      AudioFX.tap();
      showToast(reversedMode
        ? "🃏 เปิดโหมดไพ่กลับหัวแล้ว — ใบที่เปิดจะมีโอกาสกลับหัว 50%"
        : "🃏 ปิดโหมดไพ่กลับหัวแล้ว");
    });
  }

  // Reversed info toggle (?)
  const btnReversedInfo = document.getElementById("btn-reversed-info");
  const reversedInfoBox = document.getElementById("reversed-info-box");
  if (btnReversedInfo && reversedInfoBox) {
    const closeReversedInfo = () => {
      if (!reversedInfoBox.classList.contains("show")) return;
      reversedInfoBox.classList.remove("show");
      btnReversedInfo.setAttribute("aria-expanded", "false");
    };

    btnReversedInfo.addEventListener("click", () => {
      const isOpen = reversedInfoBox.classList.toggle("show");
      btnReversedInfo.setAttribute("aria-expanded", String(isOpen));
      AudioFX.tap();
      haptic(6);
    });

    // แตะ/คลิกที่อื่นบนหน้าจอ = ปิด
    document.addEventListener("click", (e) => {
      if (!reversedInfoBox.classList.contains("show")) return;
      if (e.target instanceof Element && e.target.closest("#btn-reversed-info, #reversed-info-box")) return;
      closeReversedInfo();
    });

    // กด Esc = ปิด
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeReversedInfo();
    });

    // รีเฟรชหน้า หรือกลับมาจาก back-forward cache = เริ่มในสถานะปิด
    window.addEventListener("pageshow", closeReversedInfo);
  }

  // Smart detect active mode: prioritize stored mode if it has saved reading, otherwise look for any mode with active reading
  const allModes = ["daily", "love", "career", "custom"];
  let savedMode = localStorage.getItem("tarot_current_mode");
  if (!savedMode || !getActiveReading(savedMode)) {
    const foundMode = allModes.find(m => getActiveReading(m));
    if (foundMode) savedMode = foundMode;
  }
  if (savedMode) {
    currentMode = savedMode;
  }

  // Restore saved active mode in UI
  const initialModeCard = document.querySelector(`.mode-card[data-mode="${currentMode}"]`) || modeCards[0];
  if (initialModeCard) {
    modeCards.forEach(c => c.classList.remove("active"));
    initialModeCard.classList.add("active");
    requiredCards = parseInt(initialModeCard.getAttribute("data-count"), 10);
    if (currentMode === "custom") {
      questionBox.classList.add("show");
    } else {
      questionBox.classList.remove("show");
    }
    const pickTargetCountSpan = document.getElementById("pick-target-count");
    if (pickTargetCountSpan) pickTargetCountSpan.textContent = requiredCards;
    requiredCounterSpan.textContent = requiredCards;
  }

  checkAndRenderMode(currentMode, true);

  // Mode Selection Handlers
  modeCards.forEach(card => {
    card.addEventListener("click", () => {
      const targetMode = card.getAttribute("data-mode");
      if (targetMode === currentMode && resultSection.classList.contains("show")) {
        return; // กำลังดูผลของโหมดนี้อยู่แล้ว ไม่ต้องโหลดซ้ำ
      }

      modeCards.forEach(c => c.classList.remove("active"));
      card.classList.add("active");

      currentMode = targetMode;
      localStorage.setItem("tarot_current_mode", currentMode);
      requiredCards = parseInt(card.getAttribute("data-count"), 10);

      if (currentMode === "custom") {
        questionBox.classList.add("show");
        setTimeout(() => userQuestion.focus(), 300);
      } else {
        questionBox.classList.remove("show");
      }

      const pickTargetCountSpan = document.getElementById("pick-target-count");
      if (pickTargetCountSpan) pickTargetCountSpan.textContent = requiredCards;
      requiredCounterSpan.textContent = requiredCards;

      checkAndRenderMode(currentMode);
    });
  });

  // Generate Deck (Stacked Pile or Fanned Arc)
  function generateFannedDeck(fanned = false, animate = true) {
    fannedDeck.innerHTML = "";
    resetDeckDepth();
    selectedCards = [];
    isDeckFanned = fanned;
    updateSelectionCounter();

    const isMobile = window.innerWidth <= 600;
    const totalDeckCards = 15;
    const angleStep = isMobile ? 2.4 : 4.4;
    const xSpacing = isMobile ? 34 : 22;
    const startAngle = -((totalDeckCards - 1) * angleStep) / 2;

    const track = document.createElement("div");
    track.className = "fanned-deck-track";

    if (isMobile && fanned) {
      fannedDeck.classList.add("scrollable");
      const trackWidth = (totalDeckCards - 1) * xSpacing + 76 + 64;
      track.style.width = `${trackWidth}px`;
    } else {
      fannedDeck.classList.remove("scrollable");
      track.style.width = "100%";
    }

    const createdCards = [];

    for (let i = 0; i < totalDeckCards; i++) {
      const card = document.createElement("div");
      card.dataset.index = i;

      if (!fanned) {
        // Stacked pile in the center (Deck waiting to be shuffled)
        card.className = "deck-card stacked";
        const stackX = (i - totalDeckCards / 2) * 0.4;
        const stackY = (i - totalDeckCards / 2) * -0.4;
        const stackRot = (i - totalDeckCards / 2) * 0.25;

        card.style.setProperty("--tx", `${stackX}px`);
        card.style.setProperty("--ty", `${stackY}px`);
        card.style.setProperty("--rot", `${stackRot}deg`);
        card.style.zIndex = i + 1;
      } else {
        // Fanned arc (Cards ready to pick) with subtle hand-spread imperfection
        card.className = "deck-card";
        const angle = startAngle + i * angleStep + (Math.random() - 0.5) * 1.4;
        const xOffset = (i - (totalDeckCards - 1) / 2) * xSpacing + (Math.random() - 0.5) * 2.2;
        const yOffset = Math.abs(angle) * (isMobile ? 1.1 : 1.5) + (Math.random() - 0.5) * 2.8;

        card.style.setProperty("--tx", `${xOffset.toFixed(1)}px`);
        card.style.setProperty("--ty", `${yOffset.toFixed(1)}px`);
        card.style.setProperty("--rot", `${angle.toFixed(2)}deg`);
        card.style.zIndex = i + 1;

        if (animate) {
          card.style.transform = "translate(0px, 0px) rotate(0deg) scale(0.96)";
          card.style.opacity = "0.9";
        }
      }

      // ไพ่เป็น <div> จึงต้องประกาศ role/tabindex เองเพื่อให้คีย์บอร์ดและโปรแกรมอ่านหน้าจอใช้ได้
      card.tabIndex = -1;
      if (fanned) {
        card.setAttribute("role", "button");
        card.setAttribute("aria-pressed", "false");
      } else {
        // กองที่ยังไม่สับ: ให้ปุ่ม "สับไพ่" เป็นทางเข้าหลัก ไม่ต้องมีไพ่ 15 ใบใน tab order
        card.setAttribute("aria-hidden", "true");
      }

      card.addEventListener("click", () => handleCardClick(card, i));
      track.appendChild(card);
      createdCards.push(card);
    }

    fannedDeck.appendChild(track);
    updateDeckCardA11y();

    if (fannedDeck.classList.contains("scrollable")) {
      scheduleDeckDepthPaint();
    }

    if (!fanned) {
      // Unshuffled state UI: Prompt to shuffle
      instructionText.innerHTML = `✦ หลับตา สูดลมหายใจลึกๆ ตั้งจิตอธิษฐาน แล้วกด <strong>"สับไพ่"</strong> เพื่อเริ่มทำนาย ✦`;
      btnShuffle.innerHTML = `<span class="shuffle-icon">🔀</span> สับไพ่เพื่อเริ่มทำนาย`;
      btnShuffle.classList.add("ready-pulse");
      btnReveal.style.display = "none";
    } else {
      // Shuffled and fanned state UI: Ready to pick
      instructionText.innerHTML = isMobile
        ? `ปัดซ้าย-ขวา แล้วแตะเลือกไพ่ <span id="pick-target-count" style="color: var(--gold-primary); font-weight:700;">${requiredCards}</span> ใบ`
        : `หลับตา สูดหายใจลึกๆ ตั้งจิตให้สงบ แล้วแตะเลือกไพ่ <span id="pick-target-count" style="color: var(--gold-primary); font-weight:700;">${requiredCards}</span> ใบ`;
      btnShuffle.innerHTML = `<span class="shuffle-icon">🔀</span> สับใหม่อีกครั้ง`;
      btnShuffle.classList.remove("ready-pulse");
      btnReveal.style.display = "inline-block";

      if (isMobile) {
        requestAnimationFrame(() => {
          fannedDeck.scrollLeft = Math.max(0, (track.offsetWidth - fannedDeck.clientWidth) / 2);
          scheduleDeckDepthPaint();
        });
      }

      if (animate) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            createdCards.forEach((card, idx) => {
              card.style.transitionDelay = `${idx * 22}ms`;
              card.style.transform = "";
              card.style.opacity = "1";
            });
            // หลังการ์ดเข้าที่แล้ว ค่อยวัดตำแหน่งจริงมาคำนวณ depth
            scheduleDeckDepthPaint();

            setTimeout(() => {
              createdCards.forEach(card => {
                card.style.transitionDelay = "";
              });
            }, totalDeckCards * 22 + 450);
          });
        });
      }
    }
  }

  // Handle Card Click in Deck
  function handleCardClick(cardElement, index, fromKeyboard = false) {
    if (isShuffling || isRevealing || resultSection.classList.contains("show")) return;
    if (wasSwiping && !fromKeyboard) {
      wasSwiping = false;
      return;
    }

    // If deck has not been shuffled yet, tapping the deck triggers shuffle!
    if (!isDeckFanned) {
      btnShuffle.click();
      return;
    }

    if (cardElement.classList.contains("selected")) {
      // Deselect
      cardElement.classList.remove("selected");
      selectedCards = selectedCards.filter(idx => idx !== index);
    } else {
      // Check if already reached required count
      if (selectedCards.length >= requiredCards) {
        // Subtle hint animation if max cards reached
        cardElement.style.transform = `translate(var(--tx), calc(var(--ty) - 8px)) rotate(var(--rot))`;
        setTimeout(() => {
          cardElement.style.transform = "";
        }, 180);
        return;
      }
      cardElement.classList.add("selected");
      selectedCards.push(index);
      spawnMagicParticles(cardElement, 8);
      AudioFX.tap();
      haptic(6);
    }

    updateSelectionCounter();
  }

  function syncSelectedOrderBadges() {
    const cards = fannedDeck.querySelectorAll(".deck-card");
    cards.forEach(card => {
      const idx = Number(card.dataset.index);
      const pos = selectedCards.indexOf(idx);
      if (pos !== -1) {
        card.dataset.order = requiredCards > 1 ? String(pos + 1) : "✓";
      } else {
        delete card.dataset.order;
      }
    });
  }

  function updateSelectionCounter() {
    syncSelectedOrderBadges();
    updateDeckCardA11y();
    selectedCounterSpan.textContent = selectedCards.length;
    const isReady = selectedCards.length === requiredCards;
    btnReveal.disabled = !isReady;

    if (isReady) {
      btnReveal.classList.add("ready-pulse");
    } else {
      btnReveal.classList.remove("ready-pulse");
    }
  }

  // roving tabindex + ป้ายชื่อ/สถานะสำหรับโปรแกรมอ่านหน้าจอ
  // (Tab เข้ากลุ่มครั้งเดียว แล้วใช้ลูกศรเลื่อนดูไพ่ทีละใบ)
  function updateDeckCardA11y() {
    const cards = Array.from(fannedDeck.querySelectorAll(".deck-card"));
    if (!cards.length) return;
    const total = cards.length;

    cards.forEach((card, i) => {
      card.tabIndex = -1;
      if (!isDeckFanned) return;

      const order = selectedCards.indexOf(Number(card.dataset.index));
      const picked = order !== -1;
      const base = `ไพ่ใบที่ ${i + 1} จาก ${total}`;
      card.setAttribute("aria-pressed", String(picked));
      card.setAttribute("aria-label", picked
        ? `${base} — เลือกแล้ว${requiredCards > 1 ? ` ลำดับที่ ${order + 1}` : ""}`
        : `${base} — ยังไม่เลือก`);
    });

    if (!isDeckFanned) return;

    // ใบที่โฟกัสอยู่ต้องยัง tabbable อยู่ ไม่งั้นเริ่มที่ใบแรก
    const active = document.activeElement;
    const focusTarget = cards.indexOf(active) !== -1 ? active : cards[0];
    focusTarget.tabIndex = 0;
  }

  function focusDeckCard(card) {
    const cards = Array.from(fannedDeck.querySelectorAll(".deck-card"));
    cards.forEach(c => { c.tabIndex = -1; });
    card.tabIndex = 0;
    card.focus({ preventScroll: true });

    // เลื่อนกองแนวนอนให้ใบที่โฟกัสอยู่กลางจอ (เฉพาะตอนที่กองเลื่อนได้)
    if (fannedDeck.classList.contains("scrollable")) {
      const deckRect = fannedDeck.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const delta = (cardRect.left + cardRect.width / 2) - (deckRect.left + deckRect.width / 2);
      if (Math.abs(delta) > 1) {
        fannedDeck.scrollLeft += delta;
        scheduleDeckDepthPaint();
      }
    }
  }

  fannedDeck.addEventListener("keydown", (e) => {
    const card = e.target instanceof Element ? e.target.closest(".deck-card") : null;
    if (!card) return;

    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      handleCardClick(card, Number(card.dataset.index), true);
      return;
    }

    const cards = Array.from(fannedDeck.querySelectorAll(".deck-card"));
    const i = cards.indexOf(card);
    if (i === -1) return;

    let next = null;
    if (e.key === "ArrowRight") next = cards[Math.min(cards.length - 1, i + 1)];
    else if (e.key === "ArrowLeft") next = cards[Math.max(0, i - 1)];
    else if (e.key === "Home") next = cards[0];
    else if (e.key === "End") next = cards[cards.length - 1];
    else return;

    e.preventDefault();
    if (next) focusDeckCard(next);
  });

  // Natural Overhand Cut + Riffle Physics Shuffle Sequence
  btnShuffle.addEventListener("click", () => {
    if (isShuffling) return;
    isShuffling = true;
    AudioFX.unlock();
    AudioFX.shuffle();
    haptic(18);
    const shuffleIcon = btnShuffle.querySelector(".shuffle-icon");
    if (shuffleIcon) shuffleIcon.classList.add("spinning");

    const cards = Array.from(fannedDeck.querySelectorAll(".deck-card"));
    const mid = Math.ceil(cards.length / 2);

    // Deselect all
    selectedCards = [];
    updateSelectionCounter();

    // Step 1: Gather into an imperfect, hand-held stack
    cards.forEach((card, idx) => {
      card.classList.remove("selected");
      const gx = (Math.random() - 0.5) * 8;
      const gy = (Math.random() - 0.5) * 6;
      const gr = (Math.random() - 0.5) * 5;
      card.style.setProperty("--gx", `${gx.toFixed(1)}px`);
      card.style.setProperty("--gy", `${gy.toFixed(1)}px`);
      card.style.setProperty("--gr", `${gr.toFixed(1)}deg`);
      card.style.transitionDelay = `${idx * 9}ms`;
      card.classList.add("gathering");
    });

    // Step 2: Overhand cut — lift top packet up-right, then slide onto bottom
    setTimeout(() => {
      cards.forEach((card, idx) => {
        if (idx >= mid) {
          const localIdx = idx - mid;
          card.style.setProperty("--cx", `${(26 + Math.random() * 10).toFixed(1)}px`);
          card.style.setProperty("--cy", `${(-20 - Math.random() * 8).toFixed(1)}px`);
          card.style.setProperty("--cr", `${(5 + Math.random() * 4).toFixed(1)}deg`);
          card.style.transitionDelay = `${localIdx * 8}ms`;
          card.classList.add("overhand-cut");
        }
      });
    }, 260);

    setTimeout(() => {
      cards.forEach((card, idx) => {
        if (idx >= mid) {
          card.style.zIndex = String(idx - mid + 1);
          card.classList.remove("overhand-cut");
        } else {
          card.style.zIndex = String(idx + (cards.length - mid) + 1);
        }
      });
    }, 450);

    // Step 3: Split deck into two physical halves with organic spread
    setTimeout(() => {
      const isMobile = window.innerWidth <= 600;
      const splitDist = isMobile ? 44 : 58;
      cards.forEach((card, idx) => {
        const isLeft = idx < mid;
        const localIdx = isLeft ? idx : idx - mid;
        const rx = (isLeft ? -splitDist : splitDist) + (Math.random() - 0.5) * 10;
        const ry = (localIdx - mid / 2) * 1.4 + (Math.random() - 0.5) * 6;
        const rr = (isLeft ? -11 : 11) + (Math.random() - 0.5) * 6;
        card.style.setProperty("--rx", `${rx.toFixed(1)}px`);
        card.style.setProperty("--ry", `${ry.toFixed(1)}px`);
        card.style.setProperty("--rr", `${rr.toFixed(1)}deg`);
        card.style.transitionDelay = `${localIdx * 9}ms`;
        card.classList.add("riffle-split");
      });
    }, 640);

    // Step 4: Non-linear riffle interleave (faster mid-riffle, gentle finish)
    setTimeout(() => {
      const total = cards.length;
      cards.forEach((card, idx) => {
        const isLeft = idx < mid;
        const localIdx = isLeft ? idx : idx - mid;
        const interleaveOrder = localIdx * 2 + (isLeft ? 0 : 1);
        const t = interleaveOrder / Math.max(1, total - 1);
        // S-curve timing: quick mid-riffle, soft landing on final cards
        const delayMs = Math.round((t * 0.75 + Math.sin(t * Math.PI) * 0.12) * 260);
        card.style.zIndex = String(interleaveOrder + 1);
        card.style.transitionDelay = `${delayMs}ms`;
        card.classList.remove("riffle-split");
        card.classList.add("riffle-interleave");
      });
    }, 880);

    // Step 5: Fan out with organic hand-spread imperfection
    setTimeout(() => {
      generateFannedDeck(true, true);
      if (shuffleIcon) shuffleIcon.classList.remove("spinning");
      isShuffling = false;
    }, 1300);
  });

  // Show Deck Selection Area
  function showDeckArea(withShuffle = false) {
    resultSection.classList.remove("show");
    cardsShowcase.innerHTML = "";
    readingDetails.innerHTML = "";
    isRevealing = false;

    deckArea.style.display = "block";
    requestAnimationFrame(() => {
      deckArea.style.opacity = "1";
      deckArea.style.pointerEvents = "auto";
    });

    if (withShuffle) {
      // Trigger smooth shuffle sequence automatically
      btnShuffle.click();
    } else {
      resetSelection();
    }
  }

  // Check if Mode has Saved Active Reading → auto-load saved reading immediately
  function checkAndRenderMode(mode, isInitialLoad = false) {
    // ไพ่ประจำวันของวันนี้มาก่อนเสมอ แม้ผลที่บันทึกไว้จะหมดอายุไปแล้ว
    const saved = (mode === "daily" ? getDailyLock() : null) || getActiveReading(mode);
    if (saved) {
      if (mode === "custom" && saved.question) userQuestion.value = saved.question;
      renderReading(saved.cards, saved.question, true);
      // เมื่อเพิ่งเปิดเว็บใหม่หรือกด Refresh ถ้ามีผลไพ่เดิมอยู่ ให้เลื่อนลงมาแสดงไพ่ทันที
      if (isInitialLoad) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            const scrollTarget = document.querySelector(".result-header") || cardsShowcase || resultSection;
            if (scrollTarget) {
              scrollTarget.scrollIntoView({ behavior: "auto", block: "start" });
            }
          }, 80);
        });
      }
    } else {
      showDeckArea(false);
    }
  }

  // Reveal Button
  btnReveal.addEventListener("click", () => {
    if (isRevealing || selectedCards.length !== requiredCards) return;
    isRevealing = true;
    btnReveal.disabled = true;
    btnReveal.classList.remove("ready-pulse");

    const shuffledPool = [...TAROT_CARDS].sort(() => 0.5 - Math.random());
    // Honor the cards the user actually tapped (in selection order)
    const pickedData = selectedCards.map(idx => {
      const base = shuffledPool[idx % shuffledPool.length];
      return { ...base, isReversed: reversedMode && Math.random() < 0.5 };
    });
    const q = userQuestion.value.trim();

    AudioFX.unlock();
    haptic(14);

    renderReading(pickedData, q, false);
  });

  // Render Reading Function (Used for new reveal or restored persisted reading)
  function renderReading(pickedData, customQuestionText = "", isRestored = false) {
    cardsShowcase.innerHTML = "";
    readingDetails.innerHTML = "";

    lastReading = {
      cards: pickedData,
      question: currentMode === "custom" ? (customQuestionText || userQuestion.value.trim()) : "",
      mode: currentMode
    };

    // Position titles based on mode
    let positionLabels = [];
    if (currentMode === "daily") {
      positionLabels = ["ไพ่ประจำวันของคุณ"];
    } else if (currentMode === "love") {
      positionLabels = ["1. อดีต / รากฐานความรู้สึก", "2. ปัจจุบัน / สถานการณ์ตอนนี้", "3. อนาคต / ทิศทางความสัมพันธ์"];
    } else if (currentMode === "career") {
      positionLabels = ["1. สถานการณ์ปัจจุบัน", "2. อุปสรรค & สิ่งที่ต้องระวัง", "3. คำแนะนำ & ทางออกสู่ความสำเร็จ"];
    } else {
      const q = customQuestionText || userQuestion.value.trim();
      positionLabels = [q ? `คำตอบสำหรับคำถาม: "${q}"` : "คำตอบจากไพ่สำหรับคุณ"];
    }

    // Hide selection deck area immediately to avoid height collapse / layout jump
    deckArea.style.opacity = "0";
    deckArea.style.pointerEvents = "none";
    deckArea.style.display = "none";

    // Build 3D cards
    pickedData.forEach((card, idx) => {
      const posLabel = positionLabels[idx] || `ไพ่ใบที่ ${idx + 1}`;
      const isRev = !!card.isReversed;
      const rev = isRev && card.reversed ? card.reversed : null;
      const meaningText = rev ? rev.meaning : card.meaning;
      const loveText = rev ? rev.love : card.love;
      const careerText = rev ? rev.career : card.career;
      const adviceText = rev ? rev.advice : card.advice;

      const cardContainer = document.createElement("div");
      cardContainer.className = `tarot-card-container ${isRestored ? "floating" : ""}${isRev ? " reversed" : ""}`;
      cardContainer.style.animationDelay = isRestored ? "0ms" : `${idx * 160}ms`;

      cardContainer.innerHTML = `
        <div class="tarot-card-inner ${isRestored ? "flipped" : ""}" id="tarot-inner-${idx}">
          <div class="tarot-card-face tarot-card-back"></div>
          <div class="tarot-card-face tarot-card-front">
            <div class="tarot-foil-glare"></div>
            ${isRev ? '<span class="reversed-flag">กลับหัว</span>' : ""}
            <img class="tarot-card-img${isRev ? " reversed-img" : ""}" src="${card.image}" alt="${card.nameEn}${isRev ? " (กลับหัว)" : ""}" onerror="this.src='https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80'">
            <div class="tarot-card-label">${card.nameEn}${isRev ? " · กลับหัว" : ""} (${card.id})</div>
          </div>
        </div>
      `;
      cardsShowcase.appendChild(cardContainer);
      attachCardTilt(cardContainer);

      // Build interpretation card
      const detailItem = document.createElement("div");
      detailItem.className = "reading-card-item";
      const detailDelay = isRestored ? 0 : (pickedData.length * 160) + 300 + (idx * 350);
      detailItem.style.animationDelay = `${detailDelay}ms`;

      detailItem.innerHTML = `
        <div class="reading-header">
          <div class="reading-title">${escapeHtml(card.nameEn)} - ${escapeHtml(card.nameTh)}${isRev ? '<span class="reversed-badge">🔄 กลับหัว</span>' : ""}</div>
          <div class="reading-position">${escapeHtml(posLabel)}</div>
        </div>

        ${isRev ? '<p class="reversed-note">ไพ่ใบนี้ปรากฏแบบกลับหัว — ข้อความด้านล่างคือพลังงานด้านที่ต้องระวังและควรปรับสมดุล</p>' : ""}

        <div class="keywords-list">
          ${card.keywords.map(kw => `<span class="keyword-tag">#${kw}</span>`).join("")}
        </div>

        <p class="reading-text">${meaningText}</p>

        <div class="reading-highlights">
          <div class="highlight-box">
            <h4>❤️ ด้านความรัก</h4>
            <p>${loveText}</p>
          </div>
          <div class="highlight-box">
            <h4>💼 ด้านการงาน/การเงิน</h4>
            <p>${careerText}</p>
          </div>
          <div class="highlight-box">
            <h4>💡 คำแนะนำจากจักรวาล</h4>
            <p>${adviceText}</p>
          </div>
          <div class="highlight-box">
            <h4>✨ พลังงานมงคล</h4>
            <p><strong>สีมงคล:</strong> ${card.luckyColor}<br><strong>เลขนำโชค:</strong> ${card.luckyNumber}</p>
          </div>
        </div>
      `;
      readingDetails.appendChild(detailItem);
    });

    // Show results section
    resultSection.classList.add("show");
    syncDailyLockUI();

    if (!isRestored) {
      const answeredQuestion = customQuestionText || userQuestion.value.trim();

      // Save newly drawn cards to localStorage
      saveActiveReading(currentMode, pickedData, answeredQuestion);

      // ไพ่ประจำวัน: ล็อกไว้หนึ่งใบต่อวัน
      if (currentMode === "daily") {
        dailyUnlockPrompted = false;
        saveDailyLock(pickedData, answeredQuestion);
        syncDailyLockUI();
      }

      // Smooth scroll accurately to the top of the cards showcase
      setTimeout(() => {
        const scrollTarget = document.querySelector(".result-header") || cardsShowcase || resultSection;
        scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);

      // Staggered 3D flips with floating effect
      pickedData.forEach((_, idx) => {
        const flipTime = (pickedData.length * 160) + 250 + (idx * 380);
        setTimeout(() => {
          AudioFX.flip();
          haptic(12);
          const inner = document.getElementById(`tarot-inner-${idx}`);
          if (inner) {
            inner.classList.add("flipped");
            setTimeout(() => {
              const container = inner.closest(".tarot-card-container");
              if (container) {
                container.classList.add("floating");
                spawnMagicParticles(container, 12);
              }
            }, 900);
          }
        }, flipTime);
      });
    }

    // เตรียมรูปไว้ล่วงหน้า เพื่อให้กดแชร์แล้วเปิดชีตแชร์ได้ทันที (iOS บังคับให้อยู่ในจังหวะที่ผู้ใช้กด)
    scheduleWarmShareImage();
  }

  // ==========================================
  // SHARE READING AS IMAGE (pure canvas, 1080x1920)
  // ==========================================
  const MODE_LABELS = {
    daily: "ไพ่ประจำวัน",
    love: "ความรัก & ความสัมพันธ์",
    career: "การงาน & การเงิน",
    custom: "คำตอบจากไพ่"
  };

  const MODE_POSITIONS = {
    daily: ["ไพ่ประจำวันของคุณ"],
    love: ["อดีต / รากฐานความรู้สึก", "ปัจจุบัน / สถานการณ์ตอนนี้", "อนาคต / ทิศทางความสัมพันธ์"],
    career: ["สถานการณ์ปัจจุบัน", "อุปสรรค & สิ่งที่ต้องระวัง", "คำแนะนำ & ทางออกสู่ความสำเร็จ"]
  };

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function getShareUrlText() {
    try {
      if (typeof location !== "undefined" && location.hostname && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
        const cleanPath = location.pathname ? location.pathname.replace(/\/$/, "") : "";
        return location.host + cleanPath;
      }
    } catch (e) { /* ignore */ }
    return "sarawutms.github.io/tarot-fortune-web";
  }

  function splitGraphemes(text) {
    const value = String(text || "");
    try {
      if (typeof Intl !== "undefined" && Intl.Segmenter) {
        const seg = new Intl.Segmenter("th", { granularity: "grapheme" });
        return Array.from(seg.segment(value), s => s.segment);
      }
    } catch (e) { /* fall through */ }
    return Array.from(value);
  }

  // ตัดข้อความเป็นหน่วยสำหรับขึ้นบรรทัดใหม่
  // ภาษาไทยไม่มีช่องว่างระหว่างคำ ถ้าตัดทีละตัวอักษรจะตัดกลางคำและแยกสระนำ (เ แ โ ใ ไ)
  // ออกจากพยัญชนะ เช่น "จ|ะเริ่มต้น" หรือ "เ|ริ่มต้น" ทำให้อ่านผิดและตำแหน่งข้อความเพี้ยน
  function splitWrapTokens(text) {
    try {
      if (typeof Intl !== "undefined" && Intl.Segmenter) {
        const seg = new Intl.Segmenter("th", { granularity: "word" });
        return Array.from(seg.segment(text), s => s.segment);
      }
    } catch (e) { /* fall through */ }
    return splitGraphemes(text);
  }

  // คำยาวเกินความกว้างบรรทัด (เช่น URL หรือคำอังกฤษยาว) ค่อยตัดราย grapheme
  function splitLongToken(ctx, token, maxWidth) {
    const graphemes = splitGraphemes(token);
    const parts = [];
    let chunk = "";
    graphemes.forEach(ch => {
      const test = chunk + ch;
      if (chunk && ctx.measureText(test).width > maxWidth) {
        parts.push(chunk);
        chunk = ch;
      } else {
        chunk = test;
      }
    });
    if (chunk) parts.push(chunk);
    return parts;
  }

  function wrapCanvasText(ctx, text, maxWidth, maxLines) {
    const tokens = [];
    splitWrapTokens(String(text || "")).forEach(segment => {
      segment.split(/(\n)/).forEach(piece => {
        if (!piece) return;
        if (piece === "\n") { tokens.push("\n"); return; }
        if (ctx.measureText(piece).width > maxWidth) splitLongToken(ctx, piece, maxWidth).forEach(p => tokens.push(p));
        else tokens.push(piece);
      });
    });

    const lines = [];
    let line = "";
    let i = 0;
    for (; i < tokens.length; i++) {
      const token = tokens[i];
      if (token === "\n") {
        lines.push(line);
        line = "";
        if (lines.length >= maxLines) { i++; break; }
        continue;
      }
      // ไม่เริ่มบรรทัดใหม่ด้วยช่องว่าง
      if (!line && !token.trim()) continue;
      const test = line + token;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = token.replace(/^\s+/, "");
        if (lines.length >= maxLines) { i++; break; }
      } else {
        line = test;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (i < tokens.length && lines.length) {
      // มีข้อความเกินจำนวนบรรทัด: ตัดท้ายด้วย … โดยตัดทีละ grapheme
      // เพื่อไม่ให้สระ/วรรณยุกต์ไทยหรือ emoji แตกกลางตัว
      const lastGraphemes = splitGraphemes(lines[lines.length - 1]);
      while (lastGraphemes.length && ctx.measureText(lastGraphemes.join("") + "…").width > maxWidth) {
        lastGraphemes.pop();
      }
      lines[lines.length - 1] = lastGraphemes.join("") + "…";
    }
    return lines;
  }

  function loadShareImage(url) {
    return new Promise(resolve => {
      if (!url) return resolve(null);
      const img = new Image();
      let settled = false;
      const finish = value => {
        if (!settled) { settled = true; resolve(value); }
      };
      const timer = setTimeout(() => finish(null), 7000);
      img.crossOrigin = "anonymous";
      img.onload = () => { clearTimeout(timer); finish(img); };
      img.onerror = () => { clearTimeout(timer); finish(null); };
      img.src = url;
    });
  }

  function drawImageCover(ctx, img, x, y, w, h) {
    const ratio = Math.max(w / img.width, h / img.height);
    const sw = w / ratio;
    const sh = h / ratio;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  // ไอคอนวาดเองด้วย path — สีคงที่และหน้าตาเหมือนกันทุกแพลตฟอร์ม (ต่างจาก emoji)
  function drawSparkle(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + r * 0.16, cy - r * 0.16, cx + r, cy);
    ctx.quadraticCurveTo(cx + r * 0.16, cy + r * 0.16, cx, cy + r);
    ctx.quadraticCurveTo(cx - r * 0.16, cy + r * 0.16, cx - r, cy);
    ctx.quadraticCurveTo(cx - r * 0.16, cy - r * 0.16, cx, cy - r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawDiamond(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.72, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.72, cy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function goldGradient(ctx, W) {
    const gold = ctx.createLinearGradient(W * 0.2, 0, W * 0.8, 0);
    gold.addColorStop(0, "#f7dc6f");
    gold.addColorStop(0.5, "#f5b041");
    gold.addColorStop(1, "#d35400");
    return gold;
  }

  function paintReadingBackground(ctx, W, H, reading, starCount = 150) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0a0b18");
    bg.addColorStop(0.45, "#181334");
    bg.addColorStop(1, "#0a0b18");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createRadialGradient(W / 2, H * 0.11, 40, W / 2, H * 0.11, W * 0.83);
    glow.addColorStop(0, "rgba(142,68,173,0.4)");
    glow.addColorStop(1, "rgba(142,68,173,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H * 0.57);

    // ดาวแบบ seeded — ผลไพ่เดิมได้รูปเดิมทุกครั้งที่แชร์
    let seed = 2166136261;
    (reading.cards || []).forEach(c => { seed = Math.imul(seed ^ (((c && c.id) || 0) + 1), 16777619); });
    seed = Math.imul(seed ^ String(reading.mode || "").length, 16777619) >>> 0;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < starCount; i++) {
      ctx.globalAlpha = 0.18 + rand() * 0.5;
      ctx.fillStyle = rand() > 0.75 ? "#f7dc6f" : "#ffffff";
      ctx.beginPath();
      ctx.arc(rand() * W, rand() * H, rand() * 2 + 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // พระจันทร์เสี้ยว + ดาว = เครื่องหมายแบรนด์ (วาดด้วย path เงื่อนไขเดียวกับไอคอนอื่น)
  function drawSigil(ctx, cx, cy, r, gold) {
    ctx.save();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.46, cy - r * 0.25, r * 0.93, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.restore();
    drawSparkle(ctx, cx + r * 1.5, cy - r * 0.86, r * 0.39, "#f7dc6f");
    drawSparkle(ctx, cx - r * 1.57, cy + r * 0.5, r * 0.25, "rgba(247,220,111,0.85)");
  }

  function drawShareCard(ctx, card, img, x, y, w, h, s = 1) {
    const radius = Math.max(10, Math.round(18 * s));
    const pad = Math.max(4, Math.round(7 * s));

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 16;
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.fillStyle = "#111428";
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRectPath(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, Math.max(6, radius - 5));
    ctx.clip();
    if (img) {
      if (card.isReversed) {
        const cx = x + w / 2;
        const cy = y + h / 2;
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI);
        ctx.translate(-cx, -cy);
      }
      drawImageCover(ctx, img, x + pad, y + pad, w - pad * 2, h - pad * 2);
    } else {
      const ph = ctx.createLinearGradient(x, y, x + w, y + h);
      ph.addColorStop(0, "#241a45");
      ph.addColorStop(1, "#121429");
      ctx.fillStyle = ph;
      ctx.fillRect(x, y, w, h);
      const pcx = x + w / 2;
      const pcy = y + h / 2;
      const pr = Math.min(w, h) * 0.16;
      ctx.strokeStyle = "rgba(245,176,65,0.5)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pcx, pcy, pr, 0, Math.PI * 2);
      ctx.stroke();
      drawSparkle(ctx, pcx, pcy, pr * 0.72, "rgba(245,176,65,0.9)");
    }
    ctx.restore();

    roundRectPath(ctx, x + 1.5, y + 1.5, w - 3, h - 3, radius);
    ctx.strokeStyle = "rgba(245,176,65,0.9)";
    ctx.lineWidth = 3;
    ctx.stroke();

    if (card.isReversed) {
      const bh = Math.round(46 * s);
      const bw = Math.round(116 * s);
      const off = Math.round(12 * s);
      const bx = x + w - bw - off;
      const by = y + off;
      roundRectPath(ctx, bx, by, bw, bh, bh / 2);
      ctx.fillStyle = "rgba(142,68,173,0.95)";
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `600 ${Math.round(24 * s)}px Prompt, 'Segoe UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("กลับหัว", bx + bw / 2, by + bh / 2 + 1);
      ctx.textBaseline = "alphabetic";
    }
  }

  // แท็กคีย์เวิร์ดใต้บล็อก: กล่องมนขอบทองจาง วางต่อกันจนเต็มความกว้างแล้วตัดทิ้ง
  function drawKeywordPills(ctx, keywords, x, y, maxWidth, size) {
    const list = (keywords || []).slice(0, 4);
    if (!list.length) return 0;
    const h = size + 14;
    ctx.font = `500 ${size}px Prompt, 'Segoe UI', sans-serif`;
    let cx = x;
    list.forEach(kw => {
      const label = "#" + kw;
      const pw = ctx.measureText(label).width + size * 1.6;
      if (cx + pw > x + maxWidth) return;
      roundRectPath(ctx, cx, y, pw, h, h / 2);
      ctx.fillStyle = "rgba(142,68,173,0.26)";
      ctx.fill();
      ctx.strokeStyle = "rgba(247,220,111,0.32)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#e3d9f6";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx + size * 0.8, y + h / 2 + 1);
      ctx.textBaseline = "alphabetic";
      cx += pw + 10;
    });
    return h;
  }

  // ข้อความ + ไอคอนวาดเอง ที่ความกว้างที่ใช้จัดวางจริง
  // (เลี่ยง emoji ใน canvas เพราะ emoji ทำให้บรรทัดที่จัดกึ่งกลางเยื้องไปข้างหนึ่ง)
  const ICON_TEXT_GAP = 12;
  function iconTextWidth(ctx, text, font, iconR) {
    ctx.font = font;
    return iconR * 2 + ICON_TEXT_GAP + ctx.measureText(text).width;
  }
  function drawIconText(ctx, text, x, y, opts) {
    const iconR = opts.iconR || 10;
    opts.icon(x + iconR, y - iconR * 0.9, iconR);
    ctx.textAlign = "left";
    ctx.fillStyle = opts.color;
    ctx.font = opts.font;
    ctx.fillText(text, x + iconR * 2 + ICON_TEXT_GAP, y);
    return iconTextWidth(ctx, text, opts.font, iconR);
  }

  async function buildReadingCanvas(reading, includeImages = true) {
    const W = 1080;
    const H = 1920;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    paintReadingBackground(ctx, W, H, reading, 150);

    const gold = goldGradient(ctx, W);
    drawSigil(ctx, W / 2, 58, 28, gold);

    ctx.textAlign = "center";
    ctx.fillStyle = gold;
    ctx.font = "700 58px Cinzel, Georgia, serif";
    ctx.fillText("TAROT SANCTUARY", W / 2, 130);

    ctx.fillStyle = "#c9b8e8";
    ctx.font = "400 32px Prompt, 'Segoe UI', sans-serif";
    ctx.fillText("✦ " + (MODE_LABELS[reading.mode] || "ไพ่ทำนาย") + " ✦", W / 2, 186);

    let cursorY = 240;
    if (reading.question) {
      ctx.fillStyle = "#f7dc6f";
      ctx.font = "italic 400 28px Prompt, 'Segoe UI', sans-serif";
      const qLines = wrapCanvasText(ctx, `“${reading.question}”`, 860, 2);
      qLines.forEach((line, i) => ctx.fillText(line, W / 2, cursorY + i * 40));
      cursorY += qLines.length * 40 + 12;
    }

    const cards = reading.cards || [];
    const count = cards.length || 1;
    // ไพ่ 3 ใบใช้รูปเล็กลง เพื่อเหลือพื้นที่ให้ข้อความเต็มความกว้างด้านล่าง
    const cardW = count === 1 ? 420 : 220;
    const cardH = Math.round(cardW * 1.66);
    const gap = count === 1 ? 0 : 30;
    const totalW = count * cardW + (count - 1) * gap;
    const startX = (W - totalW) / 2;
    const cardY = Math.max(cursorY + 26, count === 1 ? 300 : 276);

    const images = includeImages
      ? await Promise.all(cards.map(c => loadShareImage(c.image)))
      : cards.map(() => null);

    cards.forEach((card, i) => {
      const x = startX + i * (cardW + gap);

      drawShareCard(ctx, card, images[i], x, cardY, cardW, cardH, count === 1 ? 1 : 0.78);

      // ไพ่ 3 ใบมีชื่ออยู่ในหัวข้อบล็อกแล้ว จึงไม่ต้องเขียนซ้ำใต้รูป (ได้พื้นที่คืนให้รูปใหญ่ขึ้น)
      if (count === 1) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#f5b041";
        let nameSize = 32;
        ctx.font = `700 ${nameSize}px Cinzel, Georgia, serif`;
        while (nameSize > 16 && ctx.measureText(card.nameEn).width > cardW + 14) {
          nameSize -= 1;
          ctx.font = `700 ${nameSize}px Cinzel, Georgia, serif`;
        }
        ctx.fillText(card.nameEn, x + cardW / 2, cardY + cardH + 46);
        ctx.fillStyle = "#c9cfe4";
        ctx.font = "400 26px Prompt, 'Segoe UI', sans-serif";
        const nameLines = wrapCanvasText(ctx, card.nameTh, cardW + 20, 2);
        nameLines.forEach((line, li) => {
          ctx.fillText(line, x + cardW / 2, cardY + cardH + 82 + li * 30);
        });
      }
    });

    // ความหมายย่อ + คำแนะนำของไพ่ทุกใบ — เต็มความกว้างเพื่อให้อ่านได้ครบ
    const headingSize = 28;
    const adviceLabelSize = count === 1 ? 22 : 20;
    const textLeft = 90;
    const textW = W - textLeft * 2;
    const textTop = cardY + cardH + (count === 1 ? 126 : 50);
    const dividerGap = count === 1 ? 50 : 36;
    const afterMeaning = count === 1 ? 20 : 18;

    // เลือกขนาดตัวอักษรใหญ่ที่สุดที่เนื้อหายังพอดีกับภาพ
    // (เนื้อหาสั้น → ตัวใหญ่ขึ้น อ่านง่ายขึ้น; เนื้อหายาว → ลดลงหรือตัดบรรทัดเพื่อไม่ทับ footer)
    const contentLimit = H - 292 - 64;
    const buildStoryLayout = (size, maxMeaning, maxAdvice) => {
      const lineH = Math.round(size * 1.32);
      ctx.textAlign = "left";
      ctx.font = `400 ${size}px Prompt, 'Segoe UI', sans-serif`;
      const blocks = cards.map(card => {
        const rev = card.isReversed && card.reversed ? card.reversed : null;
        const meaningText = (rev ? rev.meaning : card.meaning) || "";
        const adviceText = (rev ? rev.advice : card.advice) || "";
        const meaningLines = wrapCanvasText(ctx, meaningText, textW - 24, maxMeaning);
        const adviceLines = wrapCanvasText(ctx, adviceText, textW - 24, maxAdvice);
        const pills = ((rev && rev.keywords) || card.keywords || []).slice(0, 4);
        const pillSize = count === 1 ? 20 : 18;
        const h = (count > 1 ? headingSize + 14 : 0)
          + size + (Math.max(1, meaningLines.length) - 1) * lineH + afterMeaning
          + adviceLabelSize + 12
          + size + (Math.max(1, adviceLines.length) - 1) * lineH
          + (pills.length ? 14 + pillSize + 14 : 0);
        return { rev, meaningLines, adviceLines, pills, pillSize, h };
      });
      const total = blocks.reduce((sum, b) => sum + b.h, 0) + (count - 1) * dividerGap;
      return { size, lineH, blocks, total };
    };

    // ให้ความสำคัญกับเนื้อหาครบก่อน แล้วค่อยลดขนาดตัวอักษรลงจนพอดี
    const storyConfigs = count === 1 ? [[6, 3], [5, 2], [4, 2]] : [[4, 2], [3, 2], [3, 1], [2, 1]];
    const minBodySize = 19;
    let layout = null;
    for (const [maxMeaning, maxAdvice] of storyConfigs) {
      for (let size = 30; size >= minBodySize; size--) {
        const candidate = buildStoryLayout(size, maxMeaning, maxAdvice);
        if (textTop + candidate.total <= contentLimit) { layout = candidate; break; }
      }
      if (layout) break;
    }
    if (!layout) {
      const lastConfig = storyConfigs[storyConfigs.length - 1];
      layout = buildStoryLayout(minBodySize, lastConfig[0], lastConfig[1]);
    }

    const bodySize = layout.size;
    const bodyLineH = layout.lineH;

    // หัวข้อทุกใบใช้ขนาดเดียวกัน — ย่อทั้งชุดถ้าชื่อยาวที่สุดยังชนกับป้ายตำแหน่งไพ่ด้านขวา
    const headingMaxW = textW - 350;
    const headingFor = (card, i) => `${i + 1}. ${card.nameEn} — ${String(card.nameTh || "").split(" (")[0]}`;
    let headingDrawSize = headingSize;
    if (count > 1) {
      cards.forEach((card, i) => {
        const heading = headingFor(card, i);
        let s = headingDrawSize;
        ctx.font = `600 ${s}px Prompt, 'Segoe UI', sans-serif`;
        while (s > 20 && ctx.measureText(heading).width > headingMaxW) {
          s -= 1;
          ctx.font = `600 ${s}px Prompt, 'Segoe UI', sans-serif`;
        }
        headingDrawSize = s;
      });
    }

    let y = textTop;
    layout.blocks.forEach((block, i) => {
      const card = cards[i];

      if (i > 0) {
        ctx.strokeStyle = "rgba(245,176,65,0.24)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(textLeft, y + 22);
        ctx.lineTo(W - textLeft, y + 22);
        ctx.stroke();
        y += dividerGap;
      }

      ctx.textAlign = "left";
      const blockStart = y;
      // ใบเดียวมีชื่อไพ่อยู่ใต้รูปแล้ว ไม่ต้องซ้ำหัวข้ออีก
      if (count > 1) {
        ctx.fillStyle = "#f5b041";
        ctx.font = `600 ${headingDrawSize}px Prompt, 'Segoe UI', sans-serif`;
        // ไม่ต่อท้ายด้วย "กลับหัว" ในหัวข้อ เพราะมีป้ายบนรูปไพ่อยู่แล้ว และทำให้หัวข้อยาวเกินบรรทัด
        const headingLines = wrapCanvasText(ctx, headingFor(card, i), headingMaxW, 1);
        ctx.fillText(headingLines[0] || "", textLeft, y + headingSize);

        const posLabel = (MODE_POSITIONS[reading.mode] || [])[i] || "";
        if (posLabel) {
          ctx.fillStyle = "#b9a7d9";
          ctx.font = `400 ${Math.round(headingSize * 0.78)}px Prompt, 'Segoe UI', sans-serif`;
          ctx.textAlign = "right";
          const posLines = wrapCanvasText(ctx, posLabel, 330, 1);
          ctx.fillText(posLines[0] || "", W - textLeft, y + headingSize);
          ctx.textAlign = "left";
        }
        y += headingSize + 14;
      }

      ctx.fillStyle = "#eef0f8";
      ctx.font = `400 ${bodySize}px Prompt, 'Segoe UI', sans-serif`;
      const meaningTop = y + bodySize;
      block.meaningLines.forEach((line, li) => ctx.fillText(line, textLeft, meaningTop + li * bodyLineH));
      y = meaningTop + (Math.max(1, block.meaningLines.length) - 1) * bodyLineH + afterMeaning;

      drawSparkle(ctx, textLeft + 9, y + adviceLabelSize * 0.42, adviceLabelSize * 0.58, "#f5b041");
      ctx.fillStyle = "#f5b041";
      ctx.font = `600 ${adviceLabelSize}px Prompt, 'Segoe UI', sans-serif`;
      ctx.fillText("คำแนะนำจากจักรวาล", textLeft + 26, y + adviceLabelSize);
      y += adviceLabelSize + 12;

      ctx.fillStyle = "#f7dc6f";
      ctx.font = `400 ${bodySize}px Prompt, 'Segoe UI', sans-serif`;
      const adviceTop = y + bodySize;
      block.adviceLines.forEach((line, li) => ctx.fillText(line, textLeft, adviceTop + li * bodyLineH));
      y = adviceTop + (Math.max(1, block.adviceLines.length) - 1) * bodyLineH;

      if (block.pills.length) {
        y += 14;
        y += drawKeywordPills(ctx, block.pills, textLeft, y, textW - 40, block.pillSize);
      }

      // แถบทองบาง ๆ ด้านซ้ายของแต่ละบล็อก ช่วยนำสายตาและแยกใบให้ชัด
      const barH = Math.max(28, y + 8 - blockStart);
      const barGrad = ctx.createLinearGradient(0, blockStart, 0, blockStart + barH);
      barGrad.addColorStop(0, "rgba(245,176,65,0.7)");
      barGrad.addColorStop(1, "rgba(245,176,65,0.08)");
      roundRectPath(ctx, textLeft - 26, blockStart - 4, 4, barH, 2);
      ctx.fillStyle = barGrad;
      ctx.fill();
    });

    // แถบพลังงานมงคล — วัดความกว้างจริงรวมไอคอนแล้วจัดกึ่งกลางทั้งกลุ่ม
    // (ไม่ใช้ emoji ใน canvas เพราะ emoji ทำให้บรรทัดเยื้องออกจากศูนย์)
    const luckyCard = cards[0] || {};
    const luckyY = Math.max(y + 76, H - 292);
    const luckyFont = "600 28px Prompt, 'Segoe UI', sans-serif";
    const luckyColorText = "สีมงคล: " + (luckyCard.luckyColor || "-");
    const luckyNumberText = "เลขนำโชค: " + (luckyCard.luckyNumber || "-");
    const luckyColorW = iconTextWidth(ctx, luckyColorText, luckyFont, 13);
    const luckyNumberW = iconTextWidth(ctx, luckyNumberText, luckyFont, 12);
    drawIconText(ctx, luckyColorText, W / 2 - luckyColorW / 2, luckyY, {
      font: luckyFont, color: "#f7dc6f", iconR: 13,
      icon: (cx, cy, r) => drawSparkle(ctx, cx, cy, r, "#f7dc6f")
    });
    drawIconText(ctx, luckyNumberText, W / 2 - luckyNumberW / 2, luckyY + 44, {
      font: luckyFont, color: "#f7dc6f", iconR: 12,
      icon: (cx, cy, r) => drawDiamond(ctx, cx, cy, r, "#f7dc6f")
    });

    // แถบปิดท้าย: แบรนด์ + วันที่อ่านไพ่
    ctx.strokeStyle = "rgba(245,176,65,0.26)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(textLeft, H - 176);
    ctx.lineTo(W - textLeft, H - 176);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.font = "700 34px Cinzel, Georgia, serif";
    const brandW = ctx.measureText("TAROT SANCTUARY").width;
    drawSparkle(ctx, W / 2 - brandW / 2 - 30, H - 134, 12, "#f5b041");
    drawSparkle(ctx, W / 2 + brandW / 2 + 30, H - 134, 12, "#f5b041");
    ctx.fillStyle = gold;
    ctx.fillText("TAROT SANCTUARY", W / 2, H - 122);

    let dateText = "";
    try {
      dateText = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
    } catch (e) { /* locale ไม่รองรับ */ }
    ctx.fillStyle = "#a8b2d1";
    ctx.font = "400 22px Prompt, 'Segoe UI', sans-serif";
    ctx.fillText("ไพ่ทาโรต์นำทางชีวิต" + (dateText ? " · อ่านเมื่อ " + dateText : ""), W / 2, H - 84);

    // บรรทัดชวนเล่นต่อ + ลิงก์เว็บสำหรับแชร์ลงโซเชียล (จัดให้พอดีทั้งบนสตอรี่และโพสต์)
    const shareUrl = getShareUrlText();
    const cta = `เปิดไพ่ของคุณเองฟรี · ${shareUrl}`;
    let ctaSize = 22;
    ctx.font = `600 ${ctaSize}px Prompt, 'Segoe UI', sans-serif`;
    while (ctaSize > 15 && ctx.measureText(cta).width > W - 120) {
      ctaSize -= 1;
      ctx.font = `600 ${ctaSize}px Prompt, 'Segoe UI', sans-serif`;
    }
    const ctaW = ctx.measureText(cta).width;
    ctx.fillStyle = "#f7dc6f";
    ctx.fillText(cta, W / 2, H - 44);
    drawSparkle(ctx, W / 2 - ctaW / 2 - 24, H - 52, 8, "#f5b041");
    drawSparkle(ctx, W / 2 + ctaW / 2 + 24, H - 52, 8, "#f5b041");

    return canvas;
  }

  // ภาพแชร์แบบจัตุรัส 1080x1080 สำหรับโพสต์ฟีด (Facebook / IG)
  // เลย์เอาต์ย่อ: สีมงคล/เลขนำโชคย่อเหลือบรรทัดเดียวที่ท้ายภาพ และไม่มีหัวข้อย่อย "คำแนะนำจากจักรวาล" เพื่อเหลือที่ให้เนื้อหา
  async function buildSquareCanvas(reading, includeImages = true) {
    const W = 1080;
    const H = 1080;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    paintReadingBackground(ctx, W, H, reading, 90);

    const gold = goldGradient(ctx, W);
    drawSigil(ctx, W / 2, 44, 20, gold);

    ctx.textAlign = "center";
    ctx.fillStyle = gold;
    ctx.font = "700 40px Cinzel, Georgia, serif";
    ctx.fillText("TAROT SANCTUARY", W / 2, 92);

    ctx.fillStyle = "#c9b8e8";
    ctx.font = "400 22px Prompt, 'Segoe UI', sans-serif";
    ctx.fillText(MODE_LABELS[reading.mode] || "ไพ่ทำนาย", W / 2, 124);

    const cards = reading.cards || [];
    const count = cards.length || 1;
    let cursorY = 154;
    if (reading.question) {
      ctx.fillStyle = "#f7dc6f";
      ctx.font = "italic 400 21px Prompt, 'Segoe UI', sans-serif";
      const qLines = wrapCanvasText(ctx, `“${reading.question}”`, 880, 1);
      ctx.fillText(qLines[0] || "", W / 2, cursorY);
      cursorY += 26;
    }

    const cardW = count === 1 ? 300 : 150;
    const cardH = Math.round(cardW * 1.66);
    const gap = count === 1 ? 0 : 26;
    const totalW = count * cardW + (count - 1) * gap;
    const startX = (W - totalW) / 2;
    const cardY = Math.max(cursorY + 10, 156);

    const images = includeImages
      ? await Promise.all(cards.map(c => loadShareImage(c.image)))
      : cards.map(() => null);

    cards.forEach((card, i) => {
      drawShareCard(ctx, card, images[i], startX + i * (cardW + gap), cardY, cardW, cardH, count === 1 ? 0.9 : 0.62);
    });

    const cardBottom = cardY + cardH;
    const textLeft = 80;
    const textW = W - textLeft * 2;
    const headingSize = 24;
    const afterMeaning = 10;
    // เผื่อที่ให้แถวสีมงคล/เลขนำโชคท้ายเรื่อง + ช่องว่างหายใจก่อน footer
    const contentLimit = H - 190;

    if (count === 1) {
      const card = cards[0] || {};
      ctx.textAlign = "center";
      ctx.fillStyle = "#f5b041";
      let nameSize = 30;
      ctx.font = `700 ${nameSize}px Cinzel, Georgia, serif`;
      while (nameSize > 16 && ctx.measureText(card.nameEn || "").width > W - 180) {
        nameSize -= 1;
        ctx.font = `700 ${nameSize}px Cinzel, Georgia, serif`;
      }
      ctx.fillText(card.nameEn || "", W / 2, cardBottom + 40);
      ctx.fillStyle = "#c9cfe4";
      ctx.font = "400 22px Prompt, 'Segoe UI', sans-serif";
      const thLines = wrapCanvasText(ctx, card.nameTh || "", W - 220, 1);
      ctx.fillText(thLines[0] || "", W / 2, cardBottom + 70);
    }

    const textTop = cardBottom + (count === 1 ? 100 : 26);

    const buildSquareLayout = (size, maxMeaning, maxAdvice) => {
      const lineH = Math.round(size * 1.34);
      ctx.textAlign = "left";
      ctx.font = `400 ${size}px Prompt, 'Segoe UI', sans-serif`;
      const blocks = cards.map(card => {
        const rev = card.isReversed && card.reversed ? card.reversed : null;
        const meaningLines = wrapCanvasText(ctx, (rev ? rev.meaning : card.meaning) || "", textW - 24, maxMeaning);
        const adviceLines = wrapCanvasText(ctx, (rev ? rev.advice : card.advice) || "", textW - 54, maxAdvice);
        const h = (count > 1 ? headingSize + 6 : 0)
          + size + (Math.max(1, meaningLines.length) - 1) * lineH + afterMeaning
          + size + (Math.max(1, adviceLines.length) - 1) * lineH;
        return { rev, meaningLines, adviceLines, h };
      });
      const total = blocks.reduce((sum, b) => sum + b.h, 0) + (count - 1) * 16;
      return { size, lineH, blocks, total };
    };

    // เนื้อหาต้องไม่ล้าเข้าโซน footer: ลดขนาด/จำนวนบรรทัดลงจนพอดี
    const squareConfigs = count === 1 ? [[4, 2], [3, 2], [3, 1]] : [[3, 2], [3, 1], [2, 1]];
    const minSquareSize = 17;
    let layout = null;
    for (const [maxMeaning, maxAdvice] of squareConfigs) {
      for (let size = 24; size >= minSquareSize; size--) {
        const candidate = buildSquareLayout(size, maxMeaning, maxAdvice);
        if (textTop + candidate.total <= contentLimit) { layout = candidate; break; }
      }
      if (layout) break;
    }
    if (!layout) {
      const lastConfig = squareConfigs[squareConfigs.length - 1];
      layout = buildSquareLayout(minSquareSize, lastConfig[0], lastConfig[1]);
    }

    // หัวข้อทุกใบใช้ขนาดเดียวกัน — ย่อทั้งชุดถ้าชื่อไพ่ยาวที่สุดยังไม่พอดี เพื่อไม่ให้หัวข้อสูงต่ำไม่เท่ากัน
    const headingFor = (card, i) => `${i + 1}. ${card.nameEn} — ${String(card.nameTh || "").split(" (")[0]}`;
    let headingDrawSize = headingSize;
    if (count > 1) {
      cards.forEach((card, i) => {
        const heading = headingFor(card, i);
        let s = headingDrawSize;
        ctx.font = `600 ${s}px Prompt, 'Segoe UI', sans-serif`;
        while (s > 20 && ctx.measureText(heading).width > textW) {
          s -= 1;
          ctx.font = `600 ${s}px Prompt, 'Segoe UI', sans-serif`;
        }
        headingDrawSize = s;
      });
    }

    // กระจายพื้นที่ว่างที่เหลือให้แต่ละบล็อก เพื่อไม่ให้มีช่องดำโหว่ช่วงล่าง
    const extra = Math.max(0, contentLimit - (textTop + layout.total));
    const spread = count > 1 ? Math.min(extra / count, 56) : 0;

    let y = textTop + spread;
    layout.blocks.forEach((block, i) => {
      const card = cards[i];

      if (i > 0) {
        y += spread;
        ctx.strokeStyle = "rgba(245,176,65,0.22)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(textLeft, y + 8);
        ctx.lineTo(W - textLeft, y + 8);
        ctx.stroke();
        y += 16;
      }

      ctx.textAlign = "left";
      if (count > 1) {
        ctx.fillStyle = "#f5b041";
        ctx.font = `600 ${headingDrawSize}px Prompt, 'Segoe UI', sans-serif`;
        const headingLines = wrapCanvasText(ctx, headingFor(card, i), textW, 1);
        ctx.fillText(headingLines[0] || "", textLeft, y + headingSize);
        y += headingSize + 6;
      }

      ctx.fillStyle = "#eef0f8";
      ctx.font = `400 ${layout.size}px Prompt, 'Segoe UI', sans-serif`;
      const meaningTop = y + layout.size;
      block.meaningLines.forEach((line, li) => ctx.fillText(line, textLeft, meaningTop + li * layout.lineH));
      y = meaningTop + (Math.max(1, block.meaningLines.length) - 1) * layout.lineH + afterMeaning;

      // ใช้ประกายทองนำหน้าคำแนะนำแทนหัวข้อย่อย เพื่อประหยัดพื้นที่
      drawSparkle(ctx, textLeft + 9, y + layout.size * 0.55, 8, "#f5b041");
      ctx.fillStyle = "#f7dc6f";
      ctx.font = `400 ${layout.size}px Prompt, 'Segoe UI', sans-serif`;
      const adviceTop = y + layout.size;
      block.adviceLines.forEach((line, li) => ctx.fillText(line, textLeft + 30, adviceTop + li * layout.lineH));
      y = adviceTop + (Math.max(1, block.adviceLines.length) - 1) * layout.lineH;
    });

    // แถบปิดท้ายแบบย่อ: สีมงคล · เลขนำโชค + เส้นคั่น + โลโก้ + CTA
    // จัดกึ่งกลางทั้งกลุ่มจากการวัดความกว้างจริง รวมไอคอนที่วาดเอง (ไม่มี emoji ใน canvas)
    const luckyCard = cards[0] || {};
    const luckyFont = `600 20px Prompt, 'Segoe UI', sans-serif`;
    const luckyColorText = "สีมงคล: " + (luckyCard.luckyColor || "-");
    const luckyNumberText = "เลขนำโชค: " + (luckyCard.luckyNumber || "-");
    const luckyDot = "·";
    const luckyGap = 30;
    ctx.font = luckyFont;
    const luckyColorW = iconTextWidth(ctx, luckyColorText, luckyFont, 9);
    const luckyNumberW = iconTextWidth(ctx, luckyNumberText, luckyFont, 9);
    const luckyDotW = ctx.measureText(luckyDot).width;
    const luckyTotalW = luckyColorW + luckyGap + luckyDotW + luckyGap + luckyNumberW;
    let luckyX = W / 2 - luckyTotalW / 2;
    drawIconText(ctx, luckyColorText, luckyX, H - 128, {
      font: luckyFont, color: "#f7dc6f", iconR: 9,
      icon: (cx, cy, r) => drawSparkle(ctx, cx, cy, r, "#f7dc6f")
    });
    luckyX += luckyColorW + luckyGap;
    ctx.fillStyle = "#b9a7d9";
    ctx.textAlign = "left";
    ctx.fillText(luckyDot, luckyX + luckyDotW / 2, H - 128);
    luckyX += luckyDotW + luckyGap;
    drawIconText(ctx, luckyNumberText, luckyX, H - 128, {
      font: luckyFont, color: "#f7dc6f", iconR: 9,
      icon: (cx, cy, r) => drawDiamond(ctx, cx, cy, r, "#f7dc6f")
    });

    const dividerY = H - 102;
    ctx.strokeStyle = "rgba(245,176,65,0.26)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(textLeft, dividerY);
    ctx.lineTo(W - textLeft, dividerY);
    ctx.stroke();

    // drawIconText ข้างบนตั้ง textAlign เป็น left — ต้องกลับมา center ก่อนวาดโลโก้และ CTA
    ctx.textAlign = "center";
    ctx.fillStyle = gold;
    ctx.font = "700 30px Cinzel, Georgia, serif";
    const brandW = ctx.measureText("TAROT SANCTUARY").width;
    drawSparkle(ctx, W / 2 - brandW / 2 - 26, H - 76, 10, "#f5b041");
    drawSparkle(ctx, W / 2 + brandW / 2 + 26, H - 76, 10, "#f5b041");
    ctx.fillText("TAROT SANCTUARY", W / 2, H - 64);

    const shareUrl = getShareUrlText();
    const squareCta = `เปิดไพ่ฟรี · ${shareUrl}`;
    let squareCtaSize = 19;
    ctx.font = `600 ${squareCtaSize}px Prompt, 'Segoe UI', sans-serif`;
    while (squareCtaSize > 13 && ctx.measureText(squareCta).width > W - 100) {
      squareCtaSize -= 1;
      ctx.font = `600 ${squareCtaSize}px Prompt, 'Segoe UI', sans-serif`;
    }
    ctx.fillStyle = "#f7dc6f";
    ctx.fillText(squareCta, W / 2, H - 28);

    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      if (canvas.toBlob) {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("toBlob returned null")), "image/png");
        return;
      }
      try {
        const dataUrl = canvas.toDataURL("image/png");
        const binary = atob(dataUrl.split(",")[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        resolve(new Blob([bytes], { type: "image/png" }));
      } catch (e) {
        reject(e);
      }
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    // ให้เวลามากพอบนมือถือที่ต้องเปิด/บันทึกไฟล์ก่อน แล้วค่อยคืนหน่วยความจำ
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // iPadOS 13+ รายงาน user agent เป็น Macintosh แต่ยังเป็นจอสัมผัส
  function isIosLike() {
    const ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  }

  // รูปผลทำนายมี 2 ขนาด: สตอรี่ = แนวตั้ง 1080x1920, ฟีด = จัตุรัส 1080x1080
  // ผู้ใช้เลือกขนาดด้วย toggle แล้วจึงเลือกการกระทำ: บันทึกลงเครื่อง หรือแชร์ผ่าน Web Share API
  const SHARE_TITLE = "ผลไพ่ทาโรต์ของฉัน — Tarot Sanctuary";
  const SHARE_TEXT = "🔮 มาเปิดไพ่ทาโรต์นำทางชีวิตกันที่ Tarot Sanctuary";
  let shareImageSize = "story";

  function getSharePreset() {
    return shareImageSize === "feed"
      ? { builder: buildSquareCanvas, suffix: "-square", label: "รูปจัตุรัส 1080×1080" }
      : { builder: buildReadingCanvas, suffix: "", label: "รูปแนวตั้ง 1080×1920" };
  }

  function setShareImageSize(size) {
    shareImageSize = size === "feed" ? "feed" : "story";
    [[btnSizeStory, "story"], [btnSizeFeed, "feed"]].forEach(([btn, key]) => {
      if (!btn) return;
      const active = key === shareImageSize;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  // ฟอนต์ต้องพร้อมก่อนวาด: ถ้าวาดด้วยฟอนต์สำรอง ความกว้างตัวอักษรจะต่างกัน
  // ทำให้ข้อความขึ้นบรรทัด/วางตำแหน่งเหลื่อมจากที่ควรเป็น (ชัดบนมือถือที่เน็ตช้า)
  const SHARE_FONT_FACES = [
    "700 58px Cinzel",
    "500 30px Prompt",
    "600 30px Prompt",
    "400 24px Prompt",
    "400 20px Prompt"
  ];
  let shareFontsPromise = null;

  function ensureShareFontsReady(timeoutMs = 3000) {
    if (!document.fonts) return Promise.resolve(false);
    if (!shareFontsPromise) {
      shareFontsPromise = (async () => {
        await Promise.all(SHARE_FONT_FACES.map(f => document.fonts.load(f).catch(() => null)));
        return Promise.race([
          document.fonts.ready.then(() => true),
          new Promise(r => setTimeout(() => r(false), timeoutMs))
        ]);
      })().catch(() => false);
      // ถ้ารอจนหมดเวลาแต่ฟอนต์ยังไม่มา ให้ลองใหม่ในครั้งถัดไป
      shareFontsPromise.then(ok => { if (!ok) shareFontsPromise = null; });
    }
    return shareFontsPromise;
  }

  async function renderReadingImage() {
    const preset = getSharePreset();
    const fontsReady = await ensureShareFontsReady();
    let canvas;
    try {
      canvas = await preset.builder(lastReading, true);
    } catch (imgErr) {
      console.warn("Image share fallback (no card images):", imgErr);
      canvas = await preset.builder(lastReading, false);
    }
    const blob = await canvasToBlob(canvas);
    return { blob, preset, fontsReady, filename: `tarot-${lastReading.mode}${preset.suffix}-${Date.now()}.png` };
  }

  // คืนค่า "shared" | "canceled" | "unsupported"
  async function tryShareFile(blob, filename) {
    if (typeof File === "undefined" || !navigator.canShare || !navigator.share) return "unsupported";
    try {
      const file = new File([blob], filename, { type: "image/png" });
      if (!navigator.canShare({ files: [file] })) return "unsupported";
      await navigator.share({ files: [file], title: SHARE_TITLE, text: SHARE_TEXT });
      return "shared";
    } catch (shareErr) {
      // ผู้ใช้กดยกเลิกในชีตแชร์ = ถือว่าจบแล้ว ไม่ต้องบันทึกไฟล์ซ้ำ
      if (shareErr && shareErr.name === "AbortError") return "canceled";
      console.warn("Share sheet unavailable:", shareErr);
      return "unsupported";
    }
  }

  // iOS ไม่รองรับ <a download> กับ blob (กดแล้วไม่มีอะไรเกิดขึ้น / เปิดรูปค้างในแท็บ)
  // จึงใช้ชีตแชร์แทน แล้วให้ผู้ใช้เลือก "บันทึกรูปภาพ" ลงอัลบั้ม
  async function saveImageFile(blob, filename) {
    if (isIosLike()) {
      const status = await tryShareFile(blob, filename);
      if (status !== "unsupported") return status;
    }
    downloadBlob(blob, filename);
    return "downloaded";
  }

  // สร้างรูปเก็บไว้ล่วงหน้า: บน iOS navigator.share ต้องถูกเรียกในจังหวะที่ผู้ใช้กด
  // ถ้ารอสร้าง canvas/blob ก่อน สิทธิ์การกดจะหมดอายุและชีตแชร์ไม่ขึ้น
  function readingImageKey() {
    if (!lastReading) return "";
    const cards = lastReading.cards.map(c => `${c.name}:${c.isReversed ? 1 : 0}`).join(",");
    return `${lastReading.mode}|${shareImageSize}|${cards}|${lastReading.question || ""}`;
  }

  function prepareReadingImage() {
    const key = readingImageKey();
    if (!key) return Promise.reject(new Error("no reading"));
    const cachedIsStale = shareImageCache.key === key && shareImageCache.result
      && shareImageCache.result.fontsReady === false;
    if (shareImageCache.key === key && shareImageCache.promise && !cachedIsStale) return shareImageCache.promise;
    const promise = renderReadingImage().then(result => {
      if (shareImageCache.key === key) shareImageCache.result = result;
      return result;
    }, err => {
      if (shareImageCache.key === key) shareImageCache.promise = null;
      throw err;
    });
    shareImageCache = { key, result: null, promise };
    return promise;
  }

  function scheduleWarmShareImage() {
    clearTimeout(warmShareTimer);
    warmShareTimer = setTimeout(() => {
      if (!lastReading) return;
      const warm = () => ensureShareFontsReady().then(ok => {
        // ถ้าฟอนต์ยังไม่มา อย่าเพิ่งสร้างรูป เพราะจะได้ภาพที่ข้อความวางตำแหน่งเหลื่อม
        if (ok) prepareReadingImage().catch(() => { /* สร้างไม่ได้ก็ปล่อยให้กดแล้วสร้างใหม่ */ });
      });
      if (window.requestIdleCallback) window.requestIdleCallback(warm, { timeout: 2500 });
      else warm();
    }, 500);
  }

  function wireImageAction(btn, action) {
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (!lastReading) return;
      const originalLabel = btn.innerHTML;
      const key = readingImageKey();
      // ถ้ารูปถูกเตรียมไว้แล้ว (key ตรงกัน และวาดตอนฟอนต์พร้อม) จะไม่ await ก่อนเรียกชีตแชร์
      // → ยังอยู่ในจังหวะที่ผู้ใช้กด; รูปที่สร้างก่อนฟอนต์พร้อมต้องวาดใหม่
      const cached = shareImageCache.key === key && shareImageCache.result
        && shareImageCache.result.fontsReady !== false
        ? shareImageCache.result
        : null;

      btn.disabled = true;
      btn.textContent = action === "share" ? "⏳ กำลังแชร์..." : "⏳ กำลังบันทึก...";

      (async () => {
        try {
          const { blob, preset, filename } = cached || await prepareReadingImage();
          if (action === "share") {
            const status = await tryShareFile(blob, filename);
            if (status === "shared") {
              showToast("✨ เปิดหน้าต่างแชร์แล้ว — เลือกแอปที่ต้องการได้เลย");
            } else if (status === "canceled") {
              showToast("ยกเลิกการแชร์แล้ว");
            } else {
              downloadBlob(blob, filename);
              showToast(`📥 เบราว์เซอร์นี้แชร์ไฟล์ไม่ได้ — บันทึก${preset.label}ให้แล้ว`);
            }
          } else {
            const status = await saveImageFile(blob, filename);
            if (status === "shared") {
              showToast(`📥 เลือก "บันทึกรูปภาพ" ในชีตแชร์เพื่อเก็บ${preset.label}ได้เลย`);
            } else if (status === "canceled") {
              showToast("ยกเลิกการบันทึกแล้ว");
            } else {
              showToast(`📥 บันทึก${preset.label}แล้ว`);
            }
          }
          AudioFX.success();
          haptic(12);
        } catch (err) {
          console.error("Image action error:", err);
          showToast("ขออภัย สร้างรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "error");
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalLabel;
        }
      })();
    });
  }

  function wireSizeButton(btn, size) {
    if (!btn) return;
    btn.addEventListener("click", () => {
      setShareImageSize(size);
      scheduleWarmShareImage();
    });
  }

  wireSizeButton(btnSizeStory, "story");
  wireSizeButton(btnSizeFeed, "feed");
  setShareImageSize("story");
  wireImageAction(btnSaveImage, "save");
  wireImageAction(btnShareImage, "share");

  // Reset Reading with Smooth Fade-Out & Auto Shuffle
  // ป้าย "ไพ่ประจำวันนี้เปิดแล้ว" และปุ่มปลดล็อก (ปุ่มจะโผล่เมื่อกด "ดูรอบใหม่" ขณะยังล็อกอยู่)
  function syncDailyLockUI() {
    const locked = currentMode === "daily" && !!getDailyLock();
    if (dailyLockBadge) dailyLockBadge.hidden = !locked;
    if (btnUnlockDaily) {
      btnUnlockDaily.hidden = !(locked && dailyUnlockPrompted);
      if (locked && dailyUnlockPrompted) {
        // เล่นแอนิเมชันเด้งเบาๆ ทุกครั้งที่ถูกเรียกให้โผล่
        btnUnlockDaily.classList.remove("is-revealed");
        void btnUnlockDaily.offsetWidth;
        btnUnlockDaily.classList.add("is-revealed");
      }
    }
  }

  // ผู้ใช้ปลดล็อกเองได้ ถ้าอยากเปิดไพ่ประจำวันใบใหม่ในวันนี้
  function clearDailyLock() {
    try {
      localStorage.removeItem(DAILY_LOCK_KEY);
    } catch (e) { /* ignore */ }
  }

  // คำถามยืนยันก่อนปลดล็อก — กันกดพลาดเพราะปลดแล้วกลับมาล็อกไม่ได้
  function openDailyUnlockConfirm() {
    if (!dailyUnlockConfirm || !dailyUnlockConfirm.hidden) return;
    dailyUnlockConfirm.hidden = false;
    requestAnimationFrame(() => dailyUnlockConfirm.classList.add("show"));
    AudioFX.tap();
    haptic(6);
    if (btnDailyUnlockCancel) btnDailyUnlockCancel.focus();
  }

  // hideVeil = true คือ "ยกเลิก" → กลับไปเห็นไพ่เปล่า ๆ ไม่มีม่าน
  function closeDailyUnlockConfirm(restoreFocus = true, hideVeil = false) {
    if (!dailyUnlockConfirm || dailyUnlockConfirm.hidden) return;
    dailyUnlockConfirm.classList.remove("show");
    dailyUnlockConfirm.hidden = true;

    if (hideVeil) {
      dailyUnlockPrompted = false;
      syncDailyLockUI();
    }

    if (restoreFocus) {
      // ม่านถูกซ่อนตอนกดยกเลิก จึงคืนโฟกัสไปที่ปุ่มที่ใช้เปิดรอบใหม่แทน
      const focusTarget = hideVeil
        ? (document.getElementById("btn-quick-reset") || btnReset)
        : (btnUnlockDaily && !btnUnlockDaily.hidden ? btnUnlockDaily : document.getElementById("btn-quick-reset"));
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    }
  }

  function performDailyUnlock() {
    if (currentMode !== "daily") return;
    const hadLock = !!getDailyLock();
    dailyUnlockPrompted = false;
    if (!hadLock) {
      closeDailyUnlockConfirm(false);
      syncDailyLockUI();
      showToast("วันนี้ยังไม่ได้เปิดไพ่ประจำวัน — เลือกไพ่ได้เลย");
      return;
    }

    clearDailyLock();
    syncDailyLockUI();
    AudioFX.success();
    haptic(8);
    showToast("🔓 ปลดล็อกไพ่ประจำวันแล้ว — ตั้งจิตแล้วกดสับไพ่เพื่อเริ่มทำนายใหม่ได้เลย");
  }

  function handleUnlockDaily() {
    if (currentMode !== "daily") return;
    if (!getDailyLock()) {
      syncDailyLockUI();
      showToast("วันนี้ยังไม่ได้เปิดไพ่ประจำวัน — เลือกไพ่ได้เลย");
      return;
    }
    openDailyUnlockConfirm();
  }

  if (btnDailyUnlockOk) {
    btnDailyUnlockOk.addEventListener("click", () => {
      closeDailyUnlockConfirm(false);
      performDailyUnlock();
      // ตกลง = ปลดล็อกแล้วกลับไปกองไพ่ที่ยังไม่ได้สับแบบตอนแรก
      handleResetReading(null, false);
    });
  }
  if (btnDailyUnlockCancel) {
    btnDailyUnlockCancel.addEventListener("click", () => closeDailyUnlockConfirm(true, true));
  }
  if (dailyUnlockConfirm) {
    // คลิกพื้นหลังนอกกล่อง = ยกเลิก
    dailyUnlockConfirm.addEventListener("click", (e) => {
      if (e.target === dailyUnlockConfirm) closeDailyUnlockConfirm(true, true);
    });
    // Esc = ยกเลิก, Tab = วนอยู่ในกล่อง
    dailyUnlockConfirm.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDailyUnlockConfirm(true, true);
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = [btnDailyUnlockCancel, btnDailyUnlockOk].filter(Boolean);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  function handleResetReading(event, withShuffle = false) {
    // ไพ่ประจำวันเปิดได้วันละครั้ง — กดครั้งแรกจะพาม่านปลดล็อกขึ้นมาคลุมไพ่แทนการสุ่มทับ
    if (currentMode === "daily" && getDailyLock()) {
      dailyUnlockPrompted = true;
      syncDailyLockUI();
      AudioFX.tap();
      haptic(6);
      showToast("🌙 ไพ่ประจำวันของวันนี้เปิดแล้ว — กด ‘ปลดล็อกไพ่ประจำวัน’ เพื่อเปิดใบใหม่");
      // โฟกัสเฉพาะเมื่อสั่งด้วยคีย์บอร์ด (event.detail === 0) — คลิกเมาส์ไม่ต้องขึ้นวงแหวน
      if (btnUnlockDaily && (!event || event.detail === 0)) {
        btnUnlockDaily.focus({ preventScroll: true });
      }
      // เลื่อนจอไปที่ไพ่ผลลัพธ์ ให้เห็นม่านที่เพิ่งโผล่บนไพ่ทันที
      // (ถ้าผู้ใช้ปิดแอนิเมชันไว้ ให้กระโดดไปเลย ไม่ต้องเลื่อนนุ่ม)
      if (cardsShowcase) {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        cardsShowcase.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      }
      return;
    }

    dailyUnlockPrompted = false;
    clearActiveReading(currentMode);
    lastReading = null;

    // Scroll smoothly up to mode section
    document.getElementById("mode-section").scrollIntoView({ behavior: "smooth" });

    // Smooth fade out results before destroying
    resultSection.style.transition = "opacity 0.4s var(--ease-smooth), transform 0.4s var(--ease-smooth)";
    resultSection.style.opacity = "0";
    resultSection.style.transform = "translateY(25px)";

    setTimeout(() => {
      resultSection.classList.remove("show");
      resultSection.style.opacity = "";
      resultSection.style.transform = "";
      resultSection.style.transition = "";
      cardsShowcase.innerHTML = "";
      readingDetails.innerHTML = "";
      isRevealing = false;
      showDeckArea(withShuffle); // กลับมาเป็นกองไพ่ที่ยังไม่สับแบบตอนแรก
    }, 350);
  }

  btnReset.addEventListener("click", handleResetReading);
  if (btnUnlockDaily) btnUnlockDaily.addEventListener("click", handleUnlockDaily);
  const btnQuickReset = document.getElementById("btn-quick-reset");
  if (btnQuickReset) {
    btnQuickReset.addEventListener("click", handleResetReading);
  }

  function resetSelection() {
    selectedCards = [];
    generateFannedDeck(false);
    updateSelectionCounter();
  }

  // Smooth resize adjustment for fanned deck
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!isShuffling && fannedDeck.children.length > 0 && isDeckFanned) {
        const isMobile = window.innerWidth <= 600;
        const cards = fannedDeck.querySelectorAll(".deck-card");
        const track = fannedDeck.querySelector(".fanned-deck-track");
        const totalDeckCards = cards.length;
        const angleStep = isMobile ? 2.4 : 4.4;
        const xSpacing = isMobile ? 34 : 22;
        const startAngle = -((totalDeckCards - 1) * angleStep) / 2;

        if (track) {
          if (isMobile) {
            fannedDeck.classList.add("scrollable");
            track.style.width = `${(totalDeckCards - 1) * xSpacing + 76 + 64}px`;
          } else {
            fannedDeck.classList.remove("scrollable");
            track.style.width = "100%";
          }
        }

        cards.forEach((card, i) => {
          const angle = startAngle + i * angleStep;
          const xOffset = (i - (totalDeckCards - 1) / 2) * xSpacing;
          const yOffset = Math.abs(angle) * (isMobile ? 1.1 : 1.5);
          card.style.setProperty("--tx", `${xOffset}px`);
          card.style.setProperty("--ty", `${yOffset}px`);
          card.style.setProperty("--rot", `${angle}deg`);
        });
      }
    }, 150);
  });

  // ==========================================
  // DONATION & FRAMED QR CARD LOGIC
  // ==========================================
  // ภาพ QR ถูกฝังมาเป็น data URI เพราะถ้าโหลด PNG จากไฟล์ตรงๆ แล้ววาดลง canvas
  // เมื่อเปิดเว็บผ่าน file:// canvas จะถูก taint แล้ว export ไม่ได้
  // (SecurityError: Tainted canvases may not be exported) — data URI ไม่มีปัญหาเรื่องนี้
  // ต้นฉบับ 632x632 ถูกบีบอัดแบบ palette เหลือ ~11KB โดยภาพแทบไม่ต่างจากเดิม
  const QR_IMAGE_DATA_URI =
    "data:image/png;base64,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";

  function loadQrImage() {
    return new Promise(resolve => {
      const img = new Image();
      let settled = false;
      const finish = value => {
        if (!settled) { settled = true; resolve(value); }
      };
      img.onload = () => finish(img);
      img.onerror = () => finish(null);
      setTimeout(() => finish(null), 3000);
      img.src = QR_IMAGE_DATA_URI;
    });
  }

  // สร้างการ์ด QR Code รับเงินแบบมีกรอบทองสวยงาม สำหรับบันทึกลง Photos
  async function buildDonationCardCanvas() {
    const W = 900;
    const H = 1200;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    try {
      if (document.fonts) {
        await Promise.all([
          document.fonts.load("700 32px Cinzel"),
          document.fonts.load("600 20px Prompt"),
          document.fonts.load("400 18px Prompt")
        ]).catch(() => {});
        await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 800))]);
      }
    } catch (e) { /* use fallback fonts */ }

    // พื้นหลังโทนสว่าง สะอาดตา แบบหน้าจอ QR ของแอปธนาคาร
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#f8f5ef");
    bg.addColorStop(0.55, "#eef1f8");
    bg.addColorStop(1, "#e5eaf4");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createRadialGradient(W / 2, 70, 20, W / 2, 70, W * 0.72);
    glow.addColorStop(0, "rgba(245,176,65,0.24)");
    glow.addColorStop(1, "rgba(245,176,65,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, 520);

    // การ์ดขาวหลักพร้อมเงา
    const cardX = 46;
    const cardY = 46;
    const cardW = W - 92;
    const cardH = H - 92;
    ctx.save();
    ctx.shadowColor = "rgba(20, 28, 56, 0.16)";
    ctx.shadowBlur = 42;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = "#ffffff";
    roundRectPath(ctx, cardX, cardY, cardW, cardH, 36);
    ctx.fill();
    ctx.restore();

    const gold = goldGradient(ctx, W);

    // หัวการ์ด: โลโก้ + ชื่อร้าน + คำอธิบาย
    drawSigil(ctx, W / 2, 112, 18, gold);
    ctx.textAlign = "center";
    ctx.fillStyle = gold;
    ctx.font = "700 32px Cinzel, Georgia, serif";
    ctx.fillText("TAROT SANCTUARY", W / 2, 166);

    ctx.fillStyle = "#6b7690";
    ctx.font = "400 19px Prompt, 'Segoe UI', sans-serif";
    ctx.fillText("ร่วมสนับสนุนตามจิตศรัทธา", W / 2, 198);

    // กรอบ QR สไตล์แอปธนาคาร: พื้นขาว มุมโค้ง + วงเล็บมุมทอง
    const qrPanel = 540;
    const qrPanelX = (W - qrPanel) / 2;
    const qrPanelY = 226;
    roundRectPath(ctx, qrPanelX, qrPanelY, qrPanel, qrPanel, 26);
    ctx.fillStyle = "#fbfcff";
    ctx.fill();
    ctx.strokeStyle = "#e6e9f2";
    ctx.lineWidth = 2;
    ctx.stroke();

    const qrImg = await loadQrImage();

    const qrSize = 452;
    const qrX = (W - qrSize) / 2;
    const qrY = qrPanelY + (qrPanel - qrSize) / 2;
    if (qrImg) {
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    } else {
      // ถ้าโหลดรูป QR ไม่ได้ ให้กรอบว่างแทน ไม่ให้การ์ดพัง
      roundRectPath(ctx, qrX, qrY, qrSize, qrSize, 18);
      ctx.fillStyle = "#f1f3f9";
      ctx.fill();
      ctx.fillStyle = "#8b93a8";
      ctx.font = "400 20px Prompt, 'Segoe UI', sans-serif";
      ctx.fillText("โหลด QR ไม่สำเร็จ", W / 2, qrY + qrSize / 2);
    }

    // วงเล็บมุมทอง รอบ QR (แบบกรอบสแกนของแอปธนาคาร)
    const bracketInset = 22;
    const bracketLen = 40;
    const bx1 = qrPanelX + bracketInset;
    const by1 = qrPanelY + bracketInset;
    const bx2 = qrPanelX + qrPanel - bracketInset;
    const by2 = qrPanelY + qrPanel - bracketInset;
    ctx.strokeStyle = "#d9a33a";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    [[bx1, by1, 1, 1], [bx2, by1, -1, 1], [bx1, by2, 1, -1], [bx2, by2, -1, -1]].forEach(([x, y, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(x + dx * bracketLen, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * bracketLen);
      ctx.stroke();
    });
    ctx.lineCap = "butt";

    // คำอธิบายใต้ QR
    ctx.textAlign = "center";
    ctx.fillStyle = "#1b2540";
    ctx.font = "600 21px Prompt, 'Segoe UI', sans-serif";
    ctx.fillText("สแกนด้วยแอปธนาคาร หรือ TrueMoney Wallet", W / 2, 812);

    ctx.fillStyle = "#8b93a8";
    ctx.font = "400 16px Prompt, 'Segoe UI', sans-serif";
    ctx.fillText("ระบุยอดตามจิตศรัทธาได้เลย", W / 2, 842);

    // เส้นคั่น + รายละเอียดแบบสลิป
    const rowLeft = 150;
    const rowRight = W - 150;
    ctx.strokeStyle = "#eceef5";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rowLeft, 872);
    ctx.lineTo(rowRight, 872);
    ctx.stroke();

    const rows = [
      ["ผู้รับ", "Tarot Sanctuary"],
      ["ช่องทาง", "TrueMoney Wallet"],
      ["ยอดชำระ", "ตามจิตศรัทธา"]
    ];
    rows.forEach(([label, value], i) => {
      const ry = 912 + i * 38;
      ctx.textAlign = "left";
      ctx.fillStyle = "#8b93a8";
      ctx.font = "400 18px Prompt, 'Segoe UI', sans-serif";
      ctx.fillText(label, rowLeft, ry);
      ctx.textAlign = "right";
      ctx.fillStyle = "#1b2540";
      ctx.font = "600 19px Prompt, 'Segoe UI', sans-serif";
      ctx.fillText(value, rowRight, ry);
    });

    // ข้อความขอบคุณ (ไอคอนวาดเอง จัดกึ่งกลางทั้งกลุ่ม)
    const thanksText = "ขอบคุณสำหรับน้ำใจที่สนับสนุนค่าครู";
    const thanksFont = "600 18px Prompt, 'Segoe UI', sans-serif";
    const thanksW = iconTextWidth(ctx, thanksText, thanksFont, 8) + 46;
    const thanksX = W / 2 - thanksW / 2;
    drawSparkle(ctx, thanksX + 8, 1035, 8, "#d9a33a");
    ctx.textAlign = "left";
    ctx.fillStyle = "#8a6a1f";
    ctx.font = thanksFont;
    ctx.fillText(thanksText, thanksX + 26, 1042);
    drawSparkle(ctx, thanksX + thanksW - 20, 1035, 8, "#d9a33a");

    // ลิงก์เว็บไซต์ท้ายการ์ด
    ctx.textAlign = "center";
    ctx.fillStyle = "#9aa3b8";
    ctx.font = "400 16px Prompt, 'Segoe UI', sans-serif";
    ctx.fillText("ไพ่ทาโรต์นำทางชีวิต · " + getShareUrlText(), W / 2, 1096);

    return canvas;
  }

  // Save QR as beautiful framed card (uses Web Share API on mobile to save directly to Photos / Gallery)
  if (btnSaveQR) {
    btnSaveQR.addEventListener("click", async () => {
      const origText = btnSaveQR.textContent;
      btnSaveQR.disabled = true;
      btnSaveQR.textContent = "⏳ กำลังสร้างการ์ด QR...";
      try {
        const canvas = await buildDonationCardCanvas();
        const blob = await canvasToBlob(canvas);
        const filename = `tarot-donation-qr-${Date.now()}.png`;

        let savedViaShare = false;
        if (typeof File !== "undefined" && navigator.canShare && navigator.share) {
          try {
            const file = new File([blob], filename, { type: "image/png" });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: "QR Code ค่าครูตามศรัทธา — Tarot Sanctuary",
                text: "การ์ด QR Code ร่วมสนับสนุนค่าครูตามจิตศรัทธา"
              });
              savedViaShare = true;
              AudioFX.success();
              haptic(10);
              showToast("✨ เลือก ‘บันทึกรูปภาพ’ (Save Image) เพื่อเก็บเข้า Photos / อัลบั้มได้เลย");
            }
          } catch (shareErr) {
            if (shareErr && shareErr.name === "AbortError") {
              savedViaShare = true;
            }
          }
        }

        if (!savedViaShare) {
          downloadBlob(blob, filename);
          AudioFX.success();
          haptic(10);
          showToast("📥 บันทึกการ์ด QR ลงเครื่องเรียบร้อยแล้ว");
        }
      } catch (err) {
        console.error("Save QR error:", err);
        showToast("บันทึกรูปไม่สำเร็จ แตะค้างที่รูป QR เพื่อบันทึกลง Photos ได้ครับ", "error");
      } finally {
        btnSaveQR.disabled = false;
        btnSaveQR.textContent = origText;
      }
    });
  }

  // Toast Notification (แทน alert)
  function showToast(message, type = "success") {
    const existing = document.getElementById("toast-msg");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "toast-msg";
    toast.className = `toast-notification ${type === "error" ? "toast-error" : ""}`;
    // ให้โปรแกรมอ่านหน้าจอประกาศข้อความแทน alert()
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("toast-show"));
    setTimeout(() => {
      toast.classList.remove("toast-show");
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  // PWA: ลงทะเบียน service worker เฉพาะ http/https (file:// ใช้ไม่ได้)
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js").catch(err => {
      console.warn("Service worker registration failed:", err);
    });
  }
});
