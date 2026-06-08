(() => {
  "use strict";

  const statusGrid = document.getElementById("statusGrid");
  const rawOutput = document.getElementById("rawOutput");
  const ideaList = document.getElementById("ideaList");
  const digestList = document.getElementById("digestList");
  const jiraDraftList = document.getElementById("jiraDraftList");
  const companionList = document.getElementById("companionList");
  const skillResearchList = document.getElementById("skillResearchList");
  const gatewayApiDraftList = document.getElementById("gatewayApiDraftList");
  const knowledgeSyncList = document.getElementById("knowledgeSyncList");
  const workspaceList = document.getElementById("workspaceList");
  const teamList = document.getElementById("teamList");
  const opsDashboardList = document.getElementById("opsDashboardList");
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
      ["Ideas", counts.ideaNotes || 0],
      ["Digests", counts.dailyDigests || 0],
      ["Jira drafts", counts.jiraDrafts || 0],
      ["Skill research", counts.skillResearchItems || 0],
      ["API drafts", counts.gatewayApiDrafts || 0],
      ["Sources", counts.workspaceConnections || 0],
      ["Team", counts.teamMembers || 0],
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
    const ideas = data?.ideaNotes || [];
    const digests = data?.dailyDigests || [];
    const jiraDrafts = data?.jiraDrafts || [];
    const skillResearchItems = data?.skillResearchItems || [];
    const gatewayApiDrafts = data?.gatewayApiDrafts || [];
    const knowledgeSyncPlans = data?.knowledgeSyncPlans || [];
    const workspaces = data?.workspaceConnections || [];
    const teamMembers = data?.teamMembers || [];
    const opsDashboards = data?.opsDashboards || [];
    const messages = data?.companionMessages || [];
    const clips = data?.clips || [];
    const profiles = data?.userProfiles || [];
    const publishers = data?.publisherProfiles || [];
    const packages = data?.servicePackages || [];
    const integrations = data?.integrations || [];
    const actions = data?.actionQueue || [];
    const payments = data?.paymentIntents || [];
    const paymentNotifications = data?.paymentNotifications || [];
    const settings = data?.settings || {};

    const jiraInput = document.getElementById("jiraProjectUrl");
    const sourceInput = document.getElementById("sourceFolders");
    if (jiraInput && document.activeElement !== jiraInput) jiraInput.value = settings.jiraProjectUrl || "";
    if (sourceInput && document.activeElement !== sourceInput) sourceInput.value = (settings.sourceFolders || []).join("\n");

    ideaList.innerHTML = ideas.length ? ideas.slice(0, 8).map((item) => `
      <article class="item">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.priority)} · ${escapeHtml(item.status)} · ${escapeHtml(item.source)}</small>
        <small>${escapeHtml((item.body || "").slice(0, 220))}</small>
      </article>
    `).join("") : `<article class="item"><strong>No captured ideas</strong><small>Use companion chat to capture owner notes.</small></article>`;

    digestList.innerHTML = digests.length ? digests.slice(0, 5).map((digest) => `
      <article class="item">
        <strong>${escapeHtml(digest.title)}</strong>
        <small>${escapeHtml(digest.date)} · ${digest.idea_count || 0} candidates · ${digest.created_jira_draft_ids?.length || 0} Jira drafts</small>
        <small>${(digest.recommendations || []).slice(0, 2).map((rec) => `${escapeHtml(rec.priority)}: ${escapeHtml(rec.title)}`).join("<br>")}</small>
      </article>
    `).join("") : `<article class="item"><strong>No daily digest yet</strong><small>Scan local notes to prepare owner review.</small></article>`;

    jiraDraftList.innerHTML = jiraDrafts.length ? jiraDrafts.slice(0, 8).map((draft) => `
      <article class="item">
        <strong>${escapeHtml(draft.title)}</strong>
        <small>${escapeHtml(draft.issue_type)} · ${escapeHtml(draft.priority)} · due ${escapeHtml(draft.deadline_date)}</small>
        <small>${escapeHtml((draft.description || "").slice(0, 220))}</small>
      </article>
    `).join("") : `<article class="item"><strong>No Jira drafts</strong><small>Daily scan creates draft tickets only, not live Jira issues.</small></article>`;

    companionList.innerHTML = messages.length ? messages.slice(0, 6).map((message) => `
      <article class="item">
        <strong>${escapeHtml(message.role)}</strong>
        <small>${escapeHtml(message.created_at)} · ${escapeHtml(message.source)}</small>
        <small>${escapeHtml(message.message)}</small>
      </article>
    `).join("") : `<article class="item"><strong>No companion chat yet</strong><small>Capture an idea or note above.</small></article>`;

    skillResearchList.innerHTML = skillResearchItems.length ? skillResearchItems.slice(0, 5).map((item) => `
      <article class="item">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.priority)} · ${escapeHtml(item.status)} · ${escapeHtml(item.source)}</small>
        <small>${(item.expected_output || []).map(escapeHtml).join(", ")}</small>
      </article>
    `).join("") : `<article class="item"><strong>No skill research backlog</strong><small>Prepare a capability upgrade draft.</small></article>`;

    gatewayApiDraftList.innerHTML = gatewayApiDrafts.length ? gatewayApiDrafts.slice(0, 5).map((draft) => `
      <article class="item">
        <strong>${escapeHtml(draft.method)} ${escapeHtml(draft.path)}</strong>
        <small>${escapeHtml(draft.name)} · ${escapeHtml(draft.status)} · auth: ${draft.auth_required ? "yes" : "no"}</small>
        <small>${escapeHtml((draft.purpose || "").slice(0, 220))}</small>
      </article>
    `).join("") : `<article class="item"><strong>No gateway API drafts</strong><small>Gateway changes stay draft-only until approved.</small></article>`;

    knowledgeSyncList.innerHTML = knowledgeSyncPlans.length ? knowledgeSyncPlans.slice(0, 4).map((plan) => `
      <article class="item">
        <strong>${escapeHtml(plan.title)}</strong>
        <small>${escapeHtml(plan.cadence)} · ${escapeHtml(plan.status)}</small>
        <small>${(plan.targets || []).map(escapeHtml).join(", ")}</small>
      </article>
    `).join("") : `<article class="item"><strong>No knowledge sync plans</strong><small>Plan how new knowledge enters skills, wiki, and gateway.</small></article>`;

    workspaceList.innerHTML = workspaces.length ? workspaces.slice(0, 10).map((item) => `
      <article class="item">
        <strong>${escapeHtml(item.name)}</strong>
        <small>${escapeHtml(item.type)} · ${escapeHtml(item.status)} · ${escapeHtml(item.cadence)}</small>
        <small>${escapeHtml(item.location)}</small>
      </article>
    `).join("") : `<article class="item"><strong>No work sources</strong><small>Add wiki, folder, Notion, Jira, Odoo, email, or platform source.</small></article>`;

    teamList.innerHTML = teamMembers.length ? teamMembers.slice(0, 10).map((member) => `
      <article class="item">
        <strong>${escapeHtml(member.name)}</strong>
        <small>${escapeHtml(member.role)} · ${escapeHtml(member.member_type)} · ${escapeHtml(member.status)}</small>
        <small>${(member.work_sources || []).map(escapeHtml).join(", ")}</small>
      </article>
    `).join("") : `<article class="item"><strong>No team members</strong><small>Add staff, agents, workers, or customer contacts.</small></article>`;

    opsDashboardList.innerHTML = opsDashboards.length ? opsDashboards.slice(0, 3).map((dashboard) => `
      <article class="item">
        <strong>${escapeHtml(dashboard.title)}</strong>
        <small>${escapeHtml(dashboard.date)} · sources ${dashboard.metrics?.workspace_connections || 0} · team ${dashboard.metrics?.team_members || 0} · actions ${dashboard.metrics?.open_actions || 0}</small>
        <small>Jira drafts ${dashboard.metrics?.jira_drafts || 0} · API drafts ${dashboard.metrics?.gateway_api_drafts || 0}</small>
      </article>
    `).join("") : `<article class="item"><strong>No ops dashboard yet</strong><small>Build dashboard after adding sources/team.</small></article>`;

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

  document.getElementById("companionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.getElementById("companionMessage").value;
    const result = await window.bumbeeOsAPI.companionChat({
      message,
      source: "bumbee_os_daily_companion",
    });
    rawOutput.textContent = JSON.stringify(result, null, 2);
    event.target.reset();
    await refresh();
  });

  document.getElementById("dailyDigestBtn").addEventListener("click", async () => {
    const folders = document.getElementById("sourceFolders").value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const result = await window.bumbeeOsAPI.buildDailyDigest({
      sourceFolders: folders,
      limit: 10,
      maxAgeHours: 168,
    });
    rawOutput.textContent = JSON.stringify(result, null, 2);
    await refresh();
  });

  document.getElementById("saveCompanionSettingsBtn").addEventListener("click", async () => {
    const folders = document.getElementById("sourceFolders").value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const result = await window.bumbeeOsAPI.updateSettings({
      jiraProjectUrl: document.getElementById("jiraProjectUrl").value,
      sourceFolders: folders,
      dailyIdeaScanEnabled: true,
      companionMode: "daily_work_companion",
    });
    rawOutput.textContent = JSON.stringify(result, null, 2);
    await refresh();
  });

  document.getElementById("queueDigestReviewBtn").addEventListener("click", async () => {
    const result = await window.bumbeeOsAPI.queueAction({
      title: "Review Bumbee daily companion digest",
      action_type: "daily_digest_review",
      target_type: "daily_digest",
      priority: "high",
      note: "Review idea inbox, daily digest, and Jira drafts before creating live tasks.",
    });
    rawOutput.textContent = JSON.stringify(result, null, 2);
    await refresh();
  });

  document.getElementById("capabilityForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const skills = document.getElementById("capabilitySkills").value.split(",").map((item) => item.trim()).filter(Boolean);
    const apis = document.getElementById("capabilityApis").value.split(",").map((item) => item.trim()).filter(Boolean);
    const sources = document.getElementById("capabilitySources").value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const result = await window.bumbeeOsAPI.proposeCapabilityUpgrade({
      title: document.getElementById("capabilityTitle").value,
      goal: document.getElementById("capabilityGoal").value,
      skills,
      apis,
      knowledge_sources: sources,
      source: "bumbee_os_capability_lab",
    });
    rawOutput.textContent = JSON.stringify(result, null, 2);
    event.target.reset();
    await refresh();
  });

  document.getElementById("workspaceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await window.bumbeeOsAPI.addWorkspaceConnection({
      name: document.getElementById("workspaceName").value,
      type: document.getElementById("workspaceType").value,
      location: document.getElementById("workspaceLocation").value,
      owner: document.getElementById("workspaceOwner").value,
      notes: document.getElementById("workspaceNotes").value,
      tags: ["daily_ops"],
    });
    rawOutput.textContent = JSON.stringify(result, null, 2);
    event.target.reset();
    await refresh();
  });

  document.getElementById("teamForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const workSources = document.getElementById("teamSources").value.split(",").map((item) => item.trim()).filter(Boolean);
    const result = await window.bumbeeOsAPI.addTeamMember({
      name: document.getElementById("teamName").value,
      role: document.getElementById("teamRole").value,
      member_type: document.getElementById("teamType").value,
      email: document.getElementById("teamEmail").value,
      work_sources: workSources,
      owner_area: "daily_ops",
    });
    rawOutput.textContent = JSON.stringify(result, null, 2);
    event.target.reset();
    await refresh();
  });

  document.getElementById("buildOpsDashboardBtn").addEventListener("click", async () => {
    const result = await window.bumbeeOsAPI.buildOpsDashboard();
    rawOutput.textContent = JSON.stringify(result, null, 2);
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
