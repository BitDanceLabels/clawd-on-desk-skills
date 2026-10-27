// src/net-recover.js — mạng đổi (Wi-Fi/Tailscale, máy ngủ dậy, mở khoá) làm Chromium giữ kết nối/DNS cũ:
// mọi net.fetch sau đó báo net::ERR_FAILED tới khi tắt mở app (21/10: chat báo "đang bận" vì refresh hỏng mãi).
// Gặp lỗi mạng → đóng kết nối cũ + xoá cache DNS rồi thử lại đúng 1 lần.
const NET_ERROR = /net::ERR_|Failed to fetch|ECONNRESET|ENOTFOUND|ETIMEDOUT/i;
const RESET_MIN_GAP_MS = 10 * 1000;

function createNetRecover({ getSession, fetchImpl, now = () => Date.now(), log = () => {} }) {
  let lastReset = 0;

  async function reset(reason) {
    if (now() - lastReset < RESET_MIN_GAP_MS) return false;
    lastReset = now();
    try {
      const ses = getSession();
      if (ses && typeof ses.closeAllConnections === "function") await ses.closeAllConnections();
      if (ses && typeof ses.clearHostResolverCache === "function") await ses.clearHostResolverCache();
      log(`net: reset connections (${reason})`);
      return true;
    } catch (err) {
      log(`net: reset failed: ${err && err.message}`);
      return false;
    }
  }

  async function fetchWithRecover(url, init) {
    try {
      return await fetchImpl(url, init);
    } catch (err) {
      const aborted = err && (err.name === "AbortError" || (init && init.signal && init.signal.aborted));
      if (aborted || !NET_ERROR.test(String(err && err.message))) throw err;
      if (!(await reset(String(err.message).slice(0, 60)))) throw err;
      return fetchImpl(url, init);
    }
  }

  return { fetch: fetchWithRecover, reset };
}

module.exports = { createNetRecover, NET_ERROR, RESET_MIN_GAP_MS };
