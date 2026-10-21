/**
 * Nhiệm vụ hằng ngày của KS qua LINK Zalo (KS không cần đăng nhập ERP).
 *
 * Mỗi loại (kind) 1 khung giờ — cron host gọi /api/cron/ks-daily-report?kind=...&step=...:
 *  - headcount (số thợ):          ask 07:00 · remind 07:10→07:50 · close 08:00
 *  - eod (khối lượng + ảnh):      ask 16:00 · remind 16:30→21:30 (1 giờ/lần) · close 22:00
 * ask   : mỗi dự án in_progress có KS (pm_engineer) → 1 dòng pending/dự án/ngày/kind,
 *         nick Zalo cty gửi mỗi KS 1 link /nv/<token> (token HMAC = kind + KS + ngày).
 * remind: gửi lại link cho KS chưa lưu (headcount 10 phút/lần, eod 1 giờ/lần). eod: KS đã tự
 *         viết nhật ký trên app (có nội dung + ảnh) thì tính là đã báo, không nhắc nữa.
 * close : pending → expired, gửi tổng hợp cho admin (anh Huỳnh Luận).
 * KS mở link → điền mọi công trình → Lưu 1 lần → khoá (không sửa). Nội dung ghi vào
 * Nhật ký thi công (construction_diaries) của ngày đó.
 *
 * Zalo của KS tự tra theo SĐT trong ERP (bridge /lookup = openzca friend find) — KS chỉ cần
 * kết bạn với nick cty.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteObjectFromMinio, putObjectToMinio } from "@/lib/minio";
import { lookupZaloUserByPhone, sendZaloBridge } from "@/lib/zalo-notify";

export type KsTaskKind = "headcount" | "eod";

export const KS_TASKS: Record<KsTaskKind, { title: string; closeHour: number; hint: string }> = {
  headcount: { title: "Báo số thợ", closeHour: 8, hint: "điền số thợ từng công trình" },
  eod: { title: "Báo cáo cuối ngày", closeHour: 22, hint: "ghi khối lượng làm được + chụp ảnh từng công trình" },
};

export function isKsTaskKind(v: unknown): v is KsTaskKind {
  return v === "headcount" || v === "eod";
}

export const MAX_WORKERS = 300;
export const EOD_MAX_PHOTOS_PER_PROJECT = 10;
const DIARY_MAX_PHOTOS = 20; // khớp giới hạn màn nhật ký KS
const EOD_TEXT_MAX = 4000;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const SITE_URL = (process.env.NEXTAUTH_URL || "https://erp.huynhgia6.com").replace(/\/$/, "");

/** Ngày hôm nay theo giờ VN, dạng Date 00:00 UTC (khớp cột @db.Date). */
export function vnToday(now = new Date()): Date {
  const vn = new Date(now.getTime() + 7 * 3600 * 1000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
}

function vnHour(now = new Date()): number {
  return new Date(now.getTime() + 7 * 3600 * 1000).getUTCHours();
}

export function ddmm(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Link của ngày `date` đã đóng chưa (qua giờ chốt hôm đó hoặc đã sang ngày khác). */
function isClosed(kind: KsTaskKind, date: Date, now = new Date()): boolean {
  if (date.getTime() !== vnToday(now).getTime()) return true;
  return vnHour(now) >= KS_TASKS[kind].closeHour;
}

// ───────────────────────────── token ─────────────────────────────

function sign(payload: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Thiếu NEXTAUTH_SECRET");
  return createHmac("sha256", secret).update(`ks-task:${payload}`).digest("hex").slice(0, 32);
}

/** Token 1 loại / 1 KS / 1 ngày: "<kind>.<ksId>.<yyyymmdd>.<hmac>" — không đoán/sửa ra link khác được. */
export function ksTaskToken(kind: KsTaskKind, ksId: string, date: Date): string {
  const payload = `${kind}.${ksId}.${ymd(date)}`;
  return `${payload}.${sign(payload)}`;
}

export function ksTaskLink(kind: KsTaskKind, ksId: string, date: Date): string {
  return `${SITE_URL}/nv/${ksTaskToken(kind, ksId, date)}`;
}

export function parseKsTaskToken(token: string): { kind: KsTaskKind; ksId: string; date: Date } | null {
  // Không neo `$`: Zalo hay dính chữ dòng sau vào link (vd "...<hmac>Anh") → bỏ đuôi rác, HMAC vẫn kiểm.
  const m = /^(headcount|eod)\.([0-9a-f-]{36})\.(\d{4})(\d{2})(\d{2})\.([0-9a-f]{32})/.exec(token || "");
  if (!m) return null;
  const expected = Buffer.from(sign(`${m[1]}.${m[2]}.${m[3]}${m[4]}${m[5]}`));
  const got = Buffer.from(m[6]);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  return {
    kind: m[1] as KsTaskKind,
    ksId: m[2],
    date: new Date(Date.UTC(Number(m[3]), Number(m[4]) - 1, Number(m[5]))),
  };
}

// ───────────────────────────── form (trang /nv) ─────────────────────────────

export type KsTaskFormRow = {
  id: string;
  projectName: string;
  status: string;
  workerCount: number | null;
  /** eod: nội dung nhật ký hiện có (KS có thể đã viết trên app) */
  tasksDone: string;
  issues: string;
  photoCount: number;
  locked: boolean; // nhật ký đã duyệt → không ghi đè
};

export type KsTaskForm = {
  kind: KsTaskKind;
  ksName: string;
  dateLabel: string;
  state: "open" | "done" | "expired";
  rows: KsTaskFormRow[];
};

function photoCountOf(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

export async function getKsTaskForm(token: string, now = new Date()): Promise<KsTaskForm | null> {
  const parsed = parseKsTaskToken(token);
  if (!parsed) return null;
  const { kind, ksId, date } = parsed;
  const rows = await prisma.ksDailyReport.findMany({
    where: { ksId, reportDate: date, kind },
    orderBy: { project: { name: "asc" } },
    select: {
      id: true,
      projectId: true,
      status: true,
      workerCount: true,
      project: { select: { name: true } },
      ks: { select: { fullName: true } },
    },
  });
  if (rows.length === 0) return null;
  const diaries = await prisma.constructionDiary.findMany({
    where: { ksId, entryDate: date, projectId: { in: rows.map((r) => r.projectId) } },
    select: { projectId: true, tasksDone: true, issues: true, taskPhotos: true, approvedAt: true },
  });
  const byProject = new Map(diaries.map((d) => [d.projectId, d]));

  const pending = rows.some((r) => r.status === "pending");
  let state: KsTaskForm["state"];
  if (pending) state = isClosed(kind, date, now) ? "expired" : "open";
  else state = rows.every((r) => r.status === "done") ? "done" : "expired";
  return {
    kind,
    ksName: rows[0].ks.fullName,
    dateLabel: ddmm(date),
    state,
    rows: rows.map((r) => {
      const d = byProject.get(r.projectId);
      return {
        id: r.id,
        projectName: r.project.name,
        status: r.status,
        workerCount: r.workerCount,
        tasksDone: d?.tasksDone ?? "",
        issues: d?.issues ?? "",
        photoCount: photoCountOf(d?.taskPhotos),
        locked: Boolean(d?.approvedAt),
      };
    }),
  };
}

type SubmitResult = { ok: true } | { ok: false; message: string };

const ALREADY = "Hôm nay anh đã báo rồi, không sửa được.";

async function loadPending(token: string, kind: KsTaskKind, now: Date) {
  const parsed = parseKsTaskToken(token);
  if (!parsed || parsed.kind !== kind) return { error: "Link không hợp lệ." } as const;
  if (isClosed(kind, parsed.date, now)) {
    return { error: `Đã quá ${KS_TASKS[kind].closeHour}:00, link đã hết hạn.` } as const;
  }
  const rows = await prisma.ksDailyReport.findMany({
    where: { ksId: parsed.ksId, reportDate: parsed.date, kind, status: "pending" },
    select: { id: true, projectId: true },
  });
  if (rows.length === 0) return { error: ALREADY } as const;
  return { parsed, rows } as const;
}

const STALE = "stale";

/** pending → done (điều kiện status=pending → bấm Lưu 2 lần / 2 tab không ghi đè). */
async function markDone(tx: Prisma.TransactionClient, id: string, data: { workerCount?: number }) {
  const u = await tx.ksDailyReport.updateMany({
    where: { id, status: "pending" },
    data: { status: "done", answeredAt: new Date(), ...data },
  });
  if (u.count !== 1) throw new Error(STALE);
}

/**
 * Sáng — KS bấm Lưu số thợ: phải điền đủ mọi công trình. Cập nhật số thợ vào nhật ký ngày đó
 * (giữ nguyên nội dung KS đã viết, bỏ qua nhật ký đã duyệt).
 */
export async function submitHeadcount(token: string, counts: Record<string, unknown>, now = new Date()): Promise<SubmitResult> {
  const loaded = await loadPending(token, "headcount", now);
  if ("error" in loaded) return { ok: false, message: loaded.error as string };
  const { parsed, rows } = loaded;

  const values: number[] = [];
  for (const r of rows) {
    const raw = counts[r.id];
    const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n < 0) return { ok: false, message: "Anh điền đủ số thợ cho tất cả công trình (không có thợ ghi 0)." };
    if (n > MAX_WORKERS) return { ok: false, message: `Số ${n} lớn quá, anh kiểm tra lại.` };
    values.push(n);
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        await markDone(tx, rows[i].id, { workerCount: values[i] });
        const key = { projectId: rows[i].projectId, ksId: parsed.ksId, entryDate: parsed.date };
        const diary = await tx.constructionDiary.findUnique({
          where: { projectId_ksId_entryDate: key },
          select: { id: true, approvedAt: true },
        });
        if (!diary) {
          await tx.constructionDiary.create({ data: { ...key, workerCount: values[i] } });
        } else if (!diary.approvedAt) {
          await tx.constructionDiary.update({ where: { id: diary.id }, data: { workerCount: values[i] } });
        }
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === STALE) return { ok: false, message: ALREADY };
    throw err;
  }
  return { ok: true };
}

export type EodPhoto = { type: string; body: Buffer };
type StoredPhoto = { key: string; contentType: string; width: number | null; height: number | null };

/**
 * Chiều — KS bấm Lưu báo cáo cuối ngày: mỗi công trình cần nội dung (công việc + khối lượng)
 * và ít nhất 1 ảnh (ảnh mới hoặc ảnh đã có trong nhật ký). Ghi vào nhật ký ngày đó:
 * tasks_done / issues / task_photos (+ảnh mới), saved_at = now. Nhật ký đã duyệt → không đụng.
 */
export async function submitEod(
  token: string,
  input: Record<string, { tasksDone?: unknown; issues?: unknown } | undefined>,
  photos: Record<string, EodPhoto[] | undefined>,
  now = new Date(),
): Promise<SubmitResult> {
  const loaded = await loadPending(token, "eod", now);
  if ("error" in loaded) return { ok: false, message: loaded.error as string };
  const { parsed, rows } = loaded;

  const diaries = await prisma.constructionDiary.findMany({
    where: { ksId: parsed.ksId, entryDate: parsed.date, projectId: { in: rows.map((r) => r.projectId) } },
    select: { id: true, projectId: true, approvedAt: true, taskPhotos: true },
  });
  const byProject = new Map(diaries.map((d) => [d.projectId, d]));

  const plan = rows.map((r) => {
    const v = input[r.id] || {};
    const diary = byProject.get(r.projectId);
    return {
      row: r,
      tasksDone: String(v.tasksDone ?? "").slice(0, EOD_TEXT_MAX).trim(),
      issues: String(v.issues ?? "").slice(0, EOD_TEXT_MAX).trim(),
      diary,
      stored: (Array.isArray(diary?.taskPhotos) ? (diary!.taskPhotos as unknown as StoredPhoto[]) : []).slice(),
      files: photos[r.id] || [],
    };
  });
  for (const p of plan) {
    if (p.diary?.approvedAt) continue; // nhật ký đã duyệt → chỉ đánh dấu đã báo
    if (!p.tasksDone) return { ok: false, message: "Anh ghi công việc + khối lượng hôm nay cho tất cả công trình." };
    if (p.files.length > EOD_MAX_PHOTOS_PER_PROJECT) {
      return { ok: false, message: `Tối đa ${EOD_MAX_PHOTOS_PER_PROJECT} ảnh mỗi công trình.` };
    }
    if (p.stored.length + p.files.length === 0) return { ok: false, message: "Mỗi công trình cần ít nhất 1 ảnh." };
    if (p.stored.length + p.files.length > DIARY_MAX_PHOTOS) {
      return { ok: false, message: `Nhật ký mỗi công trình tối đa ${DIARY_MAX_PHOTOS} ảnh.` };
    }
    if (p.files.some((f) => !PHOTO_TYPES.has(f.type))) return { ok: false, message: "Chỉ nhận ảnh JPG/PNG/WEBP." };
  }

  // Up ảnh trước (ngoài transaction); lỗi giữa chừng → xoá ảnh đã up.
  const uploaded: string[] = [];
  const day = parsed.date.toISOString().slice(0, 10);
  try {
    for (const p of plan) {
      if (p.diary?.approvedAt) continue;
      for (const f of p.files) {
        let width: number | null = null;
        let height: number | null = null;
        try {
          const meta = await sharp(f.body).metadata();
          width = meta.width ?? null;
          height = meta.height ?? null;
        } catch {
          throw new Error("bad-image");
        }
        const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
        const key = `construction-diary/${p.row.projectId}/${parsed.ksId}/${day}/task/${randomUUID()}.${ext}`;
        await putObjectToMinio({ key, body: f.body, contentType: f.type });
        uploaded.push(key);
        p.stored.push({ key, contentType: f.type, width, height });
      }
    }

    const savedAt = new Date();
    await prisma.$transaction(async (tx) => {
      for (const p of plan) {
        await markDone(tx, p.row.id, {});
        if (p.diary?.approvedAt) continue;
        const data = {
          tasksDone: p.tasksDone,
          issues: p.issues || null,
          taskPhotos: p.stored as unknown as Prisma.InputJsonValue,
          savedAt,
        };
        if (p.diary) {
          await tx.constructionDiary.update({ where: { id: p.diary.id }, data });
        } else {
          await tx.constructionDiary.create({
            data: { projectId: p.row.projectId, ksId: parsed.ksId, entryDate: parsed.date, ...data },
          });
        }
      }
    });
  } catch (err) {
    await Promise.all(uploaded.map((k) => deleteObjectFromMinio(k).catch(() => undefined)));
    if (err instanceof Error && err.message === STALE) return { ok: false, message: ALREADY };
    if (err instanceof Error && err.message === "bad-image") return { ok: false, message: "Có ảnh bị lỗi, anh chọn lại ảnh khác." };
    throw err;
  }
  return { ok: true };
}

// ───────────────────────────── cron steps ─────────────────────────────

function linkText(kind: KsTaskKind, ksId: string, date: Date, remind: boolean): string {
  const t = KS_TASKS[kind];
  return (
    `${remind ? "⏰ Nhắc: " : ""}${kind === "headcount" ? "👷" : "📋"} ${t.title} ${ddmm(date)} – hạn ${t.closeHour}:00\n` +
    `Anh bấm link, ${t.hint} rồi bấm Lưu (lưu 1 lần, không sửa được):\n` +
    // Link để CUỐI tin: Zalo gộp chữ dòng sau vào link → token hỏng.
    ksTaskLink(kind, ksId, date)
  );
}

/** Gửi (hoặc nhắc) link cho mọi KS còn dòng pending hôm nay. */
async function sendPendingLinks(kind: KsTaskKind, date: Date, remind: boolean) {
  const ksList = await prisma.user.findMany({
    where: { isActive: true, zaloThreadId: { not: null }, ksDailyReports: { some: { reportDate: date, kind, status: "pending" } } },
    select: { id: true, zaloThreadId: true },
  });
  let sent = 0;
  for (const ks of ksList) {
    if (!ks.zaloThreadId) continue;
    await prisma.ksDailyReport.updateMany({
      where: { ksId: ks.id, reportDate: date, kind, status: "pending" },
      data: remind ? { remindedAt: new Date() } : { askedAt: new Date() },
    });
    if (await sendZaloBridge({ threadId: ks.zaloThreadId, text: linkText(kind, ks.id, date, remind) })) sent++;
  }
  return sent;
}

export async function stepAsk(kind: KsTaskKind, now = new Date()) {
  const date = vnToday(now);
  const assignments = await prisma.projectMemberAssignment.findMany({
    where: { role: "pm_engineer", project: { status: "in_progress" }, user: { isActive: true } },
    orderBy: [{ isPrimary: "desc" }, { assignedAt: "asc" }],
    select: {
      projectId: true,
      project: { select: { name: true } },
      user: { select: { id: true, fullName: true, phone: true, zaloThreadId: true } },
    },
  });

  // 1 KS / dự án (ưu tiên primary).
  const seen = new Set<string>();
  const picked: typeof assignments = [];
  for (const a of assignments) {
    if (seen.has(a.projectId)) continue;
    seen.add(a.projectId);
    picked.push(a);
  }

  // KS chưa có Zalo → tra theo SĐT 1 lần rồi lưu lại.
  const linked = new Map<string, boolean>();
  for (const a of picked) {
    const u = a.user;
    if (linked.has(u.id)) continue;
    if (u.zaloThreadId) {
      linked.set(u.id, true);
      continue;
    }
    let ok = false;
    const zaloId = u.phone ? await lookupZaloUserByPhone(u.phone) : null;
    if (zaloId) {
      const taken = await prisma.user.findFirst({ where: { zaloThreadId: zaloId }, select: { id: true } });
      if (!taken) {
        await prisma.user.update({ where: { id: u.id }, data: { zaloThreadId: zaloId } });
        ok = true;
      }
    }
    linked.set(u.id, ok);
  }

  const data = picked
    .filter((a) => linked.get(a.user.id))
    .map((a) => ({ projectId: a.projectId, ksId: a.user.id, reportDate: date, kind }));
  // @@unique(projectId, reportDate, kind) chặn trùng khi cron chạy lại.
  const created = data.length ? (await prisma.ksDailyReport.createMany({ data, skipDuplicates: true })).count : 0;

  // Cảnh báo KS chưa có Zalo chỉ 1 lần/ngày (buổi sáng).
  const missing = picked.filter((a) => !linked.get(a.user.id));
  if (missing.length && kind === "headcount") {
    const lines = missing.map(
      (a) => `• ${a.project.name}: KS ${a.user.fullName}${a.user.phone ? ` (${a.user.phone})` : " (chưa có SĐT)"}`,
    );
    await sendZaloBridge({
      to: "admin",
      text:
        `⚠️ Không gửi được link cho KS — chưa tìm thấy Zalo:\n${lines.join("\n")}\n` +
        `KS cần kết bạn Zalo với nick công ty, SĐT trong ERP phải đúng số Zalo.`,
    });
  }
  return { created, sent: await sendPendingLinks(kind, date, false), unlinked: missing.length };
}

export async function stepRemind(kind: KsTaskKind, now = new Date()) {
  if (vnHour(now) >= KS_TASKS[kind].closeHour) return { sent: 0 };
  const date = vnToday(now);
  const synced = kind === "eod" ? await syncEodFromDiary(date) : 0;
  return { synced, sent: await sendPendingLinks(kind, date, true) };
}

/**
 * eod pending nhưng KS đã viết nhật ký ngày đó trên app (có nội dung + ≥1 ảnh, hoặc đã duyệt)
 * → đánh dấu done để không nhắc nữa.
 */
async function syncEodFromDiary(date: Date) {
  const pending = await prisma.ksDailyReport.findMany({
    where: { reportDate: date, kind: "eod", status: "pending" },
    select: { id: true, projectId: true, ksId: true },
  });
  if (!pending.length) return 0;
  const diaries = await prisma.constructionDiary.findMany({
    where: { entryDate: date, projectId: { in: pending.map((r) => r.projectId) } },
    select: { projectId: true, ksId: true, tasksDone: true, taskPhotos: true, approvedAt: true },
  });
  const ids = pending
    .filter((r) => {
      const d = diaries.find((x) => x.projectId === r.projectId && x.ksId === r.ksId);
      return d && (d.approvedAt || (d.tasksDone?.trim() && photoCountOf(d.taskPhotos) > 0));
    })
    .map((r) => r.id);
  if (!ids.length) return 0;
  const u = await prisma.ksDailyReport.updateMany({
    where: { id: { in: ids }, status: "pending" },
    data: { status: "done", answeredAt: new Date() },
  });
  return u.count;
}

export async function stepClose(kind: KsTaskKind, now = new Date()) {
  const date = vnToday(now);
  const expired = await prisma.ksDailyReport.updateMany({
    where: { reportDate: date, kind, status: "pending" },
    data: { status: "expired" },
  });
  const summary = kind === "headcount" ? await headcountSummaryText(date) : await eodSummaryText(date);
  if (summary) await sendZaloBridge({ to: "admin", text: summary });
  return { expired: expired.count };
}

/** Tổng hợp số thợ 1 ngày (cho admin). null nếu ngày đó không hỏi dự án nào. */
export async function headcountSummaryText(date = vnToday()): Promise<string | null> {
  const rows = await prisma.ksDailyReport.findMany({
    where: { reportDate: date, kind: "headcount" },
    orderBy: { project: { name: "asc" } },
    select: {
      status: true,
      workerCount: true,
      project: { select: { name: true } },
      ks: { select: { fullName: true } },
    },
  });
  if (rows.length === 0) return null;
  let total = 0;
  const lines = rows.map((r) => {
    if (r.status === "done" && r.workerCount !== null) {
      total += r.workerCount;
      return `• ${r.project.name}: ${r.workerCount} thợ (${r.ks.fullName})`;
    }
    if (r.status === "pending") return `• ${r.project.name}: ⏳ chưa báo (${r.ks.fullName})`;
    return `• ${r.project.name}: ❌ không báo (${r.ks.fullName})`;
  });
  return `👷 Số thợ ${ddmm(date)}:\n${lines.join("\n")}\nTổng: ${total} thợ`;
}

/** Tổng hợp báo cáo cuối ngày (cho admin): công việc + số ảnh từng công trình. */
export async function eodSummaryText(date = vnToday()): Promise<string | null> {
  const rows = await prisma.ksDailyReport.findMany({
    where: { reportDate: date, kind: "eod" },
    orderBy: { project: { name: "asc" } },
    select: {
      status: true,
      projectId: true,
      ksId: true,
      project: { select: { name: true } },
      ks: { select: { fullName: true } },
    },
  });
  if (rows.length === 0) return null;
  const diaries = await prisma.constructionDiary.findMany({
    where: { entryDate: date, projectId: { in: rows.map((r) => r.projectId) } },
    select: { projectId: true, ksId: true, tasksDone: true, issues: true, taskPhotos: true },
  });
  const clip = (s: string, n: number) => {
    const t = s.replace(/\s+/g, " ").trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  };
  const blocks = rows.map((r) => {
    if (r.status !== "done") {
      return `• ${r.project.name}: ${r.status === "pending" ? "⏳ chưa báo" : "❌ không báo"} (${r.ks.fullName})`;
    }
    const d = diaries.find((x) => x.projectId === r.projectId && x.ksId === r.ksId);
    let s = `• ${r.project.name} (${r.ks.fullName}) – ${photoCountOf(d?.taskPhotos)} ảnh\n  ${clip(d?.tasksDone || "", 200)}`;
    if (d?.issues) s += `\n  ⚠️ ${clip(d.issues, 150)}`;
    return s;
  });
  return `📋 Báo cáo cuối ngày ${ddmm(date)}:\n${blocks.join("\n")}\nXem ảnh + duyệt nhật ký trên ERP.`;
}
