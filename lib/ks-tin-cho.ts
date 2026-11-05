/**
 * Tin ERP cho KS đi qua THƯ KÝ KỸ SƯ (lệnh sếp Zalo 09:24 05/11/2026, việc V261105-092526).
 *
 * Mọi chỗ ERP định nhắn Zalo cho KS (link số thợ / báo cáo cuối ngày + nhắc, nhắc chốt nhật ký, nhắc ký BB 16h30,
 * link ký BB / BB bị trả về / BB đã đính, chủ đề trao đổi mới) gọi `guiKs`:
 *  - Luôn ghi 1 dòng vào hàng chờ ks_tin_cho (loại tin, dự án, mốc, link, giờ) — văn phòng AI đọc chỉ-đọc,
 *    thư ký của đúng KS lấy bằng lệnh `tin-ks`.
 *  - KS đã bật users.ks_tin_qua_thu_ky → ERP KHÔNG gửi Zalo thẳng (thư ký nhắn).
 *  - Chưa bật (mặc định) → ERP vẫn gửi Zalo như cũ, để KS không mất tin khi đường thư ký chưa chạy.
 * Tin cho khách / đội khoán / kế toán / admin không đi qua đây (không đổi).
 * Ghi hàng chờ lỗi → vẫn gửi thẳng (không để KS mất tin); không bao giờ ném lỗi ra luồng gọi.
 */
import { prisma } from "@/lib/prisma";
import { sendZaloBridge } from "@/lib/zalo-notify";

export type KsTinLoai =
  | "so_tho"
  | "so_tho_nhac"
  | "cuoi_ngay"
  | "cuoi_ngay_nhac"
  | "nhat_ky"
  | "nghiem_thu"
  | "ks_link"
  | "ks_link_tra_ve"
  | "ks_xong"
  | "chu_de";

export type KsTinDong = {
  loai: KsTinLoai;
  projectId?: string | null;
  duAn?: string | null;
  moc?: string | null;
  link?: string | null;
  noiDung: string;
  refId?: string | null;
  hanLuc?: Date | null;
};

/** KS này đã chuyển tin sang thư ký chưa. */
export async function ksQuaThuKy(ksId: string): Promise<boolean> {
  const u = await prisma.user
    .findUnique({ where: { id: ksId }, select: { ksTinQuaThuKy: true } })
    .catch(() => null);
  return !!u?.ksTinQuaThuKy;
}

/** Ghi các dòng vào hàng chờ. Trả false nếu ghi lỗi. */
export async function ghiTinCho(ksId: string, rows: KsTinDong[], erpGuiThang: boolean): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await prisma.ksTinCho.createMany({
      data: rows.map((r) => ({
        ksId,
        loai: r.loai,
        projectId: r.projectId ?? null,
        duAn: r.duAn ?? null,
        moc: r.moc ?? null,
        link: r.link ?? null,
        noiDung: r.noiDung,
        refId: r.refId ?? null,
        hanLuc: r.hanLuc ?? null,
        erpGuiThang,
      })),
    });
    return true;
  } catch (err) {
    console.error("[ks-tin-cho] không ghi được hàng chờ:", err);
    return false;
  }
}

/**
 * 1 tin cho 1 KS: ghi hàng chờ (rows; trống thì 1 dòng từ `text`) + gửi Zalo thẳng nếu KS chưa chuyển sang thư ký.
 * Trả true nếu tin đã tới KS hoặc đã nằm trong hàng chờ của thư ký.
 */
export async function guiKs(input: {
  ksId: string;
  threadId: string | null;
  text: string;
  rows: KsTinDong[];
}): Promise<boolean> {
  const quaThuKy = await ksQuaThuKy(input.ksId);
  const daGhi = await ghiTinCho(input.ksId, input.rows, !quaThuKy);
  if (quaThuKy && daGhi) return true;
  return input.threadId ? sendZaloBridge({ threadId: input.threadId, text: input.text }) : false;
}
