// Bumbee Vocab Tinder — markdown library writer.
// Writes one .md page per kept word at ~/Bumbee/bumbee-wiki-studio/vocab-library/<yyyy-mm>/<word>.md
// Multiple sightings of the same word append to the "Examples seen" section, not duplicate pages.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const VAULT_ROOT = path.join(os.homedir(), 'Bumbee', 'bumbee-wiki-studio', 'vocab-library');

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function monthDir(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function pagePath(word, date = new Date()) {
  return path.join(VAULT_ROOT, monthDir(date), `${word.toLowerCase()}.md`);
}

function readFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const fm = {};
  m[1].split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    fm[k] = v;
  });
  return { frontmatter: fm, body: m[2] };
}

function writeFrontmatter(fm) {
  return '---\n' + Object.entries(fm).map(([k, v]) => `${k}: "${String(v).replace(/"/g, '\\"')}"`).join('\n') + '\n---\n';
}

/**
 * Add or update a vocab page for `word` with a sighting in `context` from `source_app`.
 * If page exists, append to "Examples seen". Otherwise create with frontmatter.
 *
 * @param {object} args
 * @param {string} args.word
 * @param {string} [args.ipa]
 * @param {string} args.context
 * @param {string} args.source_app
 * @param {string} [args.status] - kept | skipped | known | mastered
 * @param {object} [args.sm2] - SM-2 state from sm2.js update()
 */
function upsertWord({ word, ipa = '', context, source_app, status = 'kept', sm2 = {} }) {
  const p = pagePath(word);
  ensureDir(path.dirname(p));
  const now = new Date().toISOString();

  let frontmatter = {
    word,
    ipa,
    captured_at: now,
    source_app,
    context_sentence: context,
    status,
    mastery_score: sm2.mastery_score || 0,
    ease_factor: sm2.ease_factor || 2.5,
    interval_days: sm2.interval_days || 0,
    repetition: sm2.repetition || 0,
    next_review_at: sm2.next_review_at || now,
  };

  let body = `## Examples seen by user\n\n- ${now.slice(0, 10)} — ${source_app}: "${context}"\n`;

  if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = readFrontmatter(raw);
    if (parsed) {
      // Merge: keep oldest captured_at, update sm2 fields, append context line.
      frontmatter = {
        ...parsed.frontmatter,
        ...frontmatter,
        captured_at: parsed.frontmatter.captured_at || now,
      };
      const newLine = `- ${now.slice(0, 10)} — ${source_app}: "${context}"`;
      body = parsed.body.trimEnd() + '\n' + newLine + '\n';
    }
  }

  fs.writeFileSync(p, writeFrontmatter(frontmatter) + '\n' + body);
  return { path: p, frontmatter };
}

function listLibrary() {
  if (!fs.existsSync(VAULT_ROOT)) return [];
  const months = fs.readdirSync(VAULT_ROOT).filter(d => /^\d{4}-\d{2}$/.test(d));
  const all = [];
  for (const m of months) {
    const files = fs.readdirSync(path.join(VAULT_ROOT, m)).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const raw = fs.readFileSync(path.join(VAULT_ROOT, m, f), 'utf8');
      const parsed = readFrontmatter(raw);
      if (parsed) all.push(parsed.frontmatter);
    }
  }
  return all.sort((a, b) => (b.captured_at || '').localeCompare(a.captured_at || ''));
}

module.exports = { upsertWord, listLibrary, pagePath, VAULT_ROOT };
