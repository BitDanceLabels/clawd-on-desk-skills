// Bumbee Vocab Tinder — renderer-side logic. Phase 2 minimal.
// Bridges to main process for word extraction + library write + review queue
// via window.bumbeeVocabAPI exposed by preload-vocab.js.

(() => {
  'use strict';

  const els = {
    paste: document.getElementById('paste'),
    extractBtn: document.getElementById('extract-btn'),
    cardStack: document.getElementById('card-stack'),
    card: document.getElementById('card'),
    word: document.querySelector('.card-word'),
    ipa: document.querySelector('.card-ipa'),
    context: document.querySelector('.card-context'),
    source: document.querySelector('.card-source'),
    progress: document.getElementById('card-progress'),
    empty: document.getElementById('empty-state'),
    reviewQueue: document.getElementById('review-queue'),
    reviewEmpty: document.getElementById('review-empty'),
    libraryList: document.getElementById('library-list'),
  };

  let cards = [];
  let cardIndex = 0;
  let lastPastedText = '';

  // ---- Tab switching ----
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach(b => b.classList.toggle('tab-active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.toggle('active', p.id === `tab-${id}`);
      });
      if (id === 'review') loadReview();
      if (id === 'library') loadLibrary();
    });
  });

  // ---- Extract words from pasted text ----
  els.extractBtn.addEventListener('click', async () => {
    const text = els.paste.value.trim();
    if (!text) return;
    lastPastedText = text;
    const candidates = await window.bumbeeVocabAPI.extract(text);
    cards = candidates;
    cardIndex = 0;
    if (cards.length === 0) {
      els.cardStack.hidden = true;
      els.empty.hidden = false;
      return;
    }
    els.cardStack.hidden = false;
    els.empty.hidden = true;
    renderCard();
  });

  function renderCard() {
    if (cardIndex >= cards.length) {
      els.cardStack.hidden = true;
      els.empty.hidden = false;
      return;
    }
    const c = cards[cardIndex];
    els.word.textContent = c.word;
    els.ipa.textContent = c.ipa || '';
    els.context.textContent = c.context || lastPastedText.slice(0, 200) + '…';
    els.source.textContent = c.source_app || 'Vocab Tinder (paste)';
    els.progress.textContent = `${cardIndex + 1} / ${cards.length}`;
    els.card.classList.remove('swipe-keep', 'swipe-skip', 'swipe-known');
  }

  // ---- Swipe handlers (keyboard J/K/L) ----
  async function swipe(action) {
    if (cardIndex >= cards.length) return;
    const c = cards[cardIndex];
    const cls = { keep: 'swipe-keep', skip: 'swipe-skip', known: 'swipe-known' }[action];
    els.card.classList.add(cls);
    try {
      await window.bumbeeVocabAPI.recordSwipe({ word: c.word, action, context: c.context, source_app: c.source_app });
    } catch (e) {
      console.error('recordSwipe failed', e);
    }
    setTimeout(() => {
      cardIndex += 1;
      renderCard();
    }, 200);
  }

  document.addEventListener('keydown', (e) => {
    if (document.activeElement === els.paste) return; // don't intercept while pasting
    if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowRight') swipe('keep');
    if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowLeft') swipe('skip');
    if (e.key === 'l' || e.key === 'L' || e.key === 'ArrowUp') swipe('known');
  });

  // ---- Review tab (SM-2) ----
  async function loadReview() {
    els.reviewQueue.innerHTML = '';
    const tasks = await window.bumbeeVocabAPI.getReviewTasks();
    if (tasks.length === 0) {
      els.reviewEmpty.hidden = false;
      return;
    }
    els.reviewEmpty.hidden = true;
    tasks.forEach((task, i) => {
      const div = document.createElement('div');
      div.className = 'review-task';
      div.innerHTML = `
        <strong>${task.prompt}</strong>
        <input type="text" data-i="${i}" placeholder="Câu trả lời..." />
      `;
      const input = div.querySelector('input');
      input.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        const result = await window.bumbeeVocabAPI.gradeReview({ task, answer: input.value });
        const correct = typeof result === 'boolean' ? result : !!result.correct;
        input.style.borderColor = correct ? 'var(--keep)' : 'var(--skip)';
        input.disabled = true;
      });
      els.reviewQueue.appendChild(div);
    });
  }

  // ---- Library tab ----
  async function loadLibrary() {
    els.libraryList.innerHTML = '<p style="color:var(--fg-dim)">Đang tải...</p>';
    const words = await window.bumbeeVocabAPI.listLibrary();
    if (!words.length) {
      els.libraryList.innerHTML = '<p style="color:var(--fg-dim)">Chưa có từ nào — quay lại tab Vuốt.</p>';
      return;
    }
    els.libraryList.innerHTML = '';
    words.forEach(w => {
      const row = document.createElement('div');
      row.className = 'library-row';
      row.innerHTML = `
        <span>${w.word}</span>
        <span class="status-${w.status}">${w.status} · ôn ${w.mastery_score}/5</span>
      `;
      els.libraryList.appendChild(row);
    });
  }

  // ---- Footer links ----
  document.getElementById('open-settings').addEventListener('click', (e) => {
    e.preventDefault();
    window.bumbeeVocabAPI.openSettings('donation');
  });
  document.getElementById('open-donate').addEventListener('click', (e) => {
    e.preventDefault();
    window.bumbeeVocabAPI.openDonate();
  });
})();
