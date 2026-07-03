import {
  Check,
  CheckCircle2,
  PackageCheck,
  Receipt,
  ShoppingCart,
  Truck,
  Wallet,
} from "lucide-react";

export type ProposalStatus = "pending" | "accepted" | "declined";
export type OrderStatus = "not_ordered" | "ordered" | "received" | "paid";

export type ParsedItem = { ten: string; sl: number; dvt: string };

export type ProposalCardRow = {
  id: string;
  description: string;
  status: ProposalStatus;
  orderStatus: OrderStatus;
  parsedItems: ParsedItem[] | null;
  createdAt: Date;
  _count?: { debts: number };
};

export const STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: "Chờ duyệt",
  accepted: "Đã duyệt",
  declined: "Từ chối",
};

export const STATUS_CHIP: Record<ProposalStatus, string> = {
  pending: "bg-amber-500/15 text-amber-300",
  accepted: "bg-blue-500/15 text-blue-300",
  declined: "bg-red-500/15 text-red-300",
};

export const ORDER_LABEL: Record<OrderStatus, string> = {
  not_ordered: "Chưa đặt",
  ordered: "Đã đặt",
  received: "Đã nhận",
  paid: "Đã TT",
};

export const ORDER_CHIP: Record<OrderStatus, string> = {
  not_ordered: "bg-slate-500/15 text-slate-300",
  ordered: "bg-cyan-500/15 text-cyan-300",
  received: "bg-emerald-500/15 text-emerald-300",
  paid: "bg-emerald-600/25 text-emerald-200",
};

export const ORDER_ICON: Record<OrderStatus, JSX.Element> = {
  not_ordered: <ShoppingCart className="h-3 w-3" />,
  ordered: <Truck className="h-3 w-3" />,
  received: <PackageCheck className="h-3 w-3" />,
  paid: <Wallet className="h-3 w-3" />,
};

type StageKey = "duyet" | "dat" | "nhan" | "ghinh" | "tt";

const STAGE_LABEL: Record<StageKey, string> = {
  duyet: "Duyệt",
  dat: "Đặt NCC",
  nhan: "Nhận",
  ghinh: "Ghi CN",
  tt: "TT NCC",
};

const STAGE_ICON: Record<StageKey, JSX.Element> = {
  duyet: <CheckCircle2 className="h-3 w-3" />,
  dat: <ShoppingCart className="h-3 w-3" />,
  nhan: <PackageCheck className="h-3 w-3" />,
  ghinh: <Receipt className="h-3 w-3" />,
  tt: <Wallet className="h-3 w-3" />,
};

export function normalizeItem(raw: unknown): ParsedItem {
  const it = (raw ?? {}) as Record<string, unknown>;
  const ten = String(it.ten ?? it.name ?? "");
  const dvt = String(it.dvt ?? it.unit ?? "");
  const sl = Number(it.sl ?? it.qty ?? 0);
  return { ten, sl, dvt };
}

function stageStates(p: ProposalCardRow): Record<StageKey, "done" | "current" | "pending"> {
  if (p.status === "declined") {
    return { duyet: "pending", dat: "pending", nhan: "pending", ghinh: "pending", tt: "pending" };
  }
  const duyet = p.status === "accepted" ? "done" : "current";
  const dat =
    p.orderStatus === "ordered" || p.orderStatus === "received" || p.orderStatus === "paid"
      ? "done"
      : duyet === "done"
        ? "current"
        : "pending";
  const nhan =
    p.orderStatus === "received" || p.orderStatus === "paid"
      ? "done"
      : dat === "done"
        ? "current"
        : "pending";
  const hasDebt = (p._count?.debts ?? 0) > 0;
  const ghinh = hasDebt ? "done" : nhan === "done" ? "current" : "pending";
  const tt = p.orderStatus === "paid" ? "done" : ghinh === "done" ? "current" : "pending";
  return { duyet, dat, nhan, ghinh, tt };
}

export function ProposalPipeline({ p }: { p: ProposalCardRow }) {
  const st = stageStates(p);
  const keys: StageKey[] = ["duyet", "dat", "nhan", "ghinh", "tt"];
  return (
    <div className="mt-2 flex items-center">
      {keys.map((k, idx) => {
        const state = st[k];
        const dotCls =
          state === "done"
            ? "bg-emerald-500 text-white ring-emerald-500/20"
            : state === "current"
              ? "bg-[#fb923c] text-[#0b0d16] ring-[#fb923c]/25 animate-pulse"
              : "bg-[#252840] text-[#5a627a] ring-transparent";
        const lineCls =
          state === "done" || (state === "current" && idx > 0 && st[keys[idx - 1]] === "done")
            ? "bg-emerald-500/60"
            : "bg-[#252840]";
        const labelCls =
          state === "done"
            ? "text-emerald-300"
            : state === "current"
              ? "text-[#fb923c] font-semibold"
              : "text-[#5a627a]";
        return (
          <div key={k} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <div className={`h-[2px] flex-1 ${idx === 0 ? "opacity-0" : lineCls}`} />
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-2 ${dotCls}`}
                title={STAGE_LABEL[k]}
              >
                {state === "done" ? (
                  <Check className="h-3 w-3" strokeWidth={3} />
                ) : (
                  STAGE_ICON[k]
                )}
              </div>
              <div
                className={`h-[2px] flex-1 ${
                  idx === keys.length - 1
                    ? "opacity-0"
                    : st[keys[idx + 1]] !== "pending"
                      ? "bg-emerald-500/60"
                      : "bg-[#252840]"
                }`}
              />
            </div>
            <div className={`mt-0.5 text-[9px] leading-none ${labelCls}`}>{STAGE_LABEL[k]}</div>
          </div>
        );
      })}
    </div>
  );
}
