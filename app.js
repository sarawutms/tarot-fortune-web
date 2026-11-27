// Tarot Sanctuary Core Logic

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

  // LocalStorage Settings for PromptPay
  let promptPayTarget = localStorage.getItem("tarot_promptpay_target") || "0812345678";
  let merchantName = localStorage.getItem("tarot_merchant_name") || "แม่หมอทาโรต์";

  // Persistence Helpers (Hold active reading until user shuffles again)
  const READING_TTL_MS = 2 * 60 * 60 * 1000; // หมดอายุหลังจาก 2 ชั่วโมง

  function saveActiveReading(mode, pickedCards, question) {
    try {
      const data = {
        mode,
        cardIds: pickedCards.map(c => c.id),
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

      if (data && Array.isArray(data.cardIds) && data.cardIds.length > 0) {
        const cards = data.cardIds.map(id => TAROT_CARDS.find(c => c.id == id)).filter(Boolean);
        if (cards.length === data.cardIds.length) {
          return { ...data, cards };
        }
      }
    } catch (e) {
      console.error("Error reading saved tarot reading:", e);
    }
    return null;
  }

  function clearActiveReading(mode) {
    localStorage.removeItem(`tarot_reading_${mode}`);
  }

  // DOM Elements
  const modeCards = document.querySelectorAll(".mode-card");
  const questionBox = document.getElementById("question-box");
  const userQuestion = document.getElementById("user-question");
  const deckArea = document.getElementById("deck-area");
  const instructionText = document.getElementById("instruction-text");
  const fannedDeck = document.getElementById("fanned-deck");
  const pickTargetCountSpan = document.getElementById("pick-target-count");
  const selectedCounterSpan = document.getElementById("selected-counter");
  const requiredCounterSpan = document.getElementById("required-counter");
  const btnShuffle = document.getElementById("btn-shuffle");
  const btnReveal = document.getElementById("btn-reveal");
  const resultSection = document.getElementById("result-section");
  const cardsShowcase = document.getElementById("cards-showcase");
  const readingDetails = document.getElementById("reading-details");
  const btnReset = document.getElementById("btn-reset-reading");

  // State
  let isDeckFanned = false; // Deck must be shuffled before cards can be picked

  // Donation Elements
  const qrCanvas = document.getElementById("qrcode-canvas");
  const qrAmountDisplay = document.getElementById("qr-amount-display");
  const displayPromptPayNumber = document.getElementById("display-promptpay-number");
  const btnCopyAccount = document.getElementById("btn-copy-account");

  // Settings Modal Elements
  const btnSettingsTrigger = document.getElementById("btn-settings-trigger");
  const settingsModal = document.getElementById("settings-modal");
  const btnModalClose = document.getElementById("btn-modal-close");
  const inputPromptPayTarget = document.getElementById("input-promptpay-target");
  const inputMerchantName = document.getElementById("input-merchant-name");
  const btnSaveSettings = document.getElementById("btn-save-settings");

  // Initialize
  updatePromptPayDisplay();
  renderDonationQR();

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
    pickTargetCountSpan.textContent = requiredCards;
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

      pickTargetCountSpan.textContent = requiredCards;
      requiredCounterSpan.textContent = requiredCards;

      checkAndRenderMode(currentMode);
    });
  });

  // Generate Deck (Stacked Pile or Fanned Arc)
  function generateFannedDeck(fanned = false, animate = true) {
    fannedDeck.innerHTML = "";
    selectedCards = [];
    isDeckFanned = fanned;
    updateSelectionCounter();

    const isMobile = window.innerWidth <= 600;
    const totalDeckCards = isMobile ? 13 : 15;
    const angleStep = isMobile ? 3.4 : 4.4;
    const xSpacing = isMobile ? 14 : 22;
    const startAngle = -((totalDeckCards - 1) * angleStep) / 2;

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
        // Fanned arc (Cards ready to pick)
        card.className = "deck-card";
        const angle = startAngle + i * angleStep;
        const xOffset = (i - totalDeckCards / 2) * xSpacing;
        const yOffset = Math.abs(angle) * (isMobile ? 1.2 : 1.5);

        card.style.setProperty("--tx", `${xOffset}px`);
        card.style.setProperty("--ty", `${yOffset}px`);
        card.style.setProperty("--rot", `${angle}deg`);
        card.style.zIndex = i + 1;

        if (animate) {
          card.style.transform = "translate(0px, 0px) rotate(0deg) scale(0.96)";
          card.style.opacity = "0.9";
        }
      }

      card.addEventListener("click", () => handleCardClick(card, i));
      fannedDeck.appendChild(card);
      createdCards.push(card);
    }

    if (!fanned) {
      // Unshuffled state UI: Prompt to shuffle
      instructionText.innerHTML = `✦ หลับตา สูดลมหายใจลึกๆ ตั้งจิตอธิษฐาน แล้วกด <strong>"สับไพ่"</strong> เพื่อเริ่มทำนาย ✦`;
      btnShuffle.innerHTML = `<span class="shuffle-icon">🔀</span> สับไพ่เพื่อเริ่มทำนาย`;
      btnShuffle.classList.add("ready-pulse");
      btnReveal.style.display = "none";
    } else {
      // Shuffled and fanned state UI: Ready to pick
      instructionText.innerHTML = `หลับตา สูดหายใจลึกๆ ตั้งจิตให้สงบ แล้วแตะเลือกไพ่ <span id="pick-target-count" style="color: var(--gold-primary); font-weight:700;">${requiredCards}</span> ใบ`;
      btnShuffle.innerHTML = `<span class="shuffle-icon">🔀</span> สับใหม่อีกครั้ง`;
      btnShuffle.classList.remove("ready-pulse");
      btnReveal.style.display = "inline-block";

      if (animate) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            createdCards.forEach((card, idx) => {
              card.style.transitionDelay = `${idx * 22}ms`;
              card.style.transform = "";
              card.style.opacity = "1";
            });

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
  function handleCardClick(cardElement, index) {
    if (isShuffling || isRevealing || resultSection.classList.contains("show")) return;

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
    }

    updateSelectionCounter();
  }

  function updateSelectionCounter() {
    selectedCounterSpan.textContent = selectedCards.length;
    const isReady = selectedCards.length === requiredCards;
    btnReveal.disabled = !isReady;

    if (isReady) {
      btnReveal.classList.add("ready-pulse");
    } else {
      btnReveal.classList.remove("ready-pulse");
    }
  }

  // Silky Smooth Shuffle Sequence
  btnShuffle.addEventListener("click", () => {
    if (isShuffling) return;
    isShuffling = true;
    const shuffleIcon = btnShuffle.querySelector(".shuffle-icon");
    if (shuffleIcon) shuffleIcon.classList.add("spinning");

    const cards = Array.from(fannedDeck.querySelectorAll(".deck-card"));

    // Deselect all
    selectedCards = [];
    updateSelectionCounter();

    // Step 1: Smoothly gather cards to center deck
    cards.forEach((card, idx) => {
      card.classList.remove("selected");
      card.style.transitionDelay = `${idx * 12}ms`;
      card.classList.add("gathering");
    });

    // Step 2: Riffle shuffle motion
    setTimeout(() => {
      cards.forEach((card, idx) => {
        card.style.transitionDelay = "0ms";
        if (idx % 2 === 0) {
          card.classList.add("riffle-left");
        } else {
          card.classList.add("riffle-right");
        }
      });
    }, 320);

    // Step 3: Gather back to center
    setTimeout(() => {
      cards.forEach(card => {
        card.classList.remove("riffle-left", "riffle-right");
      });
    }, 560);

    // Step 4: Fan back out smoothly (unlocked to pick!)
    setTimeout(() => {
      generateFannedDeck(true, true);
      if (shuffleIcon) shuffleIcon.classList.remove("spinning");
      isShuffling = false;
    }, 780);
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
    const existing = document.getElementById("resume-banner");
    if (existing) existing.remove();

    const saved = getActiveReading(mode);
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

  // Resume Banner — ให้ user เลือกเองว่าจะดูผลเก่าต่อหรือเริ่มใหม่
  function showResumeBanner(saved, mode) {
    // ลบ banner เก่าออกก่อน (ถ้ามี)
    const existing = document.getElementById("resume-banner");
    if (existing) existing.remove();

    const modeLabels = { daily: "ไพ่ประจำวัน", love: "ความรัก", career: "การงาน/การเงิน", custom: "คำถามในใจ" };
    const timeAgo = Math.round((Date.now() - saved.timestamp) / 60000);
    const timeText = timeAgo < 60 ? `${timeAgo} นาทีที่แล้ว` : `${Math.round(timeAgo / 60)} ชั่วโมงที่แล้ว`;

    const banner = document.createElement("div");
    banner.id = "resume-banner";
    banner.className = "resume-banner";
    banner.innerHTML = `
      <div class="resume-banner-inner">
        <span class="resume-banner-icon">🔮</span>
        <div class="resume-banner-text">
          <strong>คุณมีผลไพ่ ${modeLabels[mode] || mode} ค้างอยู่</strong>
          <small>${timeText}</small>
        </div>
        <div class="resume-banner-actions">
          <button id="resume-btn-continue" class="btn-resume-continue">ดูผลต่อ</button>
          <button id="resume-btn-new" class="btn-resume-new">เริ่มใหม่</button>
        </div>
      </div>
    `;

    // แทรกก่อน mode-section
    const modeSection = document.getElementById("mode-section");
    modeSection.parentNode.insertBefore(banner, modeSection);

    // แสดง deck ปกติไว้ด้านล่าง (ไม่ auto-load ผลเก่า)
    showDeckArea(false);

    document.getElementById("resume-btn-continue").addEventListener("click", () => {
      banner.remove();
      if (mode === "custom" && saved.question) userQuestion.value = saved.question;
      renderReading(saved.cards, saved.question, true);
    });

    document.getElementById("resume-btn-new").addEventListener("click", () => {
      banner.remove();
      clearActiveReading(mode);
      showDeckArea(false);
    });
  }

  // Reveal Button
  btnReveal.addEventListener("click", () => {
    if (isRevealing || selectedCards.length !== requiredCards) return;
    isRevealing = true;
    btnReveal.disabled = true;
    btnReveal.classList.remove("ready-pulse");

    const shuffledPool = [...TAROT_CARDS].sort(() => 0.5 - Math.random());
    const pickedData = shuffledPool.slice(0, requiredCards);
    const q = userQuestion.value.trim();

    renderReading(pickedData, q, false);
  });

  // Render Reading Function (Used for new reveal or restored persisted reading)
  function renderReading(pickedData, customQuestionText = "", isRestored = false) {
    cardsShowcase.innerHTML = "";
    readingDetails.innerHTML = "";

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

      const cardContainer = document.createElement("div");
      cardContainer.className = `tarot-card-container ${isRestored ? "floating" : ""}`;
      cardContainer.style.animationDelay = isRestored ? "0ms" : `${idx * 160}ms`;

      cardContainer.innerHTML = `
        <div class="tarot-card-inner ${isRestored ? "flipped" : ""}" id="tarot-inner-${idx}">
          <div class="tarot-card-face tarot-card-back"></div>
          <div class="tarot-card-face tarot-card-front">
            <img class="tarot-card-img" src="${card.image}" alt="${card.nameEn}" onerror="this.src='https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80'">
            <div class="tarot-card-label">${card.nameEn} (${card.id})</div>
          </div>
        </div>
      `;
      cardsShowcase.appendChild(cardContainer);

      // Build interpretation card
      const detailItem = document.createElement("div");
      detailItem.className = "reading-card-item";
      const detailDelay = isRestored ? 0 : (pickedData.length * 160) + 300 + (idx * 350);
      detailItem.style.animationDelay = `${detailDelay}ms`;

      detailItem.innerHTML = `
        <div class="reading-header">
          <div class="reading-title">${card.nameEn} - ${card.nameTh}</div>
          <div class="reading-position">${posLabel}</div>
        </div>

        <div class="keywords-list">
          ${card.keywords.map(kw => `<span class="keyword-tag">#${kw}</span>`).join("")}
        </div>

        <p class="reading-text">${card.meaning}</p>

        <div class="reading-highlights">
          <div class="highlight-box">
            <h4>❤️ ด้านความรัก</h4>
            <p>${card.love}</p>
          </div>
          <div class="highlight-box">
            <h4>💼 ด้านการงาน/การเงิน</h4>
            <p>${card.career}</p>
          </div>
          <div class="highlight-box">
            <h4>💡 คำแนะนำจากจักรวาล</h4>
            <p>${card.advice}</p>
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

    if (!isRestored) {
      // Save newly drawn cards to localStorage
      saveActiveReading(currentMode, pickedData, customQuestionText || userQuestion.value.trim());

      // Smooth scroll accurately to the top of the cards showcase
      setTimeout(() => {
        const scrollTarget = document.querySelector(".result-header") || cardsShowcase || resultSection;
        scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);

      // Staggered 3D flips with floating effect
      pickedData.forEach((_, idx) => {
        const flipTime = (pickedData.length * 160) + 250 + (idx * 380);
        setTimeout(() => {
          const inner = document.getElementById(`tarot-inner-${idx}`);
          if (inner) {
            inner.classList.add("flipped");
            setTimeout(() => {
              const container = inner.closest(".tarot-card-container");
              if (container) container.classList.add("floating");
            }, 900);
          }
        }, flipTime);
      });
    }
  }

  // Reset Reading with Smooth Fade-Out & Auto Shuffle
  function handleResetReading() {
    clearActiveReading(currentMode);

    // ล้าง resume banner ถ้ายังแสดงอยู่
    const banner = document.getElementById("resume-banner");
    if (banner) banner.remove();

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
        const totalDeckCards = cards.length;
        const angleStep = isMobile ? 3.4 : 4.4;
        const xSpacing = isMobile ? 14 : 22;
        const startAngle = -((totalDeckCards - 1) * angleStep) / 2;

        cards.forEach((card, i) => {
          const angle = startAngle + i * angleStep;
          const xOffset = (i - totalDeckCards / 2) * xSpacing;
          const yOffset = Math.abs(angle) * (isMobile ? 1.2 : 1.5);
          card.style.setProperty("--tx", `${xOffset}px`);
          card.style.setProperty("--ty", `${yOffset}px`);
          card.style.setProperty("--rot", `${angle}deg`);
        });
      }
    }, 150);
  });

  // ==========================================
  // DONATION & PROMPTPAY LOGIC
  // ==========================================
  function updatePromptPayDisplay() {
    // Format: 081-234-5678 or 1-2345-67890-12-3
    let formatted = promptPayTarget;
    if (promptPayTarget.length === 10) {
      formatted = `${promptPayTarget.slice(0,3)}-${promptPayTarget.slice(3,6)}-${promptPayTarget.slice(6)}`;
    } else if (promptPayTarget.length === 13) {
      formatted = `${promptPayTarget.slice(0,1)}-${promptPayTarget.slice(1,5)}-${promptPayTarget.slice(5,10)}-${promptPayTarget.slice(10,12)}-${promptPayTarget.slice(12)}`;
    }
    displayPromptPayNumber.textContent = formatted;
  }

  function renderDonationQR() {
    try {
      qrAmountDisplay.textContent = "✨ สแกนแล้วระบุยอดตามศรัทธาในแอปธนาคาร ✨";
      window.PromptPayUtil.renderQR(promptPayTarget, 0, qrCanvas, 220);
    } catch (err) {
      console.error("QR render error:", err);
    }
  }

  // Copy Account Number
  btnCopyAccount.addEventListener("click", () => {
    navigator.clipboard.writeText(promptPayTarget).then(() => {
      const origText = btnCopyAccount.textContent;
      btnCopyAccount.textContent = "✓ คัดลอกแล้ว";
      btnCopyAccount.style.borderColor = "#2ecc71";
      btnCopyAccount.style.color = "#2ecc71";
      setTimeout(() => {
        btnCopyAccount.textContent = origText;
        btnCopyAccount.style.borderColor = "";
        btnCopyAccount.style.color = "";
      }, 2000);
    });
  });

  // ==========================================
  // SETTINGS MODAL LOGIC
  // ==========================================
  btnSettingsTrigger.addEventListener("click", () => {
    inputPromptPayTarget.value = promptPayTarget;
    inputMerchantName.value = merchantName;
    settingsModal.classList.add("show");
  });

  btnModalClose.addEventListener("click", () => {
    settingsModal.classList.remove("show");
  });

  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.remove("show");
    }
  });

  btnSaveSettings.addEventListener("click", () => {
    const newTarget = inputPromptPayTarget.value.trim().replace(/[^0-9]/g, "");
    const newName = inputMerchantName.value.trim();

    if (!newTarget || (newTarget.length !== 10 && newTarget.length !== 13)) {
      showToast("กรุณากรอกเบอร์พร้อมเพย์ (10 หลัก) หรือเลขบัตรประชาชน (13 หลัก) ให้ถูกต้องครับ", "error");
      return;
    }

    promptPayTarget = newTarget;
    merchantName = newName || "แม่หมอทาโรต์";

    localStorage.setItem("tarot_promptpay_target", promptPayTarget);
    localStorage.setItem("tarot_merchant_name", merchantName);

    updatePromptPayDisplay();
    renderDonationQR();

    settingsModal.classList.remove("show");
    showToast("✅ บันทึกการตั้งค่าบัญชีพร้อมเพย์เรียบร้อยแล้ว!");
  });

  // Toast Notification (แทน alert)
  function showToast(message, type = "success") {
    const existing = document.getElementById("toast-msg");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "toast-msg";
    toast.className = `toast-notification ${type === "error" ? "toast-error" : ""}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("toast-show"));
    setTimeout(() => {
      toast.classList.remove("toast-show");
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }
});
