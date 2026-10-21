"use strict";

const { app, BrowserWindow, screen, Menu, Tray, nativeImage } = require("electron");
const path = require("path");
const brand = require("./javis-brand");

const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";
const isLinux = process.platform === "linux";

// ── Linux XDG autostart helpers ──
const fs = require("fs");
const os = require("os");
const AUTOSTART_DIR = path.join(os.homedir(), ".config", "autostart");
const AUTOSTART_FILE = path.join(AUTOSTART_DIR, "clawd-on-desk.desktop");

function linuxGetOpenAtLogin() {
  try { return fs.existsSync(AUTOSTART_FILE); } catch { return false; }
}

function linuxSetOpenAtLogin(enable) {
  if (enable) {
    const projectDir = path.resolve(__dirname, "..");
    const launchScript = path.join(projectDir, "launch.js");
    const execCmd = app.isPackaged
      ? `"${process.env.APPIMAGE || app.getPath("exe")}"`
      : `node "${launchScript}"`;
    const desktop = [
      "[Desktop Entry]",
      "Type=Application",
      "Name=JAVIS",
      `Exec=${execCmd}`,
      "Hidden=false",
      "NoDisplay=false",
      "X-GNOME-Autostart-enabled=true",
    ].join("\n") + "\n";
    try {
      fs.mkdirSync(AUTOSTART_DIR, { recursive: true });
      fs.writeFileSync(AUTOSTART_FILE, desktop);
    } catch (err) {
      console.warn("Clawd: failed to write autostart entry:", err.message);
    }
  } else {
    try { fs.unlinkSync(AUTOSTART_FILE); } catch {}
  }
}
const WIN_TOPMOST_LEVEL = "pop-up-menu"; // above taskbar-level UI

// ── Window size presets (mirrored from main.js for resizeWindow) ──
const SIZES = {
  S: { width: 200, height: 200 },
  M: { width: 280, height: 280 },
  L: { width: 360, height: 360 },
};

const { translate, LANGS } = require("./i18n");

module.exports = function initMenu(ctx) {
  // ── Translation helper ──
  function t(key) {
    return translate(ctx.lang, key);
  }

  // ── Character skin menu item (shared by tray + context menu) ──
  function buildCharacterMenuItem() {
    const current = ctx.getCharacterSkin ? ctx.getCharacterSkin() : brand.DEFAULT_CHARACTER_SKIN;
    const builtinSkins = [
      { id: "clawd", labelKey: "characterClawd" },
      { id: "bunny", labelKey: "characterBunny" },
    ];

    const lists = ctx.listAvailableSkins ? ctx.listAvailableSkins() : { live2d: [], vrm: [] };

    const builtinItems = builtinSkins.map((s) => ({
      label: t(s.labelKey),
      type: "radio",
      checked: current === s.id,
      click: () => { ctx.setCharacterSkin(s.id); rebuildAllMenus(); },
    }));

    const hiyori = lists.live2d.find((s) => s.id === brand.DEFAULT_CHARACTER_SKIN);
    const hiyoriItems = hiyori
      ? [{
          label: t("characterHiyori"),
          type: "radio",
          checked: current === hiyori.id,
          click: () => { ctx.setCharacterSkin(hiyori.id); rebuildAllMenus(); },
        }]
      : [];
    // Live2D Free Material License: credit must be shown wherever the samples are offered.
    const live2dCreditItems = lists.live2d.some((s) => brand.isLive2DSampleSkin(s))
      ? [
          { label: brand.LIVE2D_CREDIT_SHORT, enabled: false },
          { label: brand.LIVE2D_CREDIT_VI, enabled: false },
        ]
      : [];

    const live2dItems = lists.live2d.length
      ? lists.live2d.map((s) => ({
          label: brand.isLive2DSampleSkin(s) ? `${brand.sampleDisplayName(s.name)} · ${t("live2dSample")}` : s.name,
          type: "radio",
          checked: current === s.id,
          click: () => { ctx.setCharacterSkin(s.id); rebuildAllMenus(); },
        }))
      : [{ label: t("characterEmpty"), enabled: false }];

    const vrmItems = lists.vrm.length
      ? lists.vrm.map((s) => ({
          label: s.name,
          type: "radio",
          checked: current === s.id,
          click: () => { ctx.setCharacterSkin(s.id); rebuildAllMenus(); },
        }))
      : [{ label: t("characterEmpty"), enabled: false }];

    return {
      label: t("character"),
      submenu: [
        ...hiyoriItems,
        ...builtinItems,
        { type: "separator" },
        { label: t("characterLive2D"), submenu: [...live2dItems, ...(live2dCreditItems.length ? [{ type: "separator" }, ...live2dCreditItems] : [])] },
        { label: t("characterVRM"), submenu: vrmItems },
        { type: "separator" },
        {
          label: t("characterAddLive2D"),
          click: () => { try { ctx.openSkinAssetsFolder && ctx.openSkinAssetsFolder("live2d"); } catch {} },
        },
        {
          label: t("characterAddVRM"),
          click: () => { try { ctx.openSkinAssetsFolder && ctx.openSkinAssetsFolder("vrm"); } catch {} },
        },
        ...(live2dCreditItems.length ? [{ type: "separator" }, ...live2dCreditItems] : []),
      ],
    };
  }

  // ── 0.12.0 top items: Việc chờ anh · Đọc báo cáo · AI Clipboard ──
  function inboxLabel() {
    const s = ctx.getInbox ? ctx.getInbox() : null;
    if (!s || !s.paired) return t("inboxNotPaired");
    return s.count ? t("inboxCount").replace("{n}", s.count) : t("inbox");
  }

  function buildToolItems() {
    const reading = !!(ctx.isReading && ctx.isReading());
    const clipAcc = ctx.getClipShortcut ? ctx.getClipShortcut() : "";
    return [
      {
        label: inboxLabel(),
        enabled: typeof ctx.openInbox === "function",
        click: () => { if (ctx.openInbox) ctx.openInbox(); },
      },
      reading
        ? { label: t("stopReading"), click: () => { if (ctx.stopReading) ctx.stopReading(); rebuildAllMenus(); } }
        : { label: t("readReport"), enabled: typeof ctx.readReport === "function", click: () => { if (ctx.readReport) ctx.readReport(); } },
      {
        // The real shortcut is global (registered in main). macOS shows it as a menu hint;
        // GTK/Windows menus can't show unregistered accelerators, so it goes in the label.
        label: clipAcc && !isMac ? `${t("aiClipboard")}   ${ctx.shortcutLabel(clipAcc)}` : t("aiClipboard"),
        enabled: typeof ctx.openClipboard === "function",
        ...(clipAcc && isMac ? { accelerator: clipAcc, registerAccelerator: false } : {}),
        click: () => { if (ctx.openClipboard) ctx.openClipboard(); },
      },
    ];
  }

  function buildClipShortcutMenuItem() {
    const current = ctx.getClipShortcut ? ctx.getClipShortcut() : "";
    const choices = ctx.clipShortcutChoices || [];
    return {
      label: t("clipShortcut"),
      submenu: choices.map((acc) => ({
        label: acc ? ctx.shortcutLabel(acc) : t("shortcutOff"),
        type: "radio",
        checked: current === acc,
        click: () => { if (ctx.setClipShortcut) ctx.setClipShortcut(acc); },
      })),
    };
  }

  function buildLanguageMenuItem() {
    return {
      label: t("language"),
      submenu: [
        { label: "Tiếng Việt", type: "radio", checked: ctx.lang === "vi", click: () => setLanguage("vi") },
        { label: "English", type: "radio", checked: ctx.lang === "en", click: () => setLanguage("en") },
        { label: "中文", type: "radio", checked: ctx.lang === "zh", click: () => setLanguage("zh") },
      ],
    };
  }

  // Signed out: "Đăng nhập JAVIS…". Signed in: "Đã đăng nhập: <email>" (opens Settings).
  function javisLoginItem() {
    const a = ctx.getJavisAuth ? ctx.getJavisAuth() : null;
    const label = a && a.signedIn
      ? t("javisSignedIn").replace("{email}", a.email || t("javisDeviceKey"))
      : t("javisLogin");
    return {
      label,
      enabled: typeof ctx.openJavisLogin === "function",
      click: () => { if (ctx.openJavisLogin) ctx.openJavisLogin(); },
    };
  }

  // ── JAVIS assistant items (shared by tray + context menu) ──
  function buildJavisItems() {
    return [
      ...buildToolItems(),
      { type: "separator" },
      {
        label: t("javisOpenChat"),
        enabled: typeof ctx.openJavisChat === "function",
        click: () => { if (ctx.openJavisChat) ctx.openJavisChat(); },
      },
      javisLoginItem(),
      {
        label: t("javisAbout"),
        enabled: typeof ctx.showAbout === "function",
        click: () => { if (ctx.showAbout) ctx.showAbout(); },
      },
    ];
  }

  // ── Rabbit Mode menu item (shared by tray + context menu) ──
  function buildRabbitMenuItem() {
    const enabled = ctx.getRabbitEnabled ? ctx.getRabbitEnabled() : false;
    const current = ctx.getRabbitIntervalMin ? ctx.getRabbitIntervalMin() : 60;
    const intervals = ctx.rabbitAllowedIntervals || [30, 60, 90, 120];
    return {
      label: t("rabbitMode"),
      submenu: [
        {
          label: t("rabbitMode"),
          type: "checkbox",
          checked: enabled,
          click: (menuItem) => {
            ctx.setRabbitEnabled(menuItem.checked);
            rebuildAllMenus();
          },
        },
        { type: "separator" },
        {
          label: t("rabbitInterval"),
          submenu: intervals.map((m) => ({
            label: t("rabbitMinutes").replace("{n}", m),
            type: "radio",
            checked: current === m,
            click: () => {
              ctx.setRabbitIntervalMin(m);
              rebuildAllMenus();
            },
          })),
        },
        { type: "separator" },
        {
          label: t("rabbitShowNow"),
          click: () => { try { ctx.rabbitShowNow && ctx.rabbitShowNow(); } catch {} },
        },
      ],
    };
  }

  // ── System tray ──
  function createTray() {
    if (ctx.tray) return;
    let icon;
    if (isMac) {
      icon = nativeImage.createFromPath(path.join(__dirname, "../assets/tray-iconTemplate.png"));
      icon.setTemplateImage(true);
    } else {
      icon = nativeImage.createFromPath(path.join(__dirname, "../assets/tray-icon.png")).resize({ width: 32, height: 32 });
    }
    ctx.tray = new Tray(icon);
    ctx.tray.setToolTip("JAVIS");
    buildTrayMenu();
  }

  function destroyTray() {
    if (!ctx.tray) return;
    ctx.tray.destroy();
    ctx.tray = null;
  }

  function setShowTray(val) {
    // Prevent disabling both Menu Bar and Dock — app would become unquittable
    if (!val && !ctx.showDock) return;
    ctx.showTray = val;
    if (ctx.showTray) {
      createTray();
    } else {
      destroyTray();
    }
    buildContextMenu();
    ctx.savePrefs();
  }

  function applyDockVisibility() {
    if (!isMac) return;
    if (ctx.showDock) {
      app.setActivationPolicy("regular");
      if (app.dock) app.dock.show();
    } else {
      app.setActivationPolicy("accessory");
      if (app.dock) app.dock.hide();
    }
    // dock.hide()/show() resets NSWindowCollectionBehavior — re-apply fullscreen visibility
    ctx.reapplyMacVisibility();
  }

  function setShowDock(val) {
    if (!isMac || !app.dock) return;
    // Prevent disabling both Dock and Menu Bar — app would become unquittable
    if (!val && !ctx.showTray) return;
    ctx.showDock = val;
    applyDockVisibility();
    buildTrayMenu();
    buildContextMenu();
    ctx.savePrefs();
  }

  function buildBumbeeMenuItem() {
    const gw = ctx.getGateway && ctx.getGateway();
    const bot = ctx.getClawdbot && ctx.getClawdbot();
    const skills = ctx.getSkills && ctx.getSkills();
    const smart = ctx.getSmart && ctx.getSmart();

    const stateLabel = (entry) => {
      if (!entry) return t("bumbeeStateOff");
      const s = entry.status();
      if (!s.enabled) return t("bumbeeStateDisabled");
      if (s.registered === true || s.connected === true) return t("bumbeeStateOk");
      return t("bumbeeStateOff");
    };

    const submenu = [
      {
        label: t("bumbeeOpenChat"),
        enabled: typeof ctx.openJavisChat === "function",
        click: () => {
          if (ctx.openJavisChat) ctx.openJavisChat();
        },
      },
      {
        label: t("javisEnglishCoach"),
        enabled: typeof ctx.openEnglishCoach === "function",
        click: () => {
          if (ctx.openEnglishCoach) ctx.openEnglishCoach();
        },
      },
      {
        label: t("bumbeeOpenOs"),
        enabled: typeof ctx.openBumbeeOs === "function",
        click: () => {
          if (ctx.openBumbeeOs) ctx.openBumbeeOs();
        },
      },
      {
        label: t("bumbeeOpenDashboard"),
        enabled: typeof ctx.openBumbeeDashboard === "function",
        click: () => {
          if (ctx.openBumbeeDashboard) ctx.openBumbeeDashboard();
        },
      },
      {
        label: t("bumbeeOpenVocab"),
        enabled: typeof ctx.openBumbeeVocab === "function",
        click: () => {
          if (ctx.openBumbeeVocab) ctx.openBumbeeVocab();
        },
      },
      {
        label: t("bumbeeOpenChallenge"),
        enabled: typeof ctx.openBumbeeChallenge === "function",
        click: () => {
          if (ctx.openBumbeeChallenge) ctx.openBumbeeChallenge();
        },
      },
      {
        label: t("bumbeeAutoChallenge"),
        type: "checkbox",
        checked: !!ctx.getVocabAutoChallenge?.(),
        click: (menuItem) => {
          if (ctx.setVocabAutoChallenge) ctx.setVocabAutoChallenge(menuItem.checked);
          if (menuItem.checked && ctx.openBumbeeChallenge) ctx.openBumbeeChallenge();
        },
      },
      {
        label: t("bumbeeAutoSource"),
        type: "checkbox",
        checked: !!ctx.getVocabAutoSource?.(),
        click: (menuItem) => { if (ctx.setVocabAutoSource) ctx.setVocabAutoSource(menuItem.checked); },
      },
      {
        label: t("bumbeeGrabClipboard"),
        enabled: typeof ctx.grabVocabClipboard === "function",
        click: () => { try { ctx.grabVocabClipboard && ctx.grabVocabClipboard(); } catch {} },
      },
      {
        label: t("bumbeeSyncTma"),
        enabled: typeof ctx.syncVocabTma === "function",
        click: () => { try { ctx.syncVocabTma && ctx.syncVocabTma(); } catch {} },
      },
      {
        label: t("bumbeeOpenPhaseHub"),
        enabled: typeof ctx.openBumbeePhaseHub === "function",
        click: () => {
          if (ctx.openBumbeePhaseHub) ctx.openBumbeePhaseHub();
        },
      },
      // Vision auto-capture (screenshots) is off and hidden by owner decision — no menu item.
      { type: "separator" },
      {
        label: t("bumbeeStatus"),
        click: () => {
          const { dialog } = require("electron");
          const lines = [];
          if (gw) {
            const s = gw.status();
            lines.push(t("bumbeeStatusGw").replace("{url}", s.baseUrl).replace("{state}",
              s.enabled ? (s.registered ? t("bumbeeStateOk") : t("bumbeeStateOff")) : t("bumbeeStateDisabled")));
          }
          if (bot) {
            const s = bot.status();
            lines.push(t("bumbeeStatusBot").replace("{url}", s.baseUrl).replace("{state}",
              s.enabled ? (s.connected ? t("bumbeeStateOk") : t("bumbeeStateOff")) : t("bumbeeStateDisabled")));
          }
          if (skills) {
            const s = skills.status();
            lines.push(t("bumbeeStatusSkills").replace("{n}", s.count));
          }
          if (smart) {
            const s = smart.status();
            lines.push(t("bumbeeStatusSmart")
              .replace("{state}", s.enabled ? t("bumbeeStateOk") : t("bumbeeStateDisabled"))
              .replace("{endpoint}", s.chatEndpoint));
          }
          lines.push("");
          lines.push(t("bumbeeSmartHint"));
          dialog.showMessageBox({
            type: "info",
            title: t("bumbeeStatusTitle"),
            message: t("bumbeeStatusTitle"),
            detail: lines.join("\n"),
            buttons: [t("ok")],
          });
        },
      },
      { type: "separator" },
      {
        label: t("bumbeeReloadSkills").replace("{n}", skills ? skills.count() : 0),
        enabled: !!skills,
        click: () => {
          if (skills) {
            const r = skills.reload();
            buildContextMenu();
            buildTrayMenu();
            try {
              const { dialog } = require("electron");
              dialog.showMessageBox({
                type: "info",
                title: t("bumbee"),
                message: t("bumbeeStatusSkills").replace("{n}", r.count),
                buttons: [t("ok")],
              });
            } catch {}
          }
        },
      },
      {
        label: t("bumbeeOpenSkillsFolder"),
        enabled: !!skills,
        click: () => {
          if (skills) {
            const { shell } = require("electron");
            shell.openPath(skills.status().dir);
          }
        },
      },
      { type: "separator" },
      {
        label: t("bumbeeRegister"),
        enabled: !!gw,
        click: () => {
          if (gw) gw.register().then(() => { buildContextMenu(); buildTrayMenu(); });
        },
      },
    ];

    const stateBadges = [
      gw ? `Gateway: ${stateLabel(gw)}` : null,
      bot ? `Clawdbot: ${stateLabel(bot)}` : null,
    ].filter(Boolean).join(" • ");

    return {
      label: stateBadges ? `${t("bumbee")} (${stateBadges})` : t("bumbee"),
      submenu,
    };
  }

  function buildTrayMenu() {
    if (!ctx.tray) return;
    const items = [
      ...buildJavisItems(),
      { type: "separator" },
      buildCharacterMenuItem(),
      { type: "separator" },
      {
        label: ctx.doNotDisturb ? t("wake") : t("sleep"),
        click: () => ctx.doNotDisturb ? ctx.disableDoNotDisturb() : ctx.enableDoNotDisturb(),
      },
      {
        label: t("bubbleFollow"),
        type: "checkbox",
        checked: ctx.bubbleFollowPet,
        click: (menuItem) => {
          ctx.bubbleFollowPet = menuItem.checked;
          if (ctx.pendingPermissions.length) ctx.repositionBubbles();
          buildContextMenu();
          buildTrayMenu();
          ctx.savePrefs();
        },
      },
      {
        label: t("hideBubbles"),
        type: "checkbox",
        checked: ctx.hideBubbles,
        click: (menuItem) => {
          ctx.hideBubbles = menuItem.checked;
          buildContextMenu();
          buildTrayMenu();
          ctx.savePrefs();
        },
      },
      {
        label: t("ghostMode"),
        type: "checkbox",
        checked: ctx.ghostMode,
        click: (menuItem) => {
          ctx.setGhostMode(menuItem.checked);
          buildContextMenu();
          buildTrayMenu();
        },
      },
      {
        label: t("assistantMode24x7"),
        type: "checkbox",
        checked: ctx.assistantMode24x7,
        click: (menuItem) => {
          ctx.setAssistantMode24x7(menuItem.checked);
          buildContextMenu();
          buildTrayMenu();
        },
      },
      buildRabbitMenuItem(),
      buildBumbeeMenuItem(),
      {
        label: t("showSessionId"),
        type: "checkbox",
        checked: ctx.showSessionId,
        click: (menuItem) => {
          ctx.showSessionId = menuItem.checked;
          buildContextMenu();
          buildTrayMenu();
          ctx.savePrefs();
        },
      },
      { type: "separator" },
      {
        label: t("startOnLogin"),
        type: "checkbox",
        checked: isLinux ? linuxGetOpenAtLogin() : app.getLoginItemSettings().openAtLogin,
        click: (menuItem) => {
          if (isLinux) {
            linuxSetOpenAtLogin(menuItem.checked);
          } else {
            app.setLoginItemSettings({ openAtLogin: menuItem.checked });
          }
          buildTrayMenu();
          buildContextMenu();
        },
      },
      {
        label: t("startWithClaude"),
        type: "checkbox",
        checked: ctx.autoStartWithClaude,
        click: (menuItem) => {
          ctx.autoStartWithClaude = menuItem.checked;
          try {
            const { registerHooks, unregisterAutoStart } = require("../hooks/install.js");
            if (ctx.autoStartWithClaude) {
              registerHooks({ silent: true, autoStart: true, port: ctx.getHookServerPort() });
            } else {
              unregisterAutoStart();
            }
          } catch (err) {
            console.warn("Clawd: failed to toggle auto-start hook:", err.message);
          }
          ctx.savePrefs();
          buildTrayMenu();
          buildContextMenu();
        },
      },
    ];
    // macOS: Dock and Menu Bar visibility toggles
    if (isMac) {
      items.push(
        { type: "separator" },
        {
          label: t("showInMenuBar"),
          type: "checkbox",
          checked: ctx.showTray,
          enabled: ctx.showTray ? ctx.showDock : true, // can't uncheck if Dock is already hidden
          click: (menuItem) => setShowTray(menuItem.checked),
        },
        {
          label: t("showInDock"),
          type: "checkbox",
          checked: ctx.showDock,
          enabled: ctx.showDock ? ctx.showTray : true, // can't uncheck if Menu Bar is already hidden
          click: (menuItem) => setShowDock(menuItem.checked),
        },
      );
    }
    items.push(
      { type: "separator" },
      ctx.getUpdateMenuItem(),
      { type: "separator" },
      buildLanguageMenuItem(),
      { type: "separator" },
      {
        label: ctx.petHidden ? t("showPet") : t("hidePet"),
        click: () => ctx.togglePetVisibility(),
      },
      {
        label: t("toggleShortcut").replace("{shortcut}", isMac ? "⌘⇧⌥C" : "Ctrl+Shift+Alt+C"),
        enabled: false,
      },
      buildClipShortcutMenuItem(),
      { type: "separator" },
      { label: t("quit"), click: () => requestAppQuit() },
    );
    ctx.tray.setContextMenu(Menu.buildFromTemplate(items));
  }

  function rebuildAllMenus() {
    buildTrayMenu();
    buildContextMenu();
  }

  function requestAppQuit() {
    ctx.isQuitting = true;
    app.quit();
  }

  function ensureContextMenuOwner() {
    if (ctx.contextMenuOwner && !ctx.contextMenuOwner.isDestroyed()) return ctx.contextMenuOwner;
    if (!ctx.win || ctx.win.isDestroyed()) return null;

    ctx.contextMenuOwner = new BrowserWindow({
      parent: ctx.win,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      focusable: true,
      closable: false,
      minimizable: false,
      maximizable: false,
      hasShadow: false,
    });

    // Give the 1×1 owner a document: a never-navigated window has no renderer, and
    // DevTools-based tools (the Playwright tester) wait on it forever.
    ctx.contextMenuOwner.loadURL("about:blank").catch(() => {});

    // macOS: ensure owner can appear on fullscreen Spaces
    ctx.reapplyMacVisibility();

    ctx.contextMenuOwner.on("close", (event) => {
      if (!ctx.isQuitting) {
        event.preventDefault();
        ctx.contextMenuOwner.hide();
      }
    });

    ctx.contextMenuOwner.on("closed", () => {
      ctx.contextMenuOwner = null;
    });

    return ctx.contextMenuOwner;
  }

  function popupMenuAt(menu) {
    if (ctx.menuOpen) return;
    const owner = ensureContextMenuOwner();
    if (!owner) return;

    const cursor = screen.getCursorScreenPoint();
    owner.setBounds({ x: cursor.x, y: cursor.y, width: 1, height: 1 });
    owner.show();
    owner.focus();

    ctx.menuOpen = true;
    menu.popup({
      window: owner,
      callback: () => {
        ctx.menuOpen = false;
        if (owner && !owner.isDestroyed()) owner.hide();
        if (ctx.win && !ctx.win.isDestroyed()) {
          ctx.win.showInactive();
          if (isMac) {
            ctx.reapplyMacVisibility();
          } else if (isWin) {
            ctx.win.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
          }
        }
      },
    });
  }

  function buildContextMenu() {
    const template = [
      ...buildJavisItems(),
      { type: "separator" },
      buildCharacterMenuItem(),
      { type: "separator" },
      {
        label: t("size"),
        submenu: [
          { label: t("small"), type: "radio", checked: ctx.currentSize === "S", click: () => resizeWindow("S") },
          { label: t("medium"), type: "radio", checked: ctx.currentSize === "M", click: () => resizeWindow("M") },
          { label: t("large"), type: "radio", checked: ctx.currentSize === "L", click: () => resizeWindow("L") },
        ],
      },
      { type: "separator" },
      {
        label: ctx.getMiniMode() ? t("exitMiniMode") : t("miniMode"),
        enabled: !ctx.getMiniTransitioning() && !(ctx.doNotDisturb && !ctx.getMiniMode()),
        click: () => ctx.getMiniMode() ? ctx.exitMiniMode() : ctx.enterMiniViaMenu(),
      },
      { type: "separator" },
      {
        label: ctx.doNotDisturb ? t("wake") : t("sleep"),
        click: () => ctx.doNotDisturb ? ctx.disableDoNotDisturb() : ctx.enableDoNotDisturb(),
      },
      {
        label: t("hideBubbles"),
        type: "checkbox",
        checked: ctx.hideBubbles,
        click: (menuItem) => {
          ctx.hideBubbles = menuItem.checked;
          buildContextMenu();
          buildTrayMenu();
          ctx.savePrefs();
        },
      },
      {
        label: t("ghostMode"),
        type: "checkbox",
        checked: ctx.ghostMode,
        click: (menuItem) => {
          ctx.setGhostMode(menuItem.checked);
          buildContextMenu();
          buildTrayMenu();
        },
      },
      {
        label: t("assistantMode24x7"),
        type: "checkbox",
        checked: ctx.assistantMode24x7,
        click: (menuItem) => {
          ctx.setAssistantMode24x7(menuItem.checked);
          buildContextMenu();
          buildTrayMenu();
        },
      },
      buildRabbitMenuItem(),
      buildBumbeeMenuItem(),
      { type: "separator" },
      {
        label: `${t("sessions")} (${ctx.sessions.size})`,
        submenu: ctx.buildSessionSubmenu(),
      },
    ];
    // macOS: Dock and Menu Bar visibility toggles
    if (isMac) {
      template.push(
        { type: "separator" },
        {
          label: t("showInMenuBar"),
          type: "checkbox",
          checked: ctx.showTray,
          enabled: ctx.showTray ? ctx.showDock : true, // can't uncheck if Dock is already hidden
          click: (menuItem) => setShowTray(menuItem.checked),
        },
        {
          label: t("showInDock"),
          type: "checkbox",
          checked: ctx.showDock,
          enabled: ctx.showDock ? ctx.showTray : true, // can't uncheck if Menu Bar is already hidden
          click: (menuItem) => setShowDock(menuItem.checked),
        },
      );
    }
    template.push(
      { type: "separator" },
      buildLanguageMenuItem(),
      buildClipShortcutMenuItem(),
      {
        label: t("toggleShortcut").replace("{shortcut}", isMac ? "⌘⇧⌥C" : "Ctrl+Shift+Alt+C"),
        enabled: false,
      },
      { type: "separator" },
      { label: t("quit"), click: () => requestAppQuit() },
    );
    ctx.contextMenu = Menu.buildFromTemplate(template);
  }

  function showPetContextMenu() {
    if (!ctx.win || ctx.win.isDestroyed()) return;
    buildContextMenu();
    popupMenuAt(ctx.contextMenu);
  }

  function setLanguage(newLang) {
    if (!LANGS.includes(newLang)) return;
    ctx.lang = newLang;
    rebuildAllMenus();
    ctx.savePrefs();
  }

  function resizeWindow(sizeKey) {
    ctx.currentSize = sizeKey;
    const size = SIZES[sizeKey];
    if (!ctx.miniHandleResize(sizeKey)) {
      if (ctx.win && !ctx.win.isDestroyed()) {
        const { x, y } = ctx.win.getBounds();
        const clamped = ctx.clampToScreen(x, y, size.width, size.height);
        ctx.win.setBounds({ ...clamped, width: size.width, height: size.height });
      }
    }
    if (ctx.bubbleFollowPet && ctx.pendingPermissions.length) ctx.repositionBubbles();
    buildContextMenu();
    ctx.savePrefs();
  }

  return {
    t,
    buildContextMenu,
    buildTrayMenu,
    rebuildAllMenus,
    createTray,
    destroyTray,
    setShowTray,
    applyDockVisibility,
    setShowDock,
    ensureContextMenuOwner,
    popupMenuAt,
    showPetContextMenu,
    setLanguage,
    resizeWindow,
    requestAppQuit,
  };
};
