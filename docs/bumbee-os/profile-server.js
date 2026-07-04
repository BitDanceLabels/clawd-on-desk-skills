// bumbee-os-profile.js — Hồ sơ đam mê web ⇄ Bumbee On Desk (MVP, zero-dependency Node)
// GET  /bumbee-os/               → form web (key trong ?key=, không có thì cho tạo mới)
// POST /bumbee-os/api/new        → { key }  (tạo hồ sơ mới, key = private link)
// GET  /bumbee-os/api/profile?key=K
// POST /bumbee-os/api/profile?key=K  body {profile:{...}}
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = 18915;
const DATA = path.join(__dirname, "data");
fs.mkdirSync(DATA, { recursive: true });

const FIELDS = ["profession", "passions", "books", "subjects", "facebook", "linkedin", "youtube", "website", "cv_link", "cv_text"];
const keyOk = (k) => /^[a-f0-9]{24,64}$/.test(String(k || ""));
const fileOf = (k) => path.join(DATA, k + ".json");

function readBody(req) {
  return new Promise((res, rej) => {
    let b = "";
    req.on("data", (c) => { b += c; if (b.length > 200000) { rej(new Error("too big")); req.destroy(); } });
    req.on("end", () => res(b));
    req.on("error", rej);
  });
}

const FORM_HTML = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>🐝 Hồ sơ đam mê — Bumbee OS</title><style>
:root{--brand:#f4c842;--bg:#10151f;--card:#182130;--line:#2a3547;--text:#eef2f8;--muted:#93a1b5;--ok:#35c88a}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Segoe UI",system-ui,sans-serif;background:linear-gradient(160deg,#0c1018,#131b2e);color:var(--text);min-height:100vh;display:flex;justify-content:center;padding:24px 12px}
.card{width:100%;max-width:560px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:24px;display:flex;flex-direction:column;gap:12px;height:fit-content}
h1{font-size:20px;margin:0}h1 span{color:var(--brand)}
p.sub{font-size:13px;color:var(--muted);margin:0;line-height:1.5}
label{font-size:12px;font-weight:700;color:var(--brand);display:block;margin-bottom:3px}
input,textarea{width:100%;background:#131b27;border:1px solid var(--line);color:var(--text);border-radius:9px;padding:9px 12px;font-size:14px;outline:none;font-family:inherit}
input:focus,textarea:focus{border-color:var(--brand)}textarea{resize:vertical;min-height:52px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.btn{cursor:pointer;border-radius:10px;font-size:14px;padding:11px 16px;border:1px solid var(--line);background:#131b27;color:var(--text)}
.btn.primary{background:var(--brand);color:#1a1205;font-weight:700;border-color:var(--brand)}
.status{font-size:13px;color:var(--muted);min-height:16px}.status.ok{color:var(--ok)}
.keybox{font-size:12px;color:var(--muted);background:#131b27;border:1px dashed var(--line);border-radius:9px;padding:8px 10px;word-break:break-all}
@media(max-width:520px){.row{grid-template-columns:1fr}}
</style></head><body><div class="card">
<h1>🐝 Hồ sơ đam mê — <span>AI hiểu bạn, dạy đúng cái bạn cần</span></h1>
<p class="sub">Chia sẻ nghề nghiệp, đam mê, link mạng xã hội và CV — AI Bumbee sẽ định kỳ biên soạn từ vựng + mẫu câu giao tiếp đúng lĩnh vực của bạn, đồng bộ với app <b>Bumbee On Desk</b>.</p>
<div id="newBox" style="display:none"><button class="btn primary" id="newBtn">✨ Tạo hồ sơ mới</button></div>
<div id="form" style="display:none;flex-direction:column;gap:12px">
<div><label>💼 Nghề nghiệp / lĩnh vực</label><input id="profession"/></div>
<div><label>🔥 Đam mê & sở thích</label><textarea id="passions"></textarea></div>
<div><label>📚 Sách / thư viện yêu thích</label><textarea id="books"></textarea></div>
<div><label>🎯 Môn / chủ đề muốn giỏi</label><textarea id="subjects"></textarea></div>
<div class="row">
<div><label>Facebook</label><input id="facebook"/></div>
<div><label>LinkedIn</label><input id="linkedin"/></div>
<div><label>YouTube</label><input id="youtube"/></div>
<div><label>Website</label><input id="website"/></div>
</div>
<div><label>📎 Link CV (Google Drive...)</label><input id="cv_link"/></div>
<div><label>📄 Hoặc dán nội dung CV vào đây</label><textarea id="cv_text" style="min-height:90px" placeholder="Copy toàn bộ chữ trong CV dán vào — AI sẽ đọc để soạn đúng kinh nghiệm của bạn"></textarea></div>
<button class="btn primary" id="saveBtn">💾 Lưu hồ sơ</button>
<div class="status" id="status"></div>
<div class="keybox">🔑 Link riêng của bạn (lưu lại để sửa sau / dán vào Bumbee On Desk):<br/><b id="myLink"></b></div>
</div>
<script>
const F=${JSON.stringify(FIELDS)};
const q=new URLSearchParams(location.search);let key=q.get("key")||localStorage.getItem("bumbeeOsKey")||"";
const $=id=>document.getElementById(id);
function showForm(){$("form").style.display="flex";$("newBox").style.display="none";$("myLink").textContent=location.origin+"/bumbee-os/?key="+key}
async function load(){
 if(!key){$("newBox").style.display="block";return}
 localStorage.setItem("bumbeeOsKey",key);showForm();
 try{const r=await fetch("/bumbee-os/api/profile?key="+key);const d=await r.json();
  if(d.ok&&d.profile)F.forEach(f=>{const el=$(f);if(el)el.value=d.profile[f]||""});
  if(d.updated_at)$("status").textContent="Cập nhật lần cuối: "+d.updated_at.slice(0,16).replace("T"," ");
 }catch(e){}}
$("newBtn").onclick=async()=>{const r=await fetch("/bumbee-os/api/new",{method:"POST"});const d=await r.json();if(d.key){key=d.key;history.replaceState(null,"","?key="+key);localStorage.setItem("bumbeeOsKey",key);showForm()}};
$("saveBtn").onclick=async()=>{
 const profile={};F.forEach(f=>{const el=$(f);if(el)profile[f]=el.value.trim()});
 $("status").textContent="Đang lưu…";$("status").className="status";
 try{const r=await fetch("/bumbee-os/api/profile?key="+key,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({profile})});
  const d=await r.json();$("status").textContent=d.ok?"✓ Đã lưu! Bumbee On Desk sẽ tự nhận hồ sơ này, AI biên soạn từ vựng định kỳ.":"✗ Lỗi lưu";$("status").className="status "+(d.ok?"ok":"");
 }catch(e){$("status").textContent="✗ Mất kết nối"}};
load();
</script></div></body></html>`;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const send = (code, obj, type) => {
    res.writeHead(code, { "content-type": type || "application/json; charset=utf-8" });
    res.end(type ? obj : JSON.stringify(obj));
  };
  try {
    if (u.pathname === "/bumbee-os/" || u.pathname === "/bumbee-os") {
      return send(200, FORM_HTML, "text/html; charset=utf-8");
    }
    if (u.pathname === "/bumbee-os/api/new" && req.method === "POST") {
      const key = crypto.randomBytes(16).toString("hex");
      fs.writeFileSync(fileOf(key), JSON.stringify({ profile: {}, updated_at: new Date().toISOString() }));
      return send(200, { ok: true, key });
    }
    if (u.pathname === "/bumbee-os/api/profile") {
      const key = u.searchParams.get("key");
      if (!keyOk(key)) return send(400, { ok: false, reason: "bad key" });
      if (req.method === "GET") {
        if (!fs.existsSync(fileOf(key))) return send(200, { ok: true, profile: {}, updated_at: null });
        return send(200, { ok: true, ...JSON.parse(fs.readFileSync(fileOf(key), "utf8")) });
      }
      if (req.method === "POST" || req.method === "PUT") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const clean = {};
        for (const f of FIELDS) clean[f] = String((body.profile || {})[f] || "").slice(0, f === "cv_text" ? 8000 : 600);
        fs.writeFileSync(fileOf(key), JSON.stringify({ profile: clean, updated_at: new Date().toISOString() }));
        return send(200, { ok: true });
      }
    }
    send(404, { ok: false, reason: "not found" });
  } catch (e) {
    send(500, { ok: false, reason: String(e && e.message || e).slice(0, 100) });
  }
});
server.listen(PORT, "127.0.0.1", () => console.log("bumbee-os-profile on", PORT));
