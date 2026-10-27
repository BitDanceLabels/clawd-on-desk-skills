'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROUTER = {
  'vocab.review.correct': [
    { tool: 'set_emotion', args: { emotion: 'proud', intensity: 0.8 } },
    { tool: 'show_particle', args: { kind: 'sparkle', count: 12 } },
    { tool: 'play_animation', args: { clip: 'nod' } },
  ],
  'vocab.review.wrong': [
    { tool: 'set_emotion', args: { emotion: 'thinking', intensity: 0.5 } },
    { tool: 'play_animation', args: { clip: 'scratch_head' } },
  ],
  'vocab.swipe.kept': [
    { tool: 'set_emotion', args: { emotion: 'curious', intensity: 0.6 } },
  ],
  'vocab.streak.day': [
    { tool: 'set_emotion', args: { emotion: 'happy', intensity: 0.8 } },
    { tool: 'show_particle', args: { kind: 'sparkle', count: 16 } },
  ],
  'cursor.dwell.cta': [
    { tool: 'set_emotion', args: { emotion: 'curious', intensity: 0.5 } },
    { tool: 'look_at', args: { target: 'cursor' } },
    { tool: 'play_animation', args: { clip: 'tilt_head' } },
  ],
  'nudger.overscroll.30min': [
    { tool: 'set_emotion', args: { emotion: 'worried', intensity: 0.4 } },
    { tool: 'play_animation', args: { clip: 'shake_head' } },
  ],
  'digest.money_todo.ready': [
    { tool: 'set_emotion', args: { emotion: 'excited', intensity: 0.7 } },
    { tool: 'show_particle', args: { kind: 'lightbulb', count: 10 } },
  ],
  'pipeline.scene.render.start': [
    { tool: 'set_emotion', args: { emotion: 'thinking', intensity: 0.6 } },
    { tool: 'play_animation', args: { clip: 'idle_breathing', loop: true } },
  ],
  'pipeline.scene.render.done': [
    { tool: 'set_emotion', args: { emotion: 'happy', intensity: 0.8 } },
    { tool: 'show_particle', args: { kind: 'confetti', count: 24 } },
  ],
  'pipeline.scene.render.failed': [
    { tool: 'set_emotion', args: { emotion: 'sad', intensity: 0.4 } },
    { tool: 'play_animation', args: { clip: 'shrug' } },
  ],
  'business.tiktok.posted': [
    { tool: 'set_emotion', args: { emotion: 'excited', intensity: 0.8 } },
    { tool: 'play_animation', args: { clip: 'thumbs_up' } },
  ],
  'business.video.went_viral': [
    { tool: 'set_emotion', args: { emotion: 'proud', intensity: 1.0 } },
    { tool: 'play_animation', args: { clip: 'dance_short' } },
    { tool: 'show_particle', args: { kind: 'confetti', count: 32 } },
  ],
  'business.video.flopped': [
    { tool: 'set_emotion', args: { emotion: 'sad', intensity: 0.3 } },
    { tool: 'play_animation', args: { clip: 'facepalm' } },
  ],
  'business.first_donation': [
    { tool: 'set_emotion', args: { emotion: 'proud', intensity: 1.0 } },
    { tool: 'play_animation', args: { clip: 'jump' } },
    { tool: 'show_particle', args: { kind: 'heart', count: 24 } },
  ],
  'business.donation.confirmed': [
    { tool: 'set_emotion', args: { emotion: 'happy', intensity: 0.9 } },
    { tool: 'show_particle', args: { kind: 'heart', count: 16 } },
    { tool: 'play_animation', args: { clip: 'bow' } },
  ],
  'business.video.render.done': [
    { tool: 'set_emotion', args: { emotion: 'happy', intensity: 0.7 } },
    { tool: 'show_particle', args: { kind: 'confetti', count: 18 } },
  ],
  'business.video.render.failed': [
    { tool: 'set_emotion', args: { emotion: 'sad', intensity: 0.4 } },
    { tool: 'play_animation', args: { clip: 'shrug' } },
  ],
};

function ensureDefaultRouter(routerPath) {
  if (!fs.existsSync(routerPath)) {
    fs.mkdirSync(path.dirname(routerPath), { recursive: true });
    fs.writeFileSync(routerPath, JSON.stringify(DEFAULT_ROUTER, null, 2), { mode: 0o600 });
  }
  return routerPath;
}

function loadRouter(routerPath) {
  ensureDefaultRouter(routerPath);
  try {
    const parsed = JSON.parse(fs.readFileSync(routerPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : DEFAULT_ROUTER;
  } catch {
    return DEFAULT_ROUTER;
  }
}

function routeEvent(router, event) {
  const type = typeof event?.type === 'string' ? event.type : '';
  const actions = Array.isArray(router?.[type]) ? router[type] : [];
  return actions.map(action => ({
    event_type: type,
    tool: String(action.tool || ''),
    args: action.args && typeof action.args === 'object' ? action.args : {},
    ts: event.ts || new Date().toISOString(),
  })).filter(action => action.tool);
}

function writeReactions(logPath, reactions) {
  if (!reactions.length) return { ok: true, written: 0 };
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const lines = reactions.map(reaction => JSON.stringify(reaction)).join('\n') + '\n';
  fs.appendFileSync(logPath, lines);
  return { ok: true, written: reactions.length };
}

module.exports = {
  DEFAULT_ROUTER,
  ensureDefaultRouter,
  loadRouter,
  routeEvent,
  writeReactions,
};
