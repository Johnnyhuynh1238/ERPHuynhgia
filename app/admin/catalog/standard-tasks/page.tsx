import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { CatalogClient } from "./_components/catalog-client";

export default async function AdminCatalogStandardTasksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "construction_manager") {
    redirect("/?denied=1");
  }

  return (
    <ProtectedLayout>
      <CatalogClient />
    </ProtectedLayout>
  );
}
