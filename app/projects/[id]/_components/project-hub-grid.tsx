import Link from "next/link";
import {
  Banknote,
  BookOpenCheck,
  BookText,
  Calculator,
  ClipboardList,
  CreditCard,
  FileSignature,
  FolderOpen,
  Handshake,
  History,
  Library,
  ListChecks,
  Package,
  Pencil,
  ShoppingCart,
  ShieldCheck,
  Sunset,
  Wallet,
  Users,
  type LucideIcon,
} from "lucide-react";

type HubItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  desc?: string;
  badge?: number;
};

type HubGroup = {
  title: string;
  items: HubItem[];
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
  canViewFinance: boolean;
  canViewAcceptance: boolean;
  canMuaHang: boolean;
  isAdmin: boolean;
};

// Menu theo loại dự án: trực thầu (self) mới hiện Giao việc / Cuối ngày /
// QC Mapping / Lương tuần; giao khoán (subcontract) mới hiện Thầu phụ.
// Route cũ vẫn sống — chỉ ẩn khỏi menu.
export function ProjectHubGrid({
  projectId,
  caps,
  laborMode,
  pendingDiaries = 0,
}: {
  projectId: string;
  caps: Caps;
  laborMode: "self" | "subcontract";
  pendingDiaries?: number;
}) {
  const base = `/projects/${projectId}`;
  const isSelf = laborMode === "self";

  const construction: HubItem[] = [
    { href: `${base}/tasks`, label: "Tiến độ", icon: ListChecks, desc: "Mốc thi công" },
    ...(caps.canViewBudget
      ? [{ href: `${base}/budget`, label: "Dự toán", icon: Calculator, desc: "NC · VT · MM" } as HubItem]
      : []),
    ...(caps.isAdmin
      ? [{ href: `${base}/du-toan`, label: "Dự toán", icon: Package, desc: "Kho VT + khoán" } as HubItem]
      : []),
    ...(isSelf && caps.canViewWorkOrders
      ? [{ href: `${base}/work-orders`, label: "Giao việc", icon: ClipboardList, desc: "Phiếu hàng ngày" } as HubItem]
      : []),
    ...(isSelf && caps.canViewEod
      ? [{ href: `${base}/eod`, label: "Cuối ngày", icon: Sunset, desc: "Chấm công + sản lượng" } as HubItem]
      : []),
    ...(isSelf && caps.canViewQcMapping
      ? [{ href: `${base}/qc-mapping`, label: "QC Mapping", icon: ShieldCheck, desc: "Checklist NC" } as HubItem]
      : []),
  ];

  const finance: HubItem[] = [
    ...(caps.canMuaHang
      ? [{ href: `${base}/cong-no`, label: "Công nợ NCC", icon: Wallet, desc: "Nợ · trả · còn lại" } as HubItem]
      : []),
    ...(caps.canViewPayments
      ? [{ href: `${base}/payments`, label: "Lịch thanh toán", icon: CreditCard, desc: "Đợt thu HĐ" } as HubItem]
      : []),
    ...(caps.canProposeMaterials
      ? [{ href: `${base}/material-proposals`, label: "Đề xuất vật tư", icon: Package, desc: "VT cần mua" } as HubItem]
      : []),
    ...(caps.canMuaHang
      ? [{ href: `${base}/mua-hang`, label: "Mua hàng", icon: ShoppingCart, desc: "Đặt VT bám dự toán" } as HubItem]
      : []),
    ...(isSelf && caps.canViewPayroll
      ? [{ href: `${base}/payroll`, label: "Lương tuần", icon: Banknote, desc: "Bonus + payslip" } as HubItem]
      : []),
  ];

  const customer: HubItem[] = [
    ...(caps.canViewAcceptance
      ? [{ href: `${base}/acceptance`, label: "Nghiệm thu", icon: FileSignature, desc: "Chủ nhà ký · Biên bản" } as HubItem]
      : []),
    ...(caps.canViewConstructionLog
      ? [{ href: `${base}/construction-log`, label: "Nhật ký thi công", icon: BookText, desc: "Sự kiện công trường" } as HubItem]
      : []),
    ...(caps.isAdmin
      ? [
          {
            href: `${base}/diary-approval`,
            label: "Duyệt nhật ký",
            icon: BookOpenCheck,
            desc: "Nhật ký KS QL",
            badge: pendingDiaries,
          } as HubItem,
        ]
      : []),
    { href: `${base}/documents`, label: "Hồ sơ", icon: FolderOpen, desc: "File · ảnh · hợp đồng" },
  ];

  const admin: HubItem[] = [
    ...(caps.canViewMembers
      ? [{ href: `${base}/members`, label: "Thành viên", icon: Users, desc: "Đội thi công" } as HubItem]
      : []),
    ...(!isSelf && caps.canViewSubContracts
      ? [{ href: `${base}/sub-contracts`, label: "Thầu phụ", icon: Handshake, desc: "Hợp đồng phụ" } as HubItem]
      : []),
    ...(caps.isAdmin
      ? [
          { href: `${base}/edit`, label: "Sửa dự án", icon: Pencil, desc: "Thông tin chung" } as HubItem,
          { href: `${base}/log`, label: "Log dự án", icon: History, desc: "Activity log" } as HubItem,
          ...(isSelf
            ? [{ href: `${base}/migrate-to-catalog`, label: "Chuẩn hoá DM", icon: Library, desc: "Map vào catalog" } as HubItem]
            : []),
        ]
      : []),
  ];

  const groups: HubGroup[] = (
    [
      { title: "Thi công", items: construction },
      { title: "Tài chính · Vật tư", items: finance },
      { title: "Chủ nhà · Hồ sơ", items: customer },
      { title: "Quản trị", items: admin },
    ] satisfies HubGroup[]
  ).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.title}>
          <h3 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-[#8892b0]">{g.title}</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {g.items.map((it) => {
              const Icon = it.icon;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className="group relative flex flex-col items-center gap-1.5 rounded-2xl border border-[#252840] bg-[#13151f] p-3 text-center transition-all hover:-translate-y-0.5 hover:border-[#f97316]/60 hover:bg-[#1a1d2e]"
                >
                  {it.badge ? (
                    <span className="absolute right-1.5 top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {it.badge}
                    </span>
                  ) : null}
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f97316]/15 text-[#fb923c] transition-colors group-hover:bg-[#f97316]/25">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-semibold leading-tight text-[#f0f2ff]">{it.label}</span>
                  {it.desc && <span className="hidden text-[10px] leading-tight text-[#5a6080] sm:block">{it.desc}</span>}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
