import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { listCompanyDocs } from "@/lib/company-docs";
import { TaiLieuClient } from "./_components/tai-lieu-client";

export const metadata = { title: "Tài liệu chung" };
export const dynamic = "force-dynamic";

// Tài liệu chung công ty — xem / in / tải về; chỉ admin tải lên + xoá. File ở MinIO company-docs/.
export default async function TaiLieuChungPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  const docs = await listCompanyDocs();

  return (
    <ProtectedLayout>
      <TaiLieuClient initial={docs} canEdit={user.role === "admin"} />
    </ProtectedLayout>
  );
}
