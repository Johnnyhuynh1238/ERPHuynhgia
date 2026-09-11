import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { computeEstimateProgress, type ProgressTask } from "@/lib/estimate-progress";

// Tiến độ portal (flow mới): theo công tác dự toán. Read-only cho chủ nhà, ẩn tiền — chỉ %.
// Tổng & % giai đoạn tính earned value (money-weighted) phía server; chủ nhà chỉ thấy phần trăm.

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

type PhaseGroup = { phaseCode: string; phaseName: string; items: ProgressTask[] };

export default async function CustomerTimelinePage({ params }: { params: { token: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  const prog = await computeEstimateProgress(project.id);

  // Gộp theo giai đoạn, giữ thứ tự đã sort (GĐ tăng dần, khoán cuối).
  const groups: PhaseGroup[] = [];
  const byPhase = new Map<string, PhaseGroup>();
  for (const t of prog.tasks) {
    let g = byPhase.get(t.phaseCode);
    if (!g) {
      g = { phaseCode: t.phaseCode, phaseName: t.phaseName, items: [] };
      byPhase.set(t.phaseCode, g);
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
        <div className="text-sm owner-muted">Theo dõi tiến độ từng công tác trong dự án.</div>
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
        <section className="owner-section text-sm owner-muted">Dự án chưa có công tác nào để hiển thị.</section>
      ) : null}

      {groups.map((phase, index) => {
        const total = phase.items.length;
        const done = phase.items.filter((t) => t.done || t.percent >= 100).length;
        // % giai đoạn = earned value theo tiền (money-weighted), nhưng ẩn tiền — chỉ hiện %.
        const amt = phase.items.reduce((s, t) => s + t.amount, 0);
        const earned = phase.items.reduce((s, t) => s + (t.percent / 100) * t.amount, 0);
        const percent = amt > 0 ? Math.round((earned / amt) * 100) : 0;
        const completed = total > 0 && percent >= 100;
        const active = percent > 0 && percent < 100;
        const phaseLabel = phase.phaseCode === "KHOAN" ? "KHOÁN" : `GĐ ${phase.phaseCode}`;

        return (
          <section key={phase.phaseCode} className="owner-section">
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
                  <div>
                    <h2 className="font-semibold text-white">{phase.phaseName}</h2>
                    <div className="text-xs owner-muted">{phaseLabel}</div>
                  </div>
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
              {phase.items.map((t) => (
                <div key={`${t.refType}|${t.refId}`} className="owner-card block">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {t.taskCode ? <div className="text-xs owner-muted">{t.taskCode}</div> : null}
                      <div className="font-semibold text-white">{t.name}</div>
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
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
