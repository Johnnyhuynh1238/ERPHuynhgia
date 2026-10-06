import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { CT_READ, CT_WRITE } from "@/lib/construction-technique-auth";
import { loadTechniques } from "@/lib/construction-technique-db";
import { KyThuatClient } from "./_components/ky-thuat-client";

export const metadata = { title: "Kỹ thuật thi công" };
export const dynamic = "force-dynamic";

// Kỹ thuật thi công — thư viện MẪU chung: hạng mục → công tác con (trình tự + tiêu chí nghiệm thu).
// Là nguồn của tile HD thi công từng dự án (lib/construction-guide.ts khớp tên hạng mục HĐ).
export default async function KyThuatThiCongPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  const role = user.role as UserRole;
  if (!CT_READ.includes(role)) redirect("/?denied=ky-thuat-thi-cong");
  const canEdit = CT_WRITE.includes(role);
  const techniques = await loadTechniques({ includeInactive: canEdit });

  return (
    <ProtectedLayout>
      <KyThuatClient initial={techniques} canEdit={canEdit} />
    </ProtectedLayout>
  );
}
