"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// Tab "Lệnh chi TP" trong màn Quản Lý NCC — SỔ LỆNH CHI THẦU PHỤ của dự án.
// Nguồn thật khớp sổ quỹ: lệnh chi gắn hợp đồng (source_type='sub_contract').
// Chỉ đọc — tạo lệnh chi ở màn chi tiết hợp đồng (nút "Chi").

type LogRow = {
  id: string;
  code: string;
  contractId: string | null;
  contractCode: string | null;
  contractTitle: string | null;
  subcontractorName: string;
  amount: number;
  status: string;
  date: string | null;
  note: string | null;
};

const fmt = (n: number) => Math.round(n || 0).toLocaleString("vi-VN");

function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function SubPaymentsLogTab({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [totals, setTotals] = useState({ paidTotal: 0, pendingTotal: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/sub-payments-log`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!alive) return;
      setLoading(false);
      if (!res.ok) {
        toast.error(json.message || "Không tải được sổ lệnh chi thầu phụ");
        return;
      }
      setRows((json.rows || []) as LogRow[]);
      setTotals(json.totals || { paidTotal: 0, pendingTotal: 0, count: 0 });
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.code, r.subcontractorName, r.contractCode, r.contractTitle, r.note]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  return (
    <>
      <div className="meta">
        <span>{loading ? "…" : `${totals.count} lệnh chi`}</span>
        <span className="d">·</span>
        <span>Khớp sổ quỹ</span>
      </div>

      <div className="sum">
        <div className="c">
          <div className="k">Đã chi</div>
          <div className="v o num">{loading ? "—" : fmt(totals.paidTotal)}</div>
          <div className="sp">đã trừ sổ quỹ</div>
        </div>
        <div className="c">
          <div className="k">Chờ chi</div>
          <div className="v t num">{loading ? "—" : fmt(totals.pendingTotal)}</div>
          <div className="sp">chưa duyệt/chi</div>
        </div>
        <div className="c">
          <div className="k">Tổng</div>
          <div className="v r num">{loading ? "—" : fmt(totals.paidTotal + totals.pendingTotal)}</div>
          <div className="sp">mọi lệnh</div>
        </div>
      </div>

      <div className="seclabel">Sổ lệnh chi thầu phụ</div>

      <div className="fld" style={{ marginTop: 4 }}>
        <input
          placeholder="Tìm mã lệnh, thầu phụ, mã HĐ…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="load">Đang tải lệnh chi…</div>
      ) : !filtered.length ? (
        <div className="empty">
          <div className="ic">🧾</div>
          {rows.length ? "Không có lệnh chi khớp tìm kiếm." : "Chưa có lệnh chi thầu phụ nào."}
        </div>
      ) : (
        <div className="nlist">
          {filtered.map((r) => {
            const isPaid = r.status === "paid";
            return (
              <div key={r.id} className="nccrow" style={{ cursor: "default" }}>
                <div className="nl">
                  <div className="nn">{r.subcontractorName}</div>
                  <div className="nsub">
                    <span>{r.code}</span>
                    <span>· {fmtDate(r.date)}</span>
                    {r.contractCode && <span>· {r.contractCode}</span>}
                  </div>
                </div>
                <div className="nr">
                  <div className="rv num" style={{ color: isPaid ? "var(--ok)" : "var(--red)" }}>{fmt(r.amount)}</div>
                  <div className="rk">
                    <span className={`chip ${isPaid ? "paidoff" : "await"}`}>{isPaid ? "Đã chi" : "Chờ chi"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
