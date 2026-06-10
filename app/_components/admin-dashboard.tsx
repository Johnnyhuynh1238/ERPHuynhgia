"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

type Stage = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type Overview = {
  alertBar: {
    leadsNotContacted: number;
    tasksDelayed: number;
    paymentsOverdue: number;
    missingEvening: number;
  };
  pipeline: {
    counts: Record<Stage, number>;
    hot: Record<Stage, number>;
  };
  sections: {
    customers: { leadsNew: number; designStuck: number; handoverPending: number };
    construction: { missingMorning: number; missingEvening: number; tasksDelayed: number };
    finance: {
      dueIn7DaysCount: number;
      dueIn7DaysSum: number;
      paymentsOverdue: number;
      materialPending: number;
      subPaymentsPending: number;
    };
  };
  smallCards: {
    kpi: { top: { userId: string; name: string; score: number }[]; bottom: { userId: string; name: string; score: number }[] };
    subcontractor: { contractsAwaitingEval: number; contractsNew: number };
  };
};

const STAGE_LABEL: Record<Stage, string> = {
  1: "Lead",
  2: "Liên hệ",
  3: "Thiết kế",
  4: "CB TC",
  5: "Thi công",
  6: "Bàn giao",
  7: "Bảo hành",
};

const STAGE_PILL: Record<Stage, string> = {
  1: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  2: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  3: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  4: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  5: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  6: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  7: "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

function fmtVnd(n: number) {
  if (!n) return "0đ";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2).replace(/\.00$/, "") + " tỷ";
  if (n >= 1_000_000) return Math.round(n / 1_000_000) + " tr";
  return n.toLocaleString("vi-VN") + "đ";
}

export function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard-overview", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d))
      .catch(() => toast.error("Không tải được dashboard"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="rounded-2xl border border-[#252840] bg-[#13151f] p-6 text-sm text-[#8892b0]">Đang tải dashboard…</div>;
  if (!data) return <div className="rounded-2xl border border-[#252840] bg-[#13151f] p-6 text-sm text-[#8892b0]">Lỗi tải dashboard.</div>;

  const a = data.alertBar;
  const alerts: { label: string; n: number; href: string; tone: string }[] = [
    { label: "lead chưa gọi", n: a.leadsNotContacted, href: "/customer-pipeline?stage=1", tone: "text-amber-300" },
    { label: "task trễ", n: a.tasksDelayed, href: "/projects", tone: "text-rose-300" },
    { label: "khoản thu quá hạn", n: a.paymentsOverdue, href: "/payments", tone: "text-rose-300" },
    { label: "báo cáo chiều thiếu", n: a.missingEvening, href: "/reports", tone: "text-amber-300" },
  ];
  const totalHot = alerts.reduce((s, x) => s + x.n, 0);

  return (
    <div className="space-y-4">
      {/* Alert bar */}
      <div className={`rounded-2xl border p-3 ${totalHot > 0 ? "border-rose-500/40 bg-rose-500/5" : "border-emerald-500/40 bg-emerald-500/5"}`}>
        <div className="flex items-center gap-2 text-sm">
          <span className={totalHot > 0 ? "text-rose-300" : "text-emerald-300"}>
            {totalHot > 0 ? "⚡ Cần xử lý ngay" : "✓ Mọi thứ ổn"}
          </span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#cdd3e1]">
            {alerts.map((al) =>
              al.n > 0 ? (
                <Link key={al.label} href={al.href} className="inline-flex items-center gap-1 rounded-md border border-[#252840] bg-[#0f1117] px-2 py-1 hover:border-amber-400">
                  <b className={al.tone}>{al.n}</b> {al.label}
                </Link>
              ) : null,
            )}
          </div>
        </div>
      </div>

      {/* Pipeline strip */}
      <section className="rounded-2xl border border-[#252840] bg-[#13151f] p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Pipeline khách hàng</div>
          <Link href="/customer-pipeline" className="text-xs text-amber-300 hover:underline">
            Xem chi tiết →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {([1, 2, 3, 4, 5, 6, 7] as Stage[]).map((s) => {
            const n = data.pipeline.counts[s];
            const hot = data.pipeline.hot[s];
            return (
              <Link
                key={s}
                href={`/customer-pipeline?stage=${s}`}
                className={`relative rounded-xl border px-3 py-2 ${STAGE_PILL[s]} hover-ring`}
              >
                <div className="text-[10px] opacity-80">{`[${s}] ${STAGE_LABEL[s]}`}</div>
                <div className="text-xl font-semibold tabular-nums text-white">{n}</div>
                {hot > 0 && (
                  <span className="absolute right-1.5 top-1.5 inline-flex items-center rounded-full bg-rose-500/30 px-1.5 py-0.5 text-[10px] font-bold text-rose-200">
                    ⚠ {hot}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* 3 khu vực lớn */}
      <div className="grid gap-3 md:grid-cols-3">
        {/* Khách hàng */}
        <BigCard
          icon="👥"
          title="Khách hàng"
          href="/customer-pipeline"
          ctaLabel="Mở Pipeline KH"
          accent="border-violet-500/40 bg-violet-500/5"
          rows={[
            { label: "Lead mới chưa gọi", n: data.sections.customers.leadsNew, href: "/customer-pipeline?stage=1" },
            { label: "Thiết kế stuck > 7 ngày", n: data.sections.customers.designStuck, href: "/customer-pipeline?stage=3" },
            { label: "Khách chờ bàn giao", n: data.sections.customers.handoverPending, href: "/customer-pipeline?stage=6" },
          ]}
        />
        {/* Thi công */}
        <BigCard
          icon="🔨"
          title="Thi công hôm nay"
          href="/reports"
          ctaLabel="Mở Báo cáo"
          accent="border-orange-500/40 bg-orange-500/5"
          rows={[
            { label: "Báo cáo sáng thiếu", n: data.sections.construction.missingMorning, href: "/reports" },
            { label: "Báo cáo chiều thiếu", n: data.sections.construction.missingEvening, href: "/reports" },
            { label: "Task đang trễ", n: data.sections.construction.tasksDelayed, href: "/projects" },
          ]}
        />
        {/* Tài chính */}
        <BigCard
          icon="💰"
          title="Tài chính"
          href="/payments"
          ctaLabel="Mở Thanh toán"
          accent="border-emerald-500/40 bg-emerald-500/5"
          rows={[
            {
              label: `Sắp thu 7 ngày · ${fmtVnd(data.sections.finance.dueIn7DaysSum)}`,
              n: data.sections.finance.dueIn7DaysCount,
              href: "/payments",
            },
            { label: "Khoản thu quá hạn", n: data.sections.finance.paymentsOverdue, href: "/payments" },
            { label: "Đề xuất vật tư chờ duyệt", n: data.sections.finance.materialPending, href: "/proposals" },
            { label: "Chi thầu phụ chờ duyệt", n: data.sections.finance.subPaymentsPending, href: "/sub-payments" },
          ]}
        />
      </div>

      {/* 4 card nhỏ */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SmallCard title="👷 KPI Kỹ sư" href="/admin/kpi" ctaLabel="Xem KPI tổng">
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wide text-emerald-300">TOP 3</div>
            {data.smallCards.kpi.top.length === 0 ? (
              <div className="text-xs text-[#8892b0]">Chưa có dữ liệu KPI tháng này</div>
            ) : (
              data.smallCards.kpi.top.map((r) => (
                <div key={r.userId} className="flex justify-between gap-2 text-xs">
                  <span className="truncate">{r.name}</span>
                  <b className="text-emerald-300 tabular-nums">{r.score.toFixed(1)}</b>
                </div>
              ))
            )}
            {data.smallCards.kpi.bottom.length > 0 && (
              <>
                <div className="mt-2 text-[11px] uppercase tracking-wide text-rose-300">BOTTOM 3</div>
                {data.smallCards.kpi.bottom.map((r) => (
                  <div key={r.userId} className="flex justify-between gap-2 text-xs">
                    <span className="truncate">{r.name}</span>
                    <b className="text-rose-300 tabular-nums">{r.score.toFixed(1)}</b>
                  </div>
                ))}
              </>
            )}
          </div>
        </SmallCard>

        <SmallCard title="🤝 Thầu phụ" href="/sub-contracts" ctaLabel="Quản lý HĐ thầu phụ">
          <StatLine n={data.smallCards.subcontractor.contractsNew} label="HĐ draft chờ duyệt" href="/sub-contracts" />
          <StatLine n={data.smallCards.subcontractor.contractsAwaitingEval} label="HĐ chờ chấm điểm" href="/sub-contracts" />
        </SmallCard>

        <SmallCard title="📊 Báo cáo" href="/reports" ctaLabel="Mở báo cáo">
          <div className="text-xs text-[#8892b0]">
            Theo dõi báo cáo sáng/chiều của từng KS theo dự án và phase.
          </div>
        </SmallCard>

        <SmallCard title="⚙ Cài đặt nhanh" href="/admin/users" ctaLabel="">
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <Link href="/admin/users" className="rounded-md border border-[#252840] bg-[#0f1117] px-2 py-1.5 text-center hover:border-amber-400">User</Link>
            <Link href="/admin/templates" className="rounded-md border border-[#252840] bg-[#0f1117] px-2 py-1.5 text-center hover:border-amber-400">Template</Link>
            <Link href="/admin/shifts" className="rounded-md border border-[#252840] bg-[#0f1117] px-2 py-1.5 text-center hover:border-amber-400">Ca làm</Link>
            <Link href="/admin/specialties" className="rounded-md border border-[#252840] bg-[#0f1117] px-2 py-1.5 text-center hover:border-amber-400">Chuyên môn</Link>
            <Link href="/admin/kpi-settings" className="rounded-md border border-[#252840] bg-[#0f1117] px-2 py-1.5 text-center hover:border-amber-400">Cài đặt KPI</Link>
            <Link href="/admin/evaluation-criteria" className="rounded-md border border-[#252840] bg-[#0f1117] px-2 py-1.5 text-center hover:border-amber-400">Tiêu chí TP</Link>
          </div>
        </SmallCard>
      </div>

      <style jsx>{`
        @media (hover: hover) {
          .hover-ring:hover { box-shadow: 0 0 0 1px currentColor inset; }
        }
      `}</style>
    </div>
  );
}

function BigCard({
  icon,
  title,
  href,
  ctaLabel,
  rows,
  accent,
}: {
  icon: string;
  title: string;
  href: string;
  ctaLabel: string;
  rows: { label: string; n: number; href: string }[];
  accent: string;
}) {
  return (
    <article className={`flex flex-col rounded-2xl border bg-[#13151f] p-4 ${accent}`}>
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold">
          <span className="mr-1">{icon}</span>
          {title}
        </div>
      </div>
      <div className="mt-3 flex-1 space-y-1.5">
        {rows.map((r) => (
          <StatLine key={r.label} n={r.n} label={r.label} href={r.href} />
        ))}
      </div>
      <Link
        href={href}
        className="mt-3 inline-flex items-center justify-center rounded-lg border border-[#252840] bg-[#0f1117] px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/10"
      >
        {ctaLabel} →
      </Link>
    </article>
  );
}

function SmallCard({
  title,
  href,
  ctaLabel,
  children,
}: {
  title: string;
  href: string;
  ctaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-[#252840] bg-[#13151f] p-3">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-2 flex-1">{children}</div>
      {ctaLabel ? (
        <Link href={href} className="mt-3 text-xs text-amber-300 hover:underline">
          {ctaLabel} →
        </Link>
      ) : null}
    </article>
  );
}

function StatLine({ n, label, href }: { n: number; label: string; href: string }) {
  const has = n > 0;
  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs ${
        has
          ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-400"
          : "border-[#252840] bg-[#0f1117] text-[#8892b0] hover:border-[#3a4060]"
      }`}
    >
      <span>{label}</span>
      <b className={`tabular-nums ${has ? "text-amber-300" : "text-[#5b6275]"}`}>{n}</b>
    </Link>
  );
}
