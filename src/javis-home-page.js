// Trang chủ JAVIS (javis-desk://app/index.html): the tile bar and its tabs.
// Chat stays in javis-chat.js; this file draws the other tabs from the same tool calls as
// the tool windows (window.javisTools) plus local Home data (window.javisHome). No token here.
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const tools = window.javisTools;
  const home = window.javisHome;
  const desk = window.javisDesk;
  const TABS = ["chat", "inbox", "report", "clip", "english", "sessions", "web"];
  let tab = TABS.includes(localStorage.getItem("javis.home.tab")) ? localStorage.getItem("javis.home.tab") : "chat";
  let signedIn = false;
  let sessionsTimer = null;
  let reportLoaded = false;
  let clipSensitive = false;
  let spoke = false;
  let stoppedByUser = false;

  const show = (id, on) => { $(id).hidden = !on; };
  const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const badge = (id, n) => { $(id).textContent = String(n); $(id).hidden = !n; };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ── Tabs ──
  function select(next) {
    if (!TABS.includes(next)) return;
    tab = next;
    localStorage.setItem("javis.home.tab", tab);
    for (const b of document.querySelectorAll(".tile")) {
      const on = b.dataset.tab === tab;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    }
    for (const t of TABS) show(`tab-${t}`, t === tab);
    clearInterval(sessionsTimer);
    sessionsTimer = null;
    if (tab === "chat" && window.javisReopenChat) window.javisReopenChat();
    if (tab === "inbox") void loadInbox();
    if (tab === "report" && !reportLoaded) void loadReport(false);
    if (tab === "clip") void loadClip();
    if (tab === "english") void loadEnglish();
    if (tab === "sessions") {
      void loadSessions();
      // Local list only (hook state in main, no network): refresh while this tab is on screen.
      sessionsTimer = setInterval(() => { if (!document.hidden) void loadSessions(); }, 5000);
    }
    if (tab === "web") void loadWeb();
  }

  // ── Chat: 401/403 → one plain line instead of a dead end ──
  function chatHealth(h) {
    const blocked = !!(h && h.ok === false);
    show("chat-banner", blocked);
    $("tab-chat").classList.toggle("blocked", blocked);
    if (blocked) $("chat-banner-title").textContent = "Đang chờ cập nhật máy chủ";
  }

  // ── Cần anh duyệt (GET /fleet/desk/pending via main) ──
  const INBOX_ERRORS = {
    pairing_rejected: "Phiên đăng nhập đã hết hạn. Anh mở ⚙ để đăng nhập lại nhé.",
    forbidden: "Máy chủ chưa cho máy này xem việc chờ. Anh bấm Mở JAVIS web để xem.",
    feature_denied: "Máy chủ chưa mở việc chờ cho máy này. Danh sách sẽ hiện khi máy chủ cập nhật xong. Anh vẫn duyệt được trên web.",
    rate_limited: "Máy chủ đang bận, em tự tải lại sau ít phút.",
    gateway_unreachable: "Chưa kết nối được máy chủ JAVIS (đã thử 3 lần rồi dừng). Kiểm tra mạng rồi bấm Làm mới.",
  };
  const STATUS = { todo: "chưa làm", doing: "đang làm", waiting: "chờ anh", pending: "chờ duyệt", waiting_approval: "đơn chờ duyệt" };
  const dueText = (sec) => {
    const d = new Date(sec * 1000);
    return `hạn ${hhmm(d.getTime())} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}${d.getTime() < Date.now() ? " (quá hạn)" : ""}`;
  };

  function renderInbox(s) {
    if (!s) return;
    const count = s.count || 0;
    badge("badge-inbox", count);
    const err = s.paired && s.error;
    show("inbox-error", !!err);
    if (err) {
      $("inbox-error").textContent = s.error === "rate_limited" && s.retryAt
        ? `Máy chủ đang bận, em tự tải lại lúc ${hhmm(s.retryAt)}.` : (INBOX_ERRORS[s.error] || `Lỗi: ${s.error}`);
    }
    $("inbox-refresh").disabled = !!(s.retryAt && s.retryAt > Date.now());
    show("inbox-empty", s.paired && s.loaded && !err && !count);
    $("inbox-sub").textContent = s.loading && !s.loaded ? "Đang tải…"
      : count ? `${count} việc${count > (s.shown || 0) ? ` · hiện ${s.shown}` : ""}${s.updatedAt ? ` · ${hhmm(s.updatedAt)}` : ""}` : "";
    const list = $("inbox-list");
    list.textContent = "";
    for (const it of s.items || []) {
      const li = el("li", "item" + (it.urgent ? " urgent" : ""));
      const t = el("div", "t");
      const b = el("b", "", it.title);
      b.title = it.title;
      const small = el("small");
      small.appendChild(el("span", "tag", it.kind === "approval" ? "Phiếu duyệt" : "Việc"));
      small.appendChild(document.createTextNode([it.urgent ? "gấp" : "", STATUS[it.status] || "", it.due ? dueText(it.due) : ""].filter(Boolean).join(" · ")));
      t.append(b, small);
      const open = el("button", "primary small", "Mở để duyệt");
      open.title = "Mở trên trình duyệt";
      open.onclick = () => tools.openWeb(it.webUrl);
      li.append(t, open);
      list.appendChild(li);
    }
  }

  // ── Cần anh duyệt: <javis-ask-box> (cùng component web) — trả lời ngay trong app, không văng ra web ──
  const WEB = "https://javis.bumbee.asia";
  let askbox = null;
  function mountAskbox() {
    if (askbox) return askbox;
    if (!document.querySelector("script[data-javis-askbox]")) {
      const s = document.createElement("script");
      s.type = "module";
      s.src = "ui/javis-ask-box.js";
      s.dataset.javisAskbox = "1";
      document.head.appendChild(s);
    }
    askbox = document.createElement("javis-ask-box");
    askbox.setAttribute("fleet", ""); // cùng origin javis-desk://app → proxy của app tự gắn token máy
    askbox.setAttribute("via", "desk");
    askbox.setAttribute("heading", "");
    // Thẻ gộp / phiếu: link sâu tới đúng thẻ trên web (mở sẵn hộp trả lời), mở bằng trình duyệt hệ thống.
    askbox.addEventListener("javis-ask-open-link", (e) => {
      e.preventDefault();
      const u = String((e.detail && e.detail.url) || "");
      void tools.openWeb(/^https?:\/\//.test(u) ? u : WEB + (u.startsWith("/") ? u : "/" + u));
    });
    askbox.addEventListener("javis-ask-count", (e) => badge("badge-inbox", (e.detail && e.detail.n) || 0));
    askbox.addEventListener("javis-ask-answered", () => { void tools.inboxRefresh().then(renderInbox); });
    $("askbox-host").appendChild(askbox);
    return askbox;
  }

  async function loadInbox() {
    const box = mountAskbox();
    if (box && typeof box.refresh === "function") box.refresh();
    renderInbox(await tools.inboxGet());
    // Opening the tab is a real user action; main keeps it to ≤ 1 call / minute.
    renderInbox(await tools.inboxRefresh());
  }

  // ── Báo cáo hôm nay ──
  function renderReport(r) {
    if (!r) return;
    if (r.loading) { $("report-text").textContent = "Đang lấy báo cáo…"; return; }
    reportLoaded = !r.empty;
    $("report-text").textContent = r.text || "";
    $("report-len").textContent = r.seconds ? `khoảng ${Math.round(r.seconds)} giây đọc` : "";
  }

  function renderSpeech(s) {
    if (!s) return;
    show("report-wave", !!s.speaking);
    if (s.speaking) spoke = true;
    $("report-voice").textContent = s.speaking ? `Đang đọc · ${s.label || ""}` : !spoke ? "Chưa đọc" : stoppedByUser ? "Đã dừng" : "Đọc xong";
    $("report-stop").disabled = !s.speaking;
    $("report-read").disabled = !!s.speaking;
  }

  async function loadReport(fresh) {
    renderReport({ loading: true });
    renderReport(await tools.reportFetch({ fresh }));
  }

  // ── AI Clipboard ──
  const CLIP_SETUP = {
    not_paired: "Cần đăng nhập JAVIS trước.",
    denied: "Máy chủ chưa mở AI Clipboard cho máy này. Sẽ dùng được khi máy chủ cập nhật xong.",
    offline: "Chưa kết nối được máy chủ JAVIS. Kiểm tra mạng rồi mở lại tab này.",
    no_clipboard: "Tài khoản chưa có AI Clipboard. Tạo ngay trên máy này (khoá mã hoá nằm trên máy).",
    need_key: "Máy này chưa nối vào AI Clipboard của anh. Dán link ghép từ máy đang dùng Clipboard.",
  };
  const ago = (sec) => {
    const d = Math.max(0, Date.now() / 1000 - (sec || 0));
    return d < 60 ? "vừa xong" : d < 3600 ? `${Math.round(d / 60)} phút trước` : d < 86400 ? `${Math.round(d / 3600)} giờ trước` : `${Math.round(d / 86400)} ngày trước`;
  };

  async function loadClipRecent() {
    const r = await tools.clipRecent();
    const ul = $("clip-recent");
    ul.textContent = "";
    if (!r || !r.ok) return;
    if (!r.items.length) { ul.appendChild(el("li", "muted", "Chưa có mục nào.")); return; }
    for (const it of r.items.slice(0, 5)) {
      const li = el("li", "item");
      const t = el("div", "t");
      t.append(el("b", "", it.kind === "locked" ? "(không mở được: khoá khác)" : it.big ? `(tệp lớn ${Math.round((it.size || 0) / 1024)} KB, mở cửa sổ đầy đủ)` : String(it.text || "").replace(/\s+/g, " ").slice(0, 140)),
        el("small", "", [it.pinned ? "ghim" : "", it.src, ago(it.at)].filter(Boolean).join(" · ")));
      li.appendChild(t);
      if (it.text) {
        const c = el("button", "small", "Chép");
        c.onclick = async () => { await tools.clipCopy(it.text); c.textContent = "Đã chép ✓"; setTimeout(() => { c.textContent = "Chép"; }, 1500); };
        li.appendChild(c);
      }
      ul.appendChild(li);
    }
  }

  async function loadClip() {
    const s = await tools.clipStatus();
    const st = (s && s.state) || "offline";
    show("clip-ready", st === "ready");
    show("clip-setup", st !== "ready");
    $("clip-setup-text").textContent = CLIP_SETUP[st] || CLIP_SETUP.offline;
    $("clip-sub").textContent = st === "ready" ? `Đã nối · ${s.devices || 0} máy${s.paused ? " · đang tạm dừng" : ""}` : "Chép ở máy này, dán ở máy kia";
    if (st === "ready") await loadClipRecent();
  }

  async function clipSend() {
    const btn = $("clip-send");
    btn.disabled = true;
    const r = await tools.clipSend($("clip-quick").value, { confirmed: clipSensitive });
    btn.disabled = false;
    if (r && r.ok) {
      clipSensitive = false;
      $("clip-quick").value = "";
      $("clip-msg").className = "muted msg ok";
      $("clip-msg").textContent = "Đã gửi ✓ Mở Clipboard ở máy kia là thấy.";
      await loadClipRecent();
      return;
    }
    clipSensitive = !!(r && r.sensitive);
    $("clip-msg").className = "muted msg warn";
    $("clip-msg").textContent = (r && r.error) || "Chưa gửi được.";
  }

  // ── Học tiếng Anh (local vocab store) ──
  async function loadEnglish() {
    const v = await home.vocab();
    if (!v) return;
    $("eng-due").textContent = String(v.due);
    $("eng-total").textContent = String(v.total);
    $("eng-mastered").textContent = String(v.mastered);
    badge("badge-english", v.due);
  }

  // ── Phiên đang chạy trên máy này (hook-tracked) ──
  const agoShort = (s) => (s < 60 ? "vừa xong" : s < 3600 ? `${Math.round(s / 60)} phút trước` : `${Math.round(s / 3600)} giờ trước`);
  async function loadSessions() {
    const rows = (await home.sessions()) || [];
    badge("badge-sessions", rows.length);
    show("sessions-empty", !rows.length);
    const ul = $("sessions-list");
    ul.textContent = "";
    for (const r of rows) {
      const li = el("li", "item");
      li.appendChild(el("span", `dot ${r.state}`));
      const t = el("div", "t");
      t.append(el("b", "", `${r.agent} · ${r.folder}`),
        el("small", "", [r.stateText, r.host ? `máy ${r.host}` : "", r.headless ? "chạy nền" : "", agoShort(r.ago)].filter(Boolean).join(" · ")));
      li.appendChild(t);
      if (r.canFocus) {
        const b = el("button", "small", "Tới cửa sổ");
        b.onclick = () => home.focusSession(r.key);
        li.appendChild(b);
      }
      ul.appendChild(li);
    }
  }

  // ── JAVIS OS: owner areas open on the web ──
  let webDrawn = false;
  async function loadWeb() {
    if (webDrawn) return;
    const pages = (await home.webPages()) || [];
    const box = $("web-pages");
    box.textContent = "";
    for (const p of pages) {
      const b = el("button", "big-card");
      b.dataset.page = p.id;
      b.title = p.url;
      b.append(el("b", "", p.title), el("small", "", p.hint), el("span", "web", "mở trên web ↗"));
      b.onclick = () => home.openWebPage(p.id);
      box.appendChild(b);
    }
    webDrawn = pages.length > 0;
  }

  // ── Wiring ──
  for (const b of document.querySelectorAll(".tile")) b.onclick = () => select(b.dataset.tab);
  $("inbox-refresh").onclick = async () => {
    if (askbox && typeof askbox.refresh === "function") askbox.refresh();
    renderInbox(await tools.inboxRefresh());
  };
  $("inbox-web").onclick = () => home.openWebPage("home");
  $("report-refresh").onclick = () => loadReport(true);
  $("report-read").onclick = async () => {
    stoppedByUser = false;
    $("report-read").disabled = true;
    const r = await tools.reportRead({ window: false });
    renderReport(r);
    if (r && r.ok === false) $("report-read").disabled = false;
  };
  $("report-stop").onclick = () => { stoppedByUser = true; void tools.reportStop(); };
  $("clip-setup-btn").onclick = () => home.openTool("clip");
  $("clip-full").onclick = () => home.openTool("clip");
  $("clip-from-sys").onclick = async () => { $("clip-quick").value = (await tools.clipReadSystem()) || ""; clipSensitive = false; $("clip-quick").focus(); };
  $("clip-send").onclick = clipSend;
  $("clip-quick").addEventListener("input", () => { clipSensitive = false; });
  $("clip-quick").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void clipSend(); } });
  for (const b of document.querySelectorAll("[data-vocab]")) b.onclick = () => home.openVocab(b.dataset.vocab);
  $("sessions-refresh").onclick = loadSessions;
  $("web-home").onclick = () => home.openWebPage("home");

  tools.onInbox(renderInbox);
  tools.onReport(renderReport);
  tools.onSpeech(renderSpeech);
  tools.onClipChanged(() => { if (tab === "clip") void loadClip(); });
  desk.onChatHealth(chatHealth);
  desk.onShowTab((t) => select(t));

  function onAuth(s) {
    chatHealth(s.chatHealth);
    const was = signedIn;
    signedIn = !!s.signedIn;
    if (signedIn && !was) {
      select(tab);
      // Badges without extra gateway calls: inbox snapshot is kept fresh by main; vocab/sessions are local.
      void tools.inboxGet().then(renderInbox);
      void loadEnglish();
      void home.sessions().then((rows) => badge("badge-sessions", (rows || []).length));
    }
    if (!signedIn) { clearInterval(sessionsTimer); sessionsTimer = null; }
  }
  window.addEventListener("javis-auth", (e) => onAuth(e.detail || {}));
  if (window.javisAuthState) onAuth(window.javisAuthState);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && tab === "sessions") void loadSessions(); });
})();
