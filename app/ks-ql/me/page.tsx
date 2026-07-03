import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { Sparkles, User as UserIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function KsQlMePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const initials = (user.name || "K").split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-4">
      <section>
        <div className="text-sm text-[#9a8f80]">Hồ sơ + KPI</div>
        <h1
          className="mt-0.5 text-[26px] font-semibold tracking-tight"
          style={{
            background: "linear-gradient(90deg, #f0f2ff 0%, #fbbf24 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Tôi
        </h1>
      </section>

      <section
        className="overflow-hidden rounded-2xl border border-[#2a221c] p-5"
        style={{
          background:
            "linear-gradient(135deg, #1f1812 0%, #181410 50%, #120e0b 100%)",
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="grid h-14 w-14 place-items-center rounded-2xl text-lg font-bold text-[#0d0b09] shadow-lg shadow-[#34d399]/20"
            style={{ background: "linear-gradient(135deg, #34d399 0%, #4d8a6b 100%)" }}
          >
            {initials || "K"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold text-[#f0f2ff]">{user.name}</div>
            <div className="truncate text-xs text-[#9a8f80]">{user.email}</div>
            <div
              className="mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: "rgba(210,122,82,0.15)",
                color: "#D27A52",
              }}
            >
              Kỹ sư Quản lý
            </div>
          </div>
          <UserIcon className="h-5 w-5 shrink-0 text-[#9a8f80]" />
        </div>
      </section>

      <section className="rounded-2xl border border-[#2a221c] bg-[#181410] p-5 text-center">
        <Sparkles className="mx-auto mb-2 h-6 w-6 text-[#fbbf24]" />
        <div className="text-sm font-medium text-[#f0f2ff]">KPI gain-share</div>
        <p className="mt-1 text-xs leading-relaxed text-[#9a8f80]">
          Sắp ra mắt — đang nối với dữ liệu rải công + dự toán nhân công theo giai đoạn.
        </p>
      </section>
    </div>
  );
}
