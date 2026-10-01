"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { plexMono, plexSans } from "@/lib/fonts";
import { PIPELINE_STAGES, PUBLIC_SITE_URL, slugify, validateSlug } from "@/lib/pipeline";
import "./pipeline.css";

type Row = {
  kind: "pipeline" | "project";
  id: string;
  code: string | null;
  name: string;
  customerName: string;
  address: string;
  slug: string | null;
  stage: number;
  status: string; // active | paused | done
  lateDays: number;
  stageDates: Record<string, string>;
  hasDescription: boolean;
  contractValue: number | null;
  engineer: string | null;
  manager: string | null;
  startDate: string;
  endDate: string | null;
  progressPercent: number;
  taskCount: number;
  planning: boolean;
};

type Cell = { cls: "done" | "doing" | "todo"; label: string; detail: string; pct: number | null };

const STAGE_NUMS = [1, 2, 3, 4, 5, 6];

function fmtDay(iso: string | null | undefined, withYear = false) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return withYear ? `${dd}/${mm}/${d.getFullYear()}` : `${dd}/${mm}`;
}

function fmtMoney(v: number | null) {
  return v === null ? "" : Math.round(v).toLocaleString("vi-VN");
}

function rowHref(r: Row, stage?: number) {
  if (r.kind === "project") return `/projects/${r.id}`;
  return stage ? `/admin/du-an/${r.id}?gd=${stage}` : `/admin/du-an/${r.id}`;
}

function statusKey(r: Row) {
  if (r.status === "done") return "done";
  if (r.status === "paused") return "pause";
  return r.lateDays > 0 ? "late" : "run";
}

function cellOf(r: Row, n: number): Cell {
  if (r.kind === "pipeline") {
    if (r.status === "done" || n < r.stage) {
      const day = fmtDay(r.stageDates[String(n)]);
      return { cls: "done", label: "Đã chốt", detail: day ? `Chốt ${day}` : "", pct: null };
    }
    if (n === r.stage) {
      if (n === 1) {
        return {
          cls: "doing",
          label: "Đang thống nhất",
          detail: r.hasDescription ? "Đã có trang mô tả" : "Chưa tải trang mô tả",
          pct: null,
        };
      }
      return { cls: "doing", label: "Đang làm", detail: "", pct: null };
    }
    return { cls: "todo", label: "Chưa tới", detail: "", pct: null };
  }

  // Dự án thi công có sẵn (tạo theo luồng cũ): coi như đã qua 1→4.
  if (n === 1) return { cls: "done", label: "Đã tiếp nhận", detail: "", pct: null };
  if (n === 2) return { cls: "done", label: "Đã chốt", detail: fmtMoney(r.contractValue), pct: null };
  if (n === 3) return { cls: "done", label: "Đã ký", detail: fmtDay(r.startDate, true), pct: null };
  if (n === 4) return { cls: "done", label: "Đã xong", detail: "", pct: null };
  if (n === 5) {
    if (r.stage === 6) return { cls: "done", label: "Đã xong", detail: `${r.progressPercent}%`, pct: null };
    if (r.planning || r.taskCount === 0) {
      return { cls: "doing", label: "Chuẩn bị", detail: "Chưa lập tiến độ", pct: 0 };
    }
    return {
      cls: "doing",
      label: "Đang thi công",
      detail: `${r.taskCount} công tác · ${r.progressPercent}%`,
      pct: r.progressPercent,
    };
  }
  if (r.stage === 6) return { cls: "done", label: "Đã bàn giao", detail: "", pct: null };
  return { cls: "todo", label: "Chưa tới", detail: "", pct: null };
}

function Tags({ r }: { r: Row }) {
  return (
    <>
      {r.lateDays > 0 ? <span className="pl-tag late">Trễ {r.lateDays} ngày</span> : null}
      {r.status === "paused" ? <span className="pl-tag pause">Tạm ngưng</span> : null}
      {r.kind === "pipeline" && r.status === "done" ? <span className="pl-tag done">Hoàn thành</span> : null}
    </>
  );
}

export function PipelineClient() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<"pv" | "lv">("pv");
  const [fStage, setFStage] = useState(0);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fKs, setFKs] = useState("");
  const [fGd, setFGd] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/pipeline", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) setLoadError(json.message || "Không tải được danh sách dự án");
        else setRows(json.rows || []);
      })
      .catch(() => alive && setLoadError("Không tải được danh sách dự án"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const engineers = useMemo(() => {
    const out: string[] = [];
    rows.forEach((r) => {
      if (r.engineer && out.indexOf(r.engineer) < 0) out.push(r.engineer);
    });
    return out.sort();
  }, [rows]);
  const managers = useMemo(() => {
    const out: string[] = [];
    rows.forEach((r) => {
      if (r.manager && out.indexOf(r.manager) < 0) out.push(r.manager);
    });
    return out.sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fStage && r.stage !== fStage) return false;
      if (fStatus && statusKey(r) !== fStatus) return false;
      if (fKs && r.engineer !== fKs) return false;
      if (fGd && r.manager !== fGd) return false;
      if (needle) {
        const hay = `${r.code || ""} ${r.name} ${r.customerName} ${r.address} ${r.slug || ""}`.toLowerCase();
        if (hay.indexOf(needle) < 0) return false;
      }
      return true;
    });
  }, [rows, q, fStage, fStatus, fKs, fGd]);

  const clearFilters = () => {
    setQ("");
    setFStatus("");
    setFKs("");
    setFGd("");
    setFStage(0);
  };

  return (
    <div className={`pldoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`}>
      <div className="pl-head">
        <div>
          <div className="pl-eyebrow">Huỳnh Gia · Quản lý</div>
          <h1 className="pl-h1">Dự án</h1>
          <div className="pl-sub">Theo dõi từng dự án từ lúc thống nhất mô tả đến bàn giao</div>
        </div>
        <div className="pl-hact">
          <div className="pl-seg">
            <button type="button" className={view === "pv" ? "on" : ""} onClick={() => setView("pv")}>
              ▤ Tiến độ
            </button>
            <button type="button" className={view === "lv" ? "on" : ""} onClick={() => setView("lv")}>
              ☰ Danh sách
            </button>
          </div>
          <button type="button" className="pl-btn" onClick={() => setShowCreate(true)}>
            + Tạo mới
          </button>
        </div>
      </div>

      <div className="pl-strip">
        <button type="button" className={`pl-st ${fStage === 0 ? "on" : ""}`} onClick={() => setFStage(0)}>
          <div className="k">Tất cả</div>
          <div className="v pl-num">{rows.length}</div>
          <div className="d">dự án đang theo dõi</div>
        </button>
        {STAGE_NUMS.map((n) => {
          const inStage = rows.filter((r) => r.stage === n);
          const late = inStage.filter((r) => r.lateDays > 0).length;
          return (
            <button
              type="button"
              key={n}
              className={`pl-st ${fStage === n ? "on" : ""}`}
              onClick={() => setFStage(fStage === n ? 0 : n)}
            >
              <div className="k">
                <b className="pl-num">{n}</b>
                {PIPELINE_STAGES[n - 1]}
              </div>
              <div className="v pl-num">{inStage.length}</div>
              <div className="d">
                {late > 0 ? (
                  <span style={{ color: "var(--red)" }}>{late} trễ hạn</span>
                ) : inStage.length > 0 ? (
                  "đang ở bước này"
                ) : (
                  "—"
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="pl-bar">
        <div className="pl-search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm mã / tên dự án / chủ nhà / địa chỉ"
          />
        </div>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="run">Đang chạy</option>
          <option value="late">Trễ hạn</option>
          <option value="pause">Tạm ngưng</option>
          <option value="done">Hoàn thành</option>
        </select>
        <select value={fKs} onChange={(e) => setFKs(e.target.value)}>
          <option value="">Tất cả KS chính</option>
          {engineers.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select value={fGd} onChange={(e) => setFGd(e.target.value)}>
          <option value="">Tất cả GĐ thi công</option>
          {managers.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button type="button" className="pl-clear" onClick={clearFilters}>
          Xoá lọc
        </button>
        <div className="pl-count">
          {filtered.length}/{rows.length} dự án
        </div>
      </div>

      {loadError ? <div className="pl-err">{loadError}</div> : null}

      {loading ? (
        <div className="pl-empty">Đang tải…</div>
      ) : filtered.length === 0 ? (
        <div className="pl-empty">
          {rows.length === 0 ? "Chưa có dự án nào. Bấm + Tạo mới để bắt đầu." : "Không có dự án khớp bộ lọc."}
        </div>
      ) : view === "pv" ? (
        <>
          <table className="pl-tbl pl-pv">
            <colgroup>
              <col style={{ width: "23%" }} />
              {STAGE_NUMS.map((n) => (
                <col key={n} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>Dự án</th>
                {STAGE_NUMS.map((n) => (
                  <th key={n} className="sc">
                    <b className="pl-num">{n}</b>
                    {PIPELINE_STAGES[n - 1]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={`${r.kind}-${r.id}`}>
                  <td>
                    <Link className="pl-name" href={rowHref(r)}>
                      {r.name}
                    </Link>
                    <Tags r={r} />
                    <div className="pl-meta">
                      {r.code ? <span className="pl-num">{r.code} · </span> : null}
                      {r.customerName}
                    </div>
                    <div className="pl-meta">
                      {r.address || "—"}
                      {r.engineer ? ` · KS ${r.engineer}` : ""}
                    </div>
                  </td>
                  {STAGE_NUMS.map((n) => {
                    const c = cellOf(r, n);
                    const clickable = c.cls !== "todo";
                    return (
                      <td
                        key={n}
                        className={`sc ${c.cls} ${n === 1 ? "first" : ""} ${n === 6 ? "last" : ""} ${clickable ? "click" : ""}`}
                        title={clickable ? `Xem giai đoạn ${n} · ${PIPELINE_STAGES[n - 1]}` : undefined}
                        onClick={clickable ? () => router.push(rowHref(r, n)) : undefined}
                      >
                        <i className="pl-node">{c.cls === "done" ? "✓" : c.cls === "doing" ? "" : n}</i>
                        <div className="pl-sl">{c.label}</div>
                        {c.detail ? <div className="pl-sd">{c.detail}</div> : null}
                        {c.cls === "doing" && c.pct !== null ? (
                          <div className="pl-mini">
                            <i style={{ width: `${c.pct}%` }} />
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pl-legend">
            <span>
              <i className="pl-node" style={{ background: "var(--ok)", borderColor: "var(--ok)", color: "#fff" }}>
                ✓
              </i>
              Đã xong
            </span>
            <span>
              <i className="pl-node" style={{ background: "var(--orange)", borderColor: "var(--orange)" }} />
              Đang làm
            </span>
            <span>
              <i className="pl-node" />
              Chưa tới
            </span>
            <span style={{ marginLeft: "auto" }}>Bấm tên dự án hoặc ô giai đoạn để mở</span>
          </div>
        </>
      ) : (
        <table className="pl-tbl pl-lv">
          <colgroup>
            <col style={{ width: "10%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "11%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Mã</th>
              <th>Dự án</th>
              <th>Chủ nhà</th>
              <th>Giai đoạn</th>
              <th className="pl-r">Giá trị</th>
              <th>KS chính</th>
              <th>Hạn xong</th>
              <th>Tiến độ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const pct = r.kind === "project" ? r.progressPercent : r.status === "done" ? 100 : 0;
              return (
                <tr key={`${r.kind}-${r.id}`}>
                  <td className="pl-num pl-mutc" style={{ fontSize: 12 }}>
                    {r.code || "—"}
                  </td>
                  <td>
                    <Link className="pl-name" href={rowHref(r)}>
                      {r.name}
                    </Link>
                    <Tags r={r} />
                    <div className="pl-meta">{r.address || "—"}</div>
                  </td>
                  <td>{r.customerName}</td>
                  <td>
                    <span className={`pl-chip s${r.stage}`}>
                      <b className="pl-num">{r.stage}</b>
                      {PIPELINE_STAGES[r.stage - 1]}
                    </span>
                  </td>
                  <td className="pl-r">
                    {r.contractValue === null ? (
                      <span className="pl-mutc">—</span>
                    ) : (
                      <span className="pl-num">{fmtMoney(r.contractValue)}</span>
                    )}
                  </td>
                  <td>{r.engineer || <span className="pl-mutc">—</span>}</td>
                  <td className="pl-num" style={{ fontSize: 12.5 }}>
                    {fmtDay(r.endDate, true) || "—"}
                  </td>
                  <td>
                    {r.kind === "project" || r.status === "done" ? (
                      <div className="pl-pg">
                        <div className="pl-mini">
                          <i style={{ width: `${pct}%`, background: r.status === "done" ? "var(--ok)" : undefined }} />
                        </div>
                        <span className="pl-num">{pct}%</span>
                      </div>
                    ) : (
                      <span className="pl-mutc">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {showCreate ? (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => router.push(`/admin/du-an/${id}`)}
        />
      ) : null}
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const finalSlug = slugTouched ? slugify(slug) : slugify(name);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim() || !customerName.trim()) {
      setError("Cần nhập tên dự án và tên khách hàng");
      return;
    }
    const slugError = validateSlug(finalSlug);
    if (slugError) {
      setError(slugError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, customerName, customerPhone, address, slug: finalSlug }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || "Không tạo được dự án");
        setSaving(false);
        return;
      }
      onCreated(json.id);
    } catch {
      setError("Lỗi mạng, thử lại");
      setSaving(false);
    }
  };

  return createPortal(
    <div className={`plportal pl-ov ${plexSans.variable} ${plexMono.variable}`} onClick={onClose}>
      <form className="pl-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Tạo dự án mới</h2>
        <p>Dự án bắt đầu ở giai đoạn 1 · Mô tả. Tạo xong sẽ mở màn dự án để tải trang mô tả gửi khách.</p>
        {error ? <div className="pl-err">{error}</div> : null}
        <label className="pl-field">
          <span>Tên dự án *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nhà anh Bin" autoFocus />
        </label>
        <label className="pl-field">
          <span>Khách hàng *</span>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Anh Huỳnh Văn Bin"
          />
        </label>
        <label className="pl-field">
          <span>Số điện thoại</span>
          <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} inputMode="tel" />
        </label>
        <label className="pl-field">
          <span>Địa chỉ xây</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label className="pl-field">
          <span>Link gửi khách</span>
          <input
            className="pl-num"
            value={slugTouched ? slug : finalSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            placeholder="nha-anh-bin"
          />
          <em>
            {PUBLIC_SITE_URL}/<b>{finalSlug || "…"}</b> — không đổi được sau khi tạo
          </em>
        </label>
        <div className="pl-mact">
          <button type="button" className="pl-btn ghost" onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className="pl-btn" disabled={saving}>
            {saving ? "Đang tạo…" : "Tạo dự án"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
