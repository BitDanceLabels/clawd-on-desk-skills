// Desk intent classifier: owner's words → which card JAVIS shows.
const { describe, it } = require("node:test");
const assert = require("node:assert");
const { classifyIntent, normalize, parseOpen } = require("../src/desk/intent");

const type = (t) => classifyIntent(t).type;

describe("normalize", () => {
  it("strips diacritics, đ, case and punctuation", () => {
    assert.strictEqual(normalize("  Đồng TIỀN tuần này?! "), "dong tien tuan nay");
    assert.strictEqual(normalize("Máy  chủ"), "may chu");
  });
});

describe("classifyIntent → card type", () => {
  const cases = [
    // việc cần anh / task hôm nay
    ["Hôm nay có việc gì cần anh?", "tasks"],
    ["hom nay co viec gi can anh", "tasks"],
    ["javis ơi task hôm nay", "tasks"],
    ["có mấy việc chờ anh duyệt", "tasks"],
    ["tiến độ việc hôm nay", "tasks"],
    // máy + tải
    ["các máy đang sao rồi", "machines"],
    ["xem RAM GPU server", "machines"],
    ["nhiệt độ PC gaming", "machines"],
    ["jarvis mac mini có ổn không", "machines"],
    // kho tài sản
    ["mở kho video mới", "link"],
    ["kho tài sản", "assets"],
    ["xem video mới hôm nay", "assets"],
    ["nghe nhạc mới", "assets"],
    ["ảnh gần đây", "assets"],
    // cảnh báo
    ["có cảnh báo gì không", "alerts"],
    ["dang loi gi vay", "alerts"],
    // số liệu kênh
    ["số liệu kênh youtube", "channels"],
    ["lượt xem tuần này", "channels"],
    ["bao nhiêu người đăng ký", "channels"],
    // dòng tiền
    ["dòng tiền tháng này", "money"],
    ["doanh thu", "money"],
    ["chi phí credit hôm nay", "money"],
    // kết quả AI vừa làm
    ["kết quả vừa làm xong", "results"],
    ["có gì chờ nghiệm thu", "results"],
    // kiểm tra hệ thống
    ["kiểm tra hệ thống", "system"],
    ["javsi kiem tra he thong giup anh", "system"],
    // phiên Claude/Codex trên máy
    ["claude đang làm gì", "sessions"],
    // ghép đôi / trợ giúp
    ["ghép đôi javis", "pair"],
    ["em làm được gì", "help"],
    ["", "help"],
    // free-form → bộ não JAVIS
    ["viết giúp anh caption cho clip mèo", "chat"],
    ["tóm tắt cuộc họp sáng nay", "chat"],
  ];
  for (const [text, expected] of cases) {
    it(`${JSON.stringify(text)} → ${expected}`, () => assert.strictEqual(type(text), expected));
  }

  it("carries the asset kind", () => {
    assert.deepStrictEqual(classifyIntent("xem video mới hôm nay").params, { kind: "video" });
    assert.deepStrictEqual(classifyIntent("nghe nhạc mới").params, { kind: "audio" });
    assert.deepStrictEqual(classifyIntent("kho tài sản").params, {});
  });

  it("keeps the original text for the brain", () => {
    assert.strictEqual(classifyIntent("Tóm tắt giúp anh").text, "Tóm tắt giúp anh");
  });
});

describe("open commands", () => {
  it("maps known names to safe https links", () => {
    assert.deepStrictEqual(classifyIntent("mở javis").params, { url: "https://javis.bumbee.asia", label: "JAVIS" });
    assert.strictEqual(classifyIntent("mo youtube").params.url, "https://studio.youtube.com");
    assert.strictEqual(classifyIntent("mở kho").params.url, "https://javis.bumbee.asia/?module=assets");
  });
  it("accepts bare domains and full URLs", () => {
    assert.strictEqual(parseOpen("mo bumbee.asia/shop").url, "https://bumbee.asia/shop");
    assert.strictEqual(parseOpen("open https://example.com/a").url, "https://example.com/a");
  });
  it("does not invent links for unknown names", () => {
    assert.strictEqual(parseOpen("mo cai gi do"), null);
    assert.strictEqual(type("mở cái gì đó"), "chat");
  });
});
