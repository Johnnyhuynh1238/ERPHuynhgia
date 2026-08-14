import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { EstimateDetailSection } from "../_components/estimate-detail-section";
import { EMPTY_ESTIMATE_DETAIL, type EstimateDetail } from "@/lib/estimate-detail";

export const metadata = { title: "Dự toán chi tiết (toàn màn hình)" };

// Trang xem dự toán chi tiết TOÀN MÀN HÌNH (cho PC) — mở tab mới từ màn HĐ thiết kế.
export default async function DuToanFullPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const c = await prisma.designContract.findUnique({
    where: { id: params.id },
    select: { id: true, customerName: true, estimateDetail: true },
  });
  if (!c) notFound();

  const detail = (c.estimateDetail ?? EMPTY_ESTIMATE_DETAIL) as EstimateDetail;

  return (
    <main style={{ background: "#f4ede3", minHeight: "100vh" }}>
      <div
        style={{
          maxWidth: 1560,
          margin: "0 auto",
          padding: "22px 22px 90px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
            borderBottom: "2px solid #c9622a",
            paddingBottom: 12,
            marginBottom: 18,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#a94e1f" }}>
            Dự toán chi tiết — {c.customerName}
          </h1>
          <span style={{ fontSize: 13, color: "#8a7a6b" }}>
            Bóc khối lượng có bản vẽ đối chiếu · xem toàn màn hình
          </span>
        </div>
        <EstimateDetailSection contractId={c.id} detail={detail} />
      </div>
    </main>
  );
}
