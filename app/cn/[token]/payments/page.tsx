import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";

export default async function CustomerPaymentsPage({ params }: { params: { token: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  const payments = await prisma.paymentSchedule.findMany({
    where: { projectId: project.id },
    orderBy: { phaseNumber: "asc" },
    select: {
      id: true,
      phaseNumber: true,
      milestoneDescription: true,
      amount: true,
      expectedDate: true,
      status: true,
      actualPaidDate: true,
      actualPaidAmount: true,
    },
  });

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-lg font-semibold">Lịch thanh toán</div>
      {payments.map((item) => (
        <div key={item.id} className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm">
          <div className="font-semibold">Đợt {item.phaseNumber}</div>
          <div>{item.milestoneDescription}</div>
          <div>{Math.round(Number(item.amount)).toLocaleString("vi-VN")} đ</div>
          <div>Hạn: {new Date(item.expectedDate).toLocaleDateString("vi-VN")}</div>
          <div>Trạng thái: {item.status}</div>
        </div>
      ))}
    </div>
  );
}
