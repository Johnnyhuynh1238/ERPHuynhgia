import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { RouteToast } from "./_components/route-toast";
import { DashboardLoaderClient } from "./_components/dashboard-loader-client";

type HomePageProps = {
  searchParams?: {
    denied?: string;
  };
};

// KS Phúc (DA-2026-002 a Ngân — giao khoán) đi flow /ks-ql/sub — mirror /api/dashboard.
const KS_QL_ENGINEER_IDS = new Set(["aa42319b-e694-4be2-bae0-faef83601ab5"]);

export const revalidate = 60;

export default async function HomePage({ searchParams }: HomePageProps) {
  const user = await getCurrentUser();

  // Redirect server-side theo role để tránh flash "Dashboard cũ" trước khi client
  // fetch /api/dashboard → router.replace(). Mirror logic của DashboardLoaderClient.
  if (user?.id && !searchParams?.denied) {
    if (user.role === "accountant") redirect("/ketoan");
    if (user.role === "admin") redirect("/admin/dashboard");
    if (user.role === "construction_manager") redirect("/tptc/dashboard");
    if (user.role === "engineer" && KS_QL_ENGINEER_IDS.has(user.id)) {
      redirect("/ks-ql/sub");
    }
  }

  return (
    <ProtectedLayout>
      <RouteToast denied={searchParams?.denied} />
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-orange-300">Dashboard</h1>
        {user?.id ? (
          <DashboardLoaderClient />
        ) : (
          <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">Vui lòng đăng nhập để xem dashboard.</div>
        )}
      </div>
    </ProtectedLayout>
  );
}
