/**
 * Nhắc KS ký biên bản nghiệm thu (chủ nhà + thầu phụ/đội khoán).
 *  - Còn sót : mốc chờ nhưng nằm trước mốc đã ký xa nhất (đã làm qua mà quên ký/up BB).
 *  - Sắp tới : các mốc chờ kế tiếp theo thứ tự thi công (seq).
 * Dùng cho khối "Biên bản nghiệm thu sắp tới" ở màn KS + cron nhắc 16:30 (Zalo + push).
 * Từ 02/11/2026: loại mốc nào của dự án ĐÃ GÁN công tác tiến độ (Gán mốc GĐ5) → dùng tiến độ thật:
 *  - Đến hạn : công tác gắn xong hết mà chưa ký (lib/gan-moc).
 *  - Sắp tới : đang làm (xong 1 phần công tác gắn).
 * Chưa gán → giữ cách đoán theo thứ tự seq như cũ.
 */
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push-server";
import { guiKs, type KsTinDong } from "@/lib/ks-tin-cho";
import { ensureEsign, esignLink } from "@/lib/acceptance-esign";
import { loadMilestoneReadiness, type MilestoneReadiness } from "@/lib/gan-moc";

export type AcceptanceKind = "chu_nha" | "thau_phu";
type Row = { id: string; projectId: string; seq: number; kind: string; title: string; status: string };
export type UpcomingItem = Row & { missed: boolean; due: boolean };

const UPCOMING_LIMIT: Record<AcceptanceKind, number> = { thau_phu: 3, chu_nha: 1 };
const MISSED_LIMIT = 5;

const DUE_LIMIT = 8;

function pickItems(rows: Row[], ready: Map<string, MilestoneReadiness>): UpcomingItem[] {
  const out: UpcomingItem[] = [];
  for (const kind of ["thau_phu", "chu_nha"] as const) {
    const list = rows.filter((r) => r.kind === kind).sort((a, b) => a.seq - b.seq);
    const maxSigned = list.reduce((m, r) => (r.status === "signed" ? Math.max(m, r.seq) : m), 0);
    const pending = list.filter((r) => r.status !== "signed");
    const st = (r: Row) => ready.get(r.id)?.state;
    const assigned = list.some((r) => (ready.get(r.id)?.total ?? 0) > 0);
    if (assigned) {
      // Đã gán mốc: đến hạn (công tác xong hết) trước, rồi mốc đang làm. Mốc chưa gán công tác mà nằm
      // trước mốc đã ký xa nhất → vẫn tính "còn sót" như cũ.
      out.push(...pending.filter((r) => st(r) === "den_han").slice(0, DUE_LIMIT).map((r) => ({ ...r, missed: false, due: true })));
      out.push(
        ...pending
          .filter((r) => st(r) === "chua_gan" && r.seq < maxSigned)
          .slice(0, MISSED_LIMIT)
          .map((r) => ({ ...r, missed: true, due: false })),
      );
      out.push(
        ...pending
          .filter((r) => st(r) === "dang_lam")
          .slice(0, UPCOMING_LIMIT[kind])
          .map((r) => ({ ...r, missed: false, due: false })),
      );
      continue;
    }
    out.push(
      ...pending.filter((r) => r.seq < maxSigned).slice(0, MISSED_LIMIT).map((r) => ({ ...r, missed: true, due: false })),
    );
    out.push(
      ...pending
        .filter((r) => r.seq > maxSigned)
        .slice(0, UPCOMING_LIMIT[kind])
        .map((r) => ({ ...r, missed: false, due: false })),
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
  const ready = await loadMilestoneReadiness(projectIds);
  for (const pid of projectIds) {
    const items = pickItems(rows.filter((r) => r.projectId === pid), ready);
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

/**
 * Cron 16:30: mỗi KS (pm_engineer dự án đang thi công) nhận 1 tin Zalo + 1 push liệt kê BB cần ký.
 * KS đã chuyển sang thư ký (lib/ks-tin-cho) → không Zalo thẳng, mỗi mốc 1 dòng hàng chờ cho thư ký.
 */
export async function sendAcceptanceReminders() {
  const assignments = await prisma.projectMemberAssignment.findMany({
    where: { role: "pm_engineer", project: { status: "in_progress" }, user: { isActive: true } },
    select: {
      projectId: true,
      project: { select: { code: true, name: true } },
      user: { select: { id: true, zaloThreadId: true } },
    },
  });
  const upcoming = await loadUpcomingAcceptance(Array.from(new Set(assignments.map((a) => a.projectId))));

  const byKs = new Map<
    string,
    { zaloThreadId: string | null; projects: { id: string; code: string; name: string; items: UpcomingItem[] }[] }
  >();
  for (const a of assignments) {
    const items = upcoming.get(a.projectId);
    if (!items) continue;
    const entry = byKs.get(a.user.id) ?? { zaloThreadId: a.user.zaloThreadId, projects: [] };
    if (!entry.projects.some((p) => p.name === a.project.name)) {
      entry.projects.push({ id: a.projectId, code: a.project.code, name: a.project.name, items });
    }
    byKs.set(a.user.id, entry);
  }

  // Mỗi BB cần ký → link ký online (tạo phiên nếu chưa có; KS chỉ bấm link là điền + ký).
  const links = new Map<string, string>();
  const esignIds = new Map<string, string>();
  const allItems = Array.from(upcoming.values()).flat();
  for (const i of allItems) {
    try {
      const { esign } = await ensureEsign(i.id);
      links.set(i.id, esign.ksToken);
      esignIds.set(i.id, esign.id);
    } catch (err) {
      console.error("[acceptance-reminder esign]", i.id, err);
    }
  }

  let zalo = 0;
  let push = 0;
  for (const [ksId, { zaloThreadId, projects }] of Array.from(byKs.entries())) {
    const missed = projects.reduce((n, p) => n + p.items.filter((i) => i.missed).length, 0);
    const blocks = projects.map((p) => {
      // Link để CUỐI dòng riêng: Zalo hay dính chữ dòng sau vào link → trang /ky chỉ lấy 32 hex đầu.
      const lines = p.items.map((i) => {
        const tk = links.get(i.id);
        return (
          `${i.missed ? "⚠️ Còn sót" : i.due ? "🔔 Đến hạn" : "• Sắp tới"} [${i.kind === "thau_phu" ? "Thầu phụ" : "Chủ nhà"}] ${upcomingItemLabel(i)}` +
          (tk ? `\n${esignLink(tk)}` : "")
        );
      });
      return `🏠 ${p.name}\n${lines.join("\n")}`;
    });
    const text =
      `📝 Nhắc ký biên bản nghiệm thu ${ddmmToday()}\n` +
      `Hôm nay làm xong công tác nào thì bấm link BB công tác đó: điền kết quả, chụp ảnh, ký trên máy. ` +
      `Chủ nhà: ký xong máy tự gửi khách ký. Đội khoán: ký xong máy tự gửi PDF cho đội.\n\n` +
      blocks.join("\n\n");
    // Tin KS qua thư ký (sếp 05/11/2026): 1 dòng hàng chờ / mốc, kèm link ký + phiên ký (thư ký xem BB đã ký chưa).
    const rows: KsTinDong[] = projects.flatMap((p) =>
      p.items.map((i) => {
        const tk = links.get(i.id);
        return {
          loai: "nghiem_thu" as const,
          projectId: p.id,
          duAn: `${p.code} — ${p.name}`,
          moc:
            `${i.missed ? "Còn sót" : i.due ? "Đến hạn" : "Sắp tới"} · ` +
            `${i.kind === "thau_phu" ? "Thầu phụ" : "Chủ nhà"} · ${upcomingItemLabel(i)}`,
          link: tk ? esignLink(tk) : null,
          noiDung: text,
          refId: esignIds.get(i.id) ?? null,
        };
      }),
    );
    if (await guiKs({ ksId, threadId: zaloThreadId, text, rows })) zalo++;
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
