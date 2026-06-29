"use client";

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

function statusInfo(p: Proposal): { label: string; cls: string } {
  if (p.status === "declined") return { label: "Bị từ chối", cls: "bg-[#D26B6B]/20 text-[#D26B6B]" };
  if (p.status === "pending") return { label: "Chờ TPTC duyệt", cls: "bg-[#E0B855]/20 text-[#E0B855]" };
  if (p.orderStatus === "not_ordered") return { label: "Đã duyệt · chưa đặt", cls: "bg-[#ff8a3d]/20 text-[#ff8a3d]" };
  if (p.orderStatus === "ordered") return { label: "Đang về", cls: "bg-[#ff8a3d]/20 text-[#ff8a3d]" };
  if (p.orderStatus === "received") return { label: "Đã nhận", cls: "bg-[#6FA677]/20 text-[#6FA677]" };
  return { label: "Đã thanh toán", cls: "bg-[#6FA677]/20 text-[#6FA677]" };
}

export function SubProposalDetail({ proposal }: { proposal: Proposal }) {
  const items: Item[] = (proposal.parsedItems || []).map(normalize);
  const hasItems = items.length > 0;
  const st = statusInfo(proposal);

  return (
    <>
      <div className="rounded-2xl border-2 border-[#252840] bg-[#13151f] p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-[#8892b0]">Gửi lúc {fmt(proposal.createdAt)}</span>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.label}</span>
        </div>
        {proposal.processedNote ? (
          <div className="mt-3 rounded-xl border border-[#D26B6B]/30 bg-[#D26B6B]/10 px-3 py-2 text-sm text-[#f5ede4]">
            <span className="text-[#D26B6B] font-semibold">Ghi chú từ TPTC:</span> {proposal.processedNote}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border-2 border-[#252840] bg-[#13151f] p-5">
        <div className="mb-3 text-sm font-semibold text-orange-300">Vật tư đề xuất</div>
        {hasItems ? (
          <div className="overflow-x-auto rounded-xl border border-[#252840]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#0f1320] text-left text-[11px] uppercase tracking-wide text-[#8892b0]">
                  <th className="px-3 py-2 w-8">#</th>
                  <th className="px-3 py-2">Chủng loại</th>
                  <th className="px-3 py-2 text-right w-16">SL</th>
                  <th className="px-3 py-2 w-14">ĐVT</th>
                  <th className="px-3 py-2">Công tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-t border-[#252840] text-[#f5ede4]">
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
          <div className="whitespace-pre-wrap rounded-xl border border-[#252840] bg-[#0f1320] px-3 py-2.5 text-sm text-[#f5ede4]">
            {proposal.description}
          </div>
        )}
      </div>

      <div className="rounded-2xl border-2 border-[#252840] bg-[#13151f] p-5">
        <div className="mb-3 text-sm font-semibold text-orange-300">Tiến độ xử lý</div>
        <div className="space-y-2 text-sm">
          <Row label="Anh chốt đề xuất" time={proposal.createdAt} active />
          <Row label="TPTC duyệt" time={proposal.acceptedAt} active={!!proposal.acceptedAt} />
          {proposal.status === "declined" ? (
            <Row label="TPTC từ chối" time={proposal.acceptedAt} active variant="declined" />
          ) : null}
          <Row label="Đã đặt nhà cung cấp" time={proposal.orderedAt} active={!!proposal.orderedAt} />
          <Row label="Đã nhận hàng tại công trình" time={proposal.receivedAt} active={!!proposal.receivedAt} />
          <Row label="Đã thanh toán" time={proposal.paidAt} active={!!proposal.paidAt} />
        </div>
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
  const dot = variant === "declined" ? "bg-[#D26B6B]" : active ? "bg-[#6FA677]" : "bg-[#2d3249]";
  const text = variant === "declined" ? "text-[#D26B6B]" : active ? "text-[#f5ede4]" : "text-[#5a627a]";
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
