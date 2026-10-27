// Bumbee Settings → Donation panel.
// URL allow-list validator + save to ~/Library/Application Support/clawd-on-desk/settings.json
// via window.bumbeeSettingsAPI exposed by preload.

(() => {
  'use strict';

  // Allow-list. Reject every other host to avoid surfacing untrusted redirects (crypto wallets etc.).
  const ALLOWED_HOSTS = [
    /^buymeacoffee\.com$/i,
    /^(www\.)?ko-fi\.com$/i,
    /^patreon\.com$/i,
    /^paypal\.me$/i,
    /^(www\.)?tipeee\.com$/i,
    /^donate\.stripe\.com$/i,
    /^bitdancegroup\.com$/i,           // matches BitDance Odoo checkout/product/payment links
  ];

  const els = {
    url: document.getElementById('creator-url'),
    urlMsg: document.getElementById('url-msg'),
    name: document.getElementById('creator-name'),
    intent: document.getElementById('creator-intent'),
    save: document.getElementById('save'),
    saveMsg: document.getElementById('save-msg'),
    prevCreator: document.getElementById('prev-creator'),
    prevName: document.getElementById('prev-name'),
    prevIntent: document.getElementById('prev-intent'),
  };

  function validateUrl(value) {
    if (!value) return { ok: true, empty: true };
    let u;
    try { u = new URL(value); }
    catch { return { ok: false, reason: 'URL không hợp lệ.' }; }
    if (u.protocol !== 'https:') return { ok: false, reason: 'Phải là https://...' };
    if (
      /^bitdancegroup\.com$/i.test(u.host) &&
      !(
        u.pathname.startsWith('/payment/') ||
        u.pathname.startsWith('/shop/') ||
        u.pathname.startsWith('/bumbee-vocab-tinder')
      )
    ) {
      return { ok: false, reason: 'bitdancegroup.com chỉ chấp nhận /payment/, /shop/, hoặc /bumbee-vocab-tinder.' };
    }
    if (!ALLOWED_HOSTS.some(re => re.test(u.host))) {
      return { ok: false, reason: `Host "${u.host}" không trong allow-list. Chỉ chấp nhận Buy Me a Coffee, Ko-fi, Patreon, PayPal.me, Tipeee, Stripe donate, hoặc bitdancegroup.com.` };
    }
    return { ok: true };
  }

  function validateName(v) {
    if (!v) return { ok: true, empty: true };
    const trimmed = v.trim();
    if (trimmed.length < 2) return { ok: false, reason: 'Tên ít nhất 2 ký tự.' };
    if (trimmed.length > 30) return { ok: false, reason: 'Tên dài tối đa 30 ký tự.' };
    if (/^[\p{Emoji}\s]+$/u.test(trimmed)) return { ok: false, reason: 'Tên không thể chỉ chứa emoji.' };
    return { ok: true };
  }

  function refreshPreview() {
    const urlOk = validateUrl(els.url.value).ok && els.url.value.trim();
    const nameOk = validateName(els.name.value).ok && els.name.value.trim();
    if (urlOk && nameOk) {
      els.prevCreator.hidden = false;
      els.prevName.textContent = els.name.value.trim();
      els.prevCreator.href = els.url.value.trim();
    } else {
      els.prevCreator.hidden = true;
    }
    const intent = els.intent.value.trim();
    els.prevIntent.hidden = !intent;
    els.prevIntent.textContent = intent;
  }

  els.url.addEventListener('input', () => {
    const r = validateUrl(els.url.value);
    els.urlMsg.className = '';
    els.urlMsg.textContent = '';
    if (els.url.value && !r.ok) {
      els.urlMsg.className = 'err';
      els.urlMsg.textContent = r.reason;
    } else if (els.url.value && r.ok) {
      els.urlMsg.className = 'ok';
      els.urlMsg.textContent = 'OK';
    }
    refreshPreview();
  });
  els.name.addEventListener('input', refreshPreview);
  els.intent.addEventListener('input', refreshPreview);
  els.prevCreator.addEventListener('click', (event) => {
    event.preventDefault();
  });

  els.save.addEventListener('click', async () => {
    els.saveMsg.className = '';
    els.saveMsg.textContent = '';

    const urlR = validateUrl(els.url.value);
    const nameR = validateName(els.name.value);
    if (!urlR.ok) { els.saveMsg.className = 'err'; els.saveMsg.textContent = urlR.reason; return; }
    if (!nameR.ok) { els.saveMsg.className = 'err'; els.saveMsg.textContent = nameR.reason; return; }

    // Empty URL clears the per-user donate setting.
    const payload = {
      creator_donation_url: urlR.empty ? '' : els.url.value.trim(),
      creator_display_name: nameR.empty ? '' : els.name.value.trim(),
      creator_donation_intent: els.intent.value.trim(),
    };
    try {
      await window.bumbeeSettingsAPI.saveDonationSettings(payload);
      els.saveMsg.className = 'ok';
      els.saveMsg.textContent = 'Đã lưu';
    } catch (e) {
      els.saveMsg.className = 'err';
      els.saveMsg.textContent = 'Lỗi lưu: ' + (e.message || e);
    }
  });

  // Load existing settings on open.
  (async () => {
    try {
      const s = await window.bumbeeSettingsAPI.loadDonationSettings();
      if (s) {
        els.url.value = s.creator_donation_url || '';
        els.name.value = s.creator_display_name || '';
        els.intent.value = s.creator_donation_intent || '';
        refreshPreview();
      }
    } catch {/* first run, no settings yet */}
  })();

  // Export validator for unit tests (Node `require` via vm hack avoided; test imports the file).
  if (typeof module !== 'undefined') module.exports = { validateUrl, validateName, ALLOWED_HOSTS };
})();
