import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { AppShell } from "@/components/app-shell";

const ALLOWED_ROLES = new Set(["engineer", "construction_manager", "admin"]);

export default async function KsQlLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ALLOWED_ROLES.has(user.role as string)) redirect("/");

  return (
    <AppShell
      user={{
        id: user.id,
        role: user.role,
        name: user.name,
        email: user.email,
      }}
    >
      {children}
    </AppShell>
  );
}
