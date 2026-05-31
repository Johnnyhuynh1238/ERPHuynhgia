import Link from "next/link";
import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";

export default async function DaoTaoPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  if (user.role !== "engineer") redirect("/");

  return (
    <ProtectedLayout>
      <div className="space-y-4">
        <div className="slide-up">
          <Link
            href="/"
            className="smooth-press inline-flex items-center gap-1 rounded-full border border-[#2d3249] bg-[#13151f]/80 px-3 py-1.5 text-xs font-semibold text-[#d9def3] hover:border-[#f97316]/50 hover:text-[#fb923c]"
          >
            ← Quay lại
          </Link>
        </div>

        <div
          className="slide-up delay-1 relative overflow-hidden rounded-2xl border p-6 text-center"
          style={{
            borderColor: "rgba(249, 115, 22, 0.18)",
            background:
              "linear-gradient(135deg, rgba(249,115,22,0.10) 0%, rgba(26,29,46,0.95) 55%, rgba(19,21,31,0.95) 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(249,115,22,0.22), transparent 70%)" }}
          />
          <div className="relative">
            <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f97316]/15 text-3xl">
              🎓
            </div>
            <div className="mt-3 text-xl font-bold text-[#f0f2ff]">Đào tạo kỹ sư</div>
            <div className="mt-1 text-sm text-[#8892b0]">
              Tài liệu, video hướng dẫn và bài kiểm tra dành cho kỹ sư.
            </div>
          </div>
        </div>

        <div className="slide-up delay-2 rounded-2xl border border-dashed border-[#2d3249] bg-[#13151f]/60 p-8 text-center">
          <div className="text-4xl">🚧</div>
          <div className="mt-2 text-base font-semibold text-[#fb923c]">Chức năng đang phát triển</div>
          <div className="mt-1 text-xs text-[#8892b0]">
            Tính năng này sẽ sớm có mặt. A6 cảm ơn anh đã theo dõi.
          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}
