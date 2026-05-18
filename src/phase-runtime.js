'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_STUDIO_ROOT = path.join(os.homedir(), 'Bumbee', 'bumbee-wiki-studio');

function ymd(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

function phaseStatus(userDataPath, studioRoot = DEFAULT_STUDIO_ROOT) {
  const today = ymd();
  const matrixPath = path.join(studioRoot, 'content-matrix', today, 'scripts.md');
  const inboxPath = path.join(studioRoot, 'content-inbox', `${today}.json`);
  const digestPath = path.join(studioRoot, 'daily-dashboard', `${today}.md`);
  const sceneConfigPath = path.join(studioRoot, 'scenes', 'sample-scene', 'scene.config.json');
  const eventRouterPath = path.join(userDataPath, 'event_router.json');
  const reactionLogPath = path.join(userDataPath, 'avatar-reactions.jsonl');
  return {
    ok: true,
    studio_root: studioRoot,
    phase3_avatar_router: fs.existsSync(eventRouterPath) ? 'ready' : 'needs-init',
    phase4_business_loop: fs.existsSync(matrixPath) && fs.existsSync(inboxPath) ? 'ready' : 'needs-seed',
    phase5_scene_viewer: fs.existsSync(sceneConfigPath) ? 'ready' : 'needs-seed',
    watcher_mode: 'manual-fixture-ready',
    files: { matrixPath, inboxPath, digestPath, sceneConfigPath, eventRouterPath, reactionLogPath },
  };
}

function seedBusinessLoop(studioRoot = DEFAULT_STUDIO_ROOT, now = new Date()) {
  const day = ymd(now);
  const contentDir = path.join(studioRoot, 'content-matrix', day);
  const inboxDir = path.join(studioRoot, 'content-inbox');
  const dashboardDir = path.join(studioRoot, 'daily-dashboard');
  ensureDir(contentDir);
  ensureDir(inboxDir);
  ensureDir(dashboardDir);

  const scriptId = `${day}-vocab-tinder-a`;
  const scriptsMd = [
    `# Content Matrix — ${day}`,
    '',
    '## Approved Test Script',
    '',
    '```yaml',
    `script_id: ${scriptId}`,
    'mvp_slug: vocab-tinder',
    'hook_3s: "Lướt tiếng Anh mỗi ngày nhưng không nhớ từ nào? Bumbee biến đoạn bạn đang đọc thành game vuốt từ."',
    'status: approved-for-render',
    'target_channels: ["tiktok-manual-tray"]',
    'beats:',
    '  - "0-3s: hook + Vocab Tinder window"',
    '  - "3-20s: paste text, swipe J/K/L"',
    '  - "20-35s: review one word, show streak"',
    '  - "35-45s: CTA bitdancegroup.com/bumbee-vocab-tinder"',
    'visual_notes:',
    '  screen_record_target: "Bumbee Vocab Tinder panel"',
    '  veo_broll_prompts:',
    '    - "friendly bee mascot pointing at English flashcards, vertical 9:16"',
    '    - "solo founder laptop workflow, warm studio light, vertical 9:16"',
    '```',
    '',
    '## Human Review',
    '',
    '- Gate: approve manually before public posting.',
    '- Safety: no third-party copyrighted screen content in demo footage.',
    '- Fallback: post manually from phone if TikTok API is not approved.',
    '',
  ].join('\n');

  const inbox = {
    date: day,
    status: 'ready_for_review',
    items: [
      {
        script_id: scriptId,
        mvp_slug: 'vocab-tinder',
        hook: 'Lướt tiếng Anh mỗi ngày nhưng không nhớ từ nào?',
        asset_path: '',
        caption: 'Mỗi ngày 2 phút học từ trong đúng thứ bạn đang đọc. #hoctienganh #solofounder #bumbee',
        state: 'needs_video_asset',
        actions: ['approve', 'reject_with_reason', 'edit_hook'],
      },
    ],
  };

  const dashboard = [
    `# Daily Business Dashboard — ${day}`,
    '',
    '## Today Focus',
    '',
    'Hoàn thiện một demo Vocab Tinder thật ngắn, đưa vào Content Inbox, rồi dùng Odoo checkout để kiểm tra support funnel.',
    '',
    '## Hot Ideas',
    '',
    '- Vocab Tinder cho người đọc GitHub README.',
    '- Bumbee Wiki làm bộ nhớ trung tâm cho solo founder.',
    '- Avatar phản ứng khi có donation đầu tiên.',
    '',
    '## Funnel',
    '',
    '- Landing: https://bitdancegroup.com/bumbee-vocab-tinder',
    '- Checkout: https://bitdancegroup.com/bumbee-vocab-tinder/checkout',
    '- Status: chờ confirmed/paid support order đầu tiên.',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(contentDir, 'scripts.md'), scriptsMd);
  writeJson(path.join(inboxDir, `${day}.json`), inbox);
  fs.writeFileSync(path.join(dashboardDir, `${day}.md`), dashboard);
  return {
    ok: true,
    files: [
      path.join(contentDir, 'scripts.md'),
      path.join(inboxDir, `${day}.json`),
      path.join(dashboardDir, `${day}.md`),
    ],
  };
}

function seedScene(studioRoot = DEFAULT_STUDIO_ROOT) {
  const sceneDir = path.join(studioRoot, 'scenes', 'sample-scene');
  ensureDir(sceneDir);
  const config = {
    scene_id: 'sample-scene',
    title: 'Bumbee Sample Walking Tour',
    scene_file: '',
    character_file: '',
    checkpoints: [
      { id: 'cp1', position: [0, 1, -2], prompt: 'Tìm bảng Vocab Tinder' },
      { id: 'cp2', position: [2, 1, -4], prompt: 'Đứng trước checkout funnel' },
      { id: 'cp3', position: [-2, 1, -3], prompt: 'Mở Content Inbox' },
    ],
    collision_boxes: [{ center: [0, 0, 0], size: [10, 0.1, 10] }],
    spawned_objects: [],
    status: 'placeholder-ready',
  };
  writeJson(path.join(sceneDir, 'scene.config.json'), config);
  fs.writeFileSync(
    path.join(sceneDir, 'README.md'),
    '# Sample Scene\n\nPlaceholder scene config for Phase 5 testing. Replace `scene_file` or `character_file` when real `.splat` / `.glb` assets are generated.\n'
  );
  return { ok: true, file: path.join(sceneDir, 'scene.config.json') };
}

function appendManualActivity(studioRoot = DEFAULT_STUDIO_ROOT, payload = {}, now = new Date()) {
  const day = ymd(now);
  const matrixDir = path.join(studioRoot, 'idea-matrix', payload.tag || 'co_hoi', day);
  ensureDir(matrixDir);
  const title = String(payload.title || 'Manual watcher signal').trim();
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || `signal-${Date.now()}`;
  const file = path.join(matrixDir, `${slug}.md`);
  const body = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `url: "${String(payload.url || '').replace(/"/g, '\\"')}"`,
    `source_app: "${String(payload.source_app || 'Manual Phase Hub').replace(/"/g, '\\"')}"`,
    `captured_at: "${now.toISOString()}"`,
    `tags: ["${String(payload.tag || 'co_hoi')}"]`,
    `priority_boost: "${payload.priority_boost ? 'true' : 'false'}"`,
    '---',
    '',
    `# ${title}`,
    '',
    payload.dwell_context || 'Manual fixture created from Bumbee Phase Hub.',
    '',
  ].join('\n');
  fs.writeFileSync(file, body);
  return { ok: true, file };
}

function costCaps(userDataPath) {
  const file = path.join(userDataPath, 'cost_caps.json');
  const data = readJson(file, {
    month: new Date().toISOString().slice(0, 7),
    higgsfield_veo_clips_used: 0,
    higgsfield_veo_clips_cap: 60,
    tavily_calls_used: 0,
    tavily_calls_cap: 30,
    soul_trainings_used: 0,
    soul_trainings_cap: 1,
  });
  writeJson(file, data);
  return { ok: true, file, caps: data };
}

module.exports = {
  DEFAULT_STUDIO_ROOT,
  phaseStatus,
  seedBusinessLoop,
  seedScene,
  appendManualActivity,
  costCaps,
};
