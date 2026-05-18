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

  refresh().catch(err => write({ ok: false, error: err.message || String(err) }));
})();
