(() => {
  "use strict";

  const statusGrid = document.getElementById("statusGrid");
  const rawOutput = document.getElementById("rawOutput");
  const workList = document.getElementById("workList");
  const clipList = document.getElementById("clipList");
  const profileList = document.getElementById("profileList");
  const publisherList = document.getElementById("publisherList");
  const packageList = document.getElementById("packageList");
  const integrationList = document.getElementById("integrationList");
  const actionList = document.getElementById("actionList");
  const paymentList = document.getElementById("paymentList");

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  function renderStatus(data) {
    const counts = data?.counts || {};
    const cards = [
      ["Works", counts.workItems || 0],
      ["Clips", counts.clips || 0],
      ["Vocab", counts.vocabulary || 0],
      ["Profiles", counts.userProfiles || 0],
      ["Publishers", counts.publisherProfiles || 0],
      ["Actions", counts.actionQueue || 0],
      ["Payments", counts.paymentIntents || 0],
    ];
    statusGrid.innerHTML = cards.map(([label, value]) => `
      <article class="status-card">
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(label)}</span>
      </article>
    `).join("");
  }

  function renderLists(data) {
    const works = data?.workItems || [];
    const clips = data?.clips || [];
    const profiles = data?.userProfiles || [];
    const publishers = data?.publisherProfiles || [];
    const packages = data?.servicePackages || [];
    const integrations = data?.integrations || [];
    const actions = data?.actionQueue || [];
    const payments = data?.paymentIntents || [];
    const paymentNotifications = data?.paymentNotifications || [];
    workList.innerHTML = works.length ? works.slice(0, 8).map((item) => `
      <article class="item">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.type)} · ${escapeHtml(item.status)} · ${(item.tags || []).map(escapeHtml).join(", ")}</small>
        <small>${escapeHtml(item.note || "")}</small>
      </article>
    `).join("") : `<article class="item"><strong>No work drafts yet</strong><small>Create the first social publisher item.</small></article>`;

    clipList.innerHTML = clips.length ? clips.slice(0, 8).map((clip) => `
      <article class="item">
        <strong>${escapeHtml(clip.title)}</strong>
        <small>${escapeHtml(clip.topic)} · ${escapeHtml(clip.source_type)}</small>
        <small>${escapeHtml((clip.transcript || "").slice(0, 180))}</small>
      </article>
    `).join("") : `<article class="item"><strong>No clips yet</strong><small>Add one trailer or speech segment.</small></article>`;

    profileList.innerHTML = profiles.length ? profiles.slice(0, 6).map((profile) => `
      <article class="item">
        <strong>${escapeHtml(profile.display_name)}</strong>
        <small>${escapeHtml(profile.role)} · ${escapeHtml(profile.workspace)} · ${escapeHtml(profile.permission_level)}</small>
        <small>${(profile.data_sources || []).map(escapeHtml).join(", ")}</small>
      </article>
    `).join("") : `<article class="item"><strong>No profiles yet</strong><small>Add owner or customer profile.</small></article>`;

    publisherList.innerHTML = publishers.length ? publishers.slice(0, 6).map((profile) => `
      <article class="item">
        <strong>${escapeHtml(profile.name)}</strong>
        <small>${escapeHtml(profile.review_policy)} · auto post: ${profile.auto_post_enabled ? "on" : "off"}</small>
        <small>${(profile.platforms || []).map(escapeHtml).join(", ")}</small>
      </article>
    `).join("") : `<article class="item"><strong>No publishers yet</strong><small>Add a draft publishing profile.</small></article>`;

    packageList.innerHTML = packages.map((pkg) => `
      <article class="item">
        <strong>${escapeHtml(pkg.name)}</strong>
        <small>${escapeHtml(pkg.segment)} · ${escapeHtml(pkg.status)}</small>
        <small>${(pkg.features || []).map(escapeHtml).join(", ")}</small>
      </article>
    `).join("");

    integrationList.innerHTML = integrations.map((integration) => `
      <article class="item">
        <strong>${escapeHtml(integration.name)}</strong>
        <small>${escapeHtml(integration.type)} · ${escapeHtml(integration.status)} · ${escapeHtml(integration.mode)}</small>
      </article>
    `).join("");

    actionList.innerHTML = actions.length ? actions.slice(0, 6).map((action) => `
      <article class="item">
        <strong>${escapeHtml(action.title)}</strong>
        <small>${escapeHtml(action.priority)} · ${escapeHtml(action.status)} · ${escapeHtml(action.action_type)}</small>
        <small>${escapeHtml(action.note || "")}</small>
      </article>
    `).join("") : `<article class="item"><strong>No review actions</strong><small>Queue safe work for owner review.</small></article>`;

    paymentList.innerHTML = payments.length ? payments.slice(0, 6).map((payment) => `
      <article class="item">
        <strong>${escapeHtml(payment.payment_code)} · ${escapeHtml(payment.status)}</strong>
        <small>${escapeHtml(payment.environment)} · ${escapeHtml(payment.amount)} ${escapeHtml(payment.currency)} · ${escapeHtml(payment.bank)}</small>
        <small>${escapeHtml(payment.qr_url || "Missing bank/account config")}</small>
      </article>
    `).join("") : `<article class="item"><strong>No SePay intents</strong><small>Create a sandbox VietQR payment intent.</small></article>`;

    if (paymentNotifications.length) {
      paymentList.insertAdjacentHTML("beforeend", paymentNotifications.slice(0, 3).map((item) => `
        <article class="item">
          <strong>Notification ${escapeHtml(item.transaction_id || item.order_invoice_number)}</strong>
          <small>${escapeHtml(item.notification_type)} · ${escapeHtml(item.transaction_status)} · duplicate: ${item.duplicate ? "yes" : "no"}</small>
        </article>
      `).join(""));
    }
  }

  async function refresh() {
    const data = await window.bumbeeOsAPI.list();
    renderStatus(data);
    renderLists(data);
    rawOutput.textContent = JSON.stringify(data, null, 2);
  }

  document.getElementById("refreshBtn").addEventListener("click", refresh);
  document.getElementById("seedDemoBtn").addEventListener("click", async () => {
    await window.bumbeeOsAPI.seedDemo();
    await refresh();
  });

  document.getElementById("workForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = document.getElementById("workTitle").value;
    const type = document.getElementById("workType").value;
    const note = document.getElementById("workNote").value;
    const result = await window.bumbeeOsAPI.addWorkItem({
      title,
      type,
      note,
      tags: ["bumbee-os", type],
      channelDrafts: ["BitDanceGroup", "Bumbee Wiki", "Telegram draft"],
    });
    if (!result.ok) rawOutput.textContent = JSON.stringify(result, null, 2);
    event.target.reset();
    await refresh();
  });

  document.getElementById("profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const dataSources = document.getElementById("profileSources").value.split(",").map((item) => item.trim()).filter(Boolean);
    const result = await window.bumbeeOsAPI.addUserProfile({
      display_name: document.getElementById("profileName").value,
      role: document.getElementById("profileRole").value,
      workspace: document.getElementById("profileWorkspace").value,
      data_sources: dataSources,
      interests: ["idea", "product", "publisher"],
      permission_level: "local_only",
    });
    if (!result.ok) rawOutput.textContent = JSON.stringify(result, null, 2);
    event.target.reset();
    await refresh();
  });

  document.getElementById("publisherForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const platforms = document.getElementById("publisherPlatforms").value.split(",").map((item) => item.trim()).filter(Boolean);
    const result = await window.bumbeeOsAPI.addPublisherProfile({
      name: document.getElementById("publisherName").value,
      platforms,
      audience: document.getElementById("publisherAudience").value,
      tone: document.getElementById("publisherTone").value,
    });
    if (!result.ok) rawOutput.textContent = JSON.stringify(result, null, 2);
    event.target.reset();
    await refresh();
  });

  document.getElementById("clipForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = document.getElementById("clipTitle").value;
    const sourceUrl = document.getElementById("clipUrl").value;
    const topic = document.getElementById("clipTopic").value;
    const transcript = document.getElementById("clipTranscript").value;
    const result = await window.bumbeeOsAPI.addClip({
      title,
      source_url: sourceUrl,
      topic,
      transcript,
      source_type: sourceUrl ? "youtube" : "manual",
    });
    if (!result.ok) rawOutput.textContent = JSON.stringify(result, null, 2);
    event.target.reset();
    await refresh();
  });

  document.getElementById("addVocabBtn").addEventListener("click", async () => {
    const word = document.getElementById("vocabWord").value;
    const meaning = document.getElementById("vocabMeaning").value;
    const result = await window.bumbeeOsAPI.addVocabulary({
      word_or_phrase: word,
      meaning_vi: meaning,
      category: "daily_clip",
    });
    if (!result.ok) rawOutput.textContent = JSON.stringify(result, null, 2);
    document.getElementById("vocabWord").value = "";
    document.getElementById("vocabMeaning").value = "";
    await refresh();
  });

  document.getElementById("queueReviewBtn").addEventListener("click", async () => {
    const result = await window.bumbeeOsAPI.queueAction({
      title: "Owner review queued from Bumbee OS",
      action_type: "review",
      target_type: "dashboard",
      priority: "high",
      note: "Review package, publisher draft, and next integration before public action.",
    });
    rawOutput.textContent = JSON.stringify(result, null, 2);
    await refresh();
  });

  document.getElementById("exportSqlBtn").addEventListener("click", async () => {
    const result = await window.bumbeeOsAPI.exportSqlDump();
    rawOutput.textContent = result.ok ? result.sql : JSON.stringify(result, null, 2);
  });

  document.getElementById("sepayForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await window.bumbeeOsAPI.updateSettings({
      sepayEnvironment: document.getElementById("sepayEnvironment").value,
      sepayBankCode: document.getElementById("sepayBank").value,
      sepayAccountNumber: document.getElementById("sepayAccount").value,
      sepayAccountName: document.getElementById("sepayName").value,
      sepayQrTemplate: "compact",
    });
    const result = await window.bumbeeOsAPI.createSepayPaymentIntent({
      environment: document.getElementById("sepayEnvironment").value,
      bank: document.getElementById("sepayBank").value,
      account: document.getElementById("sepayAccount").value,
      account_name: document.getElementById("sepayName").value,
      amount: Number(document.getElementById("sepayAmount").value || 0),
      description: document.getElementById("sepayDescription").value,
      source: "bumbee_os_ui",
    });
    rawOutput.textContent = JSON.stringify(result, null, 2);
    await refresh();
  });

  refresh().catch((err) => {
    rawOutput.textContent = JSON.stringify({ ok: false, error: err.message || String(err) }, null, 2);
  });
})();
