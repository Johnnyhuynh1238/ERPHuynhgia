/**
 * VietQR helpers. Dùng API img.vietqr.io (free, không key) để generate ảnh.
 * Parse string EMVCo VietQR để autofill khi admin upload ảnh QR.
 */
import { VN_BANKS } from "./vn-banks";

export type VietQrInput = {
  bankBin: string;
  accountNumber: string;
  amount?: number;
  addInfo?: string;
  accountName?: string;
};

/** Trả về URL ảnh QR (compact2 = QR có logo + tên ngân hàng + STK). */
export function buildVietQrImageUrl(input: VietQrInput): string | null {
  const bank = VN_BANKS.find((b) => b.bin === input.bankBin);
  if (!bank) return null;
  const params = new URLSearchParams();
  if (input.amount && input.amount > 0) params.set("amount", String(Math.round(input.amount)));
  if (input.addInfo) params.set("addInfo", input.addInfo);
  if (input.accountName) params.set("accountName", input.accountName);
  const qs = params.toString();
  const acc = encodeURIComponent(input.accountNumber.trim());
  return `https://img.vietqr.io/image/${bank.code}-${acc}-compact2.png${qs ? `?${qs}` : ""}`;
}

/**
 * Parse chuỗi VietQR theo EMVCo TLV.
 * Trả về { bankBin, accountNumber, amount?, addInfo? } nếu hợp lệ, null nếu không.
 */
export function parseVietQrString(raw: string): {
  bankBin: string;
  accountNumber: string;
  amount?: number;
  addInfo?: string;
} | null {
  if (!raw || raw.length < 30) return null;

  const root = parseTlv(raw);
  if (!root) return null;

  // Tag 38 = merchant account info (chuẩn VN)
  const t38 = root.get("38");
  if (!t38) return null;
  const inner1 = parseTlv(t38);
  if (!inner1) return null;
  // tag 01 inside = nested merchant info chứa BIN + STK
  const innerRaw = inner1.get("01");
  if (!innerRaw) return null;
  const inner2 = parseTlv(innerRaw);
  if (!inner2) return null;
  const bankBin = inner2.get("00");
  const accountNumber = inner2.get("01");
  if (!bankBin || !accountNumber) return null;

  // Tag 54 = amount
  const amountStr = root.get("54");
  const amount = amountStr ? Number(amountStr) : undefined;

  // Tag 62 = additional data, nested 08 = purpose / 01 = bill number, lấy purpose
  let addInfo: string | undefined;
  const t62 = root.get("62");
  if (t62) {
    const inner62 = parseTlv(t62);
    addInfo = inner62?.get("08") ?? inner62?.get("01") ?? undefined;
  }

  return {
    bankBin,
    accountNumber,
    amount: amount && Number.isFinite(amount) ? amount : undefined,
    addInfo,
  };
}

/** Parse TLV chuẩn EMVCo: 2 ký tự tag + 2 ký tự length + value. */
function parseTlv(raw: string): Map<string, string> | null {
  const out = new Map<string, string>();
  let i = 0;
  while (i < raw.length) {
    if (i + 4 > raw.length) return null;
    const tag = raw.slice(i, i + 2);
    const len = Number(raw.slice(i + 2, i + 4));
    if (!Number.isFinite(len) || len < 0) return null;
    if (i + 4 + len > raw.length) return null;
    const value = raw.slice(i + 4, i + 4 + len);
    out.set(tag, value);
    i += 4 + len;
  }
  return out;
}

/**
 * Build chuỗi VietQR EMVCo từ thông tin TK + số tiền.
 * Dùng khi cần tạo QR client-side mà không cần fetch ảnh.
 */
export function buildVietQrString(input: VietQrInput): string {
  const tlv = (tag: string, value: string) => {
    const v = value;
    const len = v.length.toString().padStart(2, "0");
    return `${tag}${len}${v}`;
  };
  // Tag 38 nested
  const inner2 = tlv("00", input.bankBin) + tlv("01", input.accountNumber);
  const t38Inner = tlv("00", "A000000727") + tlv("01", inner2) + tlv("02", "QRIBFTTA");
  const t38 = tlv("38", t38Inner);

  let body =
    tlv("00", "01") + // Payload format
    tlv("01", "12") + // Point of init: dynamic
    t38 +
    tlv("53", "704") + // VND
    (input.amount && input.amount > 0 ? tlv("54", String(Math.round(input.amount))) : "") +
    tlv("58", "VN");

  if (input.addInfo) {
    const t62 = tlv("08", input.addInfo.slice(0, 99));
    body += tlv("62", t62);
  }

  // CRC: tag 63 length 04, value = CRC-16/CCITT-FALSE của (body + "6304")
  const toCrc = body + "6304";
  const crc = crc16ccitt(toCrc).toString(16).toUpperCase().padStart(4, "0");
  return body + "63" + "04" + crc;
}

function crc16ccitt(input: string): number {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}
