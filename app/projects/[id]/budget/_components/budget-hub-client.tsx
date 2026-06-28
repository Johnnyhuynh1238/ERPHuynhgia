"use client";

import Link from "next/link";

type Props = {
  projectId: string;
  projectName: string;
  projectCode: string;
  contractValue: number | null;
  profitMarginPct: number | null;
  canEdit: boolean;
  componentCount: number;
  itemCount: number;
  itemsWithNormCount: number;
  normCount: number;
  totalLabor: number;
  totalMaterial: number;
  totalEquipment: number;
  totalAmount: number;
};

type IconStatus = "done" | "partial" | "empty" | "auto" | "soon";

type IconDef = {
  key: string;
  emoji: string;
  label: string;
  sublabel?: string;
  href?: string;
  status: IconStatus;
  meta?: string;
};

type Section = {
  title: string;
  hint: string;
  icons: IconDef[];
};

function fmtVND(n: number) {
  return n.toLocaleString("vi-VN");
}

function fmtShort(n: number) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + " tỷ";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + " tr";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + " k";
  return n.toLocaleString("vi-VN");
}

const STATUS_TONE: Record<IconStatus, { ring: string; badgeBg: string; badgeText: string; badgeLabel: string; dimmed: boolean }> = {
  done:    { ring: "ring-emerald-500/40", badgeBg: "bg-emerald-500/20", badgeText: "text-emerald-300", badgeLabel: "✓ Xong",   dimmed: false },
  partial: { ring: "ring-amber-500/40",   badgeBg: "bg-amber-500/20",   badgeText: "text-amber-200",   badgeLabel: "⚠ Còn",    dimmed: false },
  empty:   { ring: "ring-zinc-700",       badgeBg: "bg-zinc-700/40",    badgeText: "text-zinc-300",    badgeLabel: "Chưa nhập", dimmed: false },
  auto:    { ring: "ring-sky-500/30",     badgeBg: "bg-sky-500/15",     badgeText: "text-sky-200",     badgeLabel: "Tự động",   dimmed: false },
  soon:    { ring: "ring-zinc-800",       badgeBg: "bg-zinc-800/60",    badgeText: "text-zinc-400",    badgeLabel: "Sắp có",    dimmed: true  },
};

export function BudgetHubClient({
  projectId,
  projectName,
  projectCode,
  contractValue,
  profitMarginPct,
  componentCount,
  itemCount,
  itemsWithNormCount,
  normCount,
  totalLabor,
  totalMaterial,
  totalEquipment,
  totalAmount,
}: Props) {
  const klStatus: IconStatus = itemCount === 0 ? "empty" : itemCount >= 20 ? "done" : "partial";
  const dmStatus: IconStatus =
    itemCount === 0
      ? "empty"
      : itemsWithNormCount === 0
        ? "empty"
        : itemsWithNormCount >= itemCount
          ? "done"
          : "partial";

  const sections: Section[] = [
    {
      title: "1. Khối lượng dự án",
      hint: "Bóc khối lượng + gắn định mức cho từng công tác",
      icons: [
        {
          key: "kl",
          emoji: "📐",
          label: "Khối lượng",
          sublabel: componentCount === 0 ? "Chưa có cấu kiện" : `${componentCount} cấu kiện · ${itemsWithNormCount}/${itemCount} đã gắn ĐM`,
          href: `/projects/${projectId}/budget/quantities`,
          status: klStatus === "done" ? dmStatus : klStatus,
        },
      ],
    },
    {
      title: "2. Tổng hợp hao phí (tự động)",
      hint: "Khối lượng × Định mức = số lượng VT/NC/MM cần",
      icons: [
        {
          key: "thvt",
          emoji: "📦",
          label: "Hao phí VT",
          sublabel: itemsWithNormCount > 0 ? "Vật tư cần mua" : "Cần gắn ĐM trước",
          href: `/projects/${projectId}/budget/totals?tab=vt`,
          status: itemsWithNormCount > 0 ? "auto" : "soon",
        },
        {
          key: "thnc",
          emoji: "👥",
          label: "Hao phí NC",
          sublabel: itemsWithNormCount > 0 ? "Công thợ theo bậc" : "Cần gắn ĐM trước",
          href: `/projects/${projectId}/budget/totals?tab=nc`,
          status: itemsWithNormCount > 0 ? "auto" : "soon",
        },
        {
          key: "thmtc",
          emoji: "🏗",
          label: "Hao phí MM",
          sublabel: itemsWithNormCount > 0 ? "Ca máy thi công" : "Cần gắn ĐM trước",
          href: `/projects/${projectId}/budget/totals?tab=mm`,
          status: itemsWithNormCount > 0 ? "auto" : "soon",
        },
      ],
    },
    {
      title: "3. Giá theo công tác",
      hint: "Bảng giá chi tiết VT + NC + MM cho từng công tác",
      icons: [
        {
          key: "btask",
          emoji: "📑",
          label: "Giá theo công tác",
          sublabel: itemsWithNormCount > 0 ? "Bảng giá từng công tác" : "Cần gắn ĐM trước",
          href: `/projects/${projectId}/budget/by-task`,
          status: itemsWithNormCount > 0 ? "auto" : "soon",
        },
      ],
    },
    {
      title: "4. Chi phí khác & Dự phòng",
      hint: "Set % phân bổ và buffer trượt giá",
      icons: [
        { key: "cpk",  emoji: "🔧", label: "CP khác trực tiếp", sublabel: "Vận chuyển, ATLĐ…",       status: "soon" },
        { key: "cpc",  emoji: "🏢", label: "CP chung CT",       sublabel: "Quản lý công trường",      status: "soon" },
        { key: "cpql", emoji: "📊", label: "CP quản lý DN",     sublabel: "Phân bổ VP",               status: "soon" },
        { key: "dp",   emoji: "📈", label: "Dự phòng trượt giá",sublabel: "Buffer rủi ro",            status: "soon" },
      ],
    },
  ];

  const allInputIcons = [
    ...sections[0].icons,
    ...sections[3].icons,
  ];
  const doneCount = allInputIcons.filter((i) => i.status === "done").length;
  const totalInput = allInputIcons.length;
  const progressPct = Math.round((doneCount / totalInput) * 100);

  const breakdown = totalAmount > 0
    ? {
        vt: Math.round((totalMaterial / totalAmount) * 100),
        nc: Math.round((totalLabor / totalAmount) * 100),
        m:  Math.round((totalEquipment / totalAmount) * 100),
      }
    : { vt: 0, nc: 0, m: 0 };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Dự toán</div>
          <h1 className="text-base font-semibold text-zinc-100 sm:text-lg">{projectName}</h1>
          <div className="text-xs text-zinc-500">{projectCode}</div>
        </div>
        <Link
          href={`/projects/${projectId}/budget/catalog`}
          title="Định mức + Đơn giá toàn hệ thống"
          className="shrink-0 rounded-xl border border-[#252840] bg-[#1a1d2e] px-2.5 py-1.5 text-[11px] text-zinc-300 ring-1 ring-zinc-700 hover:border-sky-500/50 hover:text-sky-200"
        >
          <span className="block text-lg leading-none">🛠</span>
          <span className="mt-0.5 block">Thư viện chung</span>
        </Link>
      </div>

      {/* Card tổng */}
      <div className="rounded-2xl border border-[#252840] bg-gradient-to-br from-[#1a1d2e] to-[#0f1220] p-4 ring-1 ring-orange-500/10">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Giá vốn dự kiến</div>
        <div className="mt-1 text-2xl font-bold text-zinc-100 sm:text-3xl">
          {totalAmount > 0 ? fmtVND(totalAmount) + " đ" : "—"}
        </div>

        {totalAmount > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded-lg bg-emerald-500/10 px-2 py-1.5 ring-1 ring-emerald-500/30">
              <div className="font-medium text-emerald-200">VT</div>
              <div className="text-emerald-300/80">{breakdown.vt}% · {fmtShort(totalMaterial)}</div>
            </div>
            <div className="rounded-lg bg-amber-500/10 px-2 py-1.5 ring-1 ring-amber-500/30">
              <div className="font-medium text-amber-200">NC</div>
              <div className="text-amber-300/80">{breakdown.nc}% · {fmtShort(totalLabor)}</div>
            </div>
            <div className="rounded-lg bg-violet-500/10 px-2 py-1.5 ring-1 ring-violet-500/30">
              <div className="font-medium text-violet-200">MTC</div>
              <div className="text-violet-300/80">{breakdown.m}% · {fmtShort(totalEquipment)}</div>
            </div>
          </div>
        )}

        {contractValue !== null && contractValue > 0 && (
          <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
            <span>Giá trị hợp đồng: <span className="text-zinc-200">{fmtVND(contractValue)} đ</span></span>
            {profitMarginPct !== null && (
              <span>Biên LN: <span className="text-zinc-200">{profitMarginPct}%</span></span>
            )}
          </div>
        )}

        {/* Progress */}
        <div className="mt-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Tiến độ nhập liệu</span>
            <span className="font-mono text-zinc-300">{doneCount}/{totalInput} · {progressPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Sections */}
      {sections.map((sec) => (
        <section key={sec.title} className="space-y-2">
          <div className="flex items-baseline gap-2 px-1">
            <h2 className="text-sm font-semibold text-zinc-200">{sec.title}</h2>
            <span className="text-[11px] text-zinc-500">{sec.hint}</span>
          </div>
          <div className={`grid gap-2 ${sec.icons.length === 2 ? "grid-cols-2" : sec.icons.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
            {sec.icons.map((icon) => {
              const tone = STATUS_TONE[icon.status];
              const Inner = (
                <div className={`relative flex h-full flex-col items-center justify-between rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 ring-1 ${tone.ring} transition active:scale-95 ${tone.dimmed ? "opacity-60" : ""}`}>
                  <span className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${tone.badgeBg} ${tone.badgeText}`}>
                    {tone.badgeLabel}
                  </span>
                  <div className="mt-3 text-3xl leading-none">{icon.emoji}</div>
                  <div className="mt-2 text-center text-[12px] font-medium leading-tight text-zinc-100">{icon.label}</div>
                  {icon.sublabel && (
                    <div className="mt-0.5 text-center text-[10px] leading-tight text-zinc-400">{icon.sublabel}</div>
                  )}
                </div>
              );
              return icon.href ? (
                <Link key={icon.key} href={icon.href} className="block">
                  {Inner}
                </Link>
              ) : (
                <div key={icon.key}>{Inner}</div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="pt-2 text-center text-[11px] text-zinc-600">
        Anh nhập đủ 4 nhóm là dự toán tự ra số.
      </div>
    </div>
  );
}
