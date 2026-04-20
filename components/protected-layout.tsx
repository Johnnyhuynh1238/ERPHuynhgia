import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { AppShell } from "@/components/app-shell";

// Server component dùng để bọc các route cần đăng nhập
export async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

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
