import { AlertTriangle } from "lucide-react";
import type { ProjectFinanceSummary } from "@/lib/project-finance-summary";

const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n));

function Row({
  label,
  value,
  sub,
  tone = "default",
  strong = false,
  indent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "orange" | "red" | "muted";
  strong?: boolean;
  indent?: boolean;
}) {
  const valueColor =
    tone === "orange"
      ? "text-[#fb923c]"
      : tone === "red"
        ? "text-[#f87171]"
        : tone === "muted"
          ? "text-[#5a6080]"
          : "text-[#f0f2ff]";
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${indent ? "pl-3" : ""}`}>
      <div className="min-w-0">
        <span className={`text-sm ${strong ? "font-semibold text-[#f0f2ff]" : "text-[#8892b0]"}`}>{label}</span>
        {sub && <span className="block text-[11px] leading-tight text-[#5a6080]">{sub}</span>}
      </div>
      <span
        className={`shrink-0 font-mono tabular-nums ${strong ? "text-lg font-bold" : "text-[15px] font-semibold"} ${valueColor}`}
      >
        {value}
      </span>
    </div>
  );
}

export function ProjectFinanceHeader({ summary }: { summary: ProjectFinanceSummary }) {
  const s = summary;
  return (
    <section className="rounded-2xl border border-[#252840] bg-[#13151f] p-4">
      <h3 className="mb-3 px-1 text-[11px] font-bold uppercase tracking-wider text-[#8892b0]">Tài chính dự án</h3>

      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {/* THU */}
        <div className="sm:pr-6">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#fb923c]">Dòng tiền vào</span>
            <span className="text-[10px] uppercase tracking-wide text-[#5a6080]">Chủ nhà</span>
          </div>
          <div className="divide-y divide-[#252840]">
            <Row label="Giá trị hợp đồng" value={`${vnd(s.contractValue)}đ`} strong />
            <Row label="Đã thu" value={`${vnd(s.collected)}đ`} tone="orange" />
            <Row label="Còn phải thu" value={`${vnd(s.remaining)}đ`} />
          </div>
          {/* Thanh tiến độ thu */}
          <div className="mt-2 px-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#252840]">
              <div className="h-full rounded-full bg-[#f97316]" style={{ width: `${s.collectedPct}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[11px] tabular-nums text-[#8892b0]">
              <span>Đã thu {s.collectedPct.toLocaleString("vi-VN")}%</span>
              <span>Còn {(Math.round((100 - s.collectedPct) * 10) / 10).toLocaleString("vi-VN")}%</span>
            </div>
          </div>
        </div>

        {/* CHI */}
        <div className="mt-4 border-t border-[#252840] pt-4 sm:mt-0 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#fb923c]">Chi phí</span>
            <span className="text-[10px] uppercase tracking-wide text-[#5a6080]">Đã phát sinh</span>
          </div>
          <div className="divide-y divide-[#252840]">
            <Row label="Chi phí đến hiện tại" value={`${vnd(s.incurred)}đ`} strong />
            <Row label="Thực chi · đã trả" value={`${vnd(s.spent)}đ`} indent />
            <Row label="Nợ NCC còn lại" value={`${vnd(s.supplierDebt)}đ`} tone={s.supplierDebt > 0 ? "red" : "default"} indent />
            <Row
              label="Tổng dự toán"
              value={s.budgetTotal != null ? `${vnd(s.budgetTotal)}đ` : "—"}
              sub={s.budgetTotal == null ? "Chưa lập bảng dự toán" : undefined}
              tone={s.budgetTotal == null ? "muted" : "default"}
            />
            <Row
              label="Còn phải chi"
              value={s.remainingToSpend != null ? `${vnd(s.remainingToSpend)}đ` : "—"}
              sub={s.remainingToSpend == null ? "Cần dự toán để tính" : undefined}
              tone={s.remainingToSpend == null ? "muted" : s.remainingToSpend < 0 ? "red" : "default"}
            />
          </div>
        </div>
      </div>

      {/* Đáy: quỹ thực = thu − thực chi */}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#252840] pt-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#8892b0]">Quỹ thực · Thu − Thực chi</span>
        <span
          className={`font-mono text-lg font-bold tabular-nums ${s.collected - s.spent >= 0 ? "text-[#22c55e]" : "text-[#f87171]"}`}
        >
          {s.collected - s.spent >= 0 ? "+" : "−"}
          {vnd(Math.abs(s.collected - s.spent))}đ
        </span>
      </div>

      {s.budgetTotal == null && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-[#5a6080]">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-[#fbbf24]" />
          <span>Chưa lập dự toán — chưa tính được “còn phải chi”. Lập ở mục Dự toán.</span>
        </div>
      )}
    </section>
  );
}
