import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { FolderOpen } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function KsQlProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const where = buildProjectAccessWhere({ id: user.id, role: user.role as string });
  const projects = await prisma.project.findMany({
    where: { ...where, status: { in: ["planning", "in_progress"] } },
    select: { id: true, code: true, name: true, status: true, address: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <section>
        <div className="text-sm text-[#7b8499]">Dự án bạn phụ trách</div>
        <h1 className="mt-0.5 text-[26px] font-semibold tracking-tight text-white">Dự án</h1>
        <div className="mt-0.5 text-xs text-[#7b8499]">{projects.length} dự án đang hoạt động</div>
      </section>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-[#1f2536] bg-[#131722] p-8 text-center">
          <FolderOpen className="mx-auto mb-3 h-8 w-8 text-[#7b8499]" />
          <div className="text-base font-medium text-white">Chưa có dự án</div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/ks-ql/today?p=${p.id}`}
              className="block overflow-hidden rounded-2xl border border-[#1f2536] bg-[#131722] p-4 transition-colors hover:border-[#2a3147] hover:bg-[#181d2c]"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-300">
                  {p.code}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-wider ${
                    p.status === "in_progress" ? "text-emerald-300" : "text-amber-300"
                  }`}
                >
                  {p.status === "in_progress" ? "Đang thi công" : "Đang chuẩn bị"}
                </span>
              </div>
              <div className="mt-1 text-[15px] font-semibold text-white">{p.name}</div>
              {p.address ? <div className="mt-0.5 text-xs text-[#7b8499]">{p.address}</div> : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
