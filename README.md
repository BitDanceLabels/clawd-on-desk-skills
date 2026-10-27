<p align="center"><img src="assets/icons/128x128.png" width="96" alt="JAVIS"></p>
<h1 align="center">JAVIS On Desk</h1>

Bé trợ lý JAVIS nổi trên màn hình: một cô gái hologram bằng hạt sáng (tim cam ở ngực).
Anh nói hoặc gõ, JAVIS **hiển hoá** câu trả lời thành thẻ ngay cạnh bé — không menu, không màn phụ.

## Dùng

- **Bấm vào bé** → mở bảng; **kéo** để dời chỗ; **chuột phải** → menu. Phím tắt hiện/ẩn: `Ctrl/Cmd+Shift+J`.
- Ô dưới bảng: bấm **mic** để nói (tự dừng khi anh ngưng nói) hoặc gõ rồi Enter. Có dấu hay không đều hiểu.
- Hỏi gì hiện nấy (lấy thẳng từ API JAVIS, không tốn lượt AI):

| Anh nói | Thẻ | Nguồn |
|---|---|---|
| việc hôm nay, việc cần anh | việc chờ anh quyết + việc quan trọng | `/fleet/home/tasks` |
| các máy sao rồi, RAM/GPU | máy online, RAM/CPU/GPU, việc nặng | `/fleet/load` |
| kho, video mới, nghe nhạc mới, ảnh gần đây | lưới media, bấm là phát | `/fleet/assets` + `/asset-files/…` |
| cảnh báo | cảnh báo đang mở theo mức | `/fleet/alerts` |
| số liệu kênh, lượt xem, sub | chỉ số + biểu đồ nhỏ | `/fleet/exec/overview`, `/fleet/results` |
| dòng tiền, doanh thu, chi phí | lãi ròng, tiền vào/ra, hoà vốn | `/fleet/exec/overview`, `/fleet/spend/summary` |
| kết quả vừa làm | việc chờ nghiệm thu, sản phẩm mới | `/fleet/results` |
| kiểm tra hệ thống | vòng tình trạng + tóm tắt | `/fleet/load` + `/fleet/alerts` |
| claude đang làm gì | phiên Claude/Codex trên máy này | hook cục bộ |
| mở youtube / mở bumbee.asia | mở trình duyệt | — |
| còn lại | bộ não JAVIS trả lời (cùng phiên chat với JAVIS web) | `/fleet/voice/chat` |

- **Bong bóng nổi** khi có việc cần anh: việc mới chờ quyết, cảnh báo mức cao, Claude/Codex chờ trả lời hoặc xin quyền
  (Cho phép / Luôn cho phép / Từ chối ngay trên bong bóng). Chạy theo sự kiện của gateway, không quét định kỳ.
- Menu khay: Không làm phiền · Đọc to câu trả lời · Mở cùng máy · Ghép đôi JAVIS · Kiểm tra cập nhật.

## Ghép đôi

Lần đầu bé nhắc **Ghép đôi**: quét QR hoặc mở link, bấm Duyệt trên JAVIS web. Khoá thiết bị lưu mã hoá
(Keychain / DPAPI), chỉ tiến trình chính dùng để gọi gateway; trang không bao giờ thấy khoá.
Bản 0.11/0.12 đã ghép đôi thì giữ nguyên (cùng thư mục dữ liệu).

## Nhẹ máy

Rảnh 20 giây: chỉ vẽ ~45% hạt ở ~20 khung/giây; ẩn cửa sổ thì dừng vẽ. Máy không có WebGL thì hiện ảnh tĩnh phát sáng.
Kết nối lỗi thì thử tối đa 3 lần, giãn cách, rồi dừng.

## Dev

```bash
npm install
npm start            # build desk.bundle.js rồi mở app
npm test             # node --test test/*.test.js
npm run build:mac    # / build / build:linux — chạy trên CI (build.yml) khi đẩy tag v*
```

Cấu trúc:

| File | Việc |
|---|---|
| `src/main.js` | cửa sổ trong suốt (thu gọn / bong bóng / bảng), khay, IPC, cập nhật |
| `src/javis-desk-host.js` | scheme `javis-desk://app`, proxy `/fleet/*` + `/asset-files/*` kèm khoá thiết bị, ghép đôi |
| `src/hook-server.js`, `src/sessions.js` | nhận hook Claude Code/Gemini/Cursor (127.0.0.1:23333), theo dõi phiên, thẻ xin quyền |
| `src/voice-stt.js` | giọng nói → chữ (1 lần/câu) |
| `src/desk/` | trang: `desk.js`, `hologram-desk.js`, `intent.js` (ý định → thẻ), `cards.js`, `voice-input.js` |
| `hooks/`, `agents/` | hook Claude/Codex/Gemini/Cursor (giữ từ Clawd on Desk; không đăng ký WorktreeCreate) |
| `archive/` | toàn bộ chức năng cũ đã gỡ (vocab, english game, rabbit, phase hub, Bumbee OS, wiki, donation, Live2D/VRM…) — chỉ để tra cứu, không đóng gói |
