/**
 * Danh sách ngân hàng VN dùng cho VietQR + deep link.
 * BIN theo chuẩn Napas (6 số đầu của số thẻ).
 * Trường `deepLink` là URL scheme nếu app có hỗ trợ mở từ link ngoài.
 * Để trống nghĩa là chưa có scheme công khai → KT sẽ phải "quét từ album".
 */
export type VnBank = {
  bin: string;
  code: string; // short code dùng cho img.vietqr.io
  name: string;
  shortName: string;
  /** URL scheme đăng ký của app banking trên iOS/Android nếu có */
  deepLink?: string;
};

export const VN_BANKS: VnBank[] = [
  { bin: "970422", code: "MB", name: "Ngân hàng Quân Đội", shortName: "MB Bank", deepLink: "mbbank://" },
  { bin: "970436", code: "VCB", name: "Vietcombank", shortName: "Vietcombank", deepLink: "vietcombank://" },
  { bin: "970418", code: "BIDV", name: "BIDV", shortName: "BIDV", deepLink: "bidv://" },
  { bin: "970415", code: "VTB", name: "VietinBank", shortName: "VietinBank", deepLink: "vietinbank://" },
  { bin: "970407", code: "TCB", name: "Techcombank", shortName: "Techcombank", deepLink: "tcb://" },
  { bin: "970432", code: "VPB", name: "VPBank", shortName: "VPBank", deepLink: "vpbank://" },
  { bin: "970416", code: "ACB", name: "ACB", shortName: "ACB", deepLink: "acb://" },
  { bin: "970403", code: "STB", name: "Sacombank", shortName: "Sacombank", deepLink: "sacombank://" },
  { bin: "970423", code: "TPB", name: "TPBank", shortName: "TPBank", deepLink: "tpb://" },
  { bin: "970437", code: "HDB", name: "HDBank", shortName: "HDBank", deepLink: "hdbank://" },
  { bin: "970448", code: "OCB", name: "OCB", shortName: "OCB", deepLink: "ocb://" },
  { bin: "970454", code: "VCCB", name: "Bản Việt", shortName: "VietCapital" },
  { bin: "970441", code: "VIB", name: "VIB", shortName: "VIB", deepLink: "vib://" },
  { bin: "970443", code: "SHB", name: "SHB", shortName: "SHB", deepLink: "shb://" },
  { bin: "970426", code: "MSB", name: "MSB", shortName: "MSB", deepLink: "msb://" },
  { bin: "970406", code: "DAB", name: "DongA Bank", shortName: "DongA" },
  { bin: "970405", code: "VBA", name: "Agribank", shortName: "Agribank", deepLink: "agribank://" },
  { bin: "970409", code: "BAB", name: "BacABank", shortName: "BacABank" },
  { bin: "970412", code: "VPL", name: "PVcomBank", shortName: "PVcomBank" },
  { bin: "970424", code: "SGICB", name: "Saigonbank", shortName: "Saigonbank" },
  { bin: "970425", code: "ABB", name: "ABBank", shortName: "ABBank" },
  { bin: "970427", code: "VAB", name: "VietABank", shortName: "VietABank" },
  { bin: "970428", code: "NAB", name: "NamABank", shortName: "NamABank", deepLink: "namabank://" },
  { bin: "970429", code: "SCB", name: "SCB", shortName: "SCB" },
  { bin: "970431", code: "EIB", name: "Eximbank", shortName: "Eximbank", deepLink: "eximbank://" },
  { bin: "970433", code: "VIETBANK", name: "VietBank", shortName: "VietBank" },
  { bin: "970438", code: "BVB", name: "BaoVietBank", shortName: "BaoVietBank" },
  { bin: "970440", code: "SEAB", name: "SeABank", shortName: "SeABank", deepLink: "seabank://" },
  { bin: "970442", code: "HLB", name: "HongLeong Bank", shortName: "HongLeong" },
  { bin: "970449", code: "LPB", name: "LienVietPostBank", shortName: "LienVietPost", deepLink: "lpb://" },
  { bin: "970452", code: "KLB", name: "KienLongBank", shortName: "KienLongBank" },
  { bin: "970455", code: "IBKHN", name: "IBK Hà Nội", shortName: "IBK HN" },
];

export function findBankByBin(bin: string | null | undefined): VnBank | null {
  if (!bin) return null;
  return VN_BANKS.find((b) => b.bin === bin) ?? null;
}
