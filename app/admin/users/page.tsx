import { ProtectedLayout } from "@/components/protected-layout";

export default function UsersPage() {
  return (
    <ProtectedLayout>
      <h1 className="text-xl font-semibold text-[#1F4E79]">Quản lý User</h1>
    </ProtectedLayout>
  );
}
