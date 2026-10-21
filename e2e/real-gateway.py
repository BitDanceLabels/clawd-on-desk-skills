"""Gateway THẬT (services/fleet/fleet.py của nhánh đang thử) cho tester đầu-cuối app JAVIS On Desk.
- DB/HOME tạm (BUMBEE_FLEET_HOME), không đụng dữ liệu thật.
- Tạo chủ nhân + 1 thành viên trong DB test, in cookie phiên web giả ra <out>/cookies.json.
- LLM giọng và TTS là GIẢ (không gọi AI thật — luật bảo vệ tài khoản AI).
Chạy (tester-real-gateway.js tự gọi): python3 -I e2e/real-gateway.py <repo>/services/fleet <port> <outdir>
"""
import json, os, sys, tempfile, threading
from pathlib import Path

fleet_dir, port, out = sys.argv[1], int(sys.argv[2]), Path(sys.argv[3])
home = tempfile.mkdtemp(prefix="javis-e2e-gw-")
os.environ.update(BUMBEE_FLEET_HOME=home, BUMBEE_FLEET_TOKEN="e2e-owner-token-not-used-by-app",
                  JAVIS_OWNER_EMAILS="owner@demo.test", BUMBEE_FLEET_WEB=str(Path(fleet_dir).parents[1] / "apps" / "web" / "public"),
                  JAVIS_DESKTOP_PUBLIC_BASE=f"http://127.0.0.1:{port}", JAVIS_CHAT_SUMMARY="heuristic")
sys.path.insert(0, fleet_dir)
import fleet as F  # noqa: E402
import accounts as A  # noqa: E402

AI_CALLS = {"voice_chat": 0, "tts": 0}


def fake_proxy(handler, req, fallback=None, breaker_key=None, fail_extra=None):
    AI_CALLS["voice_chat"] += 1
    body = json.loads(req.data or b"{}")
    if body.get("stream"):
        handler.send_response(200); handler.send_header("Content-Type", "text/event-stream"); handler.end_headers()
        handler.wfile.write(b'data: {"choices":[{"delta":{"content":"D\xe1\xba\xa1 em nghe (LLM gi\xe1\xba\xa3)"}}]}\n\ndata: [DONE]\n\n')
        return None
    return handler._json(200, {"choices": [{"message": {"content": "Dạ em nghe (LLM giả)"}}]})


def fake_tts(text, b, cfg, breaker):
    AI_CALLS["tts"] += 1
    return "primary", "audio/wav", b"RIFF\x24\x00\x00\x00WAVEfmt " + b"\x00" * 24


F.Handler._proxy = fake_proxy
F.tts_fallback.resolve = fake_tts

acc = F.ACCOUNTS
with acc._lock:
    acc._ensure_customer_ws() if hasattr(acc, "_ensure_customer_ws") else None
    owner = acc._upsert_user("owner@demo.test", "sub-owner", "Anh Nhựt (test)", "")
    acc._set_member(owner["id"], A.ROOT_WS, "owner")
    member = acc._upsert_user("member@demo.test", "sub-member", "Thành viên (test)", "")
    acc._set_member(member["id"], A.ROOT_WS, "member")
    cookies = {"owner": f"{A.SESSION_COOKIE}={acc._new_session(owner['id'], 'e2e')}",
               "member": f"{A.SESSION_COOKIE}={acc._new_session(member['id'], 'e2e')}"}
out.mkdir(parents=True, exist_ok=True)
(out / "cookies.json").write_text(json.dumps({**cookies, "home": home}))


class Ctl(F.Handler):
    def do_GET(self):  # noqa: N802
        if self.path == "/__e2e/ai-calls":
            return self._json(200, AI_CALLS)
        return super().do_GET()


srv = F.ThreadingHTTPServer(("127.0.0.1", port), Ctl)
print(f"real gateway on {port} home={home}", flush=True)
threading.Thread(target=srv.serve_forever, daemon=True).start()
threading.Event().wait()
