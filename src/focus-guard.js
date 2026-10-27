// src/focus-guard.js — pop-up JAVIS tự hiện (không do anh bấm) không được giành con trỏ khi anh đang gõ/chat.
// Anh vừa gõ phím hoặc rê chuột trong BUSY_IDLE_SEC giây → coi là đang làm việc: hoãn pop-up, lần kiểm sau hiện.
const BUSY_IDLE_SEC = 30;

function createFocusGuard({ powerMonitor, idleSec = BUSY_IDLE_SEC } = {}) {
  function isUserBusy() {
    try { return powerMonitor.getSystemIdleTime() < idleSec; } catch { return false; }
  }
  return { isUserBusy };
}

module.exports = { createFocusGuard, BUSY_IDLE_SEC };
