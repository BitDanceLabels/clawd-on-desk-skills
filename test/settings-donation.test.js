// Bumbee Settings → Donation panel — URL allow-list + name validator tests.
// settings-donation.js is a renderer-only module (uses `document` IIFE).
// Re-implement the rules here in pure JS so we can test in Node without jsdom.
// If the renderer module drifts, this test will diverge — keep both in sync.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Mirror of the renderer's allow-list. Update both files together.
const ALLOWED_HOSTS = [
  /^buymeacoffee\.com$/i,
  /^(www\.)?ko-fi\.com$/i,
  /^patreon\.com$/i,
  /^paypal\.me$/i,
  /^(www\.)?tipeee\.com$/i,
  /^donate\.stripe\.com$/i,
  /^bitdancegroup\.com$/i,
];

const BITDANCE_ALLOWED_PATHS = ['/payment/', '/shop/', '/bumbee-vocab-tinder'];

function validateUrl(value) {
  if (!value) return { ok: true, empty: true };
  let u;
  try { u = new URL(value); }
  catch { return { ok: false, reason: 'invalid' }; }
  if (u.protocol !== 'https:') return { ok: false, reason: 'not_https' };
  if (/^bitdancegroup\.com$/i.test(u.host)) {
    const allowed = BITDANCE_ALLOWED_PATHS.some(p => u.pathname.startsWith(p));
    if (!allowed) return { ok: false, reason: 'bitdance_path' };
  }
  if (!ALLOWED_HOSTS.some(re => re.test(u.host))) {
    return { ok: false, reason: 'host_not_allowed' };
  }
  return { ok: true };
}

function validateName(v) {
  if (!v) return { ok: true, empty: true };
  const trimmed = v.trim();
  if (trimmed.length < 2) return { ok: false, reason: 'short' };
  if (trimmed.length > 30) return { ok: false, reason: 'long' };
  if (/^[\p{Emoji}\s]+$/u.test(trimmed)) return { ok: false, reason: 'emoji_only' };
  return { ok: true };
}

// ---- URL validator ----

test('empty URL is considered ok (clears the setting)', () => {
  assert.deepEqual(validateUrl(''), { ok: true, empty: true });
  assert.deepEqual(validateUrl(null), { ok: true, empty: true });
});

test('http:// is rejected (https required)', () => {
  assert.deepEqual(validateUrl('http://buymeacoffee.com/chrispham'), { ok: false, reason: 'not_https' });
});

test('allowed hosts pass', () => {
  for (const url of [
    'https://buymeacoffee.com/chrispham',
    'https://www.ko-fi.com/foo',
    'https://ko-fi.com/foo',
    'https://patreon.com/somebody',
    'https://paypal.me/donor',
    'https://tipeee.com/creator',
    'https://www.tipeee.com/creator',
    'https://donate.stripe.com/abc123',
  ]) {
    assert.deepEqual(validateUrl(url), { ok: true }, `expected ok for ${url}`);
  }
});

test('bitdancegroup.com without an allowed path is rejected', () => {
  assert.deepEqual(
    validateUrl('https://bitdancegroup.com/'),
    { ok: false, reason: 'bitdance_path' }
  );
  assert.deepEqual(
    validateUrl('https://bitdancegroup.com/random'),
    { ok: false, reason: 'bitdance_path' }
  );
});

test('bitdancegroup.com with /payment/, /shop/, /bumbee-vocab-tinder is OK', () => {
  for (const url of [
    'https://bitdancegroup.com/payment/bumbee/wait/S00003',
    'https://bitdancegroup.com/shop/something',
    'https://bitdancegroup.com/bumbee-vocab-tinder/checkout',
  ]) {
    assert.deepEqual(validateUrl(url), { ok: true }, `expected ok for ${url}`);
  }
});

test('random host is rejected', () => {
  for (const url of [
    'https://example.com/donate',
    'https://my-crypto-wallet.io/abc',
    'https://localhost/donate',
    'https://127.0.0.1:8080/x',
  ]) {
    const r = validateUrl(url);
    assert.equal(r.ok, false, `expected reject for ${url}`);
  }
});

test('malformed URL is rejected', () => {
  assert.deepEqual(validateUrl('not a url'), { ok: false, reason: 'invalid' });
  assert.deepEqual(validateUrl('javascript:alert(1)'), { ok: false, reason: 'not_https' });
});

// ---- Name validator ----

test('empty name is ok (clears the setting)', () => {
  assert.deepEqual(validateName(''), { ok: true, empty: true });
});

test('1-char name rejected, 2-char ok', () => {
  assert.equal(validateName('a').ok, false);
  assert.equal(validateName('ab').ok, true);
});

test('over-30-char name rejected', () => {
  const long = 'x'.repeat(31);
  assert.equal(validateName(long).ok, false);
});

test('emoji-only name rejected', () => {
  assert.equal(validateName('🐝🐝🐝').ok, false);
  assert.equal(validateName('🐝 Bee').ok, true); // mixed with text passes
});
