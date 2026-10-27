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
    metricWords: document.getElementById('metric-words'),
    metricDue: document.getElementById('metric-due'),
    metricStreak: document.getElementById('metric-streak'),
    metricSupport: document.getElementById('metric-support'),
    toast: document.getElementById('toast'),
  };

  let cards = [];
  let cardIndex = 0;
  let lastPastedText = '';
  let toastTimer = null;

  function showToast(message, timeout = 6000) {
    if (!els.toast) return;
    if (toastTimer) clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.hidden = false;
    toastTimer = setTimeout(() => {
      els.toast.hidden = true;
      toastTimer = null;
    }, timeout);
  }

  async function refreshDashboard(seed) {
    const data = seed || await window.bumbeeVocabAPI.dashboard();
    if (!data?.ok) return;
    els.metricWords.textContent = String(data.words_kept || data.words_total || 0);
    els.metricDue.textContent = String(data.reviews_due || 0);
    els.metricStreak.textContent = `${data.streak?.days || 0} ngày`;
    els.metricSupport.textContent = String(data.support_clicks || 0);
  }

  function buildDemoScript() {
    const wordCount = els.metricWords?.textContent || '0';
    const dueCount = els.metricDue?.textContent || '0';
    return [
      'Hook: Lướt tiếng Anh mỗi ngày nhưng không nhớ từ nào?',
      'Show: Dán một đoạn article/email/README tiếng Anh vào Bumbee Vocab Tinder.',
      'Show: Bumbee tự lọc từ khó, mình vuốt J để giữ, K để bỏ, L nếu đã biết.',
      `Proof: Hiện đã lưu ${wordCount} từ, hôm nay có ${dueCount} từ cần ôn.`,
      'Show: Qua tab Ôn tập, trả lời một câu để Bumbee lên lịch SM-2.',
      'CTA: Dùng Bumbee miễn phí. Nếu thấy hữu ích thì ủng hộ mình ở bitdancegroup.com/bumbee-vocab-tinder.',
    ].join('\n');
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }

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
      refreshDashboard().catch(() => {});
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
        if (result?.hint && !correct) showToast(result.hint, 5000);
        if (result?.dashboard) refreshDashboard(result.dashboard);
        else refreshDashboard().catch(() => {});
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
    refreshDashboard().catch(() => {});
  }

  // ---- Footer links ----
  document.getElementById('open-settings').addEventListener('click', (e) => {
    e.preventDefault();
    window.bumbeeVocabAPI.openSettings('donation');
  });
  document.getElementById('open-donate').addEventListener('click', (e) => {
    e.preventDefault();
    window.bumbeeVocabAPI.openDonate().then((result) => {
      if (result?.dashboard) refreshDashboard(result.dashboard);
      showToast(result?.message || 'Bumbee đã mở link ủng hộ.');
    }).catch((err) => {
      showToast(`Không mở được link ủng hộ: ${err.message || err}`);
    });
  });
  document.getElementById('check-donation').addEventListener('click', async (e) => {
    e.preventDefault();
    const orderId = window.prompt('Nhập mã order Odoo, ví dụ S00007:');
    if (!orderId) return;
    const result = await window.bumbeeVocabAPI.checkDonationStatus({ order_id: orderId });
    if (result?.dashboard) refreshDashboard(result.dashboard);
    if (result?.confirmed) {
      showToast(`Đã xác nhận ủng hộ ${result.order_id}. Bumbee đã ghi event donation.`);
    } else if (result?.ok) {
      showToast(`Order ${orderId} chưa confirmed/paid. Trạng thái hiện tại: ${result.state || 'unknown'}.`);
    } else {
      showToast(`Chưa kiểm tra được order ${orderId}: ${result?.error || 'unknown error'}`);
    }
  });
  document.getElementById('copy-demo-script').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await copyText(buildDemoScript());
      showToast('Đã copy demo script. Dán vào TikTok/Reels/Notion để dùng khi cần.');
    } catch (err) {
      showToast(`Chưa copy được demo script: ${err.message || err}`);
    }
  });

  refreshDashboard().catch(() => {});
})();
