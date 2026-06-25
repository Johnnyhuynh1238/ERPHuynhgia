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
