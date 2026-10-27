// Bumbee Vocab Tinder — word extractor.
// Phase 2: heuristic only (no LLM filter yet). LLM filter is Phase 4 with full Watcher.
//
// Input:  raw pasted text (English)
// Output: array of candidate cards { word, ipa, context, source_app }

'use strict';

const fs = require('fs');
const path = require('path');

// Always-on baseline stop list — top common English words + tech acronyms that look like words.
// Vendored file at data/vocab-3000.txt (target: google-10000-english first 3000 lines) is merged
// on top of this. Both layers are used so the file can hold the real list later without
// regressing the inline coverage.
const INLINE_STOP = new Set(
  `the a an and or but if then so because of in on at to for from by with as is are was were be
   been being am have has had do does did not no will would shall should can could may might
   must ought i you he she it we they me him her us them my your his their our its this that
   these those there here what who whom whose which when where why how all any some most much
   many few several both each every other another same different new old good bad great small
   large big little long short high low first last next own such none more less very too enough
   also still just only even already yet again
   http https www html api url ftp dns ssh ssl tcp udp file href jpg png gif mp3 mp4 css json
   yaml xml svg pdf rest cli ide gpu cpu ram sdk npm git ios osx mac win web app`
    .split(/\s+/).filter(Boolean)
);

let STOP_SET = null;
function loadStopList() {
  if (STOP_SET) return STOP_SET;
  // Phase 2 Day 1 task: vendor google-10000-english/20k.txt first 3000 lines into data/vocab-3000.txt.
  const merged = new Set(INLINE_STOP);
  const dataPath = path.join(__dirname, '..', 'data', 'vocab-3000.txt');
  try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    raw.split('\n')
      .map(s => s.trim().toLowerCase())
      .filter(s => s && !s.startsWith('#'))   // skip comments + blanks
      .slice(0, 3000)
      .forEach(w => merged.add(w));
  } catch { /* file missing — INLINE_STOP alone */ }
  STOP_SET = merged;
  return STOP_SET;
}

const URL_LIKE = /^https?:\/\/|^www\.|\.com$|\.io$|\.org$|\.net$|\.ai$/i;
const CAMEL_OR_SNAKE = /[_A-Z]/;       // looks like a programming identifier
const HAS_DIGIT = /\d/;
const ALPHA_ONLY = /^[a-zA-Z][a-zA-Z'-]*$/;

function isCandidate(word) {
  if (!word) return false;
  if (word.length < 4 || word.length > 25) return false;
  if (!ALPHA_ONLY.test(word)) return false;
  if (URL_LIKE.test(word)) return false;
  if (HAS_DIGIT.test(word)) return false;
  // Drop CamelCase / snake_case (programming identifiers).
  // Bare word: all lowercase. If we see uppercase mid-word or underscore -> drop.
  if (CAMEL_OR_SNAKE.test(word.slice(1))) return false;
  if (loadStopList().has(word.toLowerCase())) return false;
  return true;
}

function splitIntoSentences(text) {
  return text.match(/[^.!?\n]+[.!?\n]/g) || [text];
}

/**
 * Extract candidate vocab cards from pasted text.
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.source_app] - label for "thấy ở:" UI
 * @param {Set<string>} [opts.knownWords] - words already in library; skip them
 * @returns {Array<{word, ipa, context, source_app}>}
 */
function extract(text, opts = {}) {
  const source_app = opts.source_app || 'Vocab Tinder (paste)';
  const known = opts.knownWords || new Set();

  const sentences = splitIntoSentences(text);
  const wordToContext = new Map(); // first-sighting context per unique word

  for (const sent of sentences) {
    const tokens = sent.split(/[\s,;:()[\]{}"`]+/);
    for (const raw of tokens) {
      const w = raw.replace(/[.!?]+$/, '').toLowerCase();
      if (!isCandidate(w)) continue;
      if (known.has(w)) continue;
      if (wordToContext.has(w)) continue;
      wordToContext.set(w, sent.trim());
    }
  }

  // Return as array, capped to 30 candidates per session (Phase 2 limit).
  return Array.from(wordToContext.entries())
    .slice(0, 30)
    .map(([word, context]) => ({
      word,
      ipa: '', // LLM-emitted IPA is Phase 4. For now leave empty; UI shows nothing.
      context,
      source_app,
    }));
}

module.exports = { extract, isCandidate, loadStopList };
