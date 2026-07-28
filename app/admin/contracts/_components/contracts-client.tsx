"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./contracts.css";

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

type ContractItem = {
  id: string;
  type: "design" | "construction";
  typeLabel: string;
  title: string;
  subtitle: string;
  customerName: string;
  phone: string | null;
  code: string | null;
  value: number | null;
  thu: number;
  chi: number;
  net: number;
  status: string;
  signedAt: string | null;
  projectId: string | null;
  needsInfo: boolean;
  needsInfoReasons: string[];
  preConstruction: boolean;
};
type Summary = { count: number; thu: number; chi: number; needsInfo: number; preConstruction: number };
type CashLine = { id: string; occurredAt: string; direction: "in" | "out"; amount: number; note: string | null };

type Filter = "all" | "pre" | "needs" | "design" | "construction";

const STATUS_LABEL: Record<string, string> = {
  active: "Đang làm",
  done: "Xong",
  cancelled: "Huỷ",
  planning: "Chuẩn bị",
  in_progress: "Đang thi công",
  completed: "Hoàn thành",
  paused: "Tạm dừng",
};

function fmt(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("vi-VN");
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function ContractsClient({ role }: { role: string }) {
  const isAdmin = role === "admin";
  const [items, setItems] = useState<ContractItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useState<ContractItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2400);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/contracts", { cache: "no-store" });
      const j = await r.json();
      setItems(j.items ?? []);
      setSummary(j.summary ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    switch (filter) {
      case "pre":
        return items.filter((i) => i.preConstruction);
      case "needs":
        return items.filter((i) => i.needsInfo);
      case "design":
        return items.filter((i) => i.type === "design");
      case "construction":
        return items.filter((i) => i.type === "construction");
      default:
        return items;
    }
  }, [items, filter]);

  const filters: Array<{ key: Filter; label: string }> = [
    { key: "all", label: `Tất cả (${items.length})` },
    { key: "pre", label: `Chưa thi công (${summary?.preConstruction ?? 0})` },
    { key: "needs", label: `Cần bổ sung (${summary?.needsInfo ?? 0})` },
    { key: "design", label: "HĐ thiết kế" },
    { key: "construction", label: "HĐ thi công" },
  ];

  return (
    <div className={`cxdoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
      <div className="cxwrap">
        <div className="cx-head">
          <div>
            <div className="cx-eyebrow">Quản lý</div>
            <h1 className="cx-h1">Hợp đồng</h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="cx-iconbtn" onClick={toggleTheme} title="Đổi nền">◐</button>
            {isAdmin && (
              <button type="button" className="cx-btn primary" onClick={() => setCreating(true)}>＋ Tạo HĐ thiết kế</button>
            )}
          </div>
        </div>

        {summary && (
          <div className="cx-stats">
            <div className="cx-tile"><div className="k">Số HĐ</div><div className="v num">{summary.count}</div></div>
            <div className="cx-tile"><div className="k">Tổng đã thu</div><div className="v ok num">{fmt(summary.thu)}</div></div>
            {isAdmin && (
              <div className="cx-tile"><div className="k">Tổng đã chi</div><div className="v chi num">{fmt(summary.chi)}</div></div>
            )}
            <div className="cx-tile"><div className="k">Cần bổ sung</div><div className={`v num ${summary.needsInfo ? "dg" : ""}`}>{summary.needsInfo}</div></div>
          </div>
        )}

        <div className="cx-filters">
          {filters.map((f) => (
            <button key={f.key} type="button" className={`cx-pill${filter === f.key ? " on" : ""}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="cx-empty">Đang tải…</div>
        ) : shown.length === 0 ? (
          <div className="cx-empty">Không có hợp đồng.</div>
        ) : (
          <div className="cx-list">
            {shown.map((it) => (
              <div key={`${it.type}_${it.id}`} className="cx-rc" onClick={() => setSel(it)}>
                <div className="cx-r1">
                  <span className={`cx-badge ${it.type === "design" ? "b-design" : "b-const"}`}>{it.typeLabel}</span>
                  <span className="cx-ttl">
                    {it.title}
                    {it.subtitle && <span className="cx-sub"> · {it.subtitle}</span>}
                  </span>
                  <span className="cx-val num">{fmt(it.value)}<span className="u">đ</span></span>
                </div>
                <div className="cx-r2">
                  <div className="cx-fin">
                    <span><span className="lb">Đã thu </span><span className="thu num">{fmt(it.thu)}</span></span>
                    {isAdmin && <span><span className="lb">Đã chi </span><span className="chi num">{fmt(it.chi)}</span></span>}
                    {isAdmin && <span><span className="lb">Ròng </span><span className={`net num ${it.net >= 0 ? "pos" : "neg"}`}>{fmt(it.net)}</span></span>}
                  </div>
                  <span className="cx-st">{STATUS_LABEL[it.status] ?? it.status}</span>
                </div>
                {it.needsInfo && <div className="cx-needs">⚠ Cần bổ sung: {it.needsInfoReasons.join(", ")}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {mounted && sel &&
        createPortal(
          <div className={`cxportal ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
            <ContractDrawer
              item={sel}
              isAdmin={isAdmin}
              onClose={() => setSel(null)}
              onSaved={() => { setSel(null); load(); }}
              flash={flash}
            />
          </div>,
          document.body,
        )}
      {mounted && creating && isAdmin &&
        createPortal(
          <div className={`cxportal ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
            <CreateModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); flash("Đã tạo HĐ thiết kế"); }} />
          </div>,
          document.body,
        )}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 70 }} className={`${plexSans.variable}`}>
          <div style={{ background: "var(--text,#2e140a)", color: "var(--bg,#f5efe1)", padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "var(--font-plex-sans)" }}>{toast}</div>
        </div>
      )}
    </div>
  );
}

function ContractDrawer({
  item,
  isAdmin,
  onClose,
  onSaved,
  flash,
}: {
  item: ContractItem;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
  flash: (m: string) => void;
}) {
  const isDesign = item.type === "design";
  const [name, setName] = useState(item.customerName);
  const [phone, setPhone] = useState(item.phone ?? "");
  const [value, setValue] = useState(item.value != null ? String(item.value) : "");
  const [signedAt, setSignedAt] = useState(item.signedAt ? item.signedAt.slice(0, 10) : "");
  const [notes, setNotes] = useState(item.subtitle === "HĐ thiết kế" ? "" : item.subtitle);
  const [saving, setSaving] = useState(false);

  const [attached, setAttached] = useState<CashLine[]>([]);
  const [candidates, setCandidates] = useState<CashLine[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const loadCash = useCallback(
    async (query = "") => {
      const r = await fetch(`/api/admin/contracts/${item.id}/cash?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const j = await r.json();
      setAttached(j.attached ?? []);
      setCandidates(j.candidates ?? []);
    },
    [item.id],
  );

  useEffect(() => {
    if (isDesign) loadCash("");
  }, [isDesign, loadCash]);

  const saveDesign = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/contracts/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name.trim() || undefined,
          customerPhone: phone.trim() ? phone.trim() : null,
          totalValue: value.trim() ? Number(value.replace(/[^\d]/g, "")) : null,
          signedAt: signedAt || undefined,
          notes: notes.trim() ? notes.trim() : null,
        }),
      });
      if (!r.ok) {
        flash("Lưu lỗi");
        return;
      }
      flash("Đã lưu");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const attachPicked = async () => {
    if (picked.size === 0) return;
    await fetch(`/api/admin/contracts/${item.id}/cash`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attach: Array.from(picked) }),
    });
    setPicked(new Set());
    setShowPicker(false);
    await loadCash("");
    flash("Đã gắn khoản vào HĐ");
  };

  const detach = async (id: string) => {
    await fetch(`/api/admin/contracts/${item.id}/cash`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detach: [id] }),
    });
    await loadCash("");
  };

  const thu = attached.filter((a) => a.direction === "in").reduce((s, a) => s + a.amount, 0);
  const chi = attached.filter((a) => a.direction === "out").reduce((s, a) => s + a.amount, 0);

  return (
    <div className="cx-scrim" onClick={onClose}>
      <div className="cx-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="cx-sheet-hd">
          <div>
            <h3>{item.title}</h3>
            <div className="sub">{item.typeLabel}{item.code ? ` · ${item.code}` : ""}</div>
          </div>
          <button type="button" className="cx-iconbtn" onClick={onClose} title="Đóng">✕</button>
        </div>

        {item.needsInfo && <div className="cx-warn">⚠ Cần bổ sung: {item.needsInfoReasons.join(", ")}</div>}

        {isDesign && isAdmin ? (
          <>
            <div className="cx-fld"><span className="cx-lbl">Tên khách</span><input className="cx-ctrl" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="cx-fld"><span className="cx-lbl">SĐT</span><input className="cx-ctrl" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Chưa có" /></div>
            <div className="cx-fld"><span className="cx-lbl">Giá trị HĐ (đ)</span><input className="cx-ctrl num" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Chưa có" /></div>
            <div className="cx-fld"><span className="cx-lbl">Ngày ký</span><input type="date" className="cx-ctrl" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} /></div>
            <div className="cx-fld"><span className="cx-lbl">Ghi chú</span><input className="cx-ctrl" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="VD: Phước Thái" /></div>
            <button type="button" className="cx-btn primary block" onClick={saveDesign} disabled={saving}>{saving ? "Đang lưu…" : "Lưu thông tin"}</button>
          </>
        ) : (
          <div style={{ fontSize: 13 }}>
            <div className="cx-fld" style={{ gap: 3 }}><span className="cx-lbl">Khách</span><div>{item.customerName}</div></div>
            {item.phone && <div className="cx-fld" style={{ gap: 3 }}><span className="cx-lbl">SĐT</span><div>{item.phone}</div></div>}
            {item.value != null && <div className="cx-fld" style={{ gap: 3 }}><span className="cx-lbl">Giá trị HĐ</span><div className="num">{fmt(item.value)} đ</div></div>}
            {!isDesign && (
              <Link href={`/projects/${item.id}/finance`} className="cx-link">Xem tài chính dự án →</Link>
            )}
          </div>
        )}

        {/* Thu / chi */}
        <div className="cx-sech">
          <span>Thu{isAdmin ? " / chi" : ""} từ sổ quỹ</span>
          {isDesign && isAdmin && (
            <button type="button" className="cx-chip" onClick={() => { setShowPicker((s) => !s); if (!showPicker) loadCash(""); }}>
              {showPicker ? "Đóng" : "＋ Gắn khoản"}
            </button>
          )}
        </div>

        {isDesign ? (
          <>
            <div className="cx-finrow">
              <span className="thu">Thu: {fmt(thu)}</span>
              {isAdmin && <span className="chi">Chi: {fmt(chi)}</span>}
              {isAdmin && <span className={thu - chi >= 0 ? "net" : "net"} style={{ color: thu - chi >= 0 ? "var(--ok)" : "var(--red)" }}>Ròng: {fmt(thu - chi)}</span>}
            </div>
            <div className="cx-cash">
              {attached.length === 0 && <div style={{ fontSize: 12, color: "var(--mut2)" }}>Chưa gắn khoản nào.</div>}
              {attached.filter((a) => isAdmin || a.direction === "in").map((a) => (
                <div key={a.id} className="cx-cline">
                  <span className={`dir ${a.direction === "in" ? "in" : "out"}`}>{a.direction === "in" ? "Thu" : "Chi"}</span>
                  <span className="num">{fmt(a.amount)}</span>
                  <span className="nt">{a.note}</span>
                  <span className="dt">{fmtDate(a.occurredAt)}</span>
                  {isAdmin && <button type="button" className="rm" onClick={() => detach(a.id)}>gỡ</button>}
                </div>
              ))}
            </div>

            {isAdmin && showPicker && (
              <div style={{ marginTop: 12 }}>
                <input className="cx-ctrl" style={{ marginBottom: 8 }} placeholder="Tìm theo nội dung… (VD: A Tâm)" value={q} onChange={(e) => { setQ(e.target.value); loadCash(e.target.value); }} />
                <div className="cx-cash" style={{ maxHeight: 260, overflowY: "auto" }}>
                  {candidates.length === 0 && <div style={{ fontSize: 12, color: "var(--mut2)" }}>Không có khoản trôi nổi phù hợp.</div>}
                  {candidates.map((c) => {
                    const on = picked.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`cx-cline pick${on ? " on" : ""}`}
                        onClick={() => setPicked((prev) => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                      >
                        <span>{on ? "☑" : "☐"}</span>
                        <span className={`dir ${c.direction === "in" ? "in" : "out"}`}>{c.direction === "in" ? "Thu" : "Chi"}</span>
                        <span className="num">{fmt(c.amount)}</span>
                        <span className="nt">{c.note}</span>
                        <span className="dt">{fmtDate(c.occurredAt)}</span>
                      </button>
                    );
                  })}
                </div>
                <button type="button" className="cx-btn primary block" style={{ marginTop: 10 }} onClick={attachPicked} disabled={picked.size === 0}>
                  Gắn {picked.size > 0 ? `${picked.size} khoản` : ""}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="cx-finrow">
            <span className="thu">Thu: {fmt(item.thu)}</span>
            {isAdmin && <span className="chi">Chi: {fmt(item.chi)}</span>}
            {isAdmin && <span className="net" style={{ color: item.net >= 0 ? "var(--ok)" : "var(--red)" }}>Ròng: {fmt(item.net)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [value, setValue] = useState("");
  const [signedAt, setSignedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setErr("Nhập tên khách");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name.trim(),
          customerPhone: phone.trim() ? phone.trim() : null,
          totalValue: value.trim() ? Number(value.replace(/[^\d]/g, "")) : null,
          signedAt,
          notes: notes.trim() ? notes.trim() : null,
        }),
      });
      if (!r.ok) {
        setErr("Tạo lỗi");
        return;
      }
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cx-scrim" onClick={onClose}>
      <div className="cx-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="cx-sheet-hd">
          <div>
            <h3>Tạo HĐ thiết kế</h3>
            <div className="sub">Thiếu SĐT / giá trị cứ để trống — màn đánh dấu cần bổ sung.</div>
          </div>
          <button type="button" className="cx-iconbtn" onClick={onClose} title="Đóng">✕</button>
        </div>
        <div className="cx-fld"><span className="cx-lbl">Tên khách <span className="req">*</span></span><input className="cx-ctrl" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="cx-fld"><span className="cx-lbl">SĐT</span><input className="cx-ctrl" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="cx-fld"><span className="cx-lbl">Giá trị HĐ (đ)</span><input className="cx-ctrl num" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} /></div>
        <div className="cx-fld"><span className="cx-lbl">Ngày ký</span><input type="date" className="cx-ctrl" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} /></div>
        <div className="cx-fld"><span className="cx-lbl">Ghi chú</span><input className="cx-ctrl" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        {err && <div className="cx-warn">{err}</div>}
        <div className="cx-acts">
          <button type="button" className="cx-btn ghost" onClick={onClose}>Huỷ</button>
          <button type="button" className="cx-btn primary block" onClick={submit} disabled={saving}>{saving ? "Đang tạo…" : "Tạo"}</button>
        </div>
      </div>
    </div>
  );
}
