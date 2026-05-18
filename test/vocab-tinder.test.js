// Bumbee Vocab Tinder — unit tests for the pure-JS modules.
// Runs via `npm test` which calls `node --test test/*.test.js`.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { extract, isCandidate } = require('../src/vocab-extractor');
const sm2 = require('../src/sm2');

// ---- vocab-extractor ----

test('isCandidate rejects short/long/non-alpha words', () => {
  assert.equal(isCandidate('a'), false);
  assert.equal(isCandidate('it'), false);
  assert.equal(isCandidate('the'), false);                 // in stop list
  assert.equal(isCandidate('aaaaaaaaaaaaaaaaaaaaaaaaaaaa'), false); // too long (>25)
  assert.equal(isCandidate('user1'), false);               // has digit
  assert.equal(isCandidate('camelCase'), false);           // programming identifier
  assert.equal(isCandidate('snake_case'), false);
  assert.equal(isCandidate('https'), false);               // URL fragment
});

test('isCandidate accepts ordinary uncommon English words', () => {
  assert.equal(isCandidate('ephemeral'), true);
  assert.equal(isCandidate('serendipity'), true);
  assert.equal(isCandidate('quintessential'), true);
});

test('extract pulls unique candidates with their first-sighting sentence', () => {
  const text = `The ephemeral nature of stories on Instagram drove huge engagement. Quintessential brands now optimize for this format.`;
  const cards = extract(text, { source_app: 'Test' });
  const words = cards.map(c => c.word);
  assert.ok(words.includes('ephemeral'));
  assert.ok(words.includes('quintessential'));
  // "the" is in stop list, "stories" / "engagement" / "format" may pass depending on stop-list size
  assert.equal(words.includes('the'), false);
  // Source app preserved
  assert.equal(cards[0].source_app, 'Test');
  // Each card has a context sentence
  cards.forEach(c => assert.ok(c.context && c.context.length > 0));
});

test('extract dedupes repeated words across sentences', () => {
  const text = `Ephemeral things. Another ephemeral thing here. And ephemeral once more.`;
  const cards = extract(text);
  const ephs = cards.filter(c => c.word === 'ephemeral');
  assert.equal(ephs.length, 1);
});

test('extract caps at 30 candidates per session', () => {
  // Generate a long pseudo-text with many distinct uncommon-looking words.
  const longWords = Array.from({ length: 80 }, (_, i) => `xenoglossy${'aeiou'[i % 5]}${i}`);
  // strip digits to keep them candidates — actually our isCandidate rejects digits.
  // Use letter-only variants:
  const sentence = Array.from({ length: 80 }, (_, i) => {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    let s = '';
    let n = i;
    do { s = letters[n % 26] + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return 'xenoglossy' + s;
  }).join(' ');
  const cards = extract(sentence + '.');
  assert.ok(cards.length <= 30);
});

// ---- sm2 ----

test('sm2.update on first correct review schedules 1 day out', () => {
  const s = sm2.update({}, 4);
  assert.equal(s.repetition, 1);
  assert.equal(s.interval_days, 1);
  assert.ok(s.next_review_at);
  assert.ok(s.ease_factor >= 1.3);
});

test('sm2.update on second correct review schedules 6 days', () => {
  let s = sm2.update({}, 4);
  s = sm2.update(s, 4);
  assert.equal(s.repetition, 2);
  assert.equal(s.interval_days, 6);
});

test('sm2.update on wrong answer resets repetition and keeps EF floor 1.3', () => {
  let s = sm2.update({}, 4);
  s = sm2.update(s, 4);
  s = sm2.update(s, 2); // wrong
  assert.equal(s.repetition, 0);
  assert.equal(s.interval_days, 1);
  assert.ok(s.ease_factor >= 1.3);
});

test('sm2.dueWords filters by next_review_at', () => {
  const past = new Date(Date.now() - 1000).toISOString();
  const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
  const lib = [
    { word: 'a', next_review_at: past },
    { word: 'b', next_review_at: future },
    { word: 'c' }, // never reviewed = due
  ];
  const due = sm2.dueWords(lib);
  assert.deepEqual(due.map(w => w.word).sort(), ['a', 'c']);
});

// ---- settings-donation URL validator (renderer-only, requires DOM globals stub) ----
// Skip these in Node since the module references `document`. Re-test in browser context.

// ---- vocab-library streak counter ----

const { getStreakDays } = require('../src/vocab-library');
const metrics = require('../src/vocab-metrics');
const router = require('../src/bumbee-event-router');
const phaseRuntime = require('../src/phase-runtime');

test('getStreakDays returns 0 for empty library', () => {
  const r = getStreakDays([]);
  assert.equal(r.days, 0);
  assert.equal(r.last_day, null);
});

test('getStreakDays counts consecutive recent days ending today', () => {
  const now = new Date('2026-05-15T10:00:00Z');
  const lib = [
    { word: 'a', status: 'kept', captured_at: '2026-05-13T08:00:00Z' },
    { word: 'b', status: 'kept', captured_at: '2026-05-14T08:00:00Z' },
    { word: 'c', status: 'kept', captured_at: '2026-05-15T07:00:00Z' },
  ];
  const r = getStreakDays(lib, now);
  assert.equal(r.days, 3);
  assert.equal(r.last_day, '2026-05-15');
  assert.equal(r.today_count, 1);
});

test('getStreakDays counts back from yesterday when today empty', () => {
  const now = new Date('2026-05-15T10:00:00Z');
  const lib = [
    { word: 'a', status: 'kept', captured_at: '2026-05-13T08:00:00Z' },
    { word: 'b', status: 'kept', captured_at: '2026-05-14T08:00:00Z' },
  ];
  const r = getStreakDays(lib, now);
  assert.equal(r.days, 2);
  assert.equal(r.last_day, '2026-05-14');
  assert.equal(r.today_count, 0);
});

test('getStreakDays stops at first gap', () => {
  const now = new Date('2026-05-15T10:00:00Z');
  const lib = [
    { word: 'a', status: 'kept', captured_at: '2026-05-10T08:00:00Z' }, // gap
    { word: 'b', status: 'kept', captured_at: '2026-05-14T08:00:00Z' },
    { word: 'c', status: 'kept', captured_at: '2026-05-15T08:00:00Z' },
  ];
  const r = getStreakDays(lib, now);
  assert.equal(r.days, 2); // 14 + 15 only
});

test('getStreakDays ignores skipped words', () => {
  const now = new Date('2026-05-15T10:00:00Z');
  const lib = [
    { word: 'a', status: 'skipped', captured_at: '2026-05-15T08:00:00Z' },
  ];
  const r = getStreakDays(lib, now);
  assert.equal(r.days, 0);
});

// ---- vocab dashboard / donation metrics ----

test('buildDashboard summarizes library and support metrics', () => {
  const now = new Date('2026-05-15T10:00:00Z');
  const library = [
    { word: 'focus', status: 'kept', captured_at: '2026-05-15T08:00:00Z', next_review_at: '2026-05-14T08:00:00Z' },
    { word: 'fluent', status: 'mastered', mastery_score: 5, captured_at: '2026-05-15T08:00:00Z', next_review_at: '2026-05-20T08:00:00Z' },
  ];
  const dashboard = metrics.buildDashboard(library, { ...metrics.defaultMetrics(now), support_clicks: 3 }, now);
  assert.equal(dashboard.words_total, 2);
  assert.equal(dashboard.words_kept, 2);
  assert.equal(dashboard.words_mastered, 1);
  assert.equal(dashboard.reviews_due, 1);
  assert.equal(dashboard.support_clicks, 3);
  assert.equal(dashboard.streak.days, 1);
});

test('normalizeDonationStatus accepts common paid states', () => {
  assert.equal(metrics.normalizeDonationStatus({ state: 'sale', order_id: 'S00007' }).confirmed, true);
  assert.equal(metrics.normalizeDonationStatus({ payment_state: 'paid', order_id: 'S00008' }).confirmed, true);
  assert.equal(metrics.normalizeDonationStatus({ state: 'draft', order_id: 'S00009' }).confirmed, false);
});

// ---- phase hub / event router ----

test('event router maps business.first_donation to avatar reactions', () => {
  const reactions = router.routeEvent(router.DEFAULT_ROUTER, {
    type: 'business.first_donation',
    ts: '2026-05-18T09:00:00.000Z',
    payload: { order_id: 'S00007' },
  });
  assert.equal(reactions.length >= 3, true);
  assert.equal(reactions.some(item => item.tool === 'set_emotion' && item.args.emotion === 'proud'), true);
  assert.equal(reactions.some(item => item.tool === 'show_particle' && item.args.kind === 'heart'), true);
});

test('phase runtime seeds business loop and scene fixture', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bumbee-phase-'));
  const business = phaseRuntime.seedBusinessLoop(root, new Date('2026-05-18T09:00:00Z'));
  const scene = phaseRuntime.seedScene(root);
  assert.equal(business.ok, true);
  assert.equal(scene.ok, true);
  assert.equal(fs.existsSync(path.join(root, 'content-matrix', '2026-05-18', 'scripts.md')), true);
  assert.equal(fs.existsSync(path.join(root, 'content-inbox', '2026-05-18.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'scenes', 'sample-scene', 'scene.config.json')), true);
});
