import { ProtectedLayout } from "@/components/protected-layout";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
