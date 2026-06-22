import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { Sparkles, User as UserIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function KsQlMePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-4">
      <section>
        <div className="text-sm text-[#7b8499]">Hồ sơ + KPI</div>
        <h1 className="mt-0.5 text-[26px] font-semibold tracking-tight text-white">Tôi</h1>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#1f2536] bg-gradient-to-br from-[#13182a] to-[#0f1320] p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-bold">
            {(user.name || "K").split(" ").pop()?.[0] || "K"}
          </span>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-white">{user.name}</div>
            <div className="truncate text-xs text-[#7b8499]">{user.email}</div>
            <div className="mt-1 inline-block rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-300">
              Kỹ sư Quản lý
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#1f2536] bg-[#131722] p-5 text-center">
        <Sparkles className="mx-auto mb-2 h-6 w-6 text-orange-300" />
        <div className="text-sm font-medium text-white">KPI gain-share</div>
        <p className="mt-1 text-xs text-[#7b8499]">
          Sắp ra mắt — đang nối với dữ liệu rải công + dự toán nhân công theo giai đoạn.
        </p>
      </section>
    </div>
  );
}
