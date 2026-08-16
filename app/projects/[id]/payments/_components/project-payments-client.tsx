"use client";

import { plexSans, plexMono } from "@/lib/fonts";
import Link from "next/link";
import { confirmDialog } from "@/components/confirm-dialog";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import "./thanh-toan.css";


type PaymentStatus = "not_collected" | "request_sent" | "collected" | "customer_late";

type ReceiptRefStatus = "pending" | "awaiting_approval" | "received" | "cancelled";

type PaymentRow = {
  id: string;
  phaseNumber: number;
  milestoneDescription: string;
  percent: number;
  amount: number;
  expectedDate: string | null;
  actualPaidDate: string | null;
  actualPaidAmount: number | null;
  status: PaymentStatus;
  notes: string | null;
  activeReceipt: { id: string; code: string; status: ReceiptRefStatus } | null;
};

type ProjectInfo = {
  id: string;
  code: string;
  name: string;
  customerName: string;
  contractValue: number;
};

const STATUS_LABEL: Record<PaymentStatus, string> = {
  not_collected: "Chưa thu",
  request_sent: "Đã gửi đề nghị",
  collected: "Đã thu",
  customer_late: "Khách chậm",
};

const STATUS_BADGE: Record<PaymentStatus, string> = {
  not_collected: "wait",
  request_sent: "req",
  collected: "ok",
  customer_late: "bad",
};

function fmtMoney(v: number | null) {
  if (v == null) return "-";
  return `${Math.round(v).toLocaleString("vi-VN")} đ`;
}

function fmtDate(dateIso: string | null) {
  if (!dateIso) return "-";
  const d = new Date(dateIso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function toInputDate(dateIso: string | null) {
  if (!dateIso) return "";
  return dateIso.slice(0, 10);
}

function daysDiffFromToday(dateIso: string | null) {
  if (!dateIso) return null;
  const t = new Date();
  const today = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  const d = new Date(dateIso);
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((target - today) / (24 * 60 * 60 * 1000));
}

export function ProjectPaymentsClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [status, setStatus] = useState<PaymentStatus>("not_collected");
  const [expectedDate, setExpectedDate] = useState("");
  const [actualPaidDate, setActualPaidDate] = useState("");
  const [actualPaidAmount, setActualPaidAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("hg-theme") : null;
    if (saved === "dark" || saved === "light") setTheme(saved);
  }, []);
  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try { window.localStorage.setItem("hg-theme", next); } catch { /* ignore */ }
      return next;
    });
  }

  async function loadData() {
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/payments`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(json.message || "Không tải được lịch thanh toán");
      return;
    }

    setProject(json.project);
    setRows(json.payments || []);
    setCanEdit(!!json.canEdit);
    setIsAdmin(!!json.isAdmin);
  }

  async function requestCollection(row: PaymentRow) {
    if (!await confirmDialog(`Gửi lệnh thu ${fmtMoney(row.amount)} — Đợt ${row.phaseNumber} cho kế toán?`)) return;
    setPendingId(row.id);
    const res = await fetch(`/api/projects/${projectId}/payments/${row.id}/request-collection`, {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    setPendingId(null);
    if (!res.ok) {
      toast.error(json.message || "Gửi lệnh thu thất bại");
      return;
    }
    toast.success(json.message || "Đã gửi cho KT");
    await loadData();
  }

  async function cancelCollection(row: PaymentRow) {
    if (!row.activeReceipt) return;
    if (!await confirmDialog(`Huỷ lệnh thu ${row.activeReceipt.code}?`)) return;
    setPendingId(row.id);
    const res = await fetch(`/api/projects/${projectId}/payments/${row.id}/request-collection`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => ({}));
    setPendingId(null);
    if (!res.ok) {
      toast.error(json.message || "Huỷ lệnh thu thất bại");
      return;
    }
    toast.success(json.message || "Đã huỷ lệnh thu");
    await loadData();
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const totals = useMemo(() => {
    const percent = rows.reduce((s, x) => s + Number(x.percent || 0), 0);
    const expected = rows.reduce((s, x) => s + Number(x.amount || 0), 0);
    const actual = rows.reduce((s, x) => s + Number(x.actualPaidAmount || 0), 0);
    const requested = rows.reduce((s, x) => s + (x.status === "request_sent" ? Number(x.amount || 0) : 0), 0);
    const collectedCount = rows.filter((x) => !!x.actualPaidDate).length;
    return { percent, expected, actual, requested, collectedCount };
  }, [rows]);

  const contractValue = project?.contractValue || totals.expected || 0;
  const paidPct = contractValue > 0 ? Math.min(100, Math.round((totals.actual / contractValue) * 100)) : 0;
  const reqPct = contractValue > 0 ? Math.min(100 - paidPct, Math.round((totals.requested / contractValue) * 100)) : 0;
  const remaining = Math.max(0, contractValue - totals.actual);

  function openEdit(row: PaymentRow) {
    setEditing(row);
    setStatus(row.status);
    setExpectedDate(toInputDate(row.expectedDate));
    setActualPaidDate(toInputDate(row.actualPaidDate));
    setActualPaidAmount(row.actualPaidAmount != null ? String(row.actualPaidAmount) : String(row.amount));
    setNotes(row.notes || "");
  }

  async function submitEdit() {
    if (!editing) return;

    if (status === "collected") {
      if (!actualPaidDate || !actualPaidAmount || Number(actualPaidAmount) <= 0) {
        toast.error("Khi đã thu tiền, ngày thu và số tiền thu là bắt buộc");
        return;
      }

      const delta = Math.abs(Number(actualPaidAmount) - Number(editing.amount));
      const threshold = Number(editing.amount) * 0.1;
      if (delta > threshold) {
        const ok = await confirmDialog("Số tiền thu chênh lệch lớn. Xác nhận?");
        if (!ok) return;
      }
    }

    setSaving(true);

    const payload = {
      status,
      expectedDate: expectedDate || null,
      actualPaidDate: status === "collected" ? actualPaidDate : null,
      actualPaidAmount: status === "collected" ? Number(actualPaidAmount) : null,
      notes: notes.trim() || null,
    };

    const res = await fetch(`/api/projects/${projectId}/payments/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      toast.error(json.message || "Cập nhật thất bại");
      return;
    }

    toast.success("Đã cập nhật thanh toán");
    setRows((prev) => prev.map((r) => (r.id === editing.id ? json.payment : r)));
    setEditing(null);
  }

  // Đợt "sắp đến hạn": chưa thu, có ngày dự kiến gần nhất từ hôm nay trở đi
  const upcomingId = useMemo(() => {
    const unpaid = rows
      .filter((r) => r.status !== "collected" && r.expectedDate)
      .sort((a, b) => new Date(a.expectedDate as string).getTime() - new Date(b.expectedDate as string).getTime());
    const future = unpaid.find((r) => {
      const d = daysDiffFromToday(r.expectedDate);
      return d !== null && d >= 0;
    });
    return (future || unpaid[unpaid.length - 1])?.id || null;
  }, [rows]);

  function paymentHint(row: PaymentRow) {
    const d = daysDiffFromToday(row.expectedDate);
    if (d == null) {
      if (row.status === "customer_late") return { className: "bad", text: "⚠️ Khách chậm thanh toán" };
      return null;
    }
    if (row.status === "not_collected" && d >= 0 && d <= 7) {
      return { className: "warn", text: `🔔 Đến hạn trong ${d} ngày` };
    }
    if (row.status === "customer_late" || (row.status === "not_collected" && d < 0)) {
      return { className: "bad", text: `⚠️ Quá hạn ${Math.abs(d)} ngày` };
    }
    return null;
  }

  const root = `ptdoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`;

  if (loading) {
    return (
      <div className={root} data-theme={theme}>
        <div className="wrap"><div className="load">Đang tải lịch thanh toán…</div></div>
      </div>
    );
  }

  return (
    <div className={root} data-theme={theme}>
      <div className="wrap">
        <div className="topbar">
          <div className="brand">
            <div className="mark">HG</div>
            <div><b>HUỲNH GIA</b><span>Xây dựng · Thi công</span></div>
          </div>
          <div className="tbtns">
            <button className="iconbtn" onClick={toggleTheme} type="button" aria-label="Đổi nền sáng/tối">
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <Link href={`/projects/${projectId}`} className="iconbtn" aria-label="Về dự án">←</Link>
          </div>
        </div>

        <div className="eyebrow">Thanh toán · Lịch thu hợp đồng</div>
        <h1>{project?.name || "Lịch thanh toán"}</h1>
        <div className="meta">
          {project?.code ? <><span className="num">{project.code}</span><span className="d">·</span></> : null}
          {project?.customerName ? <><span>{project.customerName}</span><span className="d">·</span></> : null}
          <span>Giá trị HĐ <span className="num">{fmtMoney(contractValue)}</span></span>
        </div>

        <div className="tot">
          <div className="tot-top">
            <div className="tot-n"><span className="num">{fmtMoney(totals.actual)}</span> <span className="tot-den">đã thu / {fmtMoney(contractValue)}</span></div>
            <div className="tot-pc">{paidPct}%<small>tiến độ thu</small></div>
          </div>
          <div className="bar">
            <i className="ok" style={{ width: `${paidPct}%` }} />
            <i className="req" style={{ width: `${reqPct}%` }} />
          </div>
          <div className="legend">
            <span><i className="dot ok" /> Đã thu {paidPct}%</span>
            {reqPct > 0 ? <span><i className="dot req" /> Đang thu {reqPct}%</span> : null}
            <span><i className="dot rest" /> Còn lại <span className="num">{fmtMoney(remaining)}</span></span>
          </div>
        </div>

        <div className="sect">Các đợt thanh toán ({rows.length})</div>

        {rows.length === 0 ? <div className="empty">Chưa có lịch thanh toán.</div> : null}

        {rows.map((row) => {
          const hint = paymentHint(row);
          const isPaid = row.status === "collected";
          const isNow = row.id === upcomingId && !isPaid;
          return (
            <div key={row.id} className={`pcard ${isNow ? "now" : ""} ${hint?.className === "bad" ? "bad" : ""}`}>
              <div className="ptop">
                <div className="pno">{row.phaseNumber}</div>
                <div className="pinfo">
                  <b>{row.milestoneDescription}</b>
                  <small><span className="num">{Math.round(row.percent)}%</span> HĐ · {isPaid ? "Đã thu" : "Dự kiến"} {fmtDate(isPaid ? row.actualPaidDate : row.expectedDate)}</small>
                </div>
                <div className="pamt">
                  <div className="n num">{fmtMoney(isPaid ? (row.actualPaidAmount ?? row.amount) : row.amount)}</div>
                  <span className={`badge ${STATUS_BADGE[row.status]}`}>{STATUS_LABEL[row.status]}</span>
                </div>
              </div>

              <div className="pmeta">
                <div className="f"><label>Số tiền dự kiến</label><div className="num">{fmtMoney(row.amount)}</div></div>
                <div className="f"><label>Ngày dự kiến</label><div>{fmtDate(row.expectedDate)}</div></div>
                {isPaid ? (
                  <>
                    <div className="f"><label>Đã thu</label><div className="paid num">{fmtMoney(row.actualPaidAmount ?? row.amount)}</div></div>
                    <div className="f"><label>Ngày thu</label><div className="paid">{fmtDate(row.actualPaidDate)}</div></div>
                  </>
                ) : null}
              </div>

              {row.notes ? <div className="pnote">Ghi chú: {row.notes}</div> : null}
              {row.activeReceipt ? (
                <div className="preceipt">{row.activeReceipt.status === "received" ? "Đã thu" : "Đang chờ KT thu"} — {row.activeReceipt.code}</div>
              ) : null}
              {hint ? <div className={`phint ${hint.className === "bad" ? "bad" : "warn"}`}>{hint.text}</div> : null}

              {canEdit ? (
                <div className="pacts">
                  {isAdmin && !row.activeReceipt && row.status !== "collected" ? (
                    <button className="btn primary" onClick={() => requestCollection(row)} disabled={pendingId === row.id}>
                      {pendingId === row.id ? "Đang gửi…" : "Yêu cầu KT thu"}
                    </button>
                  ) : null}
                  {isAdmin && row.activeReceipt && row.activeReceipt.status !== "received" ? (
                    <button className="btn danger" onClick={() => cancelCollection(row)} disabled={pendingId === row.id}>
                      Huỷ lệnh thu
                    </button>
                  ) : null}
                  <button className="btn" onClick={() => openEdit(row)}>Sửa</button>
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="totals">
          <div className="t"><label>Tổng % HĐ</label><div>{Math.round(totals.percent)}%</div></div>
          <div className="t"><label>Tổng dự kiến</label><div className="num">{fmtMoney(totals.expected)}</div></div>
          <div className="t"><label>Đã thu</label><div className="paid num">{fmtMoney(totals.actual)}</div></div>
          <div className="t"><label>Số đợt đã thu</label><div>{totals.collectedCount}/{rows.length}</div></div>
        </div>
      </div>

      {editing ? (
        <div className="modal-bg" onClick={() => !saving && setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Cập nhật thanh toán — Đợt {editing.phaseNumber}</h3>

            <div className="fld">
              <label>Trạng thái</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus)}>
                <option value="not_collected">Chưa thu</option>
                <option value="request_sent">Đã gửi đề nghị</option>
                <option value="collected">Đã thu</option>
                <option value="customer_late">Khách chậm</option>
              </select>
            </div>

            <div className="fld">
              <label>Ngày dự kiến</label>
              <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
              <div className="hintline">Để trống nếu chưa có ngày.</div>
            </div>

            <div className="fld2">
              <div className="fld">
                <label>Ngày thu thực tế</label>
                <input type="date" value={actualPaidDate} onChange={(e) => setActualPaidDate(e.target.value)} required={status === "collected"} />
              </div>
              <div className="fld">
                <label>Số tiền thu thực tế</label>
                <input type="number" min={0} value={actualPaidAmount} onChange={(e) => setActualPaidAmount(e.target.value)} required={status === "collected"} />
              </div>
            </div>

            <div className="fld">
              <label>Ghi chú</label>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tuỳ chọn — nhất là khi khách chậm hoặc thu thiếu" />
            </div>

            <div className="modal-acts">
              <button className="btn" onClick={() => setEditing(null)} disabled={saving}>Hủy</button>
              <button className="btn primary" onClick={submitEdit} disabled={saving}>{saving ? "Đang lưu…" : "Lưu"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
