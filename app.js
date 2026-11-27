// Tarot Sanctuary Core Logic

/* ============================================================
   Sound FX — synthesized with Web Audio API (no asset files)
   ============================================================ */
const AudioFX = (function () {
  let ctx = null;
  let noiseBuffer = null;
  let enabled = true;

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
    g.connect(ac.destination);
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
    g.connect(ac.destination);
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
        noiseBurst(0.05, { freq: 900 + Math.random() * 1800, gain: 0.04, when: i * 0.055 });
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
  const btnShareReading = document.getElementById("btn-share-reading");
  const btnShareSquare = document.getElementById("btn-share-square");
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

  function wrapCanvasText(ctx, text, maxWidth, maxLines) {
    const graphemes = splitGraphemes(text);
    const lines = [];
    let line = "";
    let i = 0;
    for (; i < graphemes.length; i++) {
      const ch = graphemes[i];
      if (ch === "\n") {
        lines.push(line);
        line = "";
        if (lines.length >= maxLines) { i++; break; }
        continue;
      }
      const test = line + ch;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = ch;
        if (lines.length >= maxLines) { i++; break; }
      } else {
        line = test;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (i < graphemes.length && lines.length) {
      // ตัดทีละ grapheme เพื่อไม่ให้สระ/วรรณยุกต์ไทยหรือ emoji แตกกลางตัว
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

  async function buildReadingCanvas(reading, includeImages = true) {
    const W = 1080;
    const H = 1920;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    paintReadingBackground(ctx, W, H, reading, 150);

    try {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
      }
    } catch (e) { /* use fallback fonts */ }

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
    const maxMeaning = count === 1 ? 6 : 4;
    const maxAdvice = count === 1 ? 3 : 2;
    const textTop = cardY + cardH + (count === 1 ? 126 : 50);
    const dividerGap = count === 1 ? 50 : 36;
    const afterMeaning = count === 1 ? 20 : 18;

    // รอบแรก: เลือกขนาดตัวอักษรใหญ่ที่สุดที่เนื้อหายังพอดีกับภาพ
    // (เนื้อหาสั้น → ตัวใหญ่ขึ้น อ่านง่ายขึ้น; เนื้อหายาว → ลดลงเพื่อไม่ทับ footer)
    const contentLimit = H - 292 - 64;
    const bodyCandidates = count === 1 ? [30, 28, 26] : [30, 28, 26, 24];
    let layout = null;
    for (const size of bodyCandidates) {
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
      layout = { size, lineH, blocks, total };
      if (textTop + total <= contentLimit) break;
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

    // แถบพลังงานมงคล — ไอคอนวาดเองเพื่อให้สีทองคงที่
    const luckyCard = cards[0] || {};
    // จัดกลุ่มกับแถบปิดท้าย เพื่อให้ส่วนที่เหลืออ่านเป็น "พื้นที่หายใจ" ไม่ใช่ข้อความลอย
    const luckyY = Math.max(y + 76, H - 292);
    const luckyFont = "600 30px Prompt, 'Segoe UI', sans-serif";
    const drawLucky = (text, baseline, icon) => {
      ctx.font = luckyFont;
      const textW2 = ctx.measureText(text).width;
      const startTx = W / 2 - textW2 / 2;
      icon(startTx - 26, baseline - 10);
      ctx.fillStyle = "#f7dc6f";
      ctx.textAlign = "left";
      ctx.fillText(text, startTx, baseline);
    };
    drawLucky("สีมงคล: " + (luckyCard.luckyColor || "-"), luckyY, (cx, cy) => drawSparkle(ctx, cx, cy, 12, "#f7dc6f"));
    drawLucky("เลขนำโชค: " + (luckyCard.luckyNumber || "-"), luckyY + 46, (cx, cy) => drawDiamond(ctx, cx, cy, 12, "#f7dc6f"));

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
    ctx.fillStyle = "#9aa3c0";
    ctx.font = "400 21px Prompt, 'Segoe UI', sans-serif";
    ctx.fillText("ไพ่ทาโรต์นำทางชีวิต" + (dateText ? " · อ่านเมื่อ " + dateText : ""), W / 2, H - 84);

    // บรรทัดชวนเล่นต่อ — ทุกครั้งที่ภาพถูกแชร์ต่อคือช่องทางกลับมาเว็บ
    const cta = "เปิดไพ่ของคุณเองฟรี";
    ctx.font = "600 26px Prompt, 'Segoe UI', sans-serif";
    const ctaW = ctx.measureText(cta).width;
    ctx.fillStyle = "#f7dc6f";
    ctx.fillText(cta, W / 2, H - 44);
    drawSparkle(ctx, W / 2 - ctaW / 2 - 26, H - 54, 8, "#f5b041");
    drawSparkle(ctx, W / 2 + ctaW / 2 + 26, H - 54, 8, "#f5b041");

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

    try {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
      }
    } catch (e) { /* use fallback fonts */ }

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
    // เผื่อที่ให้แถวสีมงคล/เลขนำโชคท้ายเรื่อง
    const contentLimit = H - 160;

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
    const maxMeaning = count === 1 ? 4 : 3;
    const maxAdvice = 2;
    const candidates = count === 1 ? [24, 22, 20] : [21, 20, 19, 18];

    let layout = null;
    for (const size of candidates) {
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
      layout = { size, lineH, blocks, total };
      if (textTop + total <= contentLimit) break;
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

    // แถบปิดท้ายแบบย่อ: แถวสีมงคล/เลขนำโชค + เส้นคั่น + โลโก้ + CTA
    const luckyCard = cards[0] || {};
    const luckyText = "สีมงคล: " + (luckyCard.luckyColor || "-") + "   ·   เลขนำโชค: " + (luckyCard.luckyNumber || "-");
    let luckySize = 20;
    ctx.textAlign = "center";
    ctx.font = `500 ${luckySize}px Prompt, 'Segoe UI', sans-serif`;
    while (luckySize > 15 && ctx.measureText(luckyText).width > textW - 60) {
      luckySize -= 1;
      ctx.font = `500 ${luckySize}px Prompt, 'Segoe UI', sans-serif`;
    }
    const luckyW = ctx.measureText(luckyText).width;
    const luckyBaseline = H - 130;
    ctx.fillStyle = "#f7dc6f";
    ctx.fillText(luckyText, W / 2, luckyBaseline);
    drawSparkle(ctx, W / 2 - luckyW / 2 - 24, luckyBaseline - luckySize * 0.34, 9, "#f5b041");

    const dividerY = H - 102;
    ctx.strokeStyle = "rgba(245,176,65,0.26)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(textLeft, dividerY);
    ctx.lineTo(W - textLeft, dividerY);
    ctx.stroke();

    ctx.fillStyle = gold;
    ctx.font = "700 30px Cinzel, Georgia, serif";
    const brandW = ctx.measureText("TAROT SANCTUARY").width;
    drawSparkle(ctx, W / 2 - brandW / 2 - 26, H - 76, 10, "#f5b041");
    drawSparkle(ctx, W / 2 + brandW / 2 + 26, H - 76, 10, "#f5b041");
    ctx.fillText("TAROT SANCTUARY", W / 2, H - 64);

    ctx.fillStyle = "#f7dc6f";
    ctx.font = "600 20px Prompt, 'Segoe UI', sans-serif";
    ctx.fillText("เปิดไพ่ของคุณเองฟรี", W / 2, H - 30);

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
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function wireShareButton(btn, builder, suffix) {
    if (!btn) return;
    btn.addEventListener("click", async () => {
      if (!lastReading) return;
      const originalLabel = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = "⏳ กำลังสร้างรูป...";
      try {
        let canvas;
        try {
          canvas = await builder(lastReading, true);
        } catch (imgErr) {
          console.warn("Image share fallback (no card images):", imgErr);
          canvas = await builder(lastReading, false);
        }
        const blob = await canvasToBlob(canvas);
        const filename = `tarot-${lastReading.mode}${suffix}-${Date.now()}.png`;
        let shared = false;
        if (typeof File !== "undefined" && navigator.canShare && navigator.share) {
          try {
            const file = new File([blob], filename, { type: "image/png" });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: "ผลไพ่ทาโรต์ของฉัน",
                text: "🔮 มาดูไพ่ทาโรต์ของฉันกันที่ Tarot Sanctuary"
              });
              shared = true;
              showToast("✨ แชร์รูปผลไพ่เรียบร้อยแล้ว");
            }
          } catch (shareErr) {
            if (shareErr && shareErr.name === "AbortError") {
              shared = true;
            }
          }
        }
        if (!shared) {
          downloadBlob(blob, filename);
          showToast("📸 บันทึกรูปผลไพ่ลงเครื่องแล้ว — นำไปแชร์ต่อได้เลย");
        }
        AudioFX.success();
        haptic(12);
      } catch (err) {
        console.error("Share image error:", err);
        showToast("ขออภัย สร้างรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "error");
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalLabel;
      }
    });
  }

  wireShareButton(btnShareReading, buildReadingCanvas, "");
  wireShareButton(btnShareSquare, buildSquareCanvas, "-square");

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
    showToast("🔓 ปลดล็อกแล้ว — เริ่มสับไพ่ชุดใหม่ให้เลย");
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
      // ตกลง = ปลดล็อกแล้วกลับไปกองไพ่และสับชุดใหม่ทันที
      handleResetReading();
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

  function handleResetReading(event) {
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
      showDeckArea(true); // Return to deck with fresh shuffle!
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
  // DONATION & TRUEMONEY QR LOGIC
  // ==========================================
  // Save TrueMoney QR as image (for mobile users who cannot scan their own screen)
  if (btnSaveQR) {
    btnSaveQR.addEventListener("click", () => {
      try {
        const a = document.createElement("a");
        a.href = "truemoney-qr.png";
        a.download = "truemoney-qr.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        AudioFX.success();
        haptic(10);
        showToast("📥 บันทึกรูป QR Code ลงเครื่องแล้ว — เปิดแอปสแกนได้เลย");
      } catch (err) {
        console.error("Save QR error:", err);
        showToast("บันทึกรูป QR ไม่สำเร็จ กรุณากดค้างที่รูปเพื่อบันทึก", "error");
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
