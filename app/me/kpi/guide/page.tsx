import Link from "next/link";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";

export default async function MeKpiGuidePage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  if (user.role !== UserRole.engineer) {
    redirect("/?denied=1");
  }

  return (
    <ProtectedLayout>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
          <div>
            <div className="text-sm font-bold text-[#f0f2ff]">Hướng dẫn tính KPI</div>
            <div className="mt-1 text-xs text-[#98a0c2]">Cách tính KPI v2 và thưởng KPI của kỹ sư.</div>
          </div>
          <Link href="/me/kpi" className="shrink-0 rounded-full border border-[#3a446d] bg-[#0f1424] px-3 py-2 text-xs font-semibold text-[#d9def3]">
            ← Quay lại
          </Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#2f3555] bg-[#0f0f0f]">
          <iframe src="/kpi-huong-dan-ks-v2.html" title="Hướng dẫn tính KPI cho kỹ sư" className="h-[calc(100vh-170px)] min-h-[680px] w-full bg-[#0f0f0f]" />
        </div>
      </div>
    </ProtectedLayout>
  );
}
