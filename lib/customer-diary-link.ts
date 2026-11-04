import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { computeEstimateProgress } from "@/lib/estimate-progress";

// Link xem nhật ký thi công cho chủ nhà (lệnh sếp 04/11/2026, việc V261104-121521):
// - KS lưu nhật ký (tự duyệt) → tạo 1 link /nk/<mã> cho đúng 1 dự án + 1 ngày, không mật khẩu, hết hạn 7 ngày,
//   + 1 tin vào hàng chờ Zalo khách hàng (gửi riêng chủ nhà, không nhóm). Cổng Zalo khách chưa có → chỉ nằm chờ.
// - Đã có link cho dự án + ngày đó → KHÔNG tạo tin mới; link luôn hiện bản nhật ký mới nhất.
// - Trang link chỉ hiện ảnh + % từng hạng mục lớn — không nội dung chi tiết/khối lượng, không giá/tiền, không dự án khác.

const SITE_URL = (process.env.NEXTAUTH_URL || "https://erp.huynhgia6.com").replace(/\/$/, "");
export const DIARY_LINK_TTL_DAYS = 7;
const CODE_RE = /^[A-Za-z0-9_-]{43}$/;

/** Mẫu tin trình sếp duyệt 1 lần — đổi chữ thì đổi luôn key (v2, v3…) để biết tin nào gửi theo mẫu nào. */
export const DIARY_LINK_TEMPLATE_KEY = "nhat_ky_ngay_v1";
export const DIARY_LINK_TEMPLATE =
  "Huỳnh Gia kính gửi {chu_nha}: kỹ sư đã cập nhật nhật ký thi công ngày {ngay} của công trình {cong_trinh}.\n" +
  "Anh/chị bấm xem (không cần mật khẩu): {link}\n" +
  "Link xem được 7 ngày, đến hết {han}. Sau đó anh/chị vào Cổng chủ nhà, mục Nhật ký để xem lại.";

export function cleanDiaryLinkCode(code: string): string | null {
  return CODE_RE.test(code || "") ? code : null;
}

export function diaryLinkUrl(code: string): string {
  return `${SITE_URL}/nk/${code}`;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function ymdToVn(value: string): string {
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function dateVn(date: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function renderDiaryLinkMessage(v: { customerName: string | null; projectName: string; entryDate: Date; url: string; expiresAt: Date }) {
  const name = v.customerName?.trim();
  return DIARY_LINK_TEMPLATE.replace("{chu_nha}", name ? `anh/chị ${name}` : "anh/chị")
    .replace("{ngay}", ymdToVn(ymd(v.entryDate)))
    .replace("{cong_trinh}", v.projectName)
    .replace("{link}", v.url)
    .replace("{han}", dateVn(v.expiresAt));
}

/**
 * Gọi sau khi KS lưu nhật ký (đã tự duyệt). Lần đầu của dự án + ngày → tạo link + 1 tin chờ gửi; các lần sau bỏ qua.
 * Lỗi không được chặn việc lưu nhật ký → nơi gọi tự catch.
 */
export async function queueCustomerDiaryLink(projectId: string, entryDate: Date): Promise<void> {
  const existing = await prisma.customerDiaryLink.findUnique({
    where: { projectId_entryDate: { projectId, entryDate } },
    select: { id: true },
  });
  if (existing) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, customerName: true, customerPhone: true, customerPortalEnabled: true },
  });
  if (!project || !project.customerPortalEnabled) return;

  const code = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + DIARY_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
  const phone = (project.customerPhone || "").trim();
  try {
    await prisma.$transaction(async (tx) => {
      const link = await tx.customerDiaryLink.create({ data: { code, projectId, entryDate, expiresAt } });
      await tx.customerZaloOutbox.create({
        data: {
          dedupeKey: `diary_link:${link.id}`,
          kind: "diary_link",
          templateKey: DIARY_LINK_TEMPLATE_KEY,
          projectId,
          recipientName: project.customerName || null,
          recipientPhone: phone || null,
          message: renderDiaryLinkMessage({
            customerName: project.customerName,
            projectName: project.name,
            entryDate,
            url: diaryLinkUrl(code),
            expiresAt,
          }),
          status: phone ? "waiting_gateway" : "missing_phone",
        },
      });
    });
  } catch (err) {
    // 2 lần lưu cùng lúc → lần sau đụng unique (dự án + ngày) → đã có link, bỏ qua.
    if ((err as { code?: string })?.code === "P2002") return;
    throw err;
  }
}

export type DiaryLinkPhoto = { key: string; contentType: string | null };

type StoredPhoto = { key?: unknown; contentType?: unknown };

function photosOf(value: unknown): DiaryLinkPhoto[] {
  if (!Array.isArray(value)) return [];
  const out: DiaryLinkPhoto[] = [];
  for (const p of value as StoredPhoto[]) {
    if (p && typeof p.key === "string") out.push({ key: p.key, contentType: typeof p.contentType === "string" ? p.contentType : null });
  }
  return out;
}

export type DiaryLinkView =
  | { state: "invalid" }
  | { state: "expired"; entryDate: string }
  | {
      state: "ok";
      entryDate: string;
      expiresAt: Date;
      projectName: string;
      hasDiary: boolean;
      photos: DiaryLinkPhoto[];
      totalPct: number;
      groups: Array<{ label: string; percent: number }>;
    };

/** Tìm link + ảnh nhật ký đã duyệt của đúng dự án + ngày đó (đọc mới mỗi lần mở → luôn là bản mới nhất). */
export async function loadDiaryLinkView(rawCode: string, opts: { withProgress: boolean }): Promise<DiaryLinkView> {
  const code = cleanDiaryLinkCode(rawCode);
  if (!code) return { state: "invalid" };
  const link = await prisma.customerDiaryLink.findUnique({ where: { code } });
  if (!link) return { state: "invalid" };
  const entryDate = ymd(link.entryDate);
  if (link.expiresAt.getTime() <= Date.now()) return { state: "expired", entryDate };

  const project = await prisma.project.findUnique({
    where: { id: link.projectId },
    select: { name: true, customerPortalEnabled: true },
  });
  if (!project || !project.customerPortalEnabled) return { state: "invalid" };

  const diaries = await prisma.constructionDiary.findMany({
    where: { projectId: link.projectId, entryDate: link.entryDate, approvedAt: { not: null } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { taskPhotos: true, sitePhotos: true },
  });
  const photos = diaries.flatMap((d) => [...photosOf(d.taskPhotos), ...photosOf(d.sitePhotos)]);

  let totalPct = 0;
  const groups: Array<{ label: string; percent: number }> = [];
  if (opts.withProgress) {
    // % hạng mục lớn = cùng cách tính tab Tiến độ cổng chủ nhà (theo ngân sách), chỉ trả % — không tên công tác, không tiền.
    const prog = await computeEstimateProgress(link.projectId);
    totalPct = prog.earnedPct;
    const byKey = new Map<string, { label: string; amt: number; earned: number }>();
    for (const t of prog.tasks) {
      let g = byKey.get(t.groupKey);
      if (!g) {
        g = { label: t.groupLabel, amt: 0, earned: 0 };
        byKey.set(t.groupKey, g);
      }
      g.amt += t.amount;
      g.earned += (t.percent / 100) * t.amount;
    }
    Array.from(byKey.values()).forEach((g) => {
      groups.push({ label: g.label, percent: g.amt > 0 ? Math.round((g.earned / g.amt) * 100) : 0 });
    });
  }

  return {
    state: "ok",
    entryDate,
    expiresAt: link.expiresAt,
    projectName: project.name,
    hasDiary: diaries.length > 0,
    photos,
    totalPct,
    groups,
  };
}
