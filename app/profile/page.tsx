import { ProtectedLayout } from "@/components/protected-layout";
import { ProfileClient } from "./_components/profile-client";

export default function ProfilePage() {
  return (
    <ProtectedLayout>
      <ProfileClient />
    </ProtectedLayout>
  );
}
