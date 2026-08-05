"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { confirmDialog } from "@/components/confirm-dialog";
import { MoneyInput } from "@/components/money-input";
import "./debts.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

type CategoryIds = { TRANOGOC: string; LAIVAY: string; TAMUNG: string };

type LoanRow = {
  id: string;
  code: string;
  lender: string;
  interestRate: number | null;
  disbursedAt: string | null;
  dueDate: string | null;
  status: "active" | "paid";
  note: string | null;
  principal: number;
  disbursed: number;
  disbursedPending: number;
  principalPaid: number;
  principalPending: number;
  interestPaid: number;
  interestPending: number;
  outstanding: number;
};

type AdvanceRow = {
  id: string;
  code: string;
  recipient: string;
  advancedAt: string | null;
  purpose: string | null;
  status: "open" | "settled";
  note: string | null;
  amount: number;
  paidOut: number;
  paidOutPending: number;
  returned: number;
  returnedPending: number;
  outstanding: number;
};

type Txn = {
  id: string;
  code: string;
  amount: number;
  status: string;
  note: string | null;
  createdAt: string;
  kind: string;
};
type LoanDetail = LoanRow & { expenseTxns: Txn[]; receiptTxns: Txn[] };
type AdvanceDetail = AdvanceRow & { expenseTxns: Txn[]; receiptTxns: Txn[] };

const fmtN = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

const TXN_ST: Record<string, string> = {
  tptc_pending: "Chờ admin duyệt",
  pending: "Chờ chi/thu",
  awaiting_approval: "Chờ admin duyệt",
  paid: "Đã chi",
  received: "Đã thu",
};

// Loại giao dịch tạo được trong màn này.
type TxnType = "loan-disburse" | "loan-principal" | "loan-interest" | "advance-out" | "advance-return";
const TXN_META: Record<TxnType, { title: string; who: string; whoLabel: string; dir: "in" | "out" }> = {
  "loan-disburse": { title: "Nhận tiền vay", who: "payer", whoLabel: "Bên cho vay", dir: "in" },
  "loan-principal": { title: "Trả nợ gốc", who: "payee", whoLabel: "Trả cho", dir: "out" },
  "loan-interest": { title: "Trả lãi vay", who: "payee", whoLabel: "Trả cho", dir: "out" },
  "advance-out": { title: "Chi tạm ứng", who: "payee", whoLabel: "Người nhận", dir: "out" },
  "advance-return": { title: "Hoàn ứng", who: "payer", whoLabel: "Người hoàn", dir: "in" },
};

export function DebtsClient({ role, categoryIds }: { role: string; categoryIds: CategoryIds }) {
  const isAdmin = role === "admin";
  const isKt = role === "accountant";
  const canCreate = isAdmin || isKt;

  // Brand theme (Ngà sáng / Mahogany tối), nhớ localStorage — đồng bộ các màn khác.
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("hg-theme") : null;
    if (t === "light" || t === "dark") setTheme(t);
  }, []);
  const toggleTheme = () =>
    setTheme((p) => {
      const n = p === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("hg-theme", n);
      } catch {
        /* ignore */
      }
      return n;
    });

  const [tab, setTab] = useState<"loans" | "advances">("loans");
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LoanDetail | AdvanceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showAdvForm, setShowAdvForm] = useState(false);
  const [txnCtx, setTxnCtx] = useState<{ type: TxnType; refId: string; refCode: string } | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const [lr, ar] = await Promise.all([
        fetch("/api/loans").then((r) => r.json()),
        fetch("/api/advances").then((r) => r.json()),
      ]);
      setLoans(lr.rows ?? []);
      setAdvances(ar.rows ?? []);
    } catch {
      toast.error("Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(
    async (kind: "loans" | "advances", id: string) => {
      setDetailLoading(true);
      try {
        const d = await fetch(`/api/${kind}/${id}`).then((r) => r.json());
        setDetail(d);
      } catch {
        toast.error("Không tải được chi tiết");
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  const toggleExpand = (kind: "loans" | "advances", id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    void loadDetail(kind, id);
  };

  const refreshAfterTxn = async () => {
    await loadList();
    if (expandedId) await loadDetail(tab, expandedId);
  };

  // Tổng số dư đang treo (để hiển thị stat tiles).
  const loanStats = useMemo(() => {
    const active = loans.filter((l) => l.status === "active");
    return {
      count: active.length,
      outstanding: active.reduce((s, l) => s + l.outstanding, 0),
      interest: loans.reduce((s, l) => s + l.interestPaid, 0),
    };
  }, [loans]);
  const advStats = useMemo(() => {
    const open = advances.filter((a) => a.status === "open");
    return {
      count: open.length,
      outstanding: open.reduce((s, a) => s + a.outstanding, 0),
    };
  }, [advances]);

  return (
    <div className={`dtdoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
      <div className="dtwrap">
        <div className="dt-head">
          <div>
            <div className="dt-eyebrow">Tài chính công ty</div>
            <h1 className="dt-h1">Vay &amp; Tạm ứng</h1>
            <div className="dt-meta">
              <span>Quản lý nợ gốc · lãi vay · tạm ứng · hoàn ứng</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="dt-iconbtn" onClick={toggleTheme} title="Đổi giao diện">
              {theme === "dark" ? "☀" : "☾"}
            </button>
            {canCreate && (
              <button
                className="dt-btn primary"
                onClick={() => (tab === "loans" ? setShowLoanForm(true) : setShowAdvForm(true))}
              >
                + {tab === "loans" ? "Khoản vay" : "Tạm ứng"}
              </button>
            )}
          </div>
        </div>

        {/* stat tiles */}
        <div className="dt-stats">
          {tab === "loans" ? (
            <>
              <div className="dt-tile"><div className="k">Khoản vay đang nợ</div><div className="v num">{loanStats.count}</div></div>
              <div className="dt-tile"><div className="k">Dư gốc còn lại</div><div className="v am num">{fmtN(loanStats.outstanding)}</div></div>
              <div className="dt-tile"><div className="k">Lãi đã trả</div><div className="v num">{fmtN(loanStats.interest)}</div></div>
            </>
          ) : (
            <>
              <div className="dt-tile"><div className="k">Phiếu ứng mở</div><div className="v num">{advStats.count}</div></div>
              <div className="dt-tile"><div className="k">Dư ứng chưa hoàn</div><div className="v am num">{fmtN(advStats.outstanding)}</div></div>
              <div className="dt-tile"><div className="k">Tổng phiếu</div><div className="v num">{advances.length}</div></div>
            </>
          )}
        </div>

        {/* tabs */}
        <div className="dt-bar">
          <div className="dt-tabs">
            <button className={`dt-tab ${tab === "loans" ? "on" : ""}`} onClick={() => { setTab("loans"); setExpandedId(null); }}>
              Khoản vay
            </button>
            <button className={`dt-tab ${tab === "advances" ? "on" : ""}`} onClick={() => { setTab("advances"); setExpandedId(null); }}>
              Tạm ứng
            </button>
          </div>
        </div>

        {/* list */}
        {loading ? (
          <div className="dt-empty">Đang tải…</div>
        ) : tab === "loans" ? (
          loans.length === 0 ? (
            <div className="dt-empty">Chưa có khoản vay nào.</div>
          ) : (
            <div className="dt-list">
              {loans.map((l) => (
                <LoanCard
                  key={l.id}
                  loan={l}
                  expanded={expandedId === l.id}
                  detail={expandedId === l.id ? (detail as LoanDetail | null) : null}
                  detailLoading={expandedId === l.id && detailLoading}
                  isAdmin={isAdmin}
                  canCreate={canCreate}
                  onToggle={() => toggleExpand("loans", l.id)}
                  onTxn={(type) => setTxnCtx({ type, refId: l.id, refCode: l.code })}
                  onChanged={refreshAfterTxn}
                  theme={theme}
                />
              ))}
            </div>
          )
        ) : advances.length === 0 ? (
          <div className="dt-empty">Chưa có phiếu tạm ứng nào.</div>
        ) : (
          <div className="dt-list">
            {advances.map((a) => (
              <AdvanceCard
                key={a.id}
                adv={a}
                expanded={expandedId === a.id}
                detail={expandedId === a.id ? (detail as AdvanceDetail | null) : null}
                detailLoading={expandedId === a.id && detailLoading}
                isAdmin={isAdmin}
                canCreate={canCreate}
                onToggle={() => toggleExpand("advances", a.id)}
                onTxn={(type) => setTxnCtx({ type, refId: a.id, refCode: a.code })}
                onChanged={refreshAfterTxn}
                theme={theme}
              />
            ))}
          </div>
        )}
      </div>

      {showLoanForm && (
        <LoanForm
          theme={theme}
          onClose={() => setShowLoanForm(false)}
          onSaved={() => { setShowLoanForm(false); void loadList(); }}
        />
      )}
      {showAdvForm && (
        <AdvanceForm
          theme={theme}
          onClose={() => setShowAdvForm(false)}
          onSaved={() => { setShowAdvForm(false); void loadList(); }}
        />
      )}
      {txnCtx && (
        <TxnForm
          theme={theme}
          ctx={txnCtx}
          categoryIds={categoryIds}
          isKt={isKt}
          onClose={() => setTxnCtx(null)}
          onSaved={() => { setTxnCtx(null); void refreshAfterTxn(); }}
        />
      )}
    </div>
  );
}

/* ── Loan card ───────────────────────────────────────────── */
function LoanCard({
  loan, expanded, detail, detailLoading, isAdmin, canCreate, onToggle, onTxn, onChanged, theme,
}: {
  loan: LoanRow;
  expanded: boolean;
  detail: LoanDetail | null;
  detailLoading: boolean;
  isAdmin: boolean;
  canCreate: boolean;
  onToggle: () => void;
  onTxn: (t: TxnType) => void;
  onChanged: () => void;
  theme: string;
}) {
  const pct = loan.principal > 0 ? Math.min(100, (loan.principalPaid / loan.principal) * 100) : 0;
  const cleared = loan.outstanding <= 0.5;

  const setStatus = async (status: "active" | "paid") => {
    const res = await fetch(`/api/loans/${loan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) { toast.success(status === "paid" ? "Đã đóng khoản vay" : "Đã mở lại"); onChanged(); }
    else toast.error((await res.json().catch(() => ({}))).message || "Lỗi");
  };
  const del = async () => {
    if (!(await confirmDialog({ title: "Xoá khoản vay?", message: `${loan.code} — ${loan.lender}` }))) return;
    const res = await fetch(`/api/loans/${loan.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Đã xoá"); onChanged(); }
    else toast.error((await res.json().catch(() => ({}))).message || "Không xoá được");
  };

  return (
    <div className={`dt-rc ${expanded ? "exp" : ""}`}>
      <div className="dt-r1" onClick={onToggle} style={{ cursor: "pointer" }}>
        <div className="dt-ttl">{loan.lender}</div>
        <div className={`dt-outstand ${cleared ? "clear" : ""}`}>{fmtN(loan.outstanding)}</div>
      </div>
      <div className="dt-r2" onClick={onToggle} style={{ cursor: "pointer" }}>
        <div className="dt-m">
          <span className="code">{loan.code}</span>
          <span className="d">·</span>
          <span>gốc {fmtN(loan.principal)}</span>
          {loan.interestRate != null && (<><span className="d">·</span><span>{loan.interestRate}%/năm</span></>)}
        </div>
        <div className="dt-rt">
          <span className={`dt-st ${loan.status === "paid" ? "stt-received" : "stt-pending"}`}>
            {loan.status === "paid" ? "Đã trả xong" : "Đang nợ"}
          </span>
        </div>
      </div>
      <div className={`dt-bar ${cleared ? "ok" : ""}`} onClick={onToggle} style={{ cursor: "pointer" }}>
        <span style={{ width: `${pct}%` }} />
      </div>

      {expanded && (
        <div className="dt-exp">
          {detailLoading || !detail ? (
            <div className="dt-empty" style={{ gridColumn: "1/-1" }}>Đang tải…</div>
          ) : (
            <>
              <div className="col">
                <div className="dt-kvrow"><span className="lb">Đã nhận vay</span><span className="vl in">{fmtN(detail.disbursed)}</span></div>
                <div className="dt-kvrow"><span className="lb">Đã trả gốc</span><span className="vl out">{fmtN(detail.principalPaid)}</span></div>
                <div className="dt-kvrow"><span className="lb">Dư gốc còn lại</span><span className="vl">{fmtN(detail.outstanding)}</span></div>
              </div>
              <div className="col">
                <div className="dt-kvrow"><span className="lb">Đã trả lãi</span><span className="vl out">{fmtN(detail.interestPaid)}</span></div>
                <div className="dt-kvrow"><span className="lb">Ngày vay</span><span className="vl">{fmtDate(detail.disbursedAt)}</span></div>
                <div className="dt-kvrow"><span className="lb">Hạn trả</span><span className="vl">{fmtDate(detail.dueDate)}</span></div>
              </div>

              <TxnList expense={detail.expenseTxns} receipt={detail.receiptTxns} />

              {canCreate && loan.status === "active" && (
                <div className="dt-txn-acts">
                  <button className="dt-chip go" onClick={() => onTxn("loan-disburse")}>+ Nhận tiền vay</button>
                  <button className="dt-chip" onClick={() => onTxn("loan-principal")}>+ Trả gốc</button>
                  <button className="dt-chip" onClick={() => onTxn("loan-interest")}>+ Trả lãi</button>
                </div>
              )}
              {isAdmin && (
                <div className="dt-txn-acts">
                  {loan.status === "active" ? (
                    <button className="dt-chip ok" onClick={() => setStatus("paid")}>✓ Đánh dấu trả xong</button>
                  ) : (
                    <button className="dt-chip" onClick={() => setStatus("active")}>↺ Mở lại</button>
                  )}
                  <button className="dt-chip dn" onClick={del}>Xoá</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Advance card ────────────────────────────────────────── */
function AdvanceCard({
  adv, expanded, detail, detailLoading, isAdmin, canCreate, onToggle, onTxn, onChanged, theme,
}: {
  adv: AdvanceRow;
  expanded: boolean;
  detail: AdvanceDetail | null;
  detailLoading: boolean;
  isAdmin: boolean;
  canCreate: boolean;
  onToggle: () => void;
  onTxn: (t: TxnType) => void;
  onChanged: () => void;
  theme: string;
}) {
  const base = adv.paidOut > 0 ? adv.paidOut : adv.amount;
  const pct = base > 0 ? Math.min(100, (adv.returned / base) * 100) : 0;
  const cleared = adv.outstanding <= 0.5;

  const setStatus = async (status: "open" | "settled") => {
    const res = await fetch(`/api/advances/${adv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) { toast.success(status === "settled" ? "Đã tất toán" : "Đã mở lại"); onChanged(); }
    else toast.error((await res.json().catch(() => ({}))).message || "Lỗi");
  };
  const del = async () => {
    if (!(await confirmDialog({ title: "Xoá phiếu tạm ứng?", message: `${adv.code} — ${adv.recipient}` }))) return;
    const res = await fetch(`/api/advances/${adv.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Đã xoá"); onChanged(); }
    else toast.error((await res.json().catch(() => ({}))).message || "Không xoá được");
  };

  return (
    <div className={`dt-rc ${expanded ? "exp" : ""}`}>
      <div className="dt-r1" onClick={onToggle} style={{ cursor: "pointer" }}>
        <div className="dt-ttl">{adv.recipient}</div>
        <div className={`dt-outstand ${cleared ? "clear" : ""}`}>{fmtN(adv.outstanding)}</div>
      </div>
      <div className="dt-r2" onClick={onToggle} style={{ cursor: "pointer" }}>
        <div className="dt-m">
          <span className="code">{adv.code}</span>
          <span className="d">·</span>
          <span>ứng {fmtN(adv.amount)}</span>
        </div>
        <div className="dt-rt">
          <span className={`dt-st ${adv.status === "settled" ? "stt-received" : "stt-pending"}`}>
            {adv.status === "settled" ? "Đã tất toán" : "Đang mở"}
          </span>
        </div>
      </div>
      <div className={`dt-bar ${cleared ? "ok" : ""}`} onClick={onToggle} style={{ cursor: "pointer" }}>
        <span style={{ width: `${pct}%` }} />
      </div>

      {expanded && (
        <div className="dt-exp">
          {detailLoading || !detail ? (
            <div className="dt-empty" style={{ gridColumn: "1/-1" }}>Đang tải…</div>
          ) : (
            <>
              <div className="col">
                <div className="dt-kvrow"><span className="lb">Đã chi ứng</span><span className="vl out">{fmtN(detail.paidOut)}</span></div>
                <div className="dt-kvrow"><span className="lb">Đã hoàn</span><span className="vl in">{fmtN(detail.returned)}</span></div>
                <div className="dt-kvrow"><span className="lb">Dư ứng chưa hoàn</span><span className="vl">{fmtN(detail.outstanding)}</span></div>
              </div>
              <div className="col">
                <div className="dt-kvrow"><span className="lb">Ngày ứng</span><span className="vl">{fmtDate(detail.advancedAt)}</span></div>
                {detail.purpose && <div className="dt-kv"><span className="lb">Mục đích: </span>{detail.purpose}</div>}
              </div>

              <TxnList expense={detail.expenseTxns} receipt={detail.receiptTxns} />

              {canCreate && adv.status === "open" && (
                <div className="dt-txn-acts">
                  <button className="dt-chip go" onClick={() => onTxn("advance-out")}>+ Chi tạm ứng</button>
                  <button className="dt-chip" onClick={() => onTxn("advance-return")}>+ Hoàn ứng</button>
                </div>
              )}
              {isAdmin && (
                <div className="dt-txn-acts">
                  {adv.status === "open" ? (
                    <button className="dt-chip ok" onClick={() => setStatus("settled")}>✓ Tất toán</button>
                  ) : (
                    <button className="dt-chip" onClick={() => setStatus("open")}>↺ Mở lại</button>
                  )}
                  <button className="dt-chip dn" onClick={del}>Xoá</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Danh sách giao dịch con ─────────────────────────────── */
function TxnList({ expense, receipt }: { expense: Txn[]; receipt: Txn[] }) {
  const all = [...receipt, ...expense].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  if (all.length === 0) return <div className="dt-txns"><div className="dt-txn-hd">Chưa có giao dịch</div></div>;
  return (
    <div className="dt-txns">
      <div className="dt-txn-hd">Lịch sử giao dịch</div>
      {all.map((t) => {
        const isIn = t.kind === "receipt" || t.kind === "return";
        const label =
          t.kind === "receipt" ? "Nhận vay"
          : t.kind === "return" ? "Hoàn ứng"
          : t.kind === "interest" ? "Trả lãi"
          : t.kind === "principal" ? "Trả gốc"
          : "Chi ứng";
        return (
          <div className="dt-txn" key={t.id}>
            <span className="code">{t.code}</span>
            <span className="ttl">{label} · {TXN_ST[t.status] ?? t.status}</span>
            <span className={`amt ${isIn ? "in" : "out"}`}>{isIn ? "+" : "−"}{fmtN(t.amount)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Modal wrapper ───────────────────────────────────────── */
function Sheet({ theme, title, sub, onClose, children }: {
  theme: string; title: string; sub?: string; onClose: () => void; children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className={`dtportal ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
      <div className="dt-scrim" onClick={onClose}>
        <div className="dt-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="dt-sheet-hd">
            <div>
              <h3>{title}</h3>
              {sub && <div className="sub">{sub}</div>}
            </div>
            <button className="dt-iconbtn" onClick={onClose}>✕</button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Form: Khoản vay ─────────────────────────────────────── */
function LoanForm({ theme, onClose, onSaved }: { theme: string; onClose: () => void; onSaved: () => void }) {
  const [lender, setLender] = useState("");
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("");
  const [disbursedAt, setDisbursedAt] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!lender.trim() || !principal) { toast.error("Nhập bên cho vay và số tiền"); return; }
    setBusy(true);
    const res = await fetch("/api/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lender, principal: Number(principal),
        interestRate: rate ? Number(rate) : null,
        disbursedAt: disbursedAt || null, dueDate: dueDate || null, note: note || null,
      }),
    });
    setBusy(false);
    if (res.ok) { toast.success("Đã tạo khoản vay"); onSaved(); }
    else toast.error((await res.json().catch(() => ({}))).message || "Lỗi");
  };

  return (
    <Sheet theme={theme} title="Khoản vay mới" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="dt-fgrid">
          <div className="dt-fld full">
            <label className="dt-lbl">Bên cho vay <span className="req">*</span></label>
            <input className="dt-ctrl" value={lender} onChange={(e) => setLender(e.target.value)} placeholder="Ngân hàng / cá nhân…" />
          </div>
          <div className="dt-fld">
            <label className="dt-lbl">Tiền gốc <span className="req">*</span></label>
            <MoneyInput className="dt-ctrl" value={principal} onChange={setPrincipal} placeholder="0" />
          </div>
          <div className="dt-fld">
            <label className="dt-lbl">Lãi suất %/năm</label>
            <input className="dt-ctrl" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="vd 12" />
          </div>
          <div className="dt-fld">
            <label className="dt-lbl">Ngày vay</label>
            <input className="dt-ctrl" type="date" value={disbursedAt} onChange={(e) => setDisbursedAt(e.target.value)} />
          </div>
          <div className="dt-fld">
            <label className="dt-lbl">Hạn trả</label>
            <input className="dt-ctrl" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="dt-fld full">
            <label className="dt-lbl">Ghi chú</label>
            <textarea className="dt-ctrl" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="dt-callout">Tạo khoản vay chỉ lập hồ sơ theo dõi. Ghi tiền vào/ra bằng nút <b>Nhận tiền vay / Trả gốc / Trả lãi</b> — các lệnh này qua duyệt và ghi sổ quỹ.</div>
        <div className="dt-acts">
          <button type="button" className="dt-btn ghost block" onClick={onClose}>Huỷ</button>
          <button type="submit" className="dt-btn primary block" disabled={busy}>{busy ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </form>
    </Sheet>
  );
}

/* ── Form: Tạm ứng ───────────────────────────────────────── */
function AdvanceForm({ theme, onClose, onSaved }: { theme: string; onClose: () => void; onSaved: () => void }) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [advancedAt, setAdvancedAt] = useState("");
  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!recipient.trim() || !amount) { toast.error("Nhập người nhận và số tiền"); return; }
    setBusy(true);
    const res = await fetch("/api/advances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient, amount: Number(amount),
        advancedAt: advancedAt || null, purpose: purpose || null, note: note || null,
      }),
    });
    setBusy(false);
    if (res.ok) { toast.success("Đã tạo phiếu tạm ứng"); onSaved(); }
    else toast.error((await res.json().catch(() => ({}))).message || "Lỗi");
  };

  return (
    <Sheet theme={theme} title="Tạm ứng mới" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="dt-fgrid">
          <div className="dt-fld full">
            <label className="dt-lbl">Người nhận tạm ứng <span className="req">*</span></label>
            <input className="dt-ctrl" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Nhân viên / đơn vị…" />
          </div>
          <div className="dt-fld">
            <label className="dt-lbl">Số tiền <span className="req">*</span></label>
            <MoneyInput className="dt-ctrl" value={amount} onChange={setAmount} placeholder="0" />
          </div>
          <div className="dt-fld">
            <label className="dt-lbl">Ngày ứng</label>
            <input className="dt-ctrl" type="date" value={advancedAt} onChange={(e) => setAdvancedAt(e.target.value)} />
          </div>
          <div className="dt-fld full">
            <label className="dt-lbl">Mục đích</label>
            <input className="dt-ctrl" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="vd ứng mua vật tư…" />
          </div>
          <div className="dt-fld full">
            <label className="dt-lbl">Ghi chú</label>
            <textarea className="dt-ctrl" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="dt-callout">Tạo phiếu ứng chỉ lập hồ sơ. Ghi tiền bằng nút <b>Chi tạm ứng / Hoàn ứng</b> — qua duyệt và ghi sổ quỹ.</div>
        <div className="dt-acts">
          <button type="button" className="dt-btn ghost block" onClick={onClose}>Huỷ</button>
          <button type="submit" className="dt-btn primary block" disabled={busy}>{busy ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </form>
    </Sheet>
  );
}

/* ── Form: Giao dịch (chi/thu gắn khoản) ─────────────────── */
function TxnForm({ theme, ctx, categoryIds, isKt, onClose, onSaved }: {
  theme: string;
  ctx: { type: TxnType; refId: string; refCode: string };
  categoryIds: CategoryIds;
  isKt: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const meta = TXN_META[ctx.type];
  const [amount, setAmount] = useState("");
  const [who, setWho] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer">("transfer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!amount) { toast.error("Nhập số tiền"); return; }
    setBusy(true);
    let url = "";
    let body: Record<string, unknown> = {};
    if (ctx.type === "loan-disburse") {
      url = "/api/receipts";
      body = { source: "loan", amount: Number(amount), payer: who || null, note: note || null, loanId: ctx.refId };
    } else if (ctx.type === "advance-return") {
      url = "/api/receipts";
      body = { source: "advance_return", amount: Number(amount), payer: who || null, note: note || null, advanceId: ctx.refId };
    } else if (ctx.type === "loan-principal") {
      url = "/api/expenses";
      body = { categoryId: categoryIds.TRANOGOC, amount: Number(amount), payee: who || null, paymentMethod: method, note: note || null, loanId: ctx.refId };
    } else if (ctx.type === "loan-interest") {
      url = "/api/expenses";
      body = { categoryId: categoryIds.LAIVAY, amount: Number(amount), payee: who || null, paymentMethod: method, note: note || null, loanId: ctx.refId };
    } else {
      url = "/api/expenses";
      body = { categoryId: categoryIds.TAMUNG, amount: Number(amount), payee: who || null, paymentMethod: method, note: note || null, advanceId: ctx.refId };
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(isKt ? "Đã tạo, chờ admin duyệt" : "Đã tạo lệnh — vào Lệnh chi/thu để chi/thu");
      onSaved();
    } else {
      toast.error((await res.json().catch(() => ({}))).message || "Lỗi");
    }
  };

  const isExpense = meta.dir === "out";
  return (
    <Sheet theme={theme} title={meta.title} sub={ctx.refCode} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="dt-fgrid">
          <div className="dt-fld">
            <label className="dt-lbl">Số tiền <span className="req">*</span></label>
            <MoneyInput className="dt-ctrl" value={amount} onChange={setAmount} placeholder="0" />
          </div>
          <div className="dt-fld">
            <label className="dt-lbl">{meta.whoLabel}</label>
            <input className="dt-ctrl" value={who} onChange={(e) => setWho(e.target.value)} />
          </div>
          {isExpense && (
            <div className="dt-fld full">
              <label className="dt-lbl">Hình thức</label>
              <div className="dt-seg">
                <button type="button" className={method === "transfer" ? "on" : ""} onClick={() => setMethod("transfer")}>Chuyển khoản</button>
                <button type="button" className={method === "cash" ? "on" : ""} onClick={() => setMethod("cash")}>Tiền mặt</button>
              </div>
            </div>
          )}
          <div className="dt-fld full">
            <label className="dt-lbl">Ghi chú</label>
            <textarea className="dt-ctrl" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="dt-callout">
          {isExpense ? "Tạo lệnh chi" : "Tạo lệnh thu"} gắn vào {ctx.refCode}.
          {" "}{isKt ? "KT tạo → admin duyệt → ghi sổ quỹ." : "Sau khi tạo, vào màn Lệnh chi/Lệnh thu để xác nhận chi/thu (ghi sổ quỹ)."}
        </div>
        <div className="dt-acts">
          <button type="button" className="dt-btn ghost block" onClick={onClose}>Huỷ</button>
          <button type="submit" className="dt-btn primary block" disabled={busy}>{busy ? "Đang lưu…" : "Tạo lệnh"}</button>
        </div>
      </form>
    </Sheet>
  );
}
