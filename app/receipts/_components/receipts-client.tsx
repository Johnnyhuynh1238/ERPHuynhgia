"use client";

import { confirmDialog } from "@/components/confirm-dialog";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoneyInput } from "@/components/money-input";
import { toast } from "sonner";
import { useCashAccounts, formatCashAccountLabel } from "@/lib/use-cash-accounts";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./receipts.css";

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

type ProjectOption = { id: string; code: string; name: string };
type DesignContractOption = { id: string; customerName: string; notes: string | null };

type ReceiptSource = "customer" | "loan" | "advance_return" | "other";

type Receipt = {
  id: string;
  code: string;
  source: ReceiptSource;
  projectId: string | null;
  amount: number;
  payer: string | null;
  paymentMethod: string | null;
  note: string | null;
  attachmentUrl: string | null;
  status: "awaiting_approval" | "pending" | "received" | "cancelled";
  createdAt: string;
  receivedAt: string | null;
  receivedAmount: number | null;
  receivedNote: string | null;
  receivedReceiptUrl: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  project: ProjectOption | null;
  paymentSchedule: {
    id: string;
    phaseNumber: number;
    milestoneDescription: string;
    description: string | null;
  } | null;
  creator: { id: string; fullName: string };
  receiver: { id: string; fullName: string } | null;
};

const SOURCE_LABEL: Record<ReceiptSource, string> = {
  customer: "Khách hàng",
  loan: "Vay",
  advance_return: "Hoàn ứng",
  other: "Khác",
};

const SOURCE_META: Record<ReceiptSource, { dot: string; sub: string }> = {
  customer: { dot: "var(--ok)", sub: "Thu theo đợt HĐ" },
  loan: { dot: "var(--violet)", sub: "Vay vốn / mượn" },
  advance_return: { dot: "var(--sky)", sub: "Thu hồi tạm ứng" },
  other: { dot: "var(--mut)", sub: "Nguồn thu khác" },
};

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "pending", label: "Chờ thu" },
  { key: "awaiting_approval", label: "Chờ duyệt" },
  { key: "received", label: "Đã thu" },
  { key: "cancelled", label: "Đã huỷ" },
  { key: "", label: "Tất cả" },
];

function money(v: number | null | undefined) {
  return `${(v || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} đ`;
}
function fmtN(v: number | null | undefined) {
  return (v || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function statusLabel(s: Receipt["status"]) {
  if (s === "awaiting_approval") return "Chờ duyệt";
  if (s === "pending") return "Chờ thu";
  if (s === "received") return "Đã thu";
  return "Đã huỷ";
}
function methodLabel(m: string | null) {
  return m === "cash" ? "TM" : m === "transfer" ? "CK" : "—";
}

type CreateForm = {
  source: ReceiptSource;
  projectId: string;
  designContractId: string;
  amount: string;
  payer: string;
  paymentMethod: "cash" | "transfer";
  note: string;
  attachmentUrl: string;
};

const emptyCreate: CreateForm = {
  source: "customer",
  projectId: "",
  designContractId: "",
  amount: "",
  payer: "",
  paymentMethod: "transfer",
  note: "",
  attachmentUrl: "",
};

export function ReceiptsClient({
  role,
  projects,
  designContracts,
}: {
  role: string;
  projects: ProjectOption[];
  designContracts: DesignContractOption[];
}) {
  const isAdmin = role === "admin";
  const isKt = role === "accountant";
  const canCreate = role === "admin" || role === "accountant";
  const canMarkReceived = role === "admin" || role === "accountant";

  const [rows, setRows] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyCreate);
  const [creating, setCreating] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const [detailRow, setDetailRow] = useState<Receipt | null>(null);

  const [openReceive, setOpenReceive] = useState<Receipt | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [recvAmount, setRecvAmount] = useState("");
  const [recvDate, setRecvDate] = useState(new Date().toISOString().slice(0, 10));
  const [recvNote, setRecvNote] = useState("");
  const [recvReceiptUrl, setRecvReceiptUrl] = useState("");
  const [recvAccountId, setRecvAccountId] = useState("");
  const [uploadingRecvReceipt, setUploadingRecvReceipt] = useState(false);
  const { accounts: cashAccounts } = useCashAccounts();
  const recvReceiptInputRef = useRef<HTMLInputElement | null>(null);

  const [openCancel, setOpenCancel] = useState<Receipt | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Brand theme (Ngà sáng / Mahogany tối). Mặc định tối, nhớ localStorage.
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
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

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (sourceFilter) qs.set("source", sourceFilter);
    if (projectFilter) qs.set("projectId", projectFilter);
    if (search.trim()) qs.set("search", search.trim());
    const res = await fetch(`/api/receipts?${qs.toString()}`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      toast.error(j.message || "Không tải được danh sách lệnh thu");
      return;
    }
    setRows(j.rows || []);
  }, [status, sourceFilter, projectFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const totalAmount = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);
  const totalReceived = useMemo(() => rows.reduce((s, r) => s + (r.receivedAmount || 0), 0), [rows]);
  const pendingCount = useMemo(() => rows.filter((r) => r.status === "pending").length, [rows]);

  async function uploadFile(file: File, kind: "attachment" | "received", setter: (url: string) => void, setLoadingFn: (b: boolean) => void) {
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Chỉ hỗ trợ ảnh hoặc PDF");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("File quá lớn (tối đa 8MB)");
      return;
    }
    setLoadingFn(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch("/api/receipts/upload-receipt", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.message || "Upload thất bại");
        return;
      }
      setter(j.url);
      toast.success("Đã tải file");
    } finally {
      setLoadingFn(false);
    }
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Nhập số tiền > 0");
      return;
    }
    if (form.source === "customer" && !form.projectId && !form.designContractId) {
      toast.error("Thu từ khách phải chọn dự án hoặc HĐ thiết kế");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/receipts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: form.source,
        projectId: form.projectId || null,
        designContractId: form.designContractId || null,
        amount: amt,
        payer: form.payer.trim() || null,
        paymentMethod: form.paymentMethod,
        note: form.note.trim() || null,
        attachmentUrl: form.attachmentUrl.trim() || null,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      toast.error(j.message || "Không tạo được lệnh thu");
      return;
    }
    toast.success(j.message || "Đã tạo lệnh thu");
    setShowCreate(false);
    setForm(emptyCreate);
    load();
  }

  async function submitReceive(e: FormEvent) {
    e.preventDefault();
    if (!openReceive) return;
    const amt = Number(recvAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Nhập số tiền > 0");
      return;
    }
    if (!recvAccountId) {
      toast.error("Chọn tài khoản nhận");
      return;
    }
    setReceiving(true);
    const res = await fetch(`/api/receipts/${openReceive.id}/mark-received`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        receivedAt: recvDate,
        receivedAmount: amt,
        receivedNote: recvNote.trim() || null,
        receivedReceiptUrl: recvReceiptUrl.trim() || null,
        accountId: recvAccountId,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setReceiving(false);
    if (!res.ok) {
      toast.error(j.message || "Không xác nhận được");
      return;
    }
    toast.success(j.message || "Đã ghi sổ quỹ");
    setOpenReceive(null);
    setRecvAmount("");
    setRecvNote("");
    setRecvReceiptUrl("");
    setRecvAccountId("");
    setRecvDate(new Date().toISOString().slice(0, 10));
    load();
  }

  async function submitCancel() {
    if (!openCancel) return;
    if (!cancelReason.trim()) {
      toast.error("Nhập lý do huỷ");
      return;
    }
    if (!(await confirmDialog(`Huỷ lệnh thu ${openCancel.code}?`))) return;
    setCancelling(true);
    const res = await fetch(`/api/receipts/${openCancel.id}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: cancelReason.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    setCancelling(false);
    if (!res.ok) {
      toast.error(j.message || "Không huỷ được");
      return;
    }
    toast.success(j.message || "Đã huỷ");
    setOpenCancel(null);
    setCancelReason("");
    load();
  }

  function openReceiveDialog(r: Receipt) {
    setOpenReceive(r);
    setRecvAmount(String(r.amount));
    setRecvNote("");
    setRecvReceiptUrl("");
    setRecvDate(new Date().toISOString().slice(0, 10));
  }

  async function approveReceipt(r: Receipt) {
    if (!(await confirmDialog(`Duyệt lệnh thu ${r.code}?`))) return;
    const res = await fetch(`/api/receipts/${r.id}/approve`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.message || "Không duyệt được");
      return;
    }
    toast.success(j.message || "Đã duyệt");
    load();
  }

  async function rejectReceipt(r: Receipt) {
    const reason = window.prompt(`Lý do từ chối lệnh thu ${r.code}:`);
    if (!reason || reason.trim().length < 3) {
      if (reason !== null) toast.error("Lý do tối thiểu 3 ký tự");
      return;
    }
    const res = await fetch(`/api/receipts/${r.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.message || "Không từ chối được");
      return;
    }
    toast.success(j.message || "Đã từ chối");
    load();
  }

  const cardTitle = (r: Receipt) => {
    if (r.project) {
      return `${r.project.name}${r.paymentSchedule ? ` · Đợt ${r.paymentSchedule.phaseNumber}` : ""}`;
    }
    return r.note || r.payer || SOURCE_LABEL[r.source];
  };

  return (
    <div className={`rtdoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
      <div className="rtwrap">
        {/* header */}
        <div className="rt-head">
          <div>
            <div className="rt-eyebrow">Sổ quỹ công ty</div>
            <h1 className="rt-h1">Lệnh thu</h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="rt-iconbtn" onClick={toggleTheme} title="Đổi nền">◐</button>
            {canCreate && (
              <button type="button" className="rt-btn primary" onClick={() => setShowCreate(true)}>
                ＋ Lệnh thu mới
              </button>
            )}
          </div>
        </div>
        <div className="rt-meta">
          <span>Tổng <span className="num">{rows.length}</span> lệnh</span>
          {pendingCount > 0 && (
            <>
              <span className="d">·</span>
              <span>chờ thu <span className="num">{pendingCount}</span></span>
            </>
          )}
        </div>

        {/* stat tiles */}
        <div className="rt-stats">
          <div className="rt-tile"><div className="k">Tổng bộ lọc</div><div className="v num">{fmtN(totalAmount)}</div></div>
          <div className="rt-tile"><div className="k">Đã thu</div><div className="v ok num">{fmtN(totalReceived)}</div></div>
          <div className="rt-tile"><div className="k">Chờ thu</div><div className="v am num">{pendingCount}</div><div className="s">lệnh</div></div>
        </div>

        {/* tabs */}
        <div className="rt-bar">
          <div className="rt-tabs">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key || "all"}
                type="button"
                className={`rt-tab${status === t.key ? " on" : ""}`}
                onClick={() => setStatus(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* search + filter */}
        <div className="rt-bar" style={{ marginTop: -4 }}>
          <div className="rt-search">
            <span className="ic">⌕</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm mã / người nộp / ghi chú" />
          </div>
          <button type="button" className={`rt-filter${showFilters ? " on" : ""}`} onClick={() => setShowFilters((v) => !v)}>
            ⚑ Lọc
          </button>
        </div>

        {showFilters && (
          <div className="rt-subf">
            <select className="rt-ctrl" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="">Tất cả nguồn</option>
              {(Object.keys(SOURCE_LABEL) as ReceiptSource[]).map((s) => (
                <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
              ))}
            </select>
            <select className="rt-ctrl" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
              <option value="">Tất cả dự án</option>
              <option value="none">Không gắn dự án</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* list */}
        {loading ? (
          <div className="rt-empty">Đang tải…</div>
        ) : rows.length === 0 ? (
          <div className="rt-empty">Chưa có lệnh thu nào trong bộ lọc này.</div>
        ) : (
          <div className="rt-list">
            {rows.map((r) => {
              return (
                <div key={r.id} className="rt-rc" onClick={() => setDetailRow(r)}>
                  <div className="rt-r1">
                    <span className={`rt-badge src-${r.source}`}>{SOURCE_LABEL[r.source]}</span>
                    <span className="rt-ttl">{cardTitle(r)}</span>
                    <span className={`rt-amt num${r.status === "awaiting_approval" ? " mut" : ""}`}>
                      {fmtN(r.amount)}<span className="u">đ</span>
                    </span>
                  </div>
                  <div className="rt-r2">
                    <div className="rt-m">
                      <span className="code">{r.code}</span>
                      {r.payer && (<><span className="d">·</span>{r.payer}</>)}
                      <span className="d">·</span>{methodLabel(r.paymentMethod)}
                      <span className="d">·</span>{fmtDate(r.createdAt)}
                    </div>
                    <div className="rt-rt">
                      <span className={`rt-st stt-${r.status}`}>{statusLabel(r.status)}</span>
                      {r.status === "pending" && canMarkReceived && (
                        <button type="button" className="rt-chip ok" onClick={(e) => { e.stopPropagation(); openReceiveDialog(r); }}>✓ Đã thu</button>
                      )}
                      {r.status === "pending" && isAdmin && (
                        <button type="button" className="rt-chip dn" onClick={(e) => { e.stopPropagation(); setOpenCancel(r); setCancelReason(""); }}>Huỷ</button>
                      )}
                      {r.status === "awaiting_approval" && isAdmin && (
                        <>
                          <button type="button" className="rt-chip go" onClick={(e) => { e.stopPropagation(); approveReceipt(r); }}>Duyệt</button>
                          <button type="button" className="rt-chip dn" onClick={(e) => { e.stopPropagation(); rejectReceipt(r); }}>Từ chối</button>
                        </>
                      )}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DETAIL SHEET */}
      {mounted && detailRow &&
        createPortal(
          <div className={`rtportal ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
            {(() => {
              const r = detailRow;
              return (
                <ModalShell
                  title={`${SOURCE_LABEL[r.source]} · ${r.code}`}
                  subtitle={`${statusLabel(r.status)} · ${fmtN(r.amount)}đ`}
                  tone={r.status === "cancelled" ? "red" : "default"}
                  onClose={() => setDetailRow(null)}
                >
                  <div className="rt-exp" style={{ marginTop: 0, borderTop: "none", paddingTop: 0 }}>
                    <div className="col">
                      <div className="rt-kv"><span className="lb">Tạo bởi: </span>{r.creator.fullName} · {fmtDate(r.createdAt)}</div>
                      <div className="rt-kv"><span className="lb">Số tiền: </span>{money(r.amount)}</div>
                      <div className="rt-kv"><span className="lb">Phương thức: </span>{r.paymentMethod === "cash" ? "Tiền mặt" : r.paymentMethod === "transfer" ? "Chuyển khoản" : "—"}</div>
                      {r.paymentSchedule && (
                        <div className="rt-phase">Đợt {r.paymentSchedule.phaseNumber} — {r.paymentSchedule.milestoneDescription}</div>
                      )}
                      {r.payer && (
                        <button type="button" className="rt-copy" onClick={() => { navigator.clipboard?.writeText(r.payer!); toast.success("Đã copy tên người nộp"); }}>
                          <span className="lb">Người nộp: </span>{r.payer} <span className="cp">⧉</span>
                        </button>
                      )}
                      {r.note && (
                        <button type="button" className="rt-copy" onClick={() => { navigator.clipboard?.writeText(r.note!); toast.success("Đã copy ghi chú"); }}>
                          <span className="lb">Ghi chú: </span>{r.note} <span className="cp">⧉</span>
                        </button>
                      )}
                      {r.attachmentUrl && (
                        <a className="rt-link" href={`/api/receipts/${r.id}/file?type=attachment`} target="_blank" rel="noreferrer">📎 Xem chứng từ</a>
                      )}
                    </div>
                    <div className="col">
                      {r.project && (
                        <div className="rt-kv"><span className="lb">Dự án: </span>{r.project.code} — {r.project.name}</div>
                      )}
                      {r.status === "received" && (
                        <>
                          <div className="rt-kv"><span className="lb">Đã thu: </span>{money(r.receivedAmount)} · {fmtDate(r.receivedAt)}</div>
                          {r.receiver && (<div className="rt-kv"><span className="lb">Người xác nhận: </span>{r.receiver.fullName}</div>)}
                          {r.receivedNote && (<div className="rt-kv"><span className="lb">Ghi chú thu: </span>{r.receivedNote}</div>)}
                          {r.receivedReceiptUrl && (
                            <a className="rt-link" href={`/api/receipts/${r.id}/file?type=received`} target="_blank" rel="noreferrer">🧾 Xem phiếu thu</a>
                          )}
                        </>
                      )}
                      {r.status === "cancelled" && r.cancelledReason && (
                        <div className="rt-kv"><span className="lb">Lý do huỷ: </span>{r.cancelledReason}</div>
                      )}
                    </div>

                    {r.status === "awaiting_approval" && (
                      <div className="rt-exp-acts">
                        <span className="rt-exp-hint">KT {r.creator?.fullName ?? ""} tạo · chờ admin duyệt</span>
                        {isAdmin && (
                          <>
                            <button type="button" className="rt-chip go" onClick={() => { setDetailRow(null); approveReceipt(r); }}>✓ Duyệt</button>
                            <button type="button" className="rt-chip dn" onClick={() => { setDetailRow(null); rejectReceipt(r); }}>✕ Từ chối</button>
                          </>
                        )}
                      </div>
                    )}
                    {r.status === "pending" && (
                      <div className="rt-exp-acts">
                        {canMarkReceived && (
                          <button type="button" className="rt-chip ok" onClick={() => { setDetailRow(null); openReceiveDialog(r); }}>✓ Xác nhận đã thu</button>
                        )}
                        {isAdmin && (
                          <button type="button" className="rt-chip dn" onClick={() => { setDetailRow(null); setOpenCancel(r); setCancelReason(""); }}>Huỷ</button>
                        )}
                      </div>
                    )}
                  </div>
                </ModalShell>
              );
            })()}
          </div>,
          document.body,
        )}

      {/* CREATE MODAL */}
      {mounted && showCreate && canCreate &&
        createPortal(
          <div className={`rtportal ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
            <ModalShell title="Tạo lệnh thu mới" onClose={() => { setShowCreate(false); setForm(emptyCreate); }}>
              <form onSubmit={submitCreate}>
                <div className="rt-fld full" style={{ marginBottom: 12 }}>
                  <span className="rt-lbl">Nguồn thu <span className="req">*</span></span>
                  <div className="rt-srcpick">
                    {(Object.keys(SOURCE_LABEL) as ReceiptSource[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={form.source === s ? "on" : ""}
                        onClick={() => setForm({ ...form, source: s })}
                      >
                        <span className="dot" style={{ background: SOURCE_META[s].dot }} />
                        <span><span className="nm">{SOURCE_LABEL[s]}</span><br /><span className="sub">{SOURCE_META[s].sub}</span></span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rt-fgrid">
                  <div className="rt-fld full">
                    <span className="rt-lbl">Số tiền <span className="req">*</span></span>
                    <MoneyInput value={form.amount} onChange={(raw) => setForm({ ...form, amount: raw })} required className="rt-ctrl num" />
                  </div>
                  <div className="rt-fld full">
                    <span className="rt-lbl">{form.source === "customer" && !form.designContractId ? "Dự án *" : "Dự án (tuỳ chọn)"}</span>
                    <select className="rt-ctrl" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value, designContractId: e.target.value ? "" : form.designContractId })}>
                      <option value="">— Không gắn dự án —</option>
                      {projects.map((p) => (<option key={p.id} value={p.id}>{p.code} — {p.name}</option>))}
                    </select>
                  </div>
                  <div className="rt-fld full">
                    <span className="rt-lbl">{form.source === "customer" && !form.projectId ? "HĐ thiết kế *" : "HĐ thiết kế (tuỳ chọn)"}</span>
                    <select className="rt-ctrl" value={form.designContractId} onChange={(e) => setForm({ ...form, designContractId: e.target.value, projectId: e.target.value ? "" : form.projectId })}>
                      <option value="">— Không gắn HĐTK —</option>
                      {designContracts.map((d) => (<option key={d.id} value={d.id}>{d.notes ? `${d.customerName} — ${d.notes}` : d.customerName}</option>))}
                    </select>
                  </div>
                  <div className="rt-fld">
                    <span className="rt-lbl">Người / đơn vị nộp</span>
                    <input
                      className="rt-ctrl"
                      value={form.payer}
                      onChange={(e) => setForm({ ...form, payer: e.target.value })}
                      placeholder={form.source === "customer" ? "Tên chủ nhà" : form.source === "loan" ? "Bên cho vay" : form.source === "advance_return" ? "TPTC / KS hoàn ứng" : "Người nộp"}
                    />
                  </div>
                  <div className="rt-fld">
                    <span className="rt-lbl">Phương thức</span>
                    <div className="rt-seg">
                      <button type="button" className={form.paymentMethod === "cash" ? "on" : ""} onClick={() => setForm({ ...form, paymentMethod: "cash" })}>Tiền mặt</button>
                      <button type="button" className={form.paymentMethod === "transfer" ? "on" : ""} onClick={() => setForm({ ...form, paymentMethod: "transfer" })}>Chuyển khoản</button>
                    </div>
                  </div>
                  <div className="rt-fld full">
                    <span className="rt-lbl">Ghi chú</span>
                    <textarea className="rt-ctrl" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="VD: Thu đợt 2 hoàn thiện thô / Tạm vay anh A / TPTC trả ứng dư" />
                  </div>
                  <div className="rt-fld full">
                    <span className="rt-lbl">Ảnh chứng từ (tuỳ chọn)</span>
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadFile(f, "attachment", (url) => setForm((p) => ({ ...p, attachmentUrl: url })), setUploadingAttachment).finally(() => { if (attachmentInputRef.current) attachmentInputRef.current.value = ""; });
                      }}
                    />
                    <div className="rt-file">
                      <button type="button" className="rt-btn ghost" onClick={() => attachmentInputRef.current?.click()} disabled={uploadingAttachment}>
                        {uploadingAttachment ? "Đang tải…" : form.attachmentUrl ? "📎 Đổi" : "📷 Chọn"}
                      </button>
                      {form.attachmentUrl && (
                        <>
                          <button type="button" className="rt-mini red" onClick={() => setForm({ ...form, attachmentUrl: "" })}>Xoá</button>
                          <span className="rt-mini ok">✓ đã đính kèm</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {isKt && (<div className="rt-callout">Lệnh do <b>kế toán</b> tạo sẽ ở trạng thái <b>Chờ duyệt</b>; admin duyệt xong mới xác nhận thu.</div>)}

                <div className="rt-acts">
                  <button type="button" className="rt-btn ghost" onClick={() => { setShowCreate(false); setForm(emptyCreate); }}>Huỷ</button>
                  <button type="submit" className="rt-btn primary block" disabled={creating}>{creating ? "Đang lưu…" : isKt ? "Gửi admin duyệt →" : "Tạo lệnh thu →"}</button>
                </div>
              </form>
            </ModalShell>
          </div>,
          document.body,
        )}

      {/* MARK RECEIVED MODAL */}
      {mounted && openReceive &&
        createPortal(
          <div className={`rtportal ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
            <ModalShell title="Xác nhận đã thu" subtitle={`${openReceive.code} · ${SOURCE_LABEL[openReceive.source]}${openReceive.payer ? ` · ${openReceive.payer}` : ""}`} onClose={() => setOpenReceive(null)}>
              <form onSubmit={submitReceive}>
                <div className="rt-fgrid">
                  <div className="rt-fld full">
                    <span className="rt-lbl">Ngày thu <span className="req">*</span></span>
                    <input className="rt-ctrl" type="date" value={recvDate} onChange={(e) => setRecvDate(e.target.value)} required />
                  </div>
                  <div className="rt-fld full">
                    <span className="rt-lbl">Số tiền đã thu <span className="req">*</span></span>
                    <MoneyInput value={recvAmount} onChange={setRecvAmount} required className="rt-ctrl num" />
                  </div>
                  <div className="rt-fld full">
                    <span className="rt-lbl">Tài khoản nhận <span className="req">*</span></span>
                    <select className="rt-ctrl" value={recvAccountId} onChange={(e) => setRecvAccountId(e.target.value)} required>
                      <option value="">— Chọn tài khoản —</option>
                      {cashAccounts.map((a) => (<option key={a.id} value={a.id}>{formatCashAccountLabel(a)}</option>))}
                    </select>
                  </div>
                  <div className="rt-fld full">
                    <span className="rt-lbl">Ghi chú (tuỳ chọn)</span>
                    <textarea className="rt-ctrl" rows={2} value={recvNote} onChange={(e) => setRecvNote(e.target.value)} />
                  </div>
                  <div className="rt-fld full">
                    <span className="rt-lbl">Phiếu thu / ảnh sao kê (tuỳ chọn)</span>
                    <input
                      ref={recvReceiptInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadFile(f, "received", setRecvReceiptUrl, setUploadingRecvReceipt).finally(() => { if (recvReceiptInputRef.current) recvReceiptInputRef.current.value = ""; });
                      }}
                    />
                    <div className="rt-file">
                      <button type="button" className="rt-btn ghost" onClick={() => recvReceiptInputRef.current?.click()} disabled={uploadingRecvReceipt}>
                        {uploadingRecvReceipt ? "Đang tải…" : recvReceiptUrl ? "📎 Đổi" : "📷 Chọn"}
                      </button>
                      {recvReceiptUrl && (
                        <>
                          <button type="button" className="rt-mini red" onClick={() => setRecvReceiptUrl("")}>Xoá</button>
                          <span className="rt-mini ok">✓ đã đính kèm</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="rt-acts">
                  <button type="button" className="rt-btn ghost" onClick={() => setOpenReceive(null)}>Huỷ</button>
                  <button type="submit" className="rt-btn primary block" disabled={receiving}>{receiving ? "Đang ghi…" : "Xác nhận + ghi sổ quỹ"}</button>
                </div>
              </form>
            </ModalShell>
          </div>,
          document.body,
        )}

      {/* CANCEL MODAL */}
      {mounted && openCancel &&
        createPortal(
          <div className={`rtportal ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
            <ModalShell title="Huỷ lệnh thu" subtitle={openCancel.code} tone="red" onClose={() => setOpenCancel(null)}>
              <div className="rt-fld full">
                <span className="rt-lbl">Lý do huỷ <span className="req">*</span></span>
                <textarea className="rt-ctrl" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              </div>
              <div className="rt-acts">
                <button type="button" className="rt-btn ghost" onClick={() => setOpenCancel(null)}>Đóng</button>
                <button type="button" className="rt-btn danger block" onClick={submitCancel} disabled={cancelling}>{cancelling ? "Đang huỷ…" : "Xác nhận huỷ"}</button>
              </div>
            </ModalShell>
          </div>,
          document.body,
        )}
    </div>
  );
}

function ModalShell({
  title,
  subtitle,
  tone = "default",
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  tone?: "default" | "red";
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rt-scrim" onClick={onClose}>
      <div className="rt-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rt-sheet-hd">
          <div>
            <h3 className={tone === "red" ? "red" : ""}>{title}</h3>
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>
          <button type="button" className="rt-iconbtn" onClick={onClose} title="Đóng">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
