import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { FolderOpen, ChevronRight } from "lucide-react";
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
        <div className="text-sm text-[#9a8f80]">Dự án bạn phụ trách</div>
        <h1
          className="mt-0.5 text-[26px] font-semibold tracking-tight"
          style={{
            background: "linear-gradient(90deg, #f5ede4 0%, #E0B855 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Dự án
        </h1>
        <div className="mt-0.5 text-xs text-[#9a8f80]">{projects.length} dự án đang hoạt động</div>
      </section>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-[#2a221c] bg-[#181410] p-8 text-center">
          <FolderOpen className="mx-auto mb-3 h-8 w-8 text-[#9a8f80]" />
          <div className="text-base font-medium text-[#f5ede4]">Chưa có dự án</div>
          <div className="mt-1 text-xs text-[#9a8f80]">Liên hệ TPTC để được phân dự án.</div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {projects.map((p) => {
            const inProgress = p.status === "in_progress";
            return (
              <Link
                key={p.id}
                href={`/ks-ql/today?p=${p.id}`}
                className="group block overflow-hidden rounded-2xl border border-[#2a221c] bg-[#181410] p-4 transition-all hover:-translate-y-px hover:border-[#E0B855]/40 hover:bg-[#1f1812] hover:shadow-[0_4px_16px_-8px_rgba(210,122,82,0.4)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                        style={{
                          background: "rgba(210,122,82,0.15)",
                          color: "#D27A52",
                        }}
                      >
                        {p.code}
                      </span>
                      <span
                        className="text-[10px] uppercase tracking-wider"
                        style={{ color: inProgress ? "#6FA677" : "#E0B855" }}
                      >
                        {inProgress ? "Đang thi công" : "Đang chuẩn bị"}
                      </span>
                    </div>
                    <div className="mt-1 text-[15px] font-semibold text-[#f5ede4]">{p.name}</div>
                    {p.address ? (
                      <div className="mt-0.5 truncate text-xs text-[#9a8f80]">{p.address}</div>
                    ) : null}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#9a8f80] transition-transform group-hover:translate-x-0.5 group-hover:text-[#E0B855]" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
