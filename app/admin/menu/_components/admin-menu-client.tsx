"use client";

import Link from "next/link";
import {
  Award,
  Banknote,
  BarChart3,
  BookOpen,
  Briefcase,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Clock,
  FileCode,
  FileSignature,
  FileText,
  FolderKanban,
  HardHat,
  Home,
  IdCard,
  Library,
  ListChecks,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Sliders,
  Target,
  TrendingUp,
  User,
  UserCog,
  UserPlus,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type MenuItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  desc: string;
};

type MenuSection = {
  title: string;
  icon: LucideIcon;
  items: MenuItem[];
};

const QUICK: MenuItem[] = [
  { label: "Dashboard", href: "/", icon: Home, desc: "Trang chủ tổng quan" },
  { label: "Hồ sơ của tôi", href: "/profile", icon: User, desc: "Thông tin cá nhân" },
];

const SECTIONS: MenuSection[] = [
  {
    title: "Kinh doanh",
    icon: TrendingUp,
    items: [
      { label: "Pipeline KH", href: "/customer-pipeline", icon: UserPlus, desc: "Phễu khách hàng tiềm năng" },
      { label: "Lead báo giá", href: "/leads", icon: FileText, desc: "Yêu cầu báo giá từ web" },
      { label: "Analytics", href: "/admin/analytics", icon: TrendingUp, desc: "Số liệu kinh doanh" },
    ],
  },
  {
    title: "Dự án",
    icon: FolderKanban,
    items: [
      { label: "Dự án", href: "/projects", icon: FolderKanban, desc: "Danh sách công trình" },
      { label: "Báo cáo", href: "/reports", icon: BarChart3, desc: "Nhiệm vụ & báo cáo KS" },
    ],
  },
  {
    title: "Vật tư & Thầu phụ",
    icon: Package,
    items: [
      { label: "Đề xuất vật tư", href: "/proposals", icon: ShoppingCart, desc: "Yêu cầu mua vật tư" },
      { label: "Thầu phụ", href: "/subcontractors", icon: HardHat, desc: "Danh sách nhà thầu phụ" },
      { label: "HĐ thầu phụ", href: "/sub-contracts", icon: FileSignature, desc: "Hợp đồng giao khoán" },
      { label: "Chi thầu phụ", href: "/sub-payments", icon: Wallet, desc: "Thanh toán thầu phụ" },
    ],
  },
  {
    title: "Tài chính",
    icon: Banknote,
    items: [
      { label: "Lệnh chi", href: "/expenses", icon: Receipt, desc: "Tạo lệnh chi gửi kế toán" },
      { label: "Sổ quỹ", href: "/treasury", icon: Wallet, desc: "Nhật ký thu/chi + số dư" },
    ],
  },
  {
    title: "Nhân sự",
    icon: Users,
    items: [
      { label: "Chấm công NV", href: "/admin/attendance", icon: Clock, desc: "Công KS & kế toán" },
      { label: "Bảng công thợ", href: "/admin/worker-attendance", icon: ClipboardList, desc: "Tổng hợp công thợ" },
      { label: "Hồ sơ thợ", href: "/admin/workers", icon: IdCard, desc: "Danh bạ + chuyên môn thợ" },
      { label: "Ca làm việc", href: "/admin/shifts", icon: CalendarDays, desc: "Cấu hình ca + ngày nghỉ" },
      { label: "Lương KS", href: "/admin/engineers/salary", icon: Banknote, desc: "Bảng lương kỹ sư" },
      { label: "User", href: "/admin/users", icon: UserCog, desc: "Tài khoản & phân quyền" },
    ],
  },
  {
    title: "KPI & Đánh giá",
    icon: Target,
    items: [
      { label: "KPI tổng", href: "/admin/kpi", icon: Target, desc: "Bảng KPI tổng hợp" },
      { label: "Cài đặt KPI", href: "/admin/kpi-settings", icon: Sliders, desc: "Trọng số & tiêu chí KPI" },
      { label: "Việc TPTC", href: "/tptc/assignments", icon: ListChecks, desc: "Phân công TPTC" },
      { label: "Chấm Đóng góp", href: "/tptc/contribution-rating", icon: Award, desc: "Rating đóng góp thợ" },
    ],
  },
  {
    title: "Cấu hình hệ thống",
    icon: Settings,
    items: [
      { label: "Template", href: "/admin/templates", icon: FileCode, desc: "Mẫu báo cáo & form" },
      { label: "Danh mục chuẩn", href: "/admin/catalog/standard-tasks", icon: Library, desc: "9 GĐ × 92 công tác chuẩn" },
      { label: "Chuyên môn", href: "/admin/specialties", icon: Wrench, desc: "Tag chuyên môn thợ" },
      { label: "Tiêu chí TP", href: "/admin/evaluation-criteria", icon: CheckSquare, desc: "Tiêu chí đánh giá thầu phụ" },
    ],
  },
  {
    title: "Trợ giúp",
    icon: BookOpen,
    items: [
      { label: "Hướng dẫn", href: "/huongdanapp", icon: BookOpen, desc: "Sổ tay sử dụng app" },
    ],
  },
];

function MenuCard({ item }: { item: MenuItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="group flex flex-col items-start gap-2 rounded-2xl border border-[#252840] bg-[#13151f] p-4 transition-all hover:-translate-y-0.5 hover:border-[#f97316]/60 hover:bg-[#1a1d2e] hover:shadow-[0_8px_24px_-12px_rgba(249,115,22,0.5)]"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f97316]/15 text-[#fb923c] transition-colors group-hover:bg-[#f97316]/25">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[#f0f2ff]">{item.label}</div>
        <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[#8892b0]">{item.desc}</div>
      </div>
    </Link>
  );
}

function SectionBlock({ section }: { section: MenuSection }) {
  const SectionIcon = section.icon;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#252840] text-[#fb923c]">
          <SectionIcon className="h-4 w-4" />
        </div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#f0f2ff]">{section.title}</h2>
        <div className="ml-1 rounded-full bg-[#252840] px-2 py-0.5 text-[10px] text-[#8892b0]">
          {section.items.length}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {section.items.map((item) => (
          <MenuCard key={item.href} item={item} />
        ))}
      </div>
    </section>
  );
}

export function AdminMenuClient() {
  const total = SECTIONS.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#252840] bg-gradient-to-br from-[#13151f] to-[#1a1d2e] p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f97316]/20 text-[#fb923c]">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#f0f2ff]">Menu đầy đủ</h1>
            <p className="mt-0.5 text-xs text-[#8892b0]">
              {total} chức năng, gom thành {SECTIONS.length} nhóm
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#f0f2ff]">Truy cập nhanh</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {QUICK.map((item) => (
            <MenuCard key={item.href} item={item} />
          ))}
        </div>
      </section>

      {SECTIONS.map((section) => (
        <SectionBlock key={section.title} section={section} />
      ))}
    </div>
  );
}
