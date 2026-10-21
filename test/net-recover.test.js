const { test } = require("node:test");
const assert = require("node:assert");
const { createNetRecover, RESET_MIN_GAP_MS } = require("../src/net-recover");

function setup(results) {
  let t = 1_000_000;
  const calls = { fetch: 0, close: 0, dns: 0 };
  const ses = { closeAllConnections: async () => { calls.close++; }, clearHostResolverCache: async () => { calls.dns++; } };
  const fetchImpl = async () => {
    const r = results[calls.fetch++];
    if (r instanceof Error) throw r;
    return r;
  };
  const nr = createNetRecover({ getSession: () => ses, fetchImpl, now: () => t });
  return { nr, calls, advance: (ms) => { t += ms; } };
}

test("net::ERR_FAILED → đóng kết nối cũ + xoá DNS rồi thử lại 1 lần thành công", async () => {
  const { nr, calls } = setup([new Error("net::ERR_FAILED"), { ok: true }]);
  assert.deepStrictEqual(await nr.fetch("https://gw/x", {}), { ok: true });
  assert.deepStrictEqual(calls, { fetch: 2, close: 1, dns: 1 });
});

test("vẫn lỗi sau khi làm mới → báo lỗi, chỉ thử lại đúng 1 lần", async () => {
  const { nr, calls } = setup([new Error("net::ERR_FAILED"), new Error("net::ERR_FAILED")]);
  await assert.rejects(nr.fetch("https://gw/x", {}), /ERR_FAILED/);
  assert.strictEqual(calls.fetch, 2);
});

test("làm mới tối đa 1 lần / 10 giây (không dồn dập)", async () => {
  const { nr, calls, advance } = setup([new Error("net::ERR_FAILED"), { ok: 1 }, new Error("net::ERR_FAILED"), new Error("net::ERR_FAILED"), { ok: 2 }]);
  await nr.fetch("u", {});
  await assert.rejects(nr.fetch("u", {}), /ERR_FAILED/);  // trong 10s: không làm mới lại
  assert.strictEqual(calls.close, 1);
  advance(RESET_MIN_GAP_MS);
  assert.deepStrictEqual(await nr.fetch("u", {}), { ok: 2 });
  assert.strictEqual(calls.close, 2);
});

test("lỗi không phải mạng hoặc huỷ yêu cầu → không làm mới, ném nguyên lỗi", async () => {
  const { nr, calls } = setup([new Error("boom")]);
  await assert.rejects(nr.fetch("u", {}), /boom/);
  const ab = Object.assign(new Error("net::ERR_ABORTED"), { name: "AbortError" });
  const s2 = setup([ab]);
  await assert.rejects(s2.nr.fetch("u", {}), /ERR_ABORTED/);
  assert.strictEqual(calls.close + s2.calls.close, 0);
});
