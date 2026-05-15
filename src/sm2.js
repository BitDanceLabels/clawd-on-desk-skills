// Bumbee Vocab Tinder — SM-2 spaced-repetition algorithm (pure JS).
// Reference: SuperMemo SM-2. Quality grades 0-5; below 3 resets interval.
//
// Used by both renderer (for live grade preview) and main process (for review session generation).

'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Update SM-2 state for one word after a review answer.
 * @param {object} state - { ease_factor, interval_days, repetition, last_reviewed_at }
 * @param {number} quality - 0..5 (0 worst, 5 best). MVP uses {2, 4} only: wrong=2, right=4.
 * @returns {object} new state + next_review_at
 */
function update(state, quality) {
  let { ease_factor = 2.5, interval_days = 0, repetition = 0 } = state || {};
  const q = Math.max(0, Math.min(5, quality));

  if (q < 3) {
    // Failed — restart the schedule, keep ease factor where it is.
    repetition = 0;
    interval_days = 1;
  } else {
    repetition += 1;
    if (repetition === 1)      interval_days = 1;
    else if (repetition === 2) interval_days = 6;
    else                       interval_days = Math.round(interval_days * ease_factor);
  }

  // EF adjustment per SM-2 formula.
  ease_factor = ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ease_factor < 1.3) ease_factor = 1.3;

  const now = Date.now();
  return {
    ease_factor: Number(ease_factor.toFixed(3)),
    interval_days,
    repetition,
    last_reviewed_at: new Date(now).toISOString(),
    next_review_at: new Date(now + interval_days * DAY_MS).toISOString(),
    mastery_score: Math.min(5, repetition), // simple 0-5 score for UI
  };
}

/**
 * Pick words from the library whose next_review_at is due.
 * @param {Array<{word, next_review_at, ...}>} library
 * @param {Date} [now]
 * @returns {Array} words due
 */
function dueWords(library, now = new Date()) {
  const t = now.getTime();
  return library.filter(w => !w.next_review_at || new Date(w.next_review_at).getTime() <= t);
}

module.exports = { update, dueWords };
