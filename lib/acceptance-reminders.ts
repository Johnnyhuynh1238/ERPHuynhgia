/**
 * Nhắc KS ký biên bản nghiệm thu (chủ nhà + thầu phụ/đội khoán).
 *  - Còn sót : mốc chờ nhưng nằm trước mốc đã ký xa nhất (đã làm qua mà quên ký/up BB).
 *  - Sắp tới : các mốc chờ kế tiếp theo thứ tự thi công (seq).
 * Dùng cho khối "Biên bản nghiệm thu sắp tới" ở màn KS + cron nhắc 16:30 (Zalo + push).
 */
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push-server";
import { sendZaloBridge } from "@/lib/zalo-notify";

export type AcceptanceKind = "chu_nha" | "thau_phu";
type Row = { id: string; projectId: string; seq: number; kind: string; title: string; status: string };
export type UpcomingItem = Row & { missed: boolean };

const UPCOMING_LIMIT: Record<AcceptanceKind, number> = { thau_phu: 3, chu_nha: 1 };
const MISSED_LIMIT = 5;

function pickItems(rows: Row[]): UpcomingItem[] {
  const out: UpcomingItem[] = [];
  for (const kind of ["thau_phu", "chu_nha"] as const) {
    const list = rows.filter((r) => r.kind === kind).sort((a, b) => a.seq - b.seq);
    const maxSigned = list.reduce((m, r) => (r.status === "signed" ? Math.max(m, r.seq) : m), 0);
    const pending = list.filter((r) => r.status !== "signed");
    out.push(...pending.filter((r) => r.seq < maxSigned).slice(0, MISSED_LIMIT).map((r) => ({ ...r, missed: true })));
    out.push(
      ...pending
        .filter((r) => r.seq > maxSigned)
        .slice(0, UPCOMING_LIMIT[kind])
        .map((r) => ({ ...r, missed: false })),
    );
  }
  return out;
}

/** BB còn sót + sắp tới theo từng dự án (giữ thứ tự projectIds). */
export async function loadUpcomingAcceptance(projectIds: string[]): Promise<Map<string, UpcomingItem[]>> {
  const result = new Map<string, UpcomingItem[]>();
  if (!projectIds.length) return result;
  const rows: Row[] = await prisma.acceptanceMilestone.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, projectId: true, seq: true, kind: true, title: true, status: true },
  });
  for (const pid of projectIds) {
    const items = pickItems(rows.filter((r) => r.projectId === pid));
    if (items.length) result.set(pid, items);
  }
  return result;
}

export function upcomingItemLabel(m: UpcomingItem): string {
  return m.kind === "chu_nha" ? `Đợt ${m.seq} · ${m.title}` : m.title;
}

export function upcomingItemHref(m: UpcomingItem): string {
  return `/ks-ql/sub/${m.projectId}/${m.kind === "thau_phu" ? "nghiem-thu-thau-phu" : "nghiem-thu"}?open=${m.id}`;
}

function ddmmToday(): string {
  return new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" });
}

/** Cron 16:30: mỗi KS (pm_engineer dự án đang thi công) nhận 1 tin Zalo + 1 push liệt kê BB cần ký. */
export async function sendAcceptanceReminders() {
  const assignments = await prisma.projectMemberAssignment.findMany({
    where: { role: "pm_engineer", project: { status: "in_progress" }, user: { isActive: true } },
    select: {
      projectId: true,
      project: { select: { name: true } },
      user: { select: { id: true, zaloThreadId: true } },
    },
  });
  const upcoming = await loadUpcomingAcceptance(Array.from(new Set(assignments.map((a) => a.projectId))));

  const byKs = new Map<string, { zaloThreadId: string | null; projects: { name: string; items: UpcomingItem[] }[] }>();
  for (const a of assignments) {
    const items = upcoming.get(a.projectId);
    if (!items) continue;
    const entry = byKs.get(a.user.id) ?? { zaloThreadId: a.user.zaloThreadId, projects: [] };
    if (!entry.projects.some((p) => p.name === a.project.name)) entry.projects.push({ name: a.project.name, items });
    byKs.set(a.user.id, entry);
  }

  let zalo = 0;
  let push = 0;
  for (const [ksId, { zaloThreadId, projects }] of Array.from(byKs.entries())) {
    const missed = projects.reduce((n, p) => n + p.items.filter((i) => i.missed).length, 0);
    const blocks = projects.map((p) => {
      const lines = p.items.map(
        (i) =>
          `${i.missed ? "⚠️ Còn sót" : "• Sắp tới"} [${i.kind === "thau_phu" ? "Thầu phụ" : "Chủ nhà"}] ${upcomingItemLabel(i)}`,
      );
      return `🏠 ${p.name}\n${lines.join("\n")}`;
    });
    const text =
      `📝 Nhắc ký biên bản nghiệm thu ${ddmmToday()}\n` +
      `Hôm nay làm xong công tác nào thì ký BB công tác đó, chụp BB + ảnh up lên ERP.\n\n` +
      blocks.join("\n\n");
    if (zaloThreadId && (await sendZaloBridge({ threadId: zaloThreadId, text }))) zalo++;
    try {
      const r = await sendPushToUser(ksId, {
        title: missed ? `⚠️ Còn ${missed} biên bản nghiệm thu chưa ký` : "📝 Nhắc ký biên bản nghiệm thu",
        body: projects.map((p) => `${p.name}: ${upcomingItemLabel(p.items[0])}`).join(" · "),
        url: "/ks-ql/sub",
        tag: "ks-acceptance-reminder",
      });
      if (r.sent) push++;
    } catch (err) {
      console.error("[acceptance-reminder push]", err);
    }
  }
  return { ks: byKs.size, zalo, push };
}
