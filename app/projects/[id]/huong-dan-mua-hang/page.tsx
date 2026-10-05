import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { buildPurchaseGuide, type GuideAdjust, type GuideMode } from "@/lib/purchase-guide";
import { HuongDanClient, type SapSchedule } from "./_components/huong-dan-client";

export const metadata = { title: "Hướng dẫn mua hàng" };
export const dynamic = "force-dynamic";

const ALLOWED: UserRole[] = [
  UserRole.admin,
  UserRole.accountant,
  UserRole.engineer,
  UserRole.construction_manager,
];

// Hướng dẫn mua hàng = phụ lục vật tư HĐ ký với khách (quote_data của HĐ gắn dự án)
// + điều chỉnh theo phụ lục (AI ghi thẳng bảng purchase_guide_adjusts, không sửa trên UI).
// KT: căn cứ mua. Giám sát: căn cứ nhận hàng.
export default async function HuongDanMuaHangPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  const role = user.role as UserRole;
  if (!ALLOWED.includes(role)) redirect(`/projects/${params.id}?denied=huong-dan-mua-hang`);

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role }) },
    select: {
      id: true,
      code: true,
      name: true,
      customerName: true,
      designContract: { select: { id: true, signedAt: true, quoteData: true, quoteUpdatedAt: true } },
      purchaseGuideAdjusts: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) notFound();

  const dc = project.designContract;
  const adjusts: GuideAdjust[] = project.purchaseGuideAdjusts.map((a) => ({
    itemKey: a.itemKey,
    mode: a.mode as GuideMode,
    groupName: a.groupName,
    ten: a.ten,
    loai: a.loai,
    quycach: a.quycach,
    note: a.note,
    source: a.source,
  }));
  const guide = dc?.quoteData ? buildPurchaseGuide(dc.quoteData, adjusts) : null;

  // Tab "Sắp cần mua": tiến độ DỰ KIẾN theo phần (project_sections, tên = hạng mục HĐ)
  // + đơn mua đã đặt theo hạng mục ngân sách (tên dòng = tên hạng mục, có thể kèm "(...)").
  const [sections, plan, orders] = await Promise.all([
    prisma.projectSection.findMany({
      where: { projectId: project.id },
      select: { name: true, planStart: true, planEnd: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.projectBudgetPlan.findUnique({
      where: { projectId: project.id },
      select: { lines: { select: { id: true, name: true } } },
    }),
    prisma.mhOrder.findMany({
      where: { projectId: project.id, status: { in: ["ordered", "received", "paid"] }, returnOfOrderId: null },
      select: { id: true, budgetLineId: true, budgetAlloc: true, createdAt: true },
    }),
  ]);
  const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const lines = plan?.lines ?? [];
  // từng PHẦN: ngày dự kiến + id các đơn mua gắn hạng mục ngân sách cùng tên
  const secStat = new Map(
    sections.map((s) => {
      const lineIds = new Set(
        lines.filter((l) => l.name === s.name || l.name.startsWith(s.name + " ")).map((l) => l.id),
      );
      const mine = orders.filter((o) => {
        const alloc = Array.isArray(o.budgetAlloc) ? (o.budgetAlloc as { lineId?: string }[]) : [];
        return (o.budgetLineId && lineIds.has(o.budgetLineId)) || alloc.some((a) => !!a?.lineId && lineIds.has(a.lineId));
      });
      return [s.name, { start: ymd(s.planStart), end: ymd(s.planEnd), orders: mine }] as const;
    }),
  );
  // Nhóm VT phần thô = nhomVt, có thể gom nhiều PHẦN (VD "MÓNG – KHUNG BÊ TÔNG – XÂY TÔ")
  // → lịch nhóm = từ ngày bắt đầu sớm nhất đến ngày kết thúc muộn nhất của các PHẦN con.
  const phanOf = new Map<string, string[]>();
  const qd = (dc?.quoteData ?? {}) as { thoPhanBaoGia?: { name?: string; nhomVt?: string }[] };
  for (const ph of Array.isArray(qd.thoPhanBaoGia) ? qd.thoPhanBaoGia : []) {
    const key = (ph.nhomVt || ph.name || "").trim();
    if (!key || !ph.name) continue;
    phanOf.set(key, [...(phanOf.get(key) ?? []), ph.name]);
  }
  const groupNames = guide ? [...guide.tho, ...guide.ht].map((g) => g.name) : [];
  const schedule: SapSchedule[] = groupNames.map((name) => {
    const parts = (phanOf.get(name) ?? [name]).map((n) => ({ name: n, st: secStat.get(n) })).filter((x) => x.st);
    const starts = parts.map((x) => x.st!.start).filter((d): d is string => !!d).sort();
    const ends = parts.map((x) => x.st!.end).filter((d): d is string => !!d).sort();
    const ords = Array.from(new Map(parts.flatMap((x) => x.st!.orders).map((o) => [o.id, o])).values());
    const last = ords.reduce<Date | null>((m, o) => (!m || o.createdAt > m ? o.createdAt : m), null);
    return {
      name,
      start: starts[0] ?? null,
      end: ends.length ? ends[ends.length - 1] : null,
      parts:
        parts.length > 1
          ? parts.map((x) => ({ name: x.name, start: x.st!.start, end: x.st!.end }))
          : [],
      orders: ords.length,
      lastOrder: last ? last.toISOString() : null,
    };
  });
  // "Hôm nay" theo giờ VN (server chạy UTC)
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

  return (
    <HuongDanClient
      projectCode={project.code}
      projectName={project.name}
      customerName={project.customerName}
      contractId={dc?.id ?? null}
      signedAt={dc?.signedAt ? dc.signedAt.toISOString() : null}
      quoteUpdatedAt={dc?.quoteUpdatedAt ? dc.quoteUpdatedAt.toISOString() : null}
      guide={guide}
      schedule={schedule}
      today={today}
      isAdmin={role === UserRole.admin}
      backHref={role === UserRole.engineer ? `/ks-ql/project/${project.id}` : `/projects/${project.id}`}
    />
  );
}
