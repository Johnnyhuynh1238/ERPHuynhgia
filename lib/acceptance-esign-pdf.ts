/**
 * Ghép PDF biên bản nghiệm thu ký online (A4, pdf-lib — container không có chromium).
 * Font DejaVu (có dấu tiếng Việt) lấy từ hệ thống: container alpine /usr/share/fonts/dejavu,
 * máy Ubuntu /usr/share/fonts/truetype/dejavu.
 */
import { existsSync, readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { EsignContent, EsignKind, EsignKsData } from "@/lib/acceptance-esign";

const FONT_DIRS = ["/usr/share/fonts/dejavu", "/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/TTF"];

function loadFont(file: string): Buffer {
  for (const d of FONT_DIRS) {
    const p = `${d}/${file}`;
    if (existsSync(p)) return readFileSync(p);
  }
  throw new Error(`Thiếu font ${file}`);
}

const COMPANY = "CÔNG TY TNHH KIẾN TRÚC XÂY DỰNG VÀ NỘI THẤT HUỲNH GIA";
const COMPANY_SUB = "2157 QL51, xã Phước Thái, Đồng Nai · ĐT 0931 316 513";

const A4 = { w: 595.28, h: 841.89 };
const M = 42; // lề
const INK = rgb(0.17, 0.15, 0.13);
const MUTE = rgb(0.45, 0.41, 0.37);
const ACC = rgb(0.71, 0.33, 0.18);
const LINE = rgb(0.85, 0.82, 0.77);
const OK = rgb(0.18, 0.49, 0.31);
const NO = rgb(0.64, 0.23, 0.16);

type Sig = { name: string | null; signature: string | null; at: Date | null; ip: string | null; note?: string | null };

export type EsignPdfInput = {
  id: string;
  kind: EsignKind;
  content: EsignContent;
  ksData: EsignKsData;
  ks: Sig;
  party: Sig;
  photos: { bytes: Buffer; type: string }[];
};

const fmtTime = (d: Date | null) =>
  d
    ? d.toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";
const fmtDay = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of String(text ?? "").split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(t, size) <= width) {
        line = t;
        continue;
      }
      if (line) out.push(line);
      // từ quá dài → cắt cứng
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
        let i = w.length - 1;
        while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
        out.push(w.slice(0, i));
        w = w.slice(i);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    public f: PDFFont,
    public b: PDFFont,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.y = A4.h - M;
  }
  ensure(h: number) {
    if (this.y - h < M + 24) this.newPage();
  }
  text(s: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; w?: number; gap?: number } = {}) {
    const size = o.size ?? 10;
    const font = o.bold ? this.b : this.f;
    const x = o.x ?? M;
    const w = o.w ?? A4.w - M - x;
    const lh = size * 1.38;
    for (const ln of wrap(s, font, size, w)) {
      this.ensure(lh);
      this.page.drawText(ln, { x, y: this.y - size, size, font, color: o.color ?? INK });
      this.y -= lh;
    }
    this.y -= o.gap ?? 0;
  }
  center(s: string, size: number, bold = false, color = INK) {
    const font = bold ? this.b : this.f;
    for (const ln of wrap(s, font, size, A4.w - 2 * M)) {
      this.ensure(size * 1.4);
      const w = font.widthOfTextAtSize(ln, size);
      this.page.drawText(ln, { x: (A4.w - w) / 2, y: this.y - size, size, font, color });
      this.y -= size * 1.4;
    }
  }
  rule(color = LINE, gap = 6) {
    this.ensure(gap * 2);
    this.y -= gap;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4.w - M, y: this.y }, thickness: 0.7, color });
    this.y -= gap;
  }
  /** Dòng "Nhãn: giá trị" */
  kv(k: string, v: string, size = 10) {
    const kw = this.b.widthOfTextAtSize(`${k}: `, size);
    const lines = wrap(v || "—", this.f, size, A4.w - 2 * M - kw);
    lines.forEach((ln, i) => {
      this.ensure(size * 1.4);
      if (i === 0) this.page.drawText(`${k}: `, { x: M, y: this.y - size, size, font: this.b, color: MUTE });
      this.page.drawText(ln, { x: M + kw, y: this.y - size, size, font: this.f, color: INK });
      this.y -= size * 1.4;
    });
  }
}

async function embedImage(doc: PDFDocument, bytes: Buffer | Uint8Array, type: string): Promise<PDFImage | null> {
  try {
    if (type === "image/png") return await doc.embedPng(bytes);
    if (type === "image/jpeg" || type === "image/jpg") return await doc.embedJpg(bytes);
  } catch {
    return null;
  }
  return null; // webp: pdf-lib không nhúng được → bỏ qua (client đã nén về jpeg)
}

const sigBytes = (dataUrl: string | null) =>
  dataUrl && dataUrl.startsWith("data:image/png;base64,") ? Buffer.from(dataUrl.split(",")[1], "base64") : null;

export async function buildEsignPdf(input: EsignPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const f = await doc.embedFont(loadFont("DejaVuSans.ttf"), { subset: true });
  const b = await doc.embedFont(loadFont("DejaVuSans-Bold.ttf"), { subset: true });
  const c = input.content;
  doc.setTitle(`Biên bản nghiệm thu ${c.title} · ${c.projectName}`);
  doc.setAuthor("Huỳnh Gia ERP");
  doc.setCreator("ERP Huỳnh Gia · ký điện tử");

  const w = new Writer(doc, f, b);

  // ── Đầu trang
  w.center(COMPANY, 10.5, true, ACC);
  w.center(COMPANY_SUB, 8.5, false, MUTE);
  w.y -= 8;
  w.center("CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM", 10, true);
  w.center("Độc lập – Tự do – Hạnh phúc", 9.5);
  w.y -= 10;
  w.center(input.kind === "thau_phu" ? "BIÊN BẢN NGHIỆM THU KHỐI LƯỢNG – ĐỘI KHOÁN" : "BIÊN BẢN NGHIỆM THU CÔNG VIỆC", 14, true);
  w.center(c.title, 11.5, true, ACC);
  w.y -= 6;

  // ── Thông tin
  w.kv("Công trình", `${c.projectName} (${c.projectCode})`);
  w.kv("Địa chỉ", c.address);
  if (c.group) w.kv("Hạng mục", c.group);
  if (c.time) w.kv("Thời điểm nghiệm thu", c.time);
  w.kv("Kỹ sư giám sát (Huỳnh Gia)", input.ks.name ?? "");
  w.kv(c.partyLabel, input.party.name ?? "");
  if (c.contractCode) w.kv("Hợp đồng khoán", c.contractCode);
  w.rule();

  // ── Từng công tác
  const items = input.ksData.items ?? {};
  c.cts.forEach((ct, i) => {
    w.ensure(60);
    const it = items[String(ct.no)];
    w.text(`${i + 1}. ${ct.no ? `CT${ct.no} · ` : ""}${ct.name}`, { size: 11, bold: true, gap: 1 });
    w.text(`Mức kiểm soát: ${ct.lv}`, { size: 8.5, color: MUTE, x: M + 12 });
    if (ct.tc.length) {
      w.text("Tiêu chuẩn đạt:", { size: 9, bold: true, x: M + 12 });
      for (const t of ct.tc) w.text(`• ${t}`, { size: 9, x: M + 20 });
    }
    if (ct.ck.length) {
      w.text("Cách kiểm tra:", { size: 9, bold: true, x: M + 12 });
      for (const t of ct.ck) w.text(`• ${t}`, { size: 9, x: M + 20 });
    }
    if (it) {
      const ok = it.kq === "dat";
      w.text(`Kết quả: ${ok ? "ĐẠT" : "KHÔNG ĐẠT – phải sửa"}${it.ngay ? ` · ngày ${fmtDay(it.ngay)}` : ""}`, {
        size: 10,
        bold: true,
        color: ok ? OK : NO,
        x: M + 12,
      });
      if (it.note) w.text(`Ghi chú: ${it.note}`, { size: 9.5, x: M + 12 });
    }
    w.y -= 6;
  });

  if (input.ksData.note) {
    w.rule();
    w.text("Ý kiến kỹ sư giám sát:", { size: 10, bold: true });
    w.text(input.ksData.note, { size: 10, gap: 4 });
  }
  if (input.party.note && input.kind === "chu_nha") {
    w.text(`Ý kiến ${c.partyLabel.toLowerCase()}:`, { size: 10, bold: true });
    w.text(input.party.note, { size: 10, gap: 4 });
  }

  // ── Chữ ký
  w.rule();
  const boxH = 150;
  w.ensure(boxH + 10);
  const cols = input.kind === "chu_nha" ? 2 : 1;
  const colW = (A4.w - 2 * M) / 2;
  const sigs: { label: string; s: Sig }[] = [{ label: "KỸ SƯ GIÁM SÁT", s: input.ks }];
  if (cols === 2) sigs.unshift({ label: c.partyLabel.toUpperCase(), s: input.party });
  const top = w.y;
  for (let i = 0; i < sigs.length; i++) {
    const { label, s } = sigs[i];
    const x0 = cols === 2 ? M + i * colW : M + colW; // 1 cột → bên phải
    const cx = x0 + colW / 2;
    const lw = b.widthOfTextAtSize(label, 10);
    w.page.drawText(label, { x: cx - lw / 2, y: top - 10, size: 10, font: b, color: INK });
    const raw = sigBytes(s.signature);
    const img = raw ? await embedImage(doc, raw, "image/png") : null;
    if (img) {
      const sc = Math.min(180 / img.width, 70 / img.height);
      w.page.drawImage(img, { x: cx - (img.width * sc) / 2, y: top - 92, width: img.width * sc, height: img.height * sc });
    }
    const nm = s.name ?? "";
    const nw = b.widthOfTextAtSize(nm, 10.5);
    w.page.drawText(nm, { x: cx - nw / 2, y: top - 108, size: 10.5, font: b, color: INK });
    const meta = s.at ? `Ký điện tử lúc ${fmtTime(s.at)}` : "Chưa ký";
    const mw = f.widthOfTextAtSize(meta, 8);
    w.page.drawText(meta, { x: cx - mw / 2, y: top - 122, size: 8, font: f, color: MUTE });
    if (s.ip) {
      const ip = `IP ${s.ip}`;
      const iw = f.widthOfTextAtSize(ip, 8);
      w.page.drawText(ip, { x: cx - iw / 2, y: top - 133, size: 8, font: f, color: MUTE });
    }
  }
  if (cols === 1) {
    const note = `${c.partyLabel}: ${input.party.name ?? ""}`;
    w.page.drawText(note, { x: M, y: top - 10, size: 10, font: b, color: INK });
    w.page.drawText("(nhận bản PDF qua Zalo)", { x: M, y: top - 24, size: 8.5, font: f, color: MUTE });
  }
  w.y = top - boxH;

  // ── Ảnh hiện trường
  const imgs: PDFImage[] = [];
  for (const p of input.photos) {
    const im = await embedImage(doc, p.bytes, p.type);
    if (im) imgs.push(im);
  }
  if (imgs.length) {
    w.newPage();
    w.text("ẢNH NGHIỆM THU", { size: 12, bold: true, color: ACC, gap: 6 });
    const gap = 10;
    const cw = (A4.w - 2 * M - gap) / 2;
    const ch = 220;
    for (let i = 0; i < imgs.length; i += 2) {
      w.ensure(ch + gap);
      for (let j = 0; j < 2 && i + j < imgs.length; j++) {
        const im = imgs[i + j];
        const sc = Math.min(cw / im.width, ch / im.height);
        const iw = im.width * sc;
        const ih = im.height * sc;
        const x = M + j * (cw + gap) + (cw - iw) / 2;
        w.page.drawImage(im, { x, y: w.y - ch + (ch - ih) / 2, width: iw, height: ih });
      }
      w.y -= ch + gap;
    }
  }

  // ── Chân trang mọi trang
  const pages = doc.getPages();
  const foot = `Ký điện tử trên ERP Huỳnh Gia · mã BB ${input.id.slice(0, 8).toUpperCase()}`;
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M - 6 }, end: { x: A4.w - M, y: M - 6 }, thickness: 0.5, color: LINE });
    p.drawText(foot, { x: M, y: M - 18, size: 7.5, font: f, color: MUTE });
    const pg = `Trang ${i + 1}/${pages.length}`;
    p.drawText(pg, { x: A4.w - M - f.widthOfTextAtSize(pg, 7.5), y: M - 18, size: 7.5, font: f, color: MUTE });
  });

  return doc.save();
}
