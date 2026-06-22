import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { KsQlFrame } from "./_components/ks-ql-frame";

const ALLOWED_ROLES = new Set(["engineer", "construction_manager", "admin"]);

export default async function KsQlLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ALLOWED_ROLES.has(user.role as string)) redirect("/");

  return (
    <KsQlFrame
      user={{
        id: user.id,
        name: user.name ?? "KS",
        email: user.email ?? "",
        role: user.role as string,
      }}
    >
      {children}
    </KsQlFrame>
  );
}
