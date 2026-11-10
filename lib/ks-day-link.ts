import { prisma } from "@/lib/prisma";
import { getWorkDateVn } from "@/lib/attendance";
import { ensureKsProject } from "@/lib/ks-diary";

// Link ngày "Việc của tôi" của KS (sếp 08/11/2026): máy vật tư (ai-office vt-web) cấp mã 8 ký tự mỗi ngày,
// ghi bảng ks_day_links (code, user_id, ref, ngay). ref 'home' = trang chủ /vt/v/<code>, 'NK:<projectId>' = nhật ký, 'TD:<projectId>' = tiến độ.
// Mã chỉ hợp lệ đúng ngày cấp (giờ VN) — qua ngày tự hết, link lọt ra ngoài không dùng được.
const RE_CODE = /^[A-Za-z0-9_-]{8}$/;
export const VK_HOME_URL = "https://erp.huynhgia6.com/vt/v/";

type Row = { user_id: string; ref: string };

async function todayRow(code: string): Promise<Row | null> {
  if (!RE_CODE.test(code)) return null;
  const ngay = getWorkDateVn().toISOString().slice(0, 10);
  const rows = await prisma.$queryRaw<Row[]>`
    select user_id::text as user_id, ref from ks_day_links where code = ${code} and ngay = ${ngay}::date limit 1`;
  return rows[0] ?? null;
}

// Mã dự án (ref '<kind><projectId>') → KS (còn hoạt động) + dự án KS đang phụ trách; null = link sai / hết hạn / hết quyền.
async function resolveProjectCode(code: string, kind: "NK:" | "TD:") {
  const row = await todayRow(code);
  if (!row || !row.ref.startsWith(kind)) return null;
  const user = await prisma.user.findFirst({
    where: { id: row.user_id, isActive: true },
    select: { id: true, fullName: true },
  });
  if (!user) return null;
  const project = await ensureKsProject(row.ref.slice(3), user.id);
  if (!project) return null;
  return { user, project };
}

// Nhật ký thi công /ks-nk/<mã>.
export function resolveDiaryCode(code: string) {
  return resolveProjectCode(code, "NK:");
}

// Báo cáo tiến độ /ks-td/<mã> (sếp 09/11/2026).
export function resolveTienDoCode(code: string) {
  return resolveProjectCode(code, "TD:");
}

// Link trang chủ hôm nay của KS (nút quay lại); null nếu chưa cấp.
export async function homeLinkOf(userId: string) {
  const ngay = getWorkDateVn().toISOString().slice(0, 10);
  const rows = await prisma.$queryRaw<Array<{ code: string }>>`
    select code from ks_day_links where user_id = ${userId}::uuid and ref = 'home' and ngay = ${ngay}::date limit 1`;
  return rows[0] ? VK_HOME_URL + rows[0].code : null;
}
