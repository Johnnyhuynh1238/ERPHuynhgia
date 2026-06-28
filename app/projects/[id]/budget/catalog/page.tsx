import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canViewBudget } from "@/lib/project-budget";

export const metadata = { title: "Thư viện chung" };

export default async function BudgetCatalogPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (!canViewBudget({ id: user.id, role: user.role })) {
    redirect(`/projects/${params.id}?denied=budget`);
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, code: true, name: true },
  });
  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) notFound();
    redirect("/projects?denied=1");
  }

  const [normCount, vtCount, ncCount, mmCount] = await Promise.all([
    prisma.norm.count({ where: { retiredAt: null } }),
    prisma.materialPrice.count({ where: { retiredAt: null } }),
    prisma.laborPrice.count({ where: { retiredAt: null } }),
    prisma.machinePrice.count({ where: { retiredAt: null } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-4">
      <div>
        <Link
          href={`/projects/${project.id}/budget`}
          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
        >
          ← Dự toán
        </Link>
        <div className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Thư viện chung (toàn hệ thống)
        </div>
        <h1 className="text-base font-semibold text-zinc-100 sm:text-lg">
          Định mức & Đơn giá
        </h1>
        <div className="text-xs text-zinc-500">
          Bộ định mức và bảng giá VT/NC/MM dùng chung cho tất cả dự án.
          Mỗi khi tạo dự án mới, admin nên rà soát lại các giá trị này.
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
        ⚠ Lưu ý: sửa định mức / đơn giá tại đây ảnh hưởng <b>tất cả dự án</b>.
        Dữ liệu tổng hợp hao phí & thành tiền sẽ tính lại ngay theo giá trị mới.
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href={`/projects/${project.id}/budget/norms`}
          className="flex flex-col items-center rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 ring-1 ring-sky-500/30 transition hover:border-sky-500/50 active:scale-95"
        >
          <div className="text-4xl">📋</div>
          <div className="mt-2 text-sm font-semibold text-zinc-100">Bảng định mức</div>
          <div className="text-[11px] text-zinc-400">{normCount} mã định mức</div>
          <div className="mt-2 text-center text-[11px] text-zinc-500">
            Hao phí VT/NC/MM cho mỗi công tác chuẩn
          </div>
        </Link>

        <Link
          href={`/projects/${project.id}/budget/prices`}
          className="flex flex-col items-center rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 ring-1 ring-emerald-500/30 transition hover:border-emerald-500/50 active:scale-95"
        >
          <div className="text-4xl">💰</div>
          <div className="mt-2 text-sm font-semibold text-zinc-100">Đơn giá VT / NC / MM</div>
          <div className="text-[11px] text-zinc-400">
            {vtCount} VT · {ncCount} bậc thợ · {mmCount} máy
          </div>
          <div className="mt-2 text-center text-[11px] text-zinc-500">
            Giá thị trường cho từng loại vật tư, nhân công, máy
          </div>
        </Link>
      </div>
    </div>
  );
}
