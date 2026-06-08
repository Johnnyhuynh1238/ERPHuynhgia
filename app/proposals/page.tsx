import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { ProposalsClient } from "./_components/proposals-client";

const ALLOWED_ROLES: string[] = [
  UserRole.engineer,
  UserRole.accountant,
  UserRole.admin,
];

export default async function ProposalsPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }
  if (!ALLOWED_ROLES.includes(user.role)) {
    redirect("/");
  }

  return (
    <ProtectedLayout>
      <ProposalsClient currentRole={user.role} />
    </ProtectedLayout>
  );
}
