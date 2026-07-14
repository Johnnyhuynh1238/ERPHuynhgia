import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { ContractsClient } from "./_components/contracts-client";

export default async function ContractsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/?denied=1");

  return (
    <ProtectedLayout>
      <ContractsClient />
    </ProtectedLayout>
  );
}
