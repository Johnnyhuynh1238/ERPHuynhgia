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
  principalPaid: number;
  interestPaid: number;
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
  returned: number;
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
const toDateInput = (s: string | null) => (s ? new Date(s).toISOString().slice(0, 10) : "");

const TXN_ST: Record<string, string> = {
  tptc_pending: "Chờ admin duyệt",
  pending: "Chờ chi/thu",
  awaiting_approval: "Chờ admin duyệt",
  paid: "Đã chi",
  received: "Đã thu",
};

// Loại giao dịch tạo được trong màn này.
type TxnType = "loan-disburse" | "loan-principal" | "loan-interest" | "advance-out" | "advance-return";
const TXN_META: Record<TxnType, { title: string; whoLabel: string; dir: "in" | "out" }> = {
  "loan-disburse": { title: "Nhận tiền vay", whoLabel: "Bên cho vay", dir: "in" },
  "loan-principal": { title: "Trả nợ gốc", whoLabel: "Trả cho", dir: "out" },
  "loan-interest": { title: "Trả lãi vay", whoLabel: "Trả cho", dir: "out" },
  "advance-out": { title: "Chi tạm ứng", whoLabel: "Người nhận", dir: "out" },
  "advance-return": { title: "Hoàn ứng", whoLabel: "Người hoàn", dir: "in" },
};

export function DebtsClient({ role, categoryIds }: { role: string; categoryIds: CategoryIds }) {
  const isAdmin = role === "admin";
  const isKt = role === "accountant";
  const canCreate = isAdmin || isKt;

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

  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showAdvForm, setShowAdvForm] = useState(false);
  const [txnCtx, setTxnCtx] = useState<{ type: TxnType; refId: string; refCode: string } | null>(null);
  // Popup chi tiết khi bấm 1 dòng. reloadKey ép modal nạp lại sau khi có thay đổi.
  const [detailCtx, setDetailCtx] = useState<{ kind: "loans" | "advances"; id: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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

  // Gọi sau mọi thay đổi (tạo giao dịch, sửa, đổi trạng thái): nạp lại list + modal.
  const refreshAll = useCallback(() => {
    void loadList();
    setReloadKey((k) => k + 1);
  }, [loadList]);

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
    return { count: open.length, outstanding: open.reduce((s, a) => s + a.outstanding, 0) };
  }, [advances]);

  return (
    <div className={`dtdoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
      <div className="dtwrap">
        <div className="dt-head">
          <div>
            <div className="dt-eyebrow">Tài chính công ty</div>
            <h1 className="dt-h1">Vay &amp; Tạm ứng</h1>
            <div className="dt-meta"><span>Quản lý nợ gốc · lãi vay · tạm ứng · hoàn ứng</span></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="dt-iconbtn" onClick={toggleTheme} title="Đổi giao diện">
              {theme === "dark" ? "☀" : "☾"}
            </button>
            {canCreate && (
              <button className="dt-btn primary" onClick={() => (tab === "loans" ? setShowLoanForm(true) : setShowAdvForm(true))}>
                + {tab === "loans" ? "Khoản vay" : "Tạm ứng"}
              </button>
            )}
          </div>
        </div>

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

        <div className="dt-bar">
          <div className="dt-tabs">
            <button className={`dt-tab ${tab === "loans" ? "on" : ""}`} onClick={() => setTab("loans")}>Khoản vay</button>
            <button className={`dt-tab ${tab === "advances" ? "on" : ""}`} onClick={() => setTab("advances")}>Tạm ứng</button>
          </div>
        </div>

        {loading ? (
          <div className="dt-empty">Đang tải…</div>
        ) : tab === "loans" ? (
          loans.length === 0 ? (
            <div className="dt-empty">Chưa có khoản vay nào.</div>
          ) : (
            <div className="dt-list">
              {loans.map((l) => (
                <LoanCard key={l.id} loan={l} onOpen={() => setDetailCtx({ kind: "loans", id: l.id })} />
              ))}
            </div>
          )
        ) : advances.length === 0 ? (
          <div className="dt-empty">Chưa có phiếu tạm ứng nào.</div>
        ) : (
          <div className="dt-list">
            {advances.map((a) => (
              <AdvanceCard key={a.id} adv={a} onOpen={() => setDetailCtx({ kind: "advances", id: a.id })} />
            ))}
          </div>
        )}
      </div>

      {showLoanForm && (
        <LoanForm theme={theme} onClose={() => setShowLoanForm(false)} onSaved={() => { setShowLoanForm(false); refreshAll(); }} />
      )}
      {showAdvForm && (
        <AdvanceForm theme={theme} onClose={() => setShowAdvForm(false)} onSaved={() => { setShowAdvForm(false); refreshAll(); }} />
      )}

      {detailCtx?.kind === "loans" && (
        <LoanDetailSheet
          theme={theme} id={detailCtx.id} reloadKey={reloadKey} isAdmin={isAdmin} canCreate={canCreate}
          onClose={() => setDetailCtx(null)}
          onChanged={refreshAll}
          onClosed={() => setDetailCtx(null)}
          onTxn={(type, refCode) => setTxnCtx({ type, refId: detailCtx.id, refCode })}
        />
      )}
      {detailCtx?.kind === "advances" && (
        <AdvanceDetailSheet
          theme={theme} id={detailCtx.id} reloadKey={reloadKey} isAdmin={isAdmin} canCreate={canCreate}
          onClose={() => setDetailCtx(null)}
          onChanged={refreshAll}
          onClosed={() => setDetailCtx(null)}
          onTxn={(type, refCode) => setTxnCtx({ type, refId: detailCtx.id, refCode })}
        />
      )}

      {txnCtx && (
        <TxnForm
          theme={theme} ctx={txnCtx} categoryIds={categoryIds} isKt={isKt}
          onClose={() => setTxnCtx(null)}
          onSaved={() => { setTxnCtx(null); refreshAll(); }}
        />
      )}
    </div>
  );
}

/* ── Cards (bấm → mở popup) ──────────────────────────────── */
function LoanCard({ loan, onOpen }: { loan: LoanRow; onOpen: () => void }) {
  const pct = loan.principal > 0 ? Math.min(100, (loan.principalPaid / loan.principal) * 100) : 0;
  const cleared = loan.outstanding <= 0.5;
  return (
    <div className="dt-rc" onClick={onOpen} style={{ cursor: "pointer" }}>
      <div className="dt-r1">
        <div className="dt-ttl">{loan.lender}</div>
        <div className={`dt-outstand ${cleared ? "clear" : ""}`}>{fmtN(loan.outstanding)}</div>
      </div>
      <div className="dt-r2">
        <div className="dt-m">
          <span className="code">{loan.code}</span><span className="d">·</span><span>gốc {fmtN(loan.principal)}</span>
          {loan.interestRate != null && (<><span className="d">·</span><span>{loan.interestRate}%/năm</span></>)}
        </div>
        <div className="dt-rt">
          <span className={`dt-st ${loan.status === "paid" ? "stt-received" : "stt-pending"}`}>
            {loan.status === "paid" ? "Đã trả xong" : "Đang nợ"}
          </span>
        </div>
      </div>
      <div className={`dt-prog ${cleared ? "ok" : ""}`}><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function AdvanceCard({ adv, onOpen }: { adv: AdvanceRow; onOpen: () => void }) {
  const base = adv.paidOut > 0 ? adv.paidOut : adv.amount;
  const pct = base > 0 ? Math.min(100, (adv.returned / base) * 100) : 0;
  const cleared = adv.outstanding <= 0.5;
  return (
    <div className="dt-rc" onClick={onOpen} style={{ cursor: "pointer" }}>
      <div className="dt-r1">
        <div className="dt-ttl">{adv.recipient}</div>
        <div className={`dt-outstand ${cleared ? "clear" : ""}`}>{fmtN(adv.outstanding)}</div>
      </div>
      <div className="dt-r2">
        <div className="dt-m"><span className="code">{adv.code}</span><span className="d">·</span><span>ứng {fmtN(adv.amount)}</span></div>
        <div className="dt-rt">
          <span className={`dt-st ${adv.status === "settled" ? "stt-received" : "stt-pending"}`}>
            {adv.status === "settled" ? "Đã tất toán" : "Đang mở"}
          </span>
        </div>
      </div>
      <div className={`dt-prog ${cleared ? "ok" : ""}`}><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/* ── Danh sách giao dịch con ─────────────────────────────── */
function TxnList({ expense, receipt }: { expense: Txn[]; receipt: Txn[] }) {
  const all = [...receipt, ...expense].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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

/* ── Popup chi tiết Khoản vay ────────────────────────────── */
function LoanDetailSheet({ theme, id, reloadKey, isAdmin, canCreate, onClose, onChanged, onClosed, onTxn }: {
  theme: string; id: string; reloadKey: number; isAdmin: boolean; canCreate: boolean;
  onClose: () => void; onChanged: () => void; onClosed: () => void; onTxn: (t: TxnType, code: string) => void;
}) {
  const [d, setD] = useState<LoanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(false);
  const [lender, setLender] = useState("");
  const [rate, setRate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/loans/${id}`)
      .then((r) => r.json())
      .then((x) => {
        if (!alive) return;
        setD(x);
        setLender(x.lender ?? "");
        setRate(x.interestRate != null ? String(x.interestRate) : "");
        setDueDate(toDateInput(x.dueDate));
        setNote(x.note ?? "");
      })
      .catch(() => toast.error("Không tải được chi tiết"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id, reloadKey]);

  const saveInfo = async () => {
    setBusy(true);
    const res = await fetch(`/api/loans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lender, interestRate: rate === "" ? null : Number(rate), dueDate: dueDate || null, note: note || null }),
    });
    setBusy(false);
    if (res.ok) { toast.success("Đã lưu thông tin"); setEdit(false); onChanged(); }
    else toast.error((await res.json().catch(() => ({}))).message || "Lỗi");
  };
  const setStatus = async (status: "active" | "paid") => {
    const res = await fetch(`/api/loans/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (res.ok) { toast.success(status === "paid" ? "Đã đóng khoản vay" : "Đã mở lại"); onChanged(); }
    else toast.error((await res.json().catch(() => ({}))).message || "Lỗi");
  };
  const del = async () => {
    if (!(await confirmDialog({ title: "Xoá khoản vay?", message: `${d?.code} — ${d?.lender}` }))) return;
    const res = await fetch(`/api/loans/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Đã xoá"); onClosed(); onChanged(); }
    else toast.error((await res.json().catch(() => ({}))).message || "Không xoá được");
  };

  return (
    <Sheet theme={theme} title={loading || !d ? "Khoản vay" : d.lender} sub={d?.code} onClose={onClose}>
      {loading || !d ? (
        <div className="dt-empty" style={{ background: "none", border: "none" }}>Đang tải…</div>
      ) : (
        <>
          <div className="dt-sheet-stats">
            <div><div className="lb">Dư gốc còn lại</div><div className="vl big">{fmtN(d.outstanding)}</div></div>
            <div><div className="lb">Đã trả gốc</div><div className="vl out">{fmtN(d.principalPaid)}</div></div>
            <div><div className="lb">Đã trả lãi</div><div className="vl out">{fmtN(d.interestPaid)}</div></div>
          </div>

          {!edit ? (
            <div className="dt-info">
              <div className="dt-kvrow"><span className="lb">Tiền gốc</span><span className="vl">{fmtN(d.principal)}</span></div>
              <div className="dt-kvrow"><span className="lb">Đã nhận vay</span><span className="vl in">{fmtN(d.disbursed)}</span></div>
              <div className="dt-kvrow"><span className="lb">Lãi suất</span><span className="vl">{d.interestRate != null ? `${d.interestRate}%/năm` : "—"}</span></div>
              <div className="dt-kvrow"><span className="lb">Ngày vay</span><span className="vl">{fmtDate(d.disbursedAt)}</span></div>
              <div className="dt-kvrow"><span className="lb">Hạn trả</span><span className="vl">{fmtDate(d.dueDate)}</span></div>
              {d.note && <div className="dt-kv"><span className="lb">Ghi chú: </span>{d.note}</div>}
              {isAdmin && (
                <button className="dt-mini ok" style={{ marginTop: 4, alignSelf: "flex-start" }} onClick={() => setEdit(true)}>✎ Sửa thông tin</button>
              )}
            </div>
          ) : (
            <div className="dt-fgrid" style={{ marginTop: 12 }}>
              <div className="dt-fld full"><label className="dt-lbl">Bên cho vay</label><input className="dt-ctrl" value={lender} onChange={(e) => setLender(e.target.value)} /></div>
              <div className="dt-fld"><label className="dt-lbl">Lãi suất %/năm</label><input className="dt-ctrl" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="vd 12" /></div>
              <div className="dt-fld"><label className="dt-lbl">Hạn trả</label><input className="dt-ctrl" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
              <div className="dt-fld full"><label className="dt-lbl">Ghi chú</label><textarea className="dt-ctrl" value={note} onChange={(e) => setNote(e.target.value)} /></div>
              <div className="dt-fld full" style={{ flexDirection: "row", gap: 9 }}>
                <button className="dt-btn ghost block" onClick={() => setEdit(false)}>Huỷ</button>
                <button className="dt-btn primary block" disabled={busy} onClick={saveInfo}>{busy ? "Đang lưu…" : "Lưu thông tin"}</button>
              </div>
            </div>
          )}

          <TxnList expense={d.expenseTxns} receipt={d.receiptTxns} />

          {canCreate && d.status === "active" && (
            <div className="dt-txn-acts">
              <button className="dt-chip go" onClick={() => onTxn("loan-disburse", d.code)}>+ Nhận tiền vay</button>
              <button className="dt-chip" onClick={() => onTxn("loan-principal", d.code)}>+ Trả gốc</button>
              <button className="dt-chip" onClick={() => onTxn("loan-interest", d.code)}>+ Trả lãi</button>
            </div>
          )}
          {isAdmin && (
            <div className="dt-txn-acts">
              {d.status === "active"
                ? <button className="dt-chip ok" onClick={() => setStatus("paid")}>✓ Đánh dấu trả xong</button>
                : <button className="dt-chip" onClick={() => setStatus("active")}>↺ Mở lại</button>}
              <button className="dt-chip dn" onClick={del}>Xoá</button>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

/* ── Popup chi tiết Tạm ứng ──────────────────────────────── */
function AdvanceDetailSheet({ theme, id, reloadKey, isAdmin, canCreate, onClose, onChanged, onClosed, onTxn }: {
  theme: string; id: string; reloadKey: number; isAdmin: boolean; canCreate: boolean;
  onClose: () => void; onChanged: () => void; onClosed: () => void; onTxn: (t: TxnType, code: string) => void;
}) {
  const [d, setD] = useState<AdvanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/advances/${id}`)
      .then((r) => r.json())
      .then((x) => {
        if (!alive) return;
        setD(x);
        setRecipient(x.recipient ?? "");
        setPurpose(x.purpose ?? "");
        setNote(x.note ?? "");
      })
      .catch(() => toast.error("Không tải được chi tiết"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id, reloadKey]);

  const saveInfo = async () => {
    setBusy(true);
    const res = await fetch(`/api/advances/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient, purpose: purpose || null, note: note || null }),
    });
    setBusy(false);
    if (res.ok) { toast.success("Đã lưu thông tin"); setEdit(false); onChanged(); }
    else toast.error((await res.json().catch(() => ({}))).message || "Lỗi");
  };
  const setStatus = async (status: "open" | "settled") => {
    const res = await fetch(`/api/advances/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (res.ok) { toast.success(status === "settled" ? "Đã tất toán" : "Đã mở lại"); onChanged(); }
    else toast.error((await res.json().catch(() => ({}))).message || "Lỗi");
  };
  const del = async () => {
    if (!(await confirmDialog({ title: "Xoá phiếu tạm ứng?", message: `${d?.code} — ${d?.recipient}` }))) return;
    const res = await fetch(`/api/advances/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Đã xoá"); onClosed(); onChanged(); }
    else toast.error((await res.json().catch(() => ({}))).message || "Không xoá được");
  };

  return (
    <Sheet theme={theme} title={loading || !d ? "Tạm ứng" : d.recipient} sub={d?.code} onClose={onClose}>
      {loading || !d ? (
        <div className="dt-empty" style={{ background: "none", border: "none" }}>Đang tải…</div>
      ) : (
        <>
          <div className="dt-sheet-stats">
            <div><div className="lb">Dư ứng chưa hoàn</div><div className="vl big">{fmtN(d.outstanding)}</div></div>
            <div><div className="lb">Đã chi ứng</div><div className="vl out">{fmtN(d.paidOut)}</div></div>
            <div><div className="lb">Đã hoàn</div><div className="vl in">{fmtN(d.returned)}</div></div>
          </div>

          {!edit ? (
            <div className="dt-info">
              <div className="dt-kvrow"><span className="lb">Số tiền ứng</span><span className="vl">{fmtN(d.amount)}</span></div>
              <div className="dt-kvrow"><span className="lb">Ngày ứng</span><span className="vl">{fmtDate(d.advancedAt)}</span></div>
              {d.purpose && <div className="dt-kv"><span className="lb">Mục đích: </span>{d.purpose}</div>}
              {d.note && <div className="dt-kv"><span className="lb">Ghi chú: </span>{d.note}</div>}
              {isAdmin && (
                <button className="dt-mini ok" style={{ marginTop: 4, alignSelf: "flex-start" }} onClick={() => setEdit(true)}>✎ Sửa thông tin</button>
              )}
            </div>
          ) : (
            <div className="dt-fgrid" style={{ marginTop: 12 }}>
              <div className="dt-fld full"><label className="dt-lbl">Người nhận</label><input className="dt-ctrl" value={recipient} onChange={(e) => setRecipient(e.target.value)} /></div>
              <div className="dt-fld full"><label className="dt-lbl">Mục đích</label><input className="dt-ctrl" value={purpose} onChange={(e) => setPurpose(e.target.value)} /></div>
              <div className="dt-fld full"><label className="dt-lbl">Ghi chú</label><textarea className="dt-ctrl" value={note} onChange={(e) => setNote(e.target.value)} /></div>
              <div className="dt-fld full" style={{ flexDirection: "row", gap: 9 }}>
                <button className="dt-btn ghost block" onClick={() => setEdit(false)}>Huỷ</button>
                <button className="dt-btn primary block" disabled={busy} onClick={saveInfo}>{busy ? "Đang lưu…" : "Lưu thông tin"}</button>
              </div>
            </div>
          )}

          <TxnList expense={d.expenseTxns} receipt={d.receiptTxns} />

          {canCreate && d.status === "open" && (
            <div className="dt-txn-acts">
              <button className="dt-chip go" onClick={() => onTxn("advance-out", d.code)}>+ Chi tạm ứng</button>
              <button className="dt-chip" onClick={() => onTxn("advance-return", d.code)}>+ Hoàn ứng</button>
            </div>
          )}
          {isAdmin && (
            <div className="dt-txn-acts">
              {d.status === "open"
                ? <button className="dt-chip ok" onClick={() => setStatus("settled")}>✓ Tất toán</button>
                : <button className="dt-chip" onClick={() => setStatus("open")}>↺ Mở lại</button>}
              <button className="dt-chip dn" onClick={del}>Xoá</button>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

/* ── Form: Khoản vay mới ─────────────────────────────────── */
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
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lender, principal: Number(principal), interestRate: rate ? Number(rate) : null, disbursedAt: disbursedAt || null, dueDate: dueDate || null, note: note || null }),
    });
    setBusy(false);
    if (res.ok) { toast.success("Đã tạo khoản vay"); onSaved(); }
    else toast.error((await res.json().catch(() => ({}))).message || "Lỗi");
  };

  return (
    <Sheet theme={theme} title="Khoản vay mới" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="dt-fgrid">
          <div className="dt-fld full"><label className="dt-lbl">Bên cho vay <span className="req">*</span></label><input className="dt-ctrl" value={lender} onChange={(e) => setLender(e.target.value)} placeholder="Ngân hàng / cá nhân…" /></div>
          <div className="dt-fld"><label className="dt-lbl">Tiền gốc <span className="req">*</span></label><MoneyInput className="dt-ctrl" value={principal} onChange={setPrincipal} placeholder="0" /></div>
          <div className="dt-fld"><label className="dt-lbl">Lãi suất %/năm</label><input className="dt-ctrl" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="vd 12" /></div>
          <div className="dt-fld"><label className="dt-lbl">Ngày vay</label><input className="dt-ctrl" type="date" value={disbursedAt} onChange={(e) => setDisbursedAt(e.target.value)} /></div>
          <div className="dt-fld"><label className="dt-lbl">Hạn trả</label><input className="dt-ctrl" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          <div className="dt-fld full"><label className="dt-lbl">Ghi chú</label><textarea className="dt-ctrl" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <div className="dt-callout">Tạo khoản vay chỉ lập hồ sơ theo dõi. Ghi tiền vào/ra bằng nút <b>Nhận tiền vay / Trả gốc / Trả lãi</b> trong chi tiết — các lệnh này qua duyệt và ghi sổ quỹ.</div>
        <div className="dt-acts">
          <button type="button" className="dt-btn ghost block" onClick={onClose}>Huỷ</button>
          <button type="submit" className="dt-btn primary block" disabled={busy}>{busy ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </form>
    </Sheet>
  );
}

/* ── Form: Tạm ứng mới ───────────────────────────────────── */
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
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient, amount: Number(amount), advancedAt: advancedAt || null, purpose: purpose || null, note: note || null }),
    });
    setBusy(false);
    if (res.ok) { toast.success("Đã tạo phiếu tạm ứng"); onSaved(); }
    else toast.error((await res.json().catch(() => ({}))).message || "Lỗi");
  };

  return (
    <Sheet theme={theme} title="Tạm ứng mới" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="dt-fgrid">
          <div className="dt-fld full"><label className="dt-lbl">Người nhận tạm ứng <span className="req">*</span></label><input className="dt-ctrl" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Nhân viên / đơn vị…" /></div>
          <div className="dt-fld"><label className="dt-lbl">Số tiền <span className="req">*</span></label><MoneyInput className="dt-ctrl" value={amount} onChange={setAmount} placeholder="0" /></div>
          <div className="dt-fld"><label className="dt-lbl">Ngày ứng</label><input className="dt-ctrl" type="date" value={advancedAt} onChange={(e) => setAdvancedAt(e.target.value)} /></div>
          <div className="dt-fld full"><label className="dt-lbl">Mục đích</label><input className="dt-ctrl" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="vd ứng mua vật tư…" /></div>
          <div className="dt-fld full"><label className="dt-lbl">Ghi chú</label><textarea className="dt-ctrl" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <div className="dt-callout">Tạo phiếu ứng chỉ lập hồ sơ. Ghi tiền bằng nút <b>Chi tạm ứng / Hoàn ứng</b> trong chi tiết — qua duyệt và ghi sổ quỹ.</div>
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
  theme: string; ctx: { type: TxnType; refId: string; refCode: string }; categoryIds: CategoryIds; isKt: boolean;
  onClose: () => void; onSaved: () => void;
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
      url = "/api/receipts"; body = { source: "loan", amount: Number(amount), payer: who || null, note: note || null, loanId: ctx.refId };
    } else if (ctx.type === "advance-return") {
      url = "/api/receipts"; body = { source: "advance_return", amount: Number(amount), payer: who || null, note: note || null, advanceId: ctx.refId };
    } else if (ctx.type === "loan-principal") {
      url = "/api/expenses"; body = { categoryId: categoryIds.TRANOGOC, amount: Number(amount), payee: who || null, paymentMethod: method, note: note || null, loanId: ctx.refId };
    } else if (ctx.type === "loan-interest") {
      url = "/api/expenses"; body = { categoryId: categoryIds.LAIVAY, amount: Number(amount), payee: who || null, paymentMethod: method, note: note || null, loanId: ctx.refId };
    } else {
      url = "/api/expenses"; body = { categoryId: categoryIds.TAMUNG, amount: Number(amount), payee: who || null, paymentMethod: method, note: note || null, advanceId: ctx.refId };
    }
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) {
      toast.success(isKt ? "Đã tạo, chờ admin duyệt" : "Đã tạo lệnh — vào Lệnh chi/thu để chi/thu");
      onSaved();
    } else toast.error((await res.json().catch(() => ({}))).message || "Lỗi");
  };

  const isExpense = meta.dir === "out";
  return (
    <Sheet theme={theme} title={meta.title} sub={ctx.refCode} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="dt-fgrid">
          <div className="dt-fld"><label className="dt-lbl">Số tiền <span className="req">*</span></label><MoneyInput className="dt-ctrl" value={amount} onChange={setAmount} placeholder="0" /></div>
          <div className="dt-fld"><label className="dt-lbl">{meta.whoLabel}</label><input className="dt-ctrl" value={who} onChange={(e) => setWho(e.target.value)} /></div>
          {isExpense && (
            <div className="dt-fld full">
              <label className="dt-lbl">Hình thức</label>
              <div className="dt-seg">
                <button type="button" className={method === "transfer" ? "on" : ""} onClick={() => setMethod("transfer")}>Chuyển khoản</button>
                <button type="button" className={method === "cash" ? "on" : ""} onClick={() => setMethod("cash")}>Tiền mặt</button>
              </div>
            </div>
          )}
          <div className="dt-fld full"><label className="dt-lbl">Ghi chú</label><textarea className="dt-ctrl" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <div className="dt-callout">
          {isExpense ? "Tạo lệnh chi" : "Tạo lệnh thu"} gắn vào {ctx.refCode}.{" "}
          {isKt ? "KT tạo → admin duyệt → ghi sổ quỹ." : "Sau khi tạo, vào màn Lệnh chi/Lệnh thu để xác nhận chi/thu (ghi sổ quỹ)."}
        </div>
        <div className="dt-acts">
          <button type="button" className="dt-btn ghost block" onClick={onClose}>Huỷ</button>
          <button type="submit" className="dt-btn primary block" disabled={busy}>{busy ? "Đang lưu…" : "Tạo lệnh"}</button>
        </div>
      </form>
    </Sheet>
  );
}
