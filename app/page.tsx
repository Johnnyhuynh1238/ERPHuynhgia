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

export const revalidate = 60;

export default async function HomePage({ searchParams }: HomePageProps) {
  const user = await getCurrentUser();

  if (user?.role === "accountant" && !searchParams?.denied) {
    redirect("/ketoan");
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
