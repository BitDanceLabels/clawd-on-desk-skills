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

function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text);
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
    watcher_mode: 'vision-bumbee-ready-manual-fixture',
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
    '- TikTok: manual posting by founder; no official TikTok API required for this workflow.',
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

function seedConnectorCenter(studioRoot = DEFAULT_STUDIO_ROOT, now = new Date()) {
  const file = path.join(studioRoot, '08-connectors', 'connectors.json');
  const connectors = [
    { id: 'obsidian', name: 'Obsidian Vault', status: 'ready', mode: 'local-folder', scope: 'project-editor' },
    { id: 'local-folder', name: 'Local Studio Folder', status: 'ready', mode: 'filesystem', scope: studioRoot },
    { id: 'bumbee-wiki', name: 'Bumbee Wiki', status: 'ready', mode: 'sync-target', endpoint: 'https://wiki.bumbee.asia/api' },
    { id: 'gateway', name: 'Bumbee Gateway', status: 'ready', mode: 'skill-bus', endpoint: 'https://gateway.bumbee.asia/api/studio/runs' },
    { id: 'vision-bumbee', name: 'Vision Bumbee', status: 'ready', mode: 'external-service', endpoint: 'https://vision.bumbee.asia/login' },
    { id: 'proxycli', name: 'ProxyCLI Gateway', status: 'ready', mode: 'openai-compatible', endpoint: 'gateway-managed' },
    { id: 'higgsfield', name: 'Higgsfield MCP/CLI', status: 'ready', mode: 'gateway-skill', server: 'bumbee-studio-us-020226' },
    { id: 'codex-skills', name: 'Codex Image/Video Skills', status: 'ready', mode: 'gateway-skill', skills: ['ai-artist', 'ai-multimodal', 'video-production'] },
    { id: 'gmail', name: 'Gmail', status: 'planned', mode: 'connector', action_policy: 'confirm_required' },
    { id: 'notion', name: 'Notion', status: 'planned', mode: 'connector', action_policy: 'read_then_confirm' },
    { id: 'crm-odoo', name: 'BitDance Odoo CRM/Commerce', status: 'ready', mode: 'gateway-or-odoo', endpoint: 'https://bitdancegroup.com/bumbee-vocab-tinder/checkout' },
  ];
  writeJson(file, { version: 1, updated_at: now.toISOString(), connectors });
  return { ok: true, file, count: connectors.length };
}

function seedGatewaySkillMap(studioRoot = DEFAULT_STUDIO_ROOT, now = new Date()) {
  const file = path.join(studioRoot, '04-skills', 'gateway-skill-map.json');
  const skills = [
    { skill_name: 'activity_digest', mvp: 'MVP 6', purpose: 'Classify Vision/cursor signals into idea matrix entries.', safety: 'read_only' },
    { skill_name: 'vocab_filter', mvp: 'MVP 8', purpose: 'Filter OCR words into useful English learning cards.', safety: 'read_only' },
    { skill_name: 'vocab_review_session', mvp: 'MVP 8', purpose: 'Create SM-2 review tasks from captured user sentences.', safety: 'read_only' },
    { skill_name: 'idea_engine', mvp: 'MVP 9 B0', purpose: 'Draft 3-5 daily scripts from idea matrix and performance data.', safety: 'draft_only' },
    { skill_name: 'case_study_writer', mvp: 'MVP 9 B1', purpose: 'Write case-study pages from shipped MVP evidence.', safety: 'draft_only' },
    { skill_name: 'demo_video_factory', mvp: 'MVP 9 B2', purpose: 'Prepare/render vertical demo assets through gateway workers.', safety: 'confirm_required' },
    { skill_name: 'content_review_gate', mvp: 'MVP 9 B3.5', purpose: 'Approve/reject/edit scripts before public posting.', safety: 'human_gate_required' },
    { skill_name: 'tiktok_manual_tray', mvp: 'MVP 9 B4', purpose: 'Prepare caption/assets for manual founder posting.', safety: 'manual_post_only' },
    { skill_name: 'daily_dashboard', mvp: 'MVP 9 B6', purpose: 'Summarize today focus, funnel, blockers, next action.', safety: 'read_only' },
    { skill_name: 'performance_analyzer', mvp: 'MVP 9 B6.5', purpose: 'Analyze 24h video metrics and feed next scripts.', safety: 'draft_only' },
    { skill_name: 'higgsfield-soul-id', mvp: 'MVP 7/MVP 10', purpose: 'Train identity/Soul asset through existing Higgsfield setup.', safety: 'confirm_required' },
    { skill_name: 'higgsfield-generate', mvp: 'MVP 7/MVP 9', purpose: 'Generate image/video/B-roll assets through existing gateway skill.', safety: 'confirm_required' },
    { skill_name: 'ai-artist', mvp: 'MVP 7/MVP 9', purpose: 'Generate image thumbnails through Codex skills.', safety: 'confirm_required' },
    { skill_name: 'ai-multimodal', mvp: 'MVP 7/MVP 9', purpose: 'Generate video/image fallbacks through Codex skills.', safety: 'confirm_required' },
  ];
  writeJson(file, { version: 1, command_bus: 'https://gateway.bumbee.asia/api/studio/runs', updated_at: now.toISOString(), skills });
  return { ok: true, file, count: skills.length };
}

function seedProjectPortfolio(studioRoot = DEFAULT_STUDIO_ROOT, now = new Date()) {
  const projects = [
    {
      slug: 'bumbee-money',
      title: 'WIKI Bumbee Money',
      tags: '#IDEA #CRM #PUBLISHER #THAM_MUU #FINAL',
      goal: 'Score money-making ideas, package demos, find partners, and track nghiệm thu/revenue.',
    },
    {
      slug: 'animal-voice-dataset',
      title: 'Robot giao tiếp với động vật',
      tags: '#IDEA #DATASET #CHUP_ANH #VIDEO #THAM_MUU',
      goal: 'Collect labeled animal audio, build dataset rules, and design training/interaction workflows.',
    },
    {
      slug: 'ai-work-delegation',
      title: 'Dạy việc và giao việc bất kỳ cho AI',
      tags: '#IDEA #WORKER #RA_LENH #TICKET #THAM_MUU',
      goal: 'Create repeatable worker templates for phone, PC, smart-home, and gateway-controlled actions.',
    },
    {
      slug: 'model-distillation-lab',
      title: 'Chưng cất models và kiến thức',
      tags: '#IDEA #DATASET #MODELS #TICKET #THAM_MUU',
      goal: 'Break expert knowledge into input/output/thinking/script datasets and reusable training packs.',
    },
    {
      slug: 'chatbot-wiki-import',
      title: 'APP Wiki AI cho từng chatbot',
      tags: '#IDEA #GATEWAY #MCP #TICKET #PUBLISHER',
      goal: 'Make portable project wiki packs that Codex, Claude, and other chatbots can import immediately.',
    },
  ];
  const files = [];
  for (const project of projects) {
    const dir = path.join(studioRoot, '03-projects', project.slug);
    ensureDir(path.join(dir, 'assets'));
    files.push(writeText(path.join(dir, 'PROJECT.work.md'), [
      `# ${project.title}`,
      '',
      `Tags: ${project.tags}`,
      'Status: ACTIVE',
      '',
      '## Goal',
      '',
      project.goal,
      '',
      '## Operating Rule',
      '',
      'One project = this one work file. Add links, images, notes, customer context, and decisions here. AI workers write separate output files and append progress logs.',
      '',
      '## Current Inputs',
      '',
      '- Bumbee Wiki is the source of truth.',
      '- Gateway skills are called through `/api/studio/runs`.',
      '- Sensitive actions require confirm unless a specific worker policy grants permission.',
      '',
      '## Next Actions',
      '',
      '- [ ] Advisor scores value, feasibility, risk, and money path.',
      '- [ ] Worker creates tester checklist.',
      '- [ ] Prepare demo/content/proposal package if score is high.',
      '',
    ].join('\n')));
    files.push(writeText(path.join(dir, 'PROJECT.progress.md'), [
      `# ${project.title} Progress`,
      '',
      `## ${now.toISOString()}`,
      '',
      '- Project seeded by Phase Hub full-system setup.',
      '- Pending: run workers, review output, sync to Bumbee Wiki.',
      '',
    ].join('\n')));
  }
  return { ok: true, files, count: projects.length };
}

function seedActionQueue(studioRoot = DEFAULT_STUDIO_ROOT, now = new Date()) {
  const file = path.join(studioRoot, '07-actions', 'action-queue.json');
  const actions = [
    {
      id: `phase-full:idea_engine:${ymd(now)}`,
      project: 'bumbee-money',
      type: 'idea_engine',
      title: 'Generate daily money scripts from idea matrix',
      tag: '#IDEA',
      mode: 'suggest_only',
      status: 'pending',
      skill_name: 'idea_engine',
    },
    {
      id: `phase-full:demo_video_factory:${ymd(now)}`,
      project: 'bumbee-money',
      type: 'demo_video_factory',
      title: 'Prepare Vocab Tinder demo video package',
      tag: '#VIDEO',
      mode: 'confirm_required',
      status: 'waiting_confirmation',
      skill_name: 'demo_video_factory',
    },
    {
      id: `phase-full:tiktok_manual_tray:${ymd(now)}`,
      project: 'bumbee-money',
      type: 'tiktok_manual_tray',
      title: 'Prepare manual TikTok tray, caption, and asset checklist',
      tag: '#PUBLISHER',
      mode: 'confirm_required',
      status: 'waiting_confirmation',
      skill_name: 'tiktok_manual_tray',
    },
    {
      id: `phase-full:activity_digest:${ymd(now)}`,
      project: 'ai-work-delegation',
      type: 'activity_digest',
      title: 'Digest Vision/manual signals into next money todos',
      tag: '#THAM_MUU',
      mode: 'suggest_only',
      status: 'pending',
      skill_name: 'activity_digest',
    },
  ].map(action => ({ ...action, created_at: now.toISOString(), updated_at: now.toISOString(), source: 'phase-hub/full-system' }));
  writeJson(file, { version: 1, updated_at: now.toISOString(), actions });
  return { ok: true, file, count: actions.length };
}

function seedBusinessArtifacts(studioRoot = DEFAULT_STUDIO_ROOT, now = new Date()) {
  const day = ymd(now);
  const base = path.join(studioRoot, 'business-ops', day);
  const files = [];
  files.push(writeText(path.join(base, 'B0-idea-engine.md'), [
    `# B0 Idea Engine — ${day}`,
    '',
    '## Draft Scripts',
    '',
    '1. Vocab Tinder: "Lướt tiếng Anh mà không nhớ từ nào?"',
    '2. Bumbee Wiki: "Một người vận hành cả công ty bằng project wiki."',
    '3. Obsidian Bridge: "Viết một file, AI hiểu toàn bộ dự án."',
    '',
    '## Rule',
    '',
    'Draft only. Human review is required before render/post.',
    '',
  ].join('\n')));
  files.push(writeJson(path.join(base, 'B2-demo-video-factory.request.json'), {
    skill_name: 'demo_video_factory',
    status: 'ready_for_confirmation',
    gateway_endpoint: 'https://gateway.bumbee.asia/api/studio/runs',
    input_data: {
      script_id: `${day}-vocab-tinder-a`,
      render_mode: 'manual_screen_record_plus_gateway_broll',
      prompt: 'Create a vertical Vocab Tinder demo package. Use existing Bumbee gateway skills; do not call paid public APIs directly.',
      safety: 'Only use user-owned app footage. Founder posts manually.',
    },
  }));
  files.push(writeJson(path.join(base, 'B3_5-human-review-gate.json'), {
    status: 'waiting_human_review',
    buttons: ['approve_for_manual_post', 'reject_with_reason', 'edit_hook'],
    hard_rule: 'Nothing posts without founder approval.',
  }));
  files.push(writeText(path.join(base, 'B4-manual-tiktok-tray.md'), [
    '# B4 Manual TikTok Tray',
    '',
    '## Caption',
    '',
    'Mỗi ngày 2 phút học từ trong đúng thứ bạn đang đọc. #hoctienganh #solofounder #bumbee',
    '',
    '## Post Rule',
    '',
    'Manual post only. No TikTok API execution in this workflow.',
    '',
  ].join('\n')));
  files.push(writeText(path.join(base, 'B6_5-performance-analyzer.md'), [
    '# B6.5 Performance Analyzer',
    '',
    'After 24h, paste metrics here: views, watch time, comments, clicks, donations.',
    '',
    'Verdict format: hot/mid/flop, why, next action.',
    '',
  ].join('\n')));
  return { ok: true, files, count: files.length };
}

function seedGatewayDryRun(studioRoot = DEFAULT_STUDIO_ROOT, now = new Date()) {
  const file = path.join(studioRoot, '07-actions', 'phase-gateway-dry-run.json');
  const payloads = [
    {
      skill_name: 'idea_engine',
      skill_id: null,
      input_data: {
        project: 'bumbee-money',
        source: 'phase-hub',
        mode: 'draft_only',
        prompt: 'Draft 3 scripts from today idea matrix and Bumbee money path.',
      },
    },
    {
      skill_name: 'higgsfield-generate',
      skill_id: null,
      input_data: {
        project: 'bumbee-money',
        mode: 'confirm_required',
        prompt: 'Generate one vertical 9:16 friendly bee mascot B-roll clip for Vocab Tinder demo through existing Bumbee gateway skill.',
      },
    },
    {
      skill_name: 'activity_digest',
      skill_id: null,
      input_data: {
        project: 'ai-work-delegation',
        mode: 'read_only',
        prompt: 'Classify manual watcher signals into money todos.',
      },
    },
  ];
  writeJson(file, {
    version: 1,
    endpoint: 'https://gateway.bumbee.asia/api/studio/runs',
    dry_run: true,
    updated_at: now.toISOString(),
    payloads,
  });
  return { ok: true, file, count: payloads.length };
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

function seedFullSystem(userDataPath, studioRoot = DEFAULT_STUDIO_ROOT, now = new Date()) {
  return {
    business: seedBusinessLoop(studioRoot, now),
    businessArtifacts: seedBusinessArtifacts(studioRoot, now),
    scene: seedScene(studioRoot),
    connectors: seedConnectorCenter(studioRoot, now),
    skills: seedGatewaySkillMap(studioRoot, now),
    portfolio: seedProjectPortfolio(studioRoot, now),
    actions: seedActionQueue(studioRoot, now),
    gatewayDryRun: seedGatewayDryRun(studioRoot, now),
    caps: costCaps(userDataPath),
  };
}

module.exports = {
  DEFAULT_STUDIO_ROOT,
  phaseStatus,
  seedBusinessLoop,
  seedBusinessArtifacts,
  seedScene,
  seedConnectorCenter,
  seedGatewaySkillMap,
  seedProjectPortfolio,
  seedActionQueue,
  seedGatewayDryRun,
  seedFullSystem,
  appendManualActivity,
  costCaps,
};
