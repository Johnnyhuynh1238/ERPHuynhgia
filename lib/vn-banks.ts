/**
 * Danh sách ngân hàng VN dùng cho VietQR + deep link.
 * BIN theo chuẩn Napas (6 số đầu của số thẻ).
 * Trường `appId` là mã app trên hệ thống VietQR.io,
 * dùng cho universal link https://dl.vietqr.io/pay?app=<appId>...
 * (cơ chế Zalo dùng — sẽ mở thẳng app NH).
 */
export type VnBank = {
  bin: string;
  code: string; // short code dùng cho img.vietqr.io
  name: string;
  shortName: string;
  /** App ID trên hệ thống VietQR.io, dùng cho universal link */
  appId?: string;
  /** Có hỗ trợ tự điền số tiền/STK khi mở app từ universal link không */
  autofill?: boolean;
};

export const VN_BANKS: VnBank[] = [
  { bin: "970422", code: "MB", name: "Ngân hàng Quân Đội", shortName: "MB Bank", appId: "mb" },
  { bin: "970436", code: "VCB", name: "Vietcombank", shortName: "Vietcombank", appId: "vcb" },
  { bin: "970418", code: "BIDV", name: "BIDV", shortName: "BIDV", appId: "bidv", autofill: true },
  { bin: "970415", code: "ICB", name: "VietinBank", shortName: "VietinBank", appId: "icb", autofill: true },
  { bin: "970407", code: "TCB", name: "Techcombank", shortName: "Techcombank", appId: "tcb" },
  { bin: "970432", code: "VPB", name: "VPBank", shortName: "VPBank", appId: "vpb" },
  { bin: "970416", code: "ACB", name: "ACB", shortName: "ACB", appId: "acb", autofill: true },
  { bin: "970403", code: "STB", name: "Sacombank", shortName: "Sacombank" },
  { bin: "970423", code: "TPB", name: "TPBank", shortName: "TPBank", appId: "tpb" },
  { bin: "970437", code: "HDB", name: "HDBank", shortName: "HDBank", appId: "hdb" },
  { bin: "970448", code: "OCB", name: "OCB", shortName: "OCB", appId: "ocb", autofill: true },
  { bin: "970454", code: "VCCB", name: "Bản Việt", shortName: "VietCapital", appId: "timo" },
  { bin: "970441", code: "VIB", name: "VIB", shortName: "VIB", appId: "vib-2" },
  { bin: "970443", code: "SHB", name: "SHB", shortName: "SHB", appId: "shb" },
  { bin: "970426", code: "MSB", name: "MSB", shortName: "MSB" },
  { bin: "970406", code: "Vikki", name: "Vikki Bank (DongA)", shortName: "Vikki" },
  { bin: "970405", code: "VBA", name: "Agribank", shortName: "Agribank", appId: "vba" },
  { bin: "970409", code: "BAB", name: "BacABank", shortName: "BacABank" },
  { bin: "970412", code: "PVCB", name: "PVcomBank", shortName: "PVcomBank", appId: "pvcb" },
  { bin: "970424", code: "SGICB", name: "Saigonbank", shortName: "Saigonbank" },
  { bin: "970425", code: "ABB", name: "ABBank", shortName: "ABBank", appId: "abb" },
  { bin: "970427", code: "VAB", name: "VietABank", shortName: "VietABank" },
  { bin: "970428", code: "NAB", name: "NamABank", shortName: "NamABank", appId: "nab" },
  { bin: "970429", code: "SCB", name: "SCB", shortName: "SCB", appId: "scb" },
  { bin: "970431", code: "EIB", name: "Eximbank", shortName: "Eximbank", appId: "eib" },
  { bin: "970433", code: "VIETBANK", name: "VietBank", shortName: "VietBank", appId: "vietbank" },
  { bin: "970438", code: "BVB", name: "BaoVietBank", shortName: "BaoVietBank" },
  { bin: "970440", code: "SEAB", name: "SeABank", shortName: "SeABank", appId: "seab" },
  { bin: "970442", code: "HLBVN", name: "HongLeong Bank", shortName: "HongLeong" },
  { bin: "970449", code: "LPB", name: "LienVietPostBank", shortName: "LienVietPost", appId: "lpb" },
  { bin: "970452", code: "KLB", name: "KienLongBank", shortName: "KienLongBank" },
  { bin: "970455", code: "IBKHN", name: "IBK Hà Nội", shortName: "IBK HN" },
];

export function findBankByBin(bin: string | null | undefined): VnBank | null {
  if (!bin) return null;
  return VN_BANKS.find((b) => b.bin === bin) ?? null;
}

/** Chuẩn hoá tên: bỏ dấu, thường hoá, bỏ ký tự thừa (giữ a-z0-9). */
function normBank(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, "d") // đ/Đ không bị NFD tách → tự map sang d để không bị nuốt.
    .normalize("NFD")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Bí danh tên NH thường gặp khi AI đọc tin nhắn / người dùng gõ tay → BIN.
 * Key đã chuẩn hoá qua normBank. Chỉ cần thêm các dạng KHÔNG suy ra được từ
 * code/shortName/name (vd viết tắt, tên cũ, gõ thiếu). Map code/shortName/name
 * tự sinh bên dưới nên không cần liệt kê lại.
 */
const BANK_ALIASES: Record<string, string> = {
  // bin
  vietcom: "970436",
  techcom: "970407",
  vietin: "970415",
  viettin: "970415",
  ctg: "970415",
  quandoi: "970422",
  nganhangquandoi: "970422",
  mbb: "970422",
  vpb: "970432",
  sacom: "970403",
  tienphong: "970423",
  agri: "970405",
  vbard: "970405",
  maritime: "970426",
  lienviet: "970449",
  lienvietpost: "970449",
  phuongdong: "970448",
  banviet: "970454",
  vietcapital: "970454",
  donga: "970406",
  dongabank: "970406",
  exim: "970431",
  baoviet: "970438",
  pvcom: "970412",
  kienlong: "970452",
  namA: "970428",
  namabank: "970428",
  baca: "970409",
  saigon: "970424",
  seab: "970440",
  // tên đầy đủ tiếng Việt hay gặp
  ngoaithuong: "970436",
  congthuong: "970415",
  nongnghiep: "970405",
  dautuphattrien: "970418",
  daututphattrien: "970418",
};

/** Bảng tra chuẩn hoá → BIN, gộp code/shortName/name + bí danh (build 1 lần). */
const BANK_INDEX: Map<string, string> = (() => {
  const idx = new Map<string, string>();
  for (const b of VN_BANKS) {
    for (const key of [b.code, b.shortName, b.name]) {
      const k = normBank(key);
      if (k && !idx.has(k)) idx.set(k, b.bin);
    }
  }
  for (const [k, bin] of Object.entries(BANK_ALIASES)) {
    const nk = normBank(k);
    if (nk && !idx.has(nk)) idx.set(nk, bin);
  }
  return idx;
})();

/** Bỏ các từ nhiễu ("ngân hàng", "bank", "nh") để tăng tỉ lệ khớp. */
function stripBankNoise(q: string): string {
  return q.replace(/nganhang/g, "").replace(/bank/g, "").replace(/^nh/, "");
}

/**
 * Dò ngân hàng từ tên tự do (VD "Vietcombank", "VCB", "MB Bank", "techcom",
 * "NH Quân Đội"). Dùng khi dữ liệu lưu tên NH dạng text (thầu phụ, NCC) mà cần
 * BIN để render/QR. Ưu tiên khớp chính xác (code/shortName/name/bí danh), rồi
 * thử bỏ từ nhiễu, cuối cùng mới khớp chứa nhau. Ko khớp trả null.
 */
export function findBankByName(input: string | null | undefined): VnBank | null {
  if (!input) return null;
  const q = normBank(input);
  if (!q) return null;

  // 1) Khớp chính xác (kể cả sau khi bỏ từ nhiễu "bank"/"ngân hàng").
  for (const cand of [q, stripBankNoise(q)]) {
    if (!cand) continue;
    const bin = BANK_INDEX.get(cand);
    if (bin) return findBankByBin(bin);
  }

  // 2) Khớp chứa nhau trên shortName / name (chỉ khi đủ dài để tránh nhầm).
  if (q.length >= 3) {
    for (const b of VN_BANKS) {
      const sn = normBank(b.shortName);
      const nm = normBank(b.name);
      if (q.includes(sn) || sn.includes(q) || q.includes(nm) || nm.includes(q)) return b;
    }
  }
  return null;
}

/**
 * Chuẩn hoá tên NH tự do về shortName chuẩn (VD "vcb" → "Vietcombank",
 * "MB Bank" → "MB Bank"). Dùng ở API trước khi lưu để dữ liệu luôn ở dạng
 * dò được BIN. Ko nhận diện được thì trả nguyên bản đã trim (không nuốt data).
 */
export function normalizeBankName(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const b = findBankByName(raw);
  return b ? b.shortName : raw;
}

/**
 * Build VietQR.io universal link để mở thẳng app NH (cơ chế Zalo).
 * @param ktAppId appId của NH KT chọn (app sẽ mở)
 * @param recipientAccount STK người nhận
 * @param recipientBankAppId appId của NH người nhận (encode trong link)
 * @param amount số tiền VND
 * @param memo nội dung
 * @param recipientName tên người nhận
 */
export function buildVietQrDeepLink(params: {
  ktAppId: string;
  recipientAccount: string;
  recipientBankAppId: string;
  amount?: number;
  memo?: string;
  recipientName?: string;
}): string {
  const u = new URL("https://dl.vietqr.io/pay");
  u.searchParams.set("app", params.ktAppId);
  u.searchParams.set("ba", `${params.recipientAccount}@${params.recipientBankAppId}`);
  if (params.amount && params.amount > 0) {
    u.searchParams.set("am", String(Math.round(params.amount)));
  }
  if (params.memo) {
    u.searchParams.set("tn", params.memo);
  }
  if (params.recipientName) {
    u.searchParams.set("bn", params.recipientName);
  }
  return u.toString();
}
