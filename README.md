# SlipFlow — Seller Revenue Dashboard & Chat Plug-ins (LINE OA + Facebook Messenger)

ระบบ **Webapp Dashboard สำหรับผู้ขาย** พร้อม **Plug-in ตรวจสลิปอัตโนมัติ** รองรับครบทั้ง **LINE Official Account** และ **Facebook Page Messenger** (ใช้งานได้ 100% บนมือถือผ่าน Webhook Bot และบนคอมพิวเตอร์ผ่าน Chrome Extension) เชื่อมต่อกับ [Thai Slip Reader & Verification API](https://my-slip-reader.onrender.com/) (`POST /api/verify-slip`)

---

## ความสามารถหลัก

1. **ระบบสมาชิก แยกข้อมูลหลายร้านค้า และบัญชีผู้ดูแลระบบรวม (Super Admin & Multi-Shop)**
   - **สมัครเปิดร้านใหม่ / เข้าสู่ระบบ** ด้วยรหัสผ่านเข้ารหัส PBKDF2-SHA256 (`100,000` รอบ)
   - **บัญชีแรกที่สมัครในระบบจะได้รับสิทธิ์ `ADMIN` (Super Admin) อัตโนมัติ** มีเมนู **ดูแลระบบรวม (Admin)** สำหรับ:
     - ดูยอดโอนยืนยันรวมทุกเพจ/ทุกร้านในระบบ (รายวัน, รายเดือน, ยอดสะสมทั้งหมด)
     - ดูสถานะการเชื่อม LINE / Facebook / บัญชีธนาคาร ของทุกร้านค้า และกด **เข้าจัดการร้าน** เพื่อเข้าไปช่วยดูหรือตั้งค่าร้านใดก็ได้ในคลิกเดียว
     - สร้างบัญชีร้านค้าใหม่ / ตั้งแอดมินเพิ่ม / **รีเซ็ตรหัสผ่านให้ร้านค้า** / ระงับหรือเปิดใช้งานร้านค้าและบัญชีผู้ใช้
   - บัญชีผู้ขายทั่วไป (`SELLER`) จะเห็นและจัดการได้เฉพาะร้านของตัวเองเท่านั้น (`shop_id` Isolation 100%)
   - **Webhook URL แยกเฉพาะแต่ละร้าน** (`/api/line/webhook/<shopSlug>` และ `/api/messenger/webhook/<shopSlug>`)

2. **Seller Revenue Dashboard (React + Cloudflare Workers + D1 SQLite)**
   - สรุปรายรับยืนยันแล้วรายวัน / รายเดือน / กราฟ 7, 14, 30 วัน แยกตามธนาคารและช่องทาง (`LINE`, `Facebook Messenger`, `Web`, `Manual`)
   - อัปเดตสดแบบ **Real-time (SSE)** และรองรับการใช้งานบนมือถือ
   - **ตรวจสลิปด่วนบนเว็บ** พร้อมสแกน Mini QR บนเบราว์เซอร์ (`jsQR`)
   - **สมุดรายการสลิป**: ค้นหา/กรอง, ดูข้อมูล QR (TLV) และข้อความ OCR, แก้ยอด/อนุมัติรายการ, เพิ่มรายรับเอง และ **Export CSV (UTF-8 BOM)**
   - **เกราะป้องกันฝั่งผู้ขาย**: Whitelist บัญชีปลายทางร้านค้า (กันโอนผิดบัญชี), กันสลิปซ้ำ (`transRef`) 2 ชั้น และแยกสถานะรอตรวจเมื่อยอดเป็น `0.00`

2. **LINE OA Webhook Bot (`POST /api/line/webhook`) — ใช้บนมือถือได้ 24 ชม.**
   - ตรวจลายเซ็น `X-Line-Signature`, ตอบกลับด้วย **LINE Flex Message**, ข้ามรูปสินค้าที่ไม่ใช่สลิปอัตโนมัติ และรองรับคำสั่ง `!id` ในกลุ่มแอดมิน

3. **Facebook Page Messenger Webhook Bot (`GET/POST /api/messenger/webhook`) — ใช้บนมือถือได้ 24 ชม.**
   - รองรับ Meta Webhook Verification (`GET`) และตรวจลายเซ็น `X-Hub-Signature-256` (`POST`)
   - ข้ามข้อความ Echo (`is_echo`) และรูปสินค้าทั่วไปที่ไม่ใช่สลิปโดยอัตโนมัติ
   - ดึงรูปสลิป -> ตรวจผ่าน `my-slip-reader.onrender.com` -> บันทึกรายรับเข้า Dashboard (`FB_MESSENGER`) -> ตอบสรุปยอดกลับเข้าแชตลูกค้าผ่าน Meta Send API (และส่งแจ้งเตือนเข้ากลุ่ม LINE แอดมินได้พร้อมกัน)

4. **Chrome Extension (`line-chat-extension/`) — สำหรับคอมพิวเตอร์**
   - ตัวเดียวรองรับทั้ง **LINE OA Manager (`chat.line.biz`)** และ **Meta Business Suite / Facebook Messenger (`business.facebook.com`, `messenger.com`)**

---

## การติดตั้งและรันบนเครื่อง (Local)

```bash
npm install
npm run build
npm start
# เปิดเบราว์เซอร์ที่ http://localhost:3001
```

> บน Windows PowerShell หากติด Execution Policy ให้ใช้ `npm.cmd start` หรือ `npm.cmd run dev`

---

## การ Deploy ขึ้น Cloudflare Workers + D1 (แนะนำ — ฟรี, ไม่หลับ, SQLite ถาวร)

```bash
# 1. ล็อกอิน Cloudflare (ครั้งแรกครั้งเดียว)
npx wrangler login

# 2. รัน Migration สร้างตารางบน D1
npm run cf:migrate:remote

# 3. Build React + Deploy Worker พร้อม Static Assets
npm run cf:deploy
```

*(เลือกตั้งค่า `DASHBOARD_ACCESS_KEY` ผ่าน `npx wrangler secret put DASHBOARD_ACCESS_KEY` หากต้องการล็อกหน้า Dashboard ด้วยรหัสผ่าน)*

---

## การ Deploy ขึ้น Render (ทางเลือก)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Xenz2207/slip-reader-plug-in)

หรือเข้าลิงก์ตรง: `https://render.com/deploy?repo=https://github.com/Xenz2207/slip-reader-plug-in`

> **แนะนำสำหรับ Render Free Tier:** หากต้องการให้ค่า LINE / Facebook Token คงอยู่ถาวรแม้เซิร์ฟเวอร์รีสตาร์ต สามารถใส่ `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `FB_APP_SECRET`, `FB_PAGE_ACCESS_TOKEN` และ `DASHBOARD_ACCESS_KEY` ไว้ในหน้า **Environment** ของ Render ได้เลย

---

## การทดสอบ

```bash
npm run typecheck
npm run build
npm test
```
