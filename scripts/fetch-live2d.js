#!/usr/bin/env node
// scripts/fetch-live2d.js — tải nhân vật Live2D + Cubism Core từ NGUỒN CHÍNH CHỦ vào assets/live2d/ lúc build.
//
// Vì sao không commit: repo này công khai; Live2D Free Material License cấm phát tán lại file model gốc
// đứng riêng (chỉ được phân phối khi nằm trong sản phẩm), Cubism Core là "Redistributable Code" đi kèm app.
// Nên file chỉ được tải về máy build rồi đóng vào JAVIS.app/.exe. Có rồi + đúng sha256 thì bỏ qua.
//   Model: github.com/Live2D/CubismWebSamples @ b1de66b (Samples/Resources/{Mao,Hiyori}), Free Material License
//   Core:  cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js (5.1.0), Live2D Proprietary Software License
// Thử tối đa 3 lần mỗi file, giãn cách tăng dần, rồi dừng báo lỗi.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..", "assets", "live2d");
const SAMPLES = "https://raw.githubusercontent.com/Live2D/CubismWebSamples/b1de66b0b1f1cb881d95fb6158622aeb6a2827bd/Samples/Resources";
const CORE = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";
const FILES = [
  ["core/live2dcubismcore.min.js", "25ae938cb4fe282ce189b357bcc97e603d1e1f7ec78bf04150d401c23cdc792f"],
  ["hiyori/Hiyori.2048/texture_00.png", "560aea0d910dc04950d669640b2ef17c0d817969e9909f477f166bb5cbd8ffbe"],
  ["hiyori/Hiyori.2048/texture_01.png", "87fe9ab7db81ab3025e0407229e449233581e00fa92c8e911923bc6c7d98ce84"],
  ["hiyori/Hiyori.cdi3.json", "0fc3fc76b7a68136056c8832c930c8af9f93899f359eded7349b481ea2342d03"],
  ["hiyori/Hiyori.moc3", "0323f5f377b9afef54318be09e9b4eea2a8cb266190ff9d2f843f95ecb77716c"],
  ["hiyori/Hiyori.model3.json", "973cb3392f7b01f5f73e9d3fedc495a81a0f3ee8014e5df72ef943311c56ee12"],
  ["hiyori/Hiyori.physics3.json", "c7a6d641893519c0bbc615545887f03f6c5b8031b4096873740b618370452fc1"],
  ["hiyori/Hiyori.pose3.json", "ff1cc242790f196c87a7379dc1340b608723db60af1b2825e00da8f351ffc1bf"],
  ["hiyori/Hiyori.userdata3.json", "75fe50a89ea695b46c98dce8991c2f3d67e3d7a479786e6310460289b552d29b"],
  ["hiyori/motions/Hiyori_m01.motion3.json", "c4f0d982c685b81c1af0ced96c8f6bd5118b8a3fa972c3a12a46652b8d78461d"],
  ["hiyori/motions/Hiyori_m02.motion3.json", "858c582874a0c4badfec38d4caf19e232fea5ba714f5a2ac6a282c617910c154"],
  ["hiyori/motions/Hiyori_m03.motion3.json", "de33a8ce78226a5ff80cfa941fb5a4c50b6c1c4b346031ed44b384f772b62cf9"],
  ["hiyori/motions/Hiyori_m04.motion3.json", "54ddb94d0494772e10355429c547bb7e29601f38d663087804b0c793b29cc51f"],
  ["hiyori/motions/Hiyori_m05.motion3.json", "7f71061c9207ac1da6e06098ede9318307a7e75715a3ef97c82646acd9ee8620"],
  ["hiyori/motions/Hiyori_m06.motion3.json", "55c007646febe4cb76d20cbb0623086986dbb55c7ef82212693a5e26636a32ef"],
  ["hiyori/motions/Hiyori_m07.motion3.json", "3f06cb70f5654eed3389978885e4dff151b6cf9e8d59248680addcd267ff793a"],
  ["hiyori/motions/Hiyori_m08.motion3.json", "66022fff5cff3c30b7fc1295bf92e4975e3ab9980d5cb296b5e24a2a8acc6daf"],
  ["hiyori/motions/Hiyori_m09.motion3.json", "9edbd6a88e977221fa90625b5f94c9fd27212e1183288105584be8272543ade7"],
  ["hiyori/motions/Hiyori_m10.motion3.json", "ba0ba6764a80459432ffd48d6bd5ba261fd25f196208ade3016be74efb9d3dfc"],
  ["mao/expressions/exp_01.exp3.json", "afbe54559e428acdaf43190d1c497792048c35ed37979f33d9a37c70181ddf5b"],
  ["mao/expressions/exp_02.exp3.json", "6d35132627f9e362e526c0ce8c2152ece2b305c9abd3368da43460c2af8538f6"],
  ["mao/expressions/exp_03.exp3.json", "460a3077d61adfdd1e6b9a062d0d7c3fcc2fb74c80f67ec3649982a9fab49bee"],
  ["mao/expressions/exp_04.exp3.json", "abad61f4ec7f1a157d6b914643e5bd4ffb29964e67f538cace420ebc9f69a716"],
  ["mao/expressions/exp_05.exp3.json", "331fe0d9c78861496a9cc9acba9650f295a72af8c36df7036ab8a372840d2cc1"],
  ["mao/expressions/exp_06.exp3.json", "52f1e391008d61efb17a33602c004a637a42bdb8af8aca3d2319ac5dac215ed1"],
  ["mao/expressions/exp_07.exp3.json", "8bf587d3d7bef509166c8ff95cc9f47c23c895eaf55f9d95110263e44452a53a"],
  ["mao/expressions/exp_08.exp3.json", "761190452e48d22727fce91e76270af2c27b0bb0ee3d04b2c6b0dc6cec49f88d"],
  ["mao/Mao.2048/texture_00.png", "0b97283d69e62d346bcca25f8a91a5dd477f2e668ad9801b15fa7f108631c624"],
  ["mao/Mao.cdi3.json", "f261069f302c013f1c60b48045aa4bf5ac2cb086ebb54917f7e5c3f47e5c8f81"],
  ["mao/Mao.moc3", "ad5195b39e35e0da8ba0c825ad9cc2d60571502007f6f7d4f00963b768bb90d8"],
  ["mao/Mao.model3.json", "d5fb29f93ef3cf3eba96b5aa9538eca063abbebee81a8d2dbeecea0cef4fecba"],
  ["mao/Mao.physics3.json", "27de73695ca6418a84953a0b2776e78160f9d0b988521e9bbfa02ff913f20a6d"],
  ["mao/Mao.pose3.json", "efac160eccb7183ee6555d4e53a739042e1c55b92f59a99c2e4bed8e73a5ab91"],
  ["mao/motions/mtn_01.motion3.json", "4a17c9b0b4ffd42ee5b8386cba0ae18916953ac693d79f44cd831bf5d59877f6"],
  ["mao/motions/mtn_02.motion3.json", "aa8c78c03f1d5fe143eedecfb7d077e7e4a7804c93723ba661eef2dd6a5d5ae0"],
  ["mao/motions/mtn_03.motion3.json", "e31eab8c371a253322c68968dbe5895e3029562f31a5b8d277012e94b0a6badd"],
  ["mao/motions/mtn_04.motion3.json", "a95f67d35c81755dee7f3be1e5e60171f090026725f628c99a1e3585985a1ac1"],
  ["mao/motions/sample_01.motion3.json", "21293d1d7c91f8d8b055f5215274df663e345a198517ebf8e3d26613ba37324a"],
  ["mao/motions/special_01.motion3.json", "141320d2e8913097156bf61aa2c27cd51ffcf8ba5d288172da288d2afcc164db"],
  ["mao/motions/special_02.motion3.json", "68e6e12c14d2c06504891971dcdce7771637aedbda9ef5edc616fd4f6972d20c"],
  ["mao/motions/special_03.motion3.json", "fe6b990b6d26a48955c0b33e27c3de8e020c98d2d06be41dcdfecdd053e6dd0f"]
];

function urlFor(rel) {
  if (rel.startsWith("core/")) return CORE;
  const [model, ...rest] = rel.split("/");
  const dir = model === "mao" ? "Mao" : model === "hiyori" ? "Hiyori" : model;
  return `${SAMPLES}/${dir}/${rest.join("/")}`;
}
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(url) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      last = err;
      await sleep(1000 * 2 ** i);
    }
  }
  throw new Error(`${url}: ${last && last.message}`);
}

async function main() {
  let got = 0;
  for (const [rel, want] of FILES) {
    const file = path.join(ROOT, ...rel.split("/"));
    if (fs.existsSync(file) && sha(fs.readFileSync(file)) === want) continue;
    const buf = await download(urlFor(rel));
    const have = sha(buf);
    if (have !== want) {
      throw new Error(`${rel}: sha256 ${have} ≠ ${want} — nguồn chính chủ đã đổi file; kiểm bản mới rồi cập nhật bảng FILES`);
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    got++;
  }
  console.log(`[live2d] ${FILES.length} file sẵn sàng${got ? ` (tải mới ${got})` : ""}`);
}

if (require.main === module) {
  main().catch((err) => { console.error("[live2d] LỖI:", err.message); process.exit(1); });
}
module.exports = { FILES, urlFor };
