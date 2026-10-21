const { test } = require("node:test");
const assert = require("node:assert");
const { createFocusGuard, BUSY_IDLE_SEC } = require("../src/focus-guard");

const pm = (idle) => ({ getSystemIdleTime: () => idle });

test("anh vừa gõ (idle < 30s) → đang bận, pop-up tự nảy phải chờ", () => {
  assert.strictEqual(createFocusGuard({ powerMonitor: pm(0) }).isUserBusy(), true);
  assert.strictEqual(createFocusGuard({ powerMonitor: pm(BUSY_IDLE_SEC - 1) }).isUserBusy(), true);
});

test("anh ngừng tay ≥ 30s → được hiện", () => {
  assert.strictEqual(createFocusGuard({ powerMonitor: pm(BUSY_IDLE_SEC) }).isUserBusy(), false);
});

test("không đọc được idle → không chặn (giữ hành vi cũ)", () => {
  const broken = { getSystemIdleTime: () => { throw new Error("x"); } };
  assert.strictEqual(createFocusGuard({ powerMonitor: broken }).isUserBusy(), false);
});
