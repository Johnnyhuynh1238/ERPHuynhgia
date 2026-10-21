/**
 * Nhắc KS chốt nhật ký thi công: cron 17:00 + 20:00 (host crontab).
 * Mỗi KS (pm_engineer dự án đang thi công) chỉ nhận tin khi còn dự án hôm nay chưa chốt nhật ký;
 * tin liệt kê đúng các dự án thiếu. Gửi Zalo + push.
 */
import { prisma } from "@/lib/prisma";
import { getWorkDateVn } from "@/lib/attendance";
import { KS_QL_ENGINEER_IDS } from "@/lib/ks-ql-engineers";
import { sendPushToUser } from "@/lib/push-server";
import { sendZaloBridge } from "@/lib/zalo-notify";

function ddmmToday(): string {
  return new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" });
}

export async function sendDiaryReminders({ dryRun = false }: { dryRun?: boolean } = {}) {
  const entryDate = getWorkDateVn();
  const assignments = await prisma.projectMemberAssignment.findMany({
    where: {
      role: "pm_engineer",
      userId: { in: Array.from(KS_QL_ENGINEER_IDS) },
      project: { status: "in_progress" },
      user: { isActive: true },
    },
    select: {
      projectId: true,
      project: { select: { name: true } },
      user: { select: { id: true, zaloThreadId: true } },
    },
  });
  const done = await prisma.constructionDiary.findMany({
    where: { entryDate, savedAt: { not: null }, projectId: { in: assignments.map((a) => a.projectId) } },
    select: { projectId: true, ksId: true },
  });
  const doneKeys = new Set(done.map((d) => `${d.projectId}:${d.ksId}`));

  const byKs = new Map<string, { zaloThreadId: string | null; projects: string[] }>();
  for (const a of assignments) {
    if (doneKeys.has(`${a.projectId}:${a.user.id}`)) continue;
    const entry = byKs.get(a.user.id) ?? { zaloThreadId: a.user.zaloThreadId, projects: [] };
    if (!entry.projects.includes(a.project.name)) entry.projects.push(a.project.name);
    byKs.set(a.user.id, entry);
  }

  let zalo = 0;
  let push = 0;
  const preview: { ksId: string; projects: string[] }[] = [];
  for (const [ksId, { zaloThreadId, projects }] of Array.from(byKs.entries())) {
    preview.push({ ksId, projects });
    if (dryRun) continue;
    const text =
      `📒 Nhắc chốt nhật ký thi công ${ddmmToday()}\n` +
      `Còn ${projects.length} dự án hôm nay chưa chốt nhật ký:\n` +
      projects.map((n) => `🏠 ${n}`).join("\n") +
      `\n\nVào ERP → chọn dự án → NHẬT KÝ THI CÔNG, điền đủ 5 mục rồi bấm Chốt.`;
    if (zaloThreadId && (await sendZaloBridge({ threadId: zaloThreadId, text }))) zalo++;
    try {
      const r = await sendPushToUser(ksId, {
        title: `📒 Còn ${projects.length} nhật ký hôm nay chưa chốt`,
        body: projects.join(" · "),
        url: "/ks-ql/sub",
        tag: "ks-diary-reminder",
      });
      if (r.sent) push++;
    } catch (err) {
      console.error("[diary-reminder push]", err);
    }
  }
  return { ks: byKs.size, zalo, push, dryRun, preview };
}
