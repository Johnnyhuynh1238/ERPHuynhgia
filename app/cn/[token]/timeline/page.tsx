import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { computeEstimateProgress, type ProgressTask } from "@/lib/estimate-progress";

// Tiến độ portal chủ nhà: mirror màn Tiến độ ERP (computeEstimateProgress theo ngân sách).
// Read-only, nhóm theo PHẦN (Thô/Hoàn thiện/Nhân công/Chung), ẨN TIỀN — chỉ %.
// Tổng & % mỗi phần tính earned value (money-weighted) phía server; chủ nhà chỉ thấy %.

function dateText(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("vi-VN");
}

function statusText(t: ProgressTask) {
  if (t.done || t.percent >= 100) return "Hoàn tất";
  if (t.percent > 0) return "Đang thi công";
  return "Chưa bắt đầu";
}

function statusTone(t: ProgressTask) {
  if (t.done || t.percent >= 100) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (t.percent > 0) return "border-orange-500/30 bg-orange-500/10 text-orange-200";
  return "border-[#2d3249] bg-[#13151f] text-[#a8b0c8]";
}

type Group = { groupKey: string; groupLabel: string; items: ProgressTask[] };

export default async function CustomerTimelinePage({ params }: { params: { token: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  const prog = await computeEstimateProgress(project.id);

  // Gộp theo phần (groupKey), giữ thứ tự đã sort (Thô → Hoàn thiện → NC → Chung).
  const groups: Group[] = [];
  const byKey = new Map<string, Group>();
  for (const t of prog.tasks) {
    let g = byKey.get(t.groupKey);
    if (!g) {
      g = { groupKey: t.groupKey, groupLabel: t.groupLabel, items: [] };
      byKey.set(t.groupKey, g);
      groups.push(g);
    }
    g.items.push(t);
  }

  const acceptanceMilestones = await prisma.acceptanceMilestone.findMany({
    where: { projectId: project.id },
    orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
    select: { id: true, seq: true, title: true, status: true, signedAt: true },
  });

  return (
    <div className="owner-portal-page">
      <section className="owner-section">
        <div className="owner-section-title">TIẾN ĐỘ THI CÔNG</div>
        <div className="text-sm owner-muted">Theo dõi tiến độ từng phần công việc trong dự án.</div>
      </section>

      {/* Tổng tiến độ */}
      <section className="owner-section">
        <div className="flex items-end justify-between gap-3">
          <div className="text-sm owner-muted">Tổng tiến độ dự án</div>
          <div className="text-2xl font-bold text-white">{prog.earnedPct}%</div>
        </div>
        <div className="mt-3 owner-progress-track">
          <div
            className={prog.earnedPct >= 100 ? "h-full rounded-full bg-emerald-500" : "owner-progress-fill"}
            style={{ width: `${Math.max(0, Math.min(100, prog.earnedPct))}%` }}
          />
        </div>
      </section>

      {acceptanceMilestones.length > 0 ? (
        <section className="owner-section">
          <div className="owner-section-title">MỐC NGHIỆM THU</div>
          <div className="text-sm owner-muted">Bấm vào mốc để xem và ký nghiệm thu.</div>
          <div className="mt-3 space-y-2">
            {acceptanceMilestones.map((m) => (
              <Link key={m.id} href={`/cn/${params.token}/acceptance/${m.id}`} className="owner-card block">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs owner-muted">Mốc #{m.seq}</div>
                    <div className="font-semibold text-white">{m.title}</div>
                    {m.status === "signed" && m.signedAt ? (
                      <div className="mt-1 text-xs text-emerald-300">
                        Đã ký lúc {m.signedAt.toLocaleString("vi-VN")}
                      </div>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${
                      m.status === "signed"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        : "border-orange-500/30 bg-orange-500/10 text-orange-200"
                    }`}
                  >
                    {m.status === "signed" ? "Đã nghiệm thu" : "Chờ ký nghiệm thu"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {groups.length === 0 ? (
        <section className="owner-section text-sm owner-muted">Dự án chưa có phần công việc nào để hiển thị.</section>
      ) : null}

      {groups.map((group, index) => {
        const total = group.items.length;
        const done = group.items.filter((t) => t.done || t.percent >= 100).length;
        // % phần = earned value theo ngân sách (money-weighted), nhưng ẩn tiền — chỉ hiện %.
        const amt = group.items.reduce((s, t) => s + t.amount, 0);
        const earned = group.items.reduce((s, t) => s + (t.percent / 100) * t.amount, 0);
        const percent = amt > 0 ? Math.round((earned / amt) * 100) : 0;
        const completed = total > 0 && percent >= 100;
        const active = percent > 0 && percent < 100;

        return (
          <section key={group.groupKey} className="owner-section">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  completed ? "bg-emerald-500 text-black" : active ? "bg-[#ff8a3d] text-black" : "bg-[#2a2a2a] text-neutral-400"
                }`}
              >
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold text-white">{group.groupLabel}</h2>
                  <div className="text-right text-xs owner-muted">
                    {done}/{total}
                    <br />
                    {percent}%
                  </div>
                </div>
                <div className="mt-3 owner-progress-track">
                  <div
                    className={completed ? "h-full rounded-full bg-emerald-500" : "owner-progress-fill"}
                    style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {group.items.map((t) => {
                const start = dateText(t.planStart);
                const end = dateText(t.planEnd);
                const plan = start || end ? `Dự kiến: ${start ?? "?"} - ${end ?? "?"}` : null;
                return (
                  <div key={`${t.refType}|${t.refId}`} className="owner-card block">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-white">{t.name}</div>
                        {plan ? <div className="mt-1 text-xs owner-muted">{plan}</div> : null}
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${statusTone(t)}`}>
                        {statusText(t)}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="owner-progress-track h-1.5 flex-1">
                        <div className="owner-progress-fill" style={{ width: `${Math.max(0, Math.min(100, t.percent))}%` }} />
                      </div>
                      <span className="shrink-0 text-xs owner-muted">{t.percent}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
