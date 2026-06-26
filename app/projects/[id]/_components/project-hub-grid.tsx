import Link from "next/link";
import {
  Activity,
  Banknote,
  BookText,
  Calculator,
  ClipboardList,
  CreditCard,
  FolderOpen,
  Handshake,
  History,
  Library,
  ListChecks,
  Package,
  ShieldCheck,
  Sunset,
  Users,
  type LucideIcon,
} from "lucide-react";

type HubItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  desc?: string;
};

type HubGroup = {
  title: string;
  tone: "blue" | "emerald" | "amber" | "violet";
  items: HubItem[];
};

const TONE_RING: Record<HubGroup["tone"], string> = {
  blue: "ring-blue-500/20",
  emerald: "ring-emerald-500/20",
  amber: "ring-amber-500/20",
  violet: "ring-violet-500/20",
};

const TONE_DOT: Record<HubGroup["tone"], string> = {
  blue: "bg-blue-400",
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  violet: "bg-violet-400",
};

const TONE_ICON_BG: Record<HubGroup["tone"], string> = {
  blue: "bg-blue-500/10 text-blue-300 ring-blue-500/30",
  emerald: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  amber: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  violet: "bg-violet-500/10 text-violet-300 ring-violet-500/30",
};

type Caps = {
  canViewBudget: boolean;
  canViewWorkOrders: boolean;
  canViewEod: boolean;
  canViewQcMapping: boolean;
  canViewPayroll: boolean;
  canProposeMaterials: boolean;
  canViewSubContracts: boolean;
  canViewConstructionLog: boolean;
  canViewPayments: boolean;
  canViewMembers: boolean;
  isAdmin: boolean;
};

export function ProjectHubGrid({ projectId, caps }: { projectId: string; caps: Caps }) {
  const base = `/projects/${projectId}`;

  const construction: HubItem[] = [
    { href: `${base}/tasks`, label: "Tiến độ", icon: ListChecks, desc: "Mốc thi công" },
    ...(caps.canViewBudget
      ? [{ href: `${base}/budget`, label: "Dự toán", icon: Calculator, desc: "NC · VT · MM" } as HubItem]
      : []),
    ...(caps.canViewWorkOrders
      ? [{ href: `${base}/work-orders`, label: "Giao việc", icon: ClipboardList, desc: "Phiếu hàng ngày" } as HubItem]
      : []),
    ...(caps.canViewEod
      ? [{ href: `${base}/eod`, label: "Cuối ngày", icon: Sunset, desc: "Chấm công + sản lượng" } as HubItem]
      : []),
    ...(caps.canViewQcMapping
      ? [{ href: `${base}/qc-mapping`, label: "QC Mapping", icon: ShieldCheck, desc: "Checklist NC" } as HubItem]
      : []),
    ...(caps.canViewQcMapping
      ? [{ href: `${base}/migrate-to-catalog`, label: "Chuẩn hoá DM", icon: Library, desc: "Map vào catalog" } as HubItem]
      : []),
  ];

  const labor: HubItem[] = [
    ...(caps.canViewPayroll
      ? [{ href: `${base}/payroll`, label: "Lương tuần", icon: Banknote, desc: "Bonus + payslip" } as HubItem]
      : []),
    ...(caps.canViewSubContracts
      ? [{ href: `${base}/sub-contracts`, label: "Thầu phụ", icon: Handshake, desc: "Hợp đồng phụ" } as HubItem]
      : []),
    ...(caps.canViewMembers
      ? [{ href: `${base}/members`, label: "Thành viên", icon: Users, desc: "Đội thi công" } as HubItem]
      : []),
  ];

  const finance: HubItem[] = [
    ...(caps.canProposeMaterials
      ? [{ href: `${base}/material-proposals`, label: "Đề xuất vật tư", icon: Package, desc: "VT cần mua" } as HubItem]
      : []),
    ...(caps.canViewPayments
      ? [{ href: `${base}/payments`, label: "Lịch thanh toán", icon: CreditCard, desc: "Đợt thu HĐ" } as HubItem]
      : []),
  ];

  const archive: HubItem[] = [
    ...(caps.canViewConstructionLog
      ? [{ href: `${base}/construction-log`, label: "Nhật ký thi công", icon: BookText, desc: "Sự kiện trên công trường" } as HubItem]
      : []),
    { href: `${base}/documents`, label: "Hồ sơ", icon: FolderOpen, desc: "File · ảnh · hợp đồng" },
    ...(caps.isAdmin
      ? [{ href: `${base}/log`, label: "Log dự án", icon: History, desc: "Activity log" } as HubItem]
      : []),
    ...(caps.isAdmin
      ? [{ href: `${base}/edit`, label: "Sửa dự án", icon: Activity, desc: "Đổi thông tin chung" } as HubItem]
      : []),
  ];

  const groups: HubGroup[] = (
    [
      { title: "Thi công", tone: "blue", items: construction },
      { title: "Nhân lực", tone: "emerald", items: labor },
      { title: "Vật tư · Tài chính", tone: "amber", items: finance },
      { title: "Hồ sơ · Nhật ký", tone: "violet", items: archive },
    ] satisfies HubGroup[]
  ).filter((g) => g.items.length > 0);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {groups.map((g) => (
        <section
          key={g.title}
          className={`rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 ring-1 ${TONE_RING[g.tone]}`}
        >
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[g.tone]}`} />
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#8892b0]">{g.title}</h3>
            <span className="ml-auto text-[10px] text-[#5a6080]">{g.items.length} chức năng</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {g.items.map((it) => {
              const Icon = it.icon;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className="group flex flex-col items-center gap-1.5 rounded-xl bg-[#0f1220] p-2.5 text-center ring-1 ring-[#252840] transition hover:ring-orange-500/40"
                >
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-lg ring-1 ${TONE_ICON_BG[g.tone]} transition group-hover:scale-105`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-xs font-medium text-[#f0f2ff]">{it.label}</span>
                  {it.desc && <span className="text-[10px] text-[#5a6080]">{it.desc}</span>}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
