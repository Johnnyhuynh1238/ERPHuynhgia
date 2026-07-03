"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { ProposalComments } from "@/app/proposals/[id]/_components/proposal-comments";
import {
  ProposalPipeline,
  STATUS_LABEL,
  STATUS_CHIP,
  ORDER_LABEL,
  ORDER_CHIP,
  ORDER_ICON,
  type ProposalCardRow,
} from "../../../_components/proposal-card";

type RawItem = Record<string, unknown>;

type Proposal = {
  id: string;
  description: string;
  status: "pending" | "accepted" | "declined";
  orderStatus: "not_ordered" | "ordered" | "received" | "paid";
  parsedItems: RawItem[] | null;
  processedNote: string | null;
  createdAt: string;
  acceptedAt: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  paidAt: string | null;
  debtCount: number;
};

type Item = { name: string; qty: number; unit: string; task: string };

function normalize(it: RawItem): Item {
  const name = (it.name ?? it.ten ?? "") as string;
  const unit = (it.unit ?? it.dvt ?? "") as string;
  const qty = Number(it.qty ?? it.sl ?? 0);
  const task = (it.task ?? "") as string;
  return { name, qty, unit, task };
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function SubProposalDetail({
  proposal,
  projectId,
  currentUserId,
}: {
  proposal: Proposal;
  projectId: string;
  currentUserId: string;
}) {
  const items: Item[] = (proposal.parsedItems || []).map(normalize);
  const hasItems = items.length > 0;
  const isDeclined = proposal.status === "declined";
  const pipelineRow: ProposalCardRow = {
    id: proposal.id,
    description: proposal.description,
    status: proposal.status,
    orderStatus: proposal.orderStatus,
    parsedItems: null,
    createdAt: new Date(proposal.createdAt),
    _count: { debts: proposal.debtCount },
  };

  return (
    <>
      <div className="rounded-2xl border-2 border-[#252840] bg-[#13151f] p-5">
        <ProposalPipeline p={pipelineRow} />

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[proposal.status]}`}
          >
            {STATUS_LABEL[proposal.status]}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ORDER_CHIP[proposal.orderStatus]}`}
          >
            {ORDER_ICON[proposal.orderStatus]}
            {ORDER_LABEL[proposal.orderStatus]}
          </span>
          <span className="ml-auto text-xs text-[#8892b0]">Gửi lúc {fmt(proposal.createdAt)}</span>
        </div>
        {proposal.processedNote ? (
          <div className="mt-3 rounded-xl border border-[#f87171]/30 bg-[#f87171]/10 px-3 py-2 text-sm text-[#f0f2ff]">
            <span className="text-[#f87171] font-semibold">Ghi chú từ TPTC:</span> {proposal.processedNote}
          </div>
        ) : null}
        {isDeclined ? (
          <Link
            href={`/ks-ql/sub/${projectId}/material/propose/${proposal.id}/edit`}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff8a3d] px-4 py-3 text-base font-bold text-black transition active:scale-[0.99] hover:bg-[#ffa05f]"
          >
            <Pencil className="h-5 w-5" />
            Sửa & gửi lại đề xuất
          </Link>
        ) : null}
      </div>

      <div className="rounded-2xl border-2 border-[#252840] bg-[#13151f] p-5">
        <div className="mb-3 text-sm font-semibold text-orange-300">Vật tư đề xuất</div>
        {hasItems ? (
          <div className="overflow-x-auto rounded-xl border border-[#252840]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#0f1015] text-left text-[11px] uppercase tracking-wide text-[#8892b0]">
                  <th className="px-3 py-2 w-8">#</th>
                  <th className="px-3 py-2">Chủng loại</th>
                  <th className="px-3 py-2 text-right w-16">SL</th>
                  <th className="px-3 py-2 w-14">ĐVT</th>
                  <th className="px-3 py-2">Công tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-t border-[#252840] text-[#f0f2ff]">
                    <td className="px-3 py-2 text-[#8892b0]">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{it.name || "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#ff8a3d]">{it.qty.toLocaleString("vi-VN")}</td>
                    <td className="px-3 py-2">{it.unit}</td>
                    <td className="px-3 py-2 text-[#8892b0]">{it.task || <span className="text-[#5a627a]">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="whitespace-pre-wrap rounded-xl border border-[#252840] bg-[#0f1015] px-3 py-2.5 text-sm text-[#f0f2ff]">
            {proposal.description}
          </div>
        )}
      </div>

      <div className="rounded-2xl border-2 border-[#252840] bg-[#13151f] p-5">
        <div className="mb-3 text-sm font-semibold text-orange-300">Tiến độ xử lý</div>
        <div className="space-y-2 text-sm">
          <Row label="KS gửi đề xuất" time={proposal.createdAt} active />
          <Row label="TPTC duyệt" time={proposal.acceptedAt} active={!!proposal.acceptedAt} />
          {proposal.status === "declined" ? (
            <Row label="TPTC từ chối" time={proposal.acceptedAt} active variant="declined" />
          ) : null}
          <Row label="Đã đặt nhà cung cấp" time={proposal.orderedAt} active={!!proposal.orderedAt} />
          <Row label="Đã nhận hàng tại công trình" time={proposal.receivedAt} active={!!proposal.receivedAt} />
          <Row label="Đã thanh toán" time={proposal.paidAt} active={!!proposal.paidAt} />
        </div>
      </div>

      <div className="rounded-2xl border-2 border-[#252840] bg-[#13151f] p-3">
        <ProposalComments proposalId={proposal.id} currentUserId={currentUserId} />
      </div>
    </>
  );
}

function Row({
  label,
  time,
  active,
  variant = "default",
}: {
  label: string;
  time: string | null;
  active: boolean;
  variant?: "default" | "declined";
}) {
  const dot = variant === "declined" ? "bg-[#f87171]" : active ? "bg-[#34d399]" : "bg-[#2d3249]";
  const text = variant === "declined" ? "text-[#f87171]" : active ? "text-[#f0f2ff]" : "text-[#5a627a]";
  return (
    <div className="flex items-start gap-3">
      <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <div className="flex-1">
        <div className={text}>{label}</div>
        {time ? <div className="text-xs text-[#5a627a]">{fmt(time)}</div> : null}
      </div>
    </div>
  );
}
