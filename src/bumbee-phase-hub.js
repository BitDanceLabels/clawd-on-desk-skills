(() => {
  'use strict';

  const output = document.getElementById('output');
  const phaseGrid = document.getElementById('phaseGrid');
  const events = [
    'vocab.review.correct',
    'vocab.streak.day',
    'cursor.dwell.cta',
    'digest.money_todo.ready',
    'pipeline.scene.render.done',
    'business.video.render.done',
    'business.donation.confirmed',
    'business.first_donation',
  ];

  function write(data) {
    output.textContent = JSON.stringify(data, null, 2);
  }

  function renderStatus(data) {
    const cards = [
      ['Phase 3', 'Avatar router + emotion reaction log', data.phase3_avatar_router],
      ['Phase 4', 'Business content loop + inbox + dashboard', data.phase4_business_loop],
      ['Phase 5', 'Scene viewer config + walking-tour placeholder', data.phase5_scene_viewer],
      ['Watcher', 'Vision Bumbee is available; manual fixture tests local idea-matrix writes', data.watcher_mode],
    ];
    phaseGrid.innerHTML = cards.map(([title, desc, state]) => {
      const ready = String(state).includes('ready');
      return `
        <article class="card">
          <strong>${title}</strong>
          <p>${desc}</p>
          <span class="badge ${ready ? 'ready' : ''}">${state}</span>
        </article>
      `;
    }).join('');
    renderInventory(data.inventory || []);
  }

  function renderInventory(items) {
    const list = document.getElementById('featureList');
    list.innerHTML = items.map(item => `
      <article class="feature-row">
        <div>
          <strong>${item.name}</strong>
          <small>${item.surface}</small>
        </div>
        <span class="status status-${String(item.status).replace(/_/g, '-')}">${item.status}</span>
        <small>${item.evidence}</small>
      </article>
    `).join('');
  }

  async function refresh() {
    const status = await window.bumbeePhaseAPI.status();
    renderStatus(status);
    write(status);
  }

  document.getElementById('seedAll').addEventListener('click', async () => {
    const result = await window.bumbeePhaseAPI.seedAll();
    write(result);
    await refresh();
  });

  document.getElementById('addSignal').addEventListener('click', async () => {
    const result = await window.bumbeePhaseAPI.addManualActivity({
      title: document.getElementById('signalTitle').value,
      tag: document.getElementById('signalTag').value,
      priority_boost: true,
      dwell_context: 'Manual fixture from Phase Hub: user wants Bumbee to turn this signal into money-making work.',
    });
    write(result);
    await refresh();
  });

  document.getElementById('openVocab').addEventListener('click', () => {
    window.bumbeePhaseAPI.openVocab();
  });
  document.getElementById('openVision').addEventListener('click', () => {
    window.bumbeePhaseAPI.openVision();
  });
  document.getElementById('openDonate').addEventListener('click', async () => {
    const result = await window.bumbeePhaseAPI.openDonate();
    write(result);
  });
  document.getElementById('openDonationSettings').addEventListener('click', async () => {
    const result = await window.bumbeePhaseAPI.openDonationSettings();
    write(result);
  });
  document.getElementById('syncStudio').addEventListener('click', async () => {
    const result = await window.bumbeePhaseAPI.syncStudio();
    write(result);
    await refresh();
  });
  document.getElementById('seedBusiness').addEventListener('click', async () => {
    const result = await window.bumbeePhaseAPI.seedBusinessArtifacts();
    write(result);
    await refresh();
  });
  document.getElementById('gatewayDryRun').addEventListener('click', async () => {
    const result = await window.bumbeePhaseAPI.gatewayDryRun();
    write(result);
    await refresh();
  });

  const chips = document.getElementById('eventChips');
  chips.innerHTML = events.map(event => `<button class="secondary" data-event="${event}">${event}</button>`).join('');
  chips.addEventListener('click', async (e) => {
    const type = e.target?.dataset?.event;
    if (!type) return;
    const result = await window.bumbeePhaseAPI.emitEvent({
      type,
      payload: {
        source: 'phase-hub',
        order_id: type.includes('donation') ? 'S00007' : undefined,
        amount_vnd: type.includes('donation') ? 99000 : undefined,
        word: type.startsWith('vocab') ? 'serendipity' : undefined,
        item_count: type === 'digest.money_todo.ready' ? 4 : undefined,
      },
    });
    write(result);
  });

  // Gateway Live Execute
  document.getElementById('gatewayExecuteLive').addEventListener('click', async () => {
    const result = await window.bumbeePhaseAPI.gatewayExecuteLive({ actionId: 'latest' });
    write(result);
    await refresh();
  });

  // Business Ops Pipeline
  async function refreshPipeline() {
    const status = await window.bumbeePhaseAPI.pipelineStatus();
    const el = document.getElementById('pipelineStatus');
    const steps = ['B0', 'B2', 'B3_5', 'B4', 'B6_5'];
    el.innerHTML = steps.map(s => {
      const st = status[s] || {};
      const color = st.status === 'done' ? '#7fffd4' : st.status === 'blocked' ? '#ffaa44' : st.status === 'failed' ? '#ff6666' : '#888';
      return `<span style="display:inline-block;margin:2px 6px 2px 0;padding:3px 8px;border-radius:4px;font-size:11px;background:rgba(255,255,255,0.06);border:1px solid ${color};color:${color}">${s}: ${st.status || 'pending'}</span>`;
    }).join('');
  }
  document.getElementById('pipelineRunFull').addEventListener('click', async () => { write(await window.bumbeePhaseAPI.pipelineRunFull()); await refreshPipeline(); });
  document.getElementById('pipelineRunB0').addEventListener('click', async () => { write(await window.bumbeePhaseAPI.pipelineRunStep('B0')); await refreshPipeline(); });
  document.getElementById('pipelineRunB2').addEventListener('click', async () => { write(await window.bumbeePhaseAPI.pipelineRunStep('B2')); await refreshPipeline(); });
  document.getElementById('pipelineApprove').addEventListener('click', async () => { write(await window.bumbeePhaseAPI.pipelineApprove()); await refreshPipeline(); });
  document.getElementById('pipelineRunB4').addEventListener('click', async () => { write(await window.bumbeePhaseAPI.pipelineRunStep('B4')); await refreshPipeline(); });
  document.getElementById('pipelineRunB6_5').addEventListener('click', async () => { write(await window.bumbeePhaseAPI.pipelineRunStep('B6_5')); await refreshPipeline(); });

  // Vision Auto-Capture
  const visionBtn = document.getElementById('visionToggle');
  const visionStatusEl = document.getElementById('visionCaptureStatus');
  async function refreshVisionStatus() {
    const st = await window.bumbeePhaseAPI.visionStatus();
    visionStatusEl.textContent = st.running ? `Running — ${st.captureCount} captures, last: ${st.lastCaptureTime || '—'}` : 'Stopped';
    visionBtn.textContent = st.running ? 'Stop Vision Capture' : 'Start Vision Capture';
  }
  visionBtn.addEventListener('click', async () => {
    const st = await window.bumbeePhaseAPI.visionStatus();
    if (st.running) { await window.bumbeePhaseAPI.visionStopCapture(); }
    else { await window.bumbeePhaseAPI.visionStartCapture(); }
    await refreshVisionStatus();
  });

  // Scene Viewer
  document.getElementById('openSceneViewer').addEventListener('click', () => {
    window.bumbeePhaseAPI.openSceneViewer();
  });

  refresh().catch(err => write({ ok: false, error: err.message || String(err) }));
  refreshPipeline().catch(() => {});
  refreshVisionStatus().catch(() => {});
})();
