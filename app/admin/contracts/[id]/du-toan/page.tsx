import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { DuToanTabs } from "../_components/du-toan-tabs";
import { EMPTY_ESTIMATE_DETAIL, type EstimateDetail } from "@/lib/estimate-detail";
import { quoteSummary } from "@/lib/quote-compute";

export const metadata = { title: "Dự toán (toàn màn hình)" };

// Trang TOÀN MÀN HÌNH (cho PC): 3 màn chung menu — Khối lượng · Giá vốn · Báo giá.
export default async function DuToanFullPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const c = await prisma.designContract.findUnique({
    where: { id: params.id },
    select: { id: true, customerName: true, estimateDetail: true, quoteData: true, projectId: true },
  });
  if (!c) notFound();

  const detail = (c.estimateDetail ?? EMPTY_ESTIMATE_DETAIL) as EstimateDetail;
  const dtTong = quoteSummary(c.quoteData).dtTong; // m² quy đổi — số chảy ngược ra đơn giá m²

  // Danh sách hạng mục = NGUỒN từ báo giá khách (thoPhanBaoGia thô, hoanThien hoàn thiện).
  const q = (c.quoteData ?? {}) as {
    thoPhanBaoGia?: { name?: string }[];
    hoanThien?: { name?: string }[];
  };
  const hmTho = (q.thoPhanBaoGia ?? []).map((h) => h.name ?? "").filter(Boolean);
  const hmHt = (q.hoanThien ?? []).map((h) => h.name ?? "").filter(Boolean);

  return (
    <main style={{ background: "#f4ede3", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1560, margin: "0 auto", padding: "22px 22px 90px" }}>
        <DuToanTabs
          contractId={c.id}
          customerName={c.customerName}
          detail={detail}
          dtTong={dtTong}
          hmTho={hmTho}
          hmHt={hmHt}
          locked={c.projectId != null}
        />
      </div>
    </main>
  );
}
