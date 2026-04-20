import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <ProtectedLayout>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-[#1F4E79]">Dashboard</h1>
        <p className="text-sm text-slate-600">Chào mừng {user?.name} ({user?.role})</p>
        <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">
          Khung app đã sẵn sàng. Các màn chi tiết sẽ build ở bước tiếp theo.
        </div>
      </div>
    </ProtectedLayout>
  );
}
