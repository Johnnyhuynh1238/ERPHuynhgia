"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api, fmt, type CatalogTask, type Khoan, type Material } from "./du-toan-data";
import "./du-toan.css";

type TabKey = "ct" | "vt" | "kh";
const TABS: { key: TabKey; label: string }[] = [
  { key: "ct", label: "Công tác" },
  { key: "vt", label: "Vật tư" },
  { key: "kh", label: "Khoán" },
];

const qfmt = (n: number, u: string) =>
  `${n.toLocaleString("vi-VN", { maximumFractionDigits: 3 })}${u ? " " + u : ""}`;
const amountOf = (m: Material) => Math.round(m.quantity * m.unitPrice);

// bảng màu chấm chủng loại (ổn định theo tên)
const SWATCH = ["#6b7280", "#9ca3af", "#B8934A", "#8A3D1C", "#c88a3a", "#5B7A52", "#7a6a58", "#a15b3a"];
const swatchOf = (s: string | null) => {
  const k = s ?? "";
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return SWATCH[h % SWATCH.length];
};

// ── ô đơn giá sửa trực tiếp: chạm → input, blur/Enter lưu, Esc huỷ ──
function PriceCell({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [edit, setEdit] = useState(false);
  const [flash, setFlash] = useState(false);
  if (edit) {
    return (
      <input
        className="dt-epin"
        autoFocus
        inputMode="numeric"
        type="text"
        defaultValue={value ? fmt(value) : ""}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") setEdit(false);
        }}
        onBlur={(e) => {
          const v = Number(e.target.value.replace(/[^\d]/g, "")) || 0;
          setEdit(false);
          if (v !== value) {
            onSave(v);
            setFlash(true);
            setTimeout(() => setFlash(false), 900);
          }
        }}
      />
    );
  }
  return (
    <span className={"dt-ep" + (flash ? " dt-flash" : "")} onClick={() => setEdit(true)}>
      {fmt(value)}
      <span className="pen">✎</span>
    </span>
  );
}

type CtGroup = {
  catalogId: string | null;
  code: string | null;
  taskName: string;
  phaseCode: string;
  phaseName: string;
  mats: Material[];
  value: number;
};
type VtGroup = {
  key: string;
  name: string;
  unit: string;
  categoryName: string | null;
  qty: number;
  amount: number;
  members: Material[];
  uniformPrice: number | null;
};

export function DuToanClient({
  projectId,
  projectCode,
  projectName,
  initialTab,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
  initialTab?: string;
}) {
  const validTab = TABS.some((t) => t.key === initialTab) ? (initialTab as TabKey) : "ct";
  const [tab, setTab] = useState<TabKey>(validTab);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [khoan, setKhoan] = useState<Khoan[]>([]);
  const [tasksMeta, setTasksMeta] = useState<CatalogTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ kind: TabKey; id: string } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null); // null = theo hệ thống

  useEffect(() => {
    Promise.all([api.meta(projectId), api.listMaterials(projectId), api.listKhoan(projectId)])
      .then(([m, mat, kh]) => {
        setTasksMeta(m.tasks);
        setMaterials(mat.items);
        setKhoan(kh.items);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const phaseByCatalog = useMemo(() => {
    const map = new Map<string, CatalogTask>();
    for (const t of tasksMeta) map.set(t.id, t);
    return map;
  }, [tasksMeta]);

  const matTotal = useMemo(() => materials.reduce((s, m) => s + amountOf(m), 0), [materials]);
  const khoanTotal = useMemo(() => khoan.reduce((s, k) => s + k.value, 0), [khoan]);
  const grand = matTotal + khoanTotal;
  const vtPct = grand ? Math.round((matTotal / grand) * 100) : 0;
  const khPct = grand ? 100 - vtPct : 0;

  // gộp theo công tác
  const ctGroups = useMemo<CtGroup[]>(() => {
    const map = new Map<string, CtGroup>();
    for (const m of materials) {
      const key = m.catalogId ?? "__none";
      let g = map.get(key);
      if (!g) {
        const meta = m.catalogId ? phaseByCatalog.get(m.catalogId) : undefined;
        g = {
          catalogId: m.catalogId,
          code: m.taskCode ?? meta?.code ?? null,
          taskName: m.taskName ?? meta?.taskName ?? "Chưa gán công tác",
          phaseCode: meta?.phaseCode ?? (m.catalogId ? "??" : "zz"),
          phaseName: meta?.phaseName ?? (m.catalogId ? "Khác" : "Chưa gán công tác"),
          mats: [],
          value: 0,
        };
        map.set(key, g);
      }
      g.mats.push(m);
      g.value += amountOf(m);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.phaseCode !== b.phaseCode
        ? a.phaseCode.localeCompare(b.phaseCode)
        : (a.code ?? "").localeCompare(b.code ?? ""),
    );
  }, [materials, phaseByCatalog]);

  // gộp theo vật tư (tên + đvt)
  const vtGroups = useMemo<VtGroup[]>(() => {
    const map = new Map<string, VtGroup>();
    for (const m of materials) {
      const key = `${m.name.toLowerCase()}|${m.unit.toLowerCase()}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          name: m.name,
          unit: m.unit,
          categoryName: m.categoryName,
          qty: 0,
          amount: 0,
          members: [],
          uniformPrice: null,
        };
        map.set(key, g);
      }
      g.qty += m.quantity;
      g.amount += amountOf(m);
      g.members.push(m);
    }
    const arr = Array.from(map.values());
    for (const g of arr) {
      const prices = new Set(g.members.map((x) => x.unitPrice));
      g.uniformPrice = prices.size === 1 ? g.members[0].unitPrice : null;
    }
    return arr.sort((a, b) => b.amount - a.amount);
  }, [materials]);

  const selectTab = (key: TabKey) => {
    setTab(key);
    window.history.replaceState(null, "", `/projects/${projectId}/du-toan?tab=${key}`);
  };

  // lưu đơn giá 1 dòng VT
  const saveMatPrice = async (id: string, price: number) => {
    setMaterials((rows) => rows.map((r) => (r.id === id ? { ...r, unitPrice: price } : r)));
    try {
      await api.patchMaterial(id, { unitPrice: price });
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  // lưu giá trị 1 HĐ khoán
  const saveKhoanValue = async (id: string, value: number) => {
    setKhoan((rows) => rows.map((r) => (r.id === id ? { ...r, value } : r)));
    try {
      await api.patchKhoan(id, { value });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="dt-app" data-theme={theme ?? undefined}>
      <div className="dt-wrap">
        <div className="dt-top">
          <Link href={`/projects/${projectId}`} className="dt-back">
            ← Dự án
          </Link>
          <div className="dt-acts">
            <button type="button" className="dt-ibtn ai" onClick={() => setAiOpen(true)}>
              🤖 AI bóc vật tư
            </button>
            <button
              type="button"
              className="dt-ibtn"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label="Đổi sáng/tối"
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </div>
        </div>

        <div className="dt-eyebrow">Dự toán · {projectCode}</div>
        <h1 className="dt-h1">{projectName}</h1>
        <div className="dt-meta">Kho DB — AI bóc &amp; ghi, ERP hiển thị</div>

        {err && (
          <div className="dt-formula" style={{ marginTop: 12, color: "#b91c1c" }}>
            Lỗi: {err}
          </div>
        )}

        {/* THÔNG SỐ DỰ TOÁN */}
        <div className="dt-sum">
          <div className="k">Tổng chi phí dự toán</div>
          <div className="tot">
            {fmt(grand)}
            <span className="u">đ</span>
          </div>
          <div className="note">Vật tư cấp + nhân công khoán · chưa gồm VAT</div>
          <div className="dt-split">
            <div className="c vt">
              <div className="sk">Chi phí vật tư</div>
              <div className="sv">{fmt(matTotal)}</div>
              <div className="sp">
                {vtPct}% · {vtGroups.length} chủng loại
              </div>
            </div>
            <div className="c kh">
              <div className="sk">Chi phí khoán</div>
              <div className="sv">{fmt(khoanTotal)}</div>
              <div className="sp">
                {khPct}% · {khoan.length} hợp đồng
              </div>
            </div>
          </div>
          {grand > 0 && (
            <div className="dt-track">
              <i style={{ width: `${vtPct}%`, background: "var(--dt-terra)" }} />
              <i style={{ width: `${khPct}%`, background: "var(--dt-orange)" }} />
            </div>
          )}
        </div>

        {/* TABS */}
        <div className="dt-tabs">
          {TABS.map((t) => {
            const n = t.key === "ct" ? ctGroups.length : t.key === "vt" ? vtGroups.length : khoan.length;
            const unit = t.key === "ct" ? "công tác" : t.key === "vt" ? "loại" : "HĐ";
            return (
              <button
                key={t.key}
                className={"dt-tab" + (tab === t.key ? " on" : "")}
                onClick={() => selectTab(t.key)}
              >
                <span>{t.label}</span>
                <span className="tn">
                  {n} {unit}
                </span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="dt-empty">Đang tải…</div>
        ) : tab === "ct" ? (
          <CongTacPanel groups={ctGroups} total={matTotal} onOpen={(id) => setSheet({ kind: "ct", id })} />
        ) : tab === "vt" ? (
          <VatTuPanel groups={vtGroups} total={matTotal} onOpen={(id) => setSheet({ kind: "vt", id })} />
        ) : (
          <KhoanPanel rows={khoan} total={khoanTotal} onOpen={(id) => setSheet({ kind: "kh", id })} />
        )}

        <div className="dt-foot">Đúng — Đẹp — Bền · Huỳnh Gia ERP</div>
      </div>

      {/* SHEET */}
      {sheet &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="dt-portal" data-theme={theme ?? undefined}>
            <div className="dt-scrim show" onClick={() => setSheet(null)} />
            <div className="dt-sheet show" role="dialog" aria-modal="true">
              <div className="dt-grip" />
              {sheet.kind === "ct" && (
                <CtSheet
                  group={ctGroups.find((g) => (g.catalogId ?? "__none") === sheet.id)}
                  onClose={() => setSheet(null)}
                  onSavePrice={saveMatPrice}
                />
              )}
              {sheet.kind === "vt" && (
                <VtSheet
                  group={vtGroups.find((g) => g.key === sheet.id)}
                  onClose={() => setSheet(null)}
                  onSavePrice={saveMatPrice}
                />
              )}
              {sheet.kind === "kh" && (
                <KhSheet
                  khoan={khoan.find((k) => k.id === sheet.id)}
                  onClose={() => setSheet(null)}
                  onSaveValue={saveKhoanValue}
                />
              )}
            </div>
          </div>,
          document.body,
        )}

      {/* AI drawer */}
      {aiOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="dt-ai-scrim" onClick={() => setAiOpen(false)}>
            <div className="dt-ai-box" onClick={(e) => e.stopPropagation()}>
              <div className="dt-ai-head">
                <b>🤖 AI bóc vật tư — {projectCode}</b>
                <button type="button" className="x" onClick={() => setAiOpen(false)} aria-label="Đóng">
                  ✕
                </button>
              </div>
              <iframe
                src={`https://huynhgia6.com/claude/chat?arg=dutoan-${encodeURIComponent(projectCode)}`}
                title="AI bóc vật tư"
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ───────────────────────── PANELS ─────────────────────────
function CongTacPanel({
  groups,
  total,
  onOpen,
}: {
  groups: CtGroup[];
  total: number;
  onOpen: (id: string) => void;
}) {
  if (groups.length === 0) return <div className="dt-empty">Chưa có công tác nào. Dùng 🤖 AI để bóc vật tư.</div>;
  const phaseTotal = new Map<string, number>();
  for (const g of groups) phaseTotal.set(g.phaseCode, (phaseTotal.get(g.phaseCode) ?? 0) + g.value);

  let lastPhase = "";
  let idx = 0;
  return (
    <div>
      {groups.map((g) => {
        idx++;
        const header =
          g.phaseCode !== lastPhase ? (
            <div className="dt-phead" key={"h-" + g.phaseCode}>
              <span className="pi">{g.phaseCode === "zz" ? "—" : "GĐ " + g.phaseCode}</span>
              <span className="pn">{g.phaseName}</span>
              <span className="pt dt-num">{fmt(phaseTotal.get(g.phaseCode) ?? 0)}</span>
            </div>
          ) : null;
        lastPhase = g.phaseCode;
        return (
          <div key={g.catalogId ?? "__none"}>
            {header}
            <button className="dt-row" onClick={() => onOpen(g.catalogId ?? "__none")}>
              <span className="stt dt-num">{idx}</span>
              <span className="rb">
                <span className="r1">
                  <span className="rn">{g.taskName}</span>
                  <span className="rav dt-num">{fmt(g.value)}</span>
                </span>
                <span className="r2">
                  <span className="rs">
                    {g.code && <span className="code">{g.code}</span>}
                    {g.code ? " · " : ""}
                    {g.mats.length} chủng loại VT
                  </span>
                  <span className="rau">vật tư</span>
                </span>
              </span>
              <span className="chev">›</span>
            </button>
          </div>
        );
      })}
      <div className="dt-gstrip">
        <span className="gk">Tổng vật tư {groups.length} công tác</span>
        <span className="gv dt-num">
          {fmt(total)}
          <span className="u">đ</span>
        </span>
      </div>
    </div>
  );
}

function VatTuPanel({
  groups,
  total,
  onOpen,
}: {
  groups: VtGroup[];
  total: number;
  onOpen: (id: string) => void;
}) {
  if (groups.length === 0) return <div className="dt-empty">Chưa có vật tư. Dùng 🤖 AI để bóc vật tư.</div>;
  // giữ thứ tự theo tiền nhưng nhóm nhãn chủng loại
  const catTotal = new Map<string, number>();
  for (const g of groups) {
    const c = g.categoryName ?? "Chưa phân loại";
    catTotal.set(c, (catTotal.get(c) ?? 0) + g.amount);
  }
  let lastCat = "";
  return (
    <div>
      {groups.map((g) => {
        const cat = g.categoryName ?? "Chưa phân loại";
        const header =
          cat !== lastCat ? (
            <div className="dt-phead" key={"h-" + cat}>
              <span className="pn" style={{ flex: 1 }}>
                {cat}
              </span>
              <span className="pt dt-num">{fmt(catTotal.get(cat) ?? 0)}</span>
            </div>
          ) : null;
        lastCat = cat;
        return (
          <div key={g.key}>
            {header}
            <button className="dt-row" onClick={() => onOpen(g.key)}>
              <span className="swatch" style={{ background: swatchOf(g.categoryName) }} />
              <span className="rb">
                <span className="r1">
                  <span className="rn">{g.name}</span>
                  <span className="rav dt-num">{fmt(g.amount)}</span>
                </span>
                <span className="r2">
                  <span className="rs">
                    {qfmt(g.qty, g.unit)} · {g.members.length} công tác
                  </span>
                  <span className="rau">
                    {g.uniformPrice != null ? `${fmt(g.uniformPrice)} đ/${g.unit}` : "nhiều giá"}
                  </span>
                </span>
              </span>
              <span className="chev">›</span>
            </button>
          </div>
        );
      })}
      <div className="dt-gstrip">
        <span className="gk">Tổng vật tư mua</span>
        <span className="gv dt-num">
          {fmt(total)}
          <span className="u">đ</span>
        </span>
      </div>
    </div>
  );
}

function KhoanPanel({
  rows,
  total,
  onOpen,
}: {
  rows: Khoan[];
  total: number;
  onOpen: (id: string) => void;
}) {
  if (rows.length === 0) return <div className="dt-empty">Chưa có hạng mục khoán. Dùng 🤖 AI để nhập.</div>;
  return (
    <div>
      {rows.map((k, i) => (
        <button className="dt-row" key={k.id} onClick={() => onOpen(k.id)}>
          <span className="stt dt-num">{i + 1}</span>
          <span className="rb">
            <span className="r1">
              <span className="rn">{k.name}</span>
              <span className="rav dt-num">{fmt(k.value)}</span>
            </span>
            <span className="r2">
              <span className="rs">
                {k.contractor || "—"}
                {k.quantity != null && k.unit ? ` · ${qfmt(Number(k.quantity), k.unit)}` : ""}
              </span>
              <span className="rau">
                {k.unitPrice ? `${fmt(k.unitPrice)} đ${k.unit ? "/" + k.unit : ""}` : "trọn gói"}
              </span>
            </span>
          </span>
          <span className="chev">›</span>
        </button>
      ))}
      <div className="dt-gstrip">
        <span className="gk">Tổng khoán {rows.length} hợp đồng</span>
        <span className="gv dt-num">
          {fmt(total)}
          <span className="u">đ</span>
        </span>
      </div>
    </div>
  );
}

// ───────────────────────── SHEETS ─────────────────────────
function SheetHead({ eye, title, onClose }: { eye: string; title: string; onClose: () => void }) {
  return (
    <div className="dt-shead">
      <div>
        <div className="se">{eye}</div>
        <div className="st">{title}</div>
      </div>
      <button className="close" onClick={onClose} aria-label="Đóng">
        ✕
      </button>
    </div>
  );
}

function CtSheet({
  group,
  onClose,
  onSavePrice,
}: {
  group?: CtGroup;
  onClose: () => void;
  onSavePrice: (id: string, price: number) => void;
}) {
  if (!group) return <SheetHead eye="Công tác" title="—" onClose={onClose} />;
  const sub = group.mats.reduce((s, m) => s + amountOf(m), 0);
  return (
    <>
      <SheetHead eye={`Công tác${group.code ? " · " + group.code : ""}`} title={group.taskName} onClose={onClose} />
      <div className="dt-sbody">
        <div className="dt-kpi">
          <div className="ki">
            <div className="kk">Giai đoạn</div>
            <div className="kv" style={{ fontSize: 13 }}>
              {group.phaseName}
            </div>
          </div>
          <div className="ki">
            <div className="kk">Số VT</div>
            <div className="kv">{group.mats.length}</div>
          </div>
          <div className="ki">
            <div className="kk">Vật tư</div>
            <div className="kv hl">{fmt(sub)}</div>
          </div>
        </div>

        <div className="dt-blabel">Chi tiết vật tư</div>
        <p className="dt-ephelp">Chạm đơn giá để sửa · bấm ra ngoài để lưu</p>
        <table className="dt-t">
          <thead>
            <tr>
              <th>Chủng loại · SL</th>
              <th className="r">Đơn giá</th>
              <th className="r">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {group.mats.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="dn">{m.name}</div>
                  <div className="dsub">
                    {m.categoryName ? m.categoryName + " · " : ""}
                    {qfmt(m.quantity, m.unit)}
                    {m.note ? " · " + m.note : ""}
                  </div>
                </td>
                <td className="r">
                  <PriceCell value={m.unitPrice} onSave={(v) => onSavePrice(m.id, v)} />
                  <div className="dsub">đ/{m.unit}</div>
                </td>
                <td className="r amt">{fmt(amountOf(m))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="tk">Cộng vật tư</td>
              <td></td>
              <td className="r">{fmt(sub)} đ</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function VtSheet({
  group,
  onClose,
  onSavePrice,
}: {
  group?: VtGroup;
  onClose: () => void;
  onSavePrice: (id: string, price: number) => void;
}) {
  if (!group) return <SheetHead eye="Vật tư" title="—" onClose={onClose} />;
  const tot = group.members.reduce((s, m) => s + amountOf(m), 0);
  const tq = group.members.reduce((s, m) => s + m.quantity, 0);
  return (
    <>
      <SheetHead eye={`Vật tư${group.categoryName ? " · " + group.categoryName : ""}`} title={group.name} onClose={onClose} />
      <div className="dt-sbody">
        <div className="dt-kpi">
          <div className="ki">
            <div className="kk">Tổng SL</div>
            <div className="kv">{qfmt(tq, group.unit)}</div>
          </div>
          <div className="ki">
            <div className="kk">Số công tác</div>
            <div className="kv">{group.members.length}</div>
          </div>
          <div className="ki">
            <div className="kk">Thành tiền</div>
            <div className="kv hl">{fmt(tot)}</div>
          </div>
        </div>

        <div className="dt-blabel">Dùng cho công tác ({group.members.length})</div>
        <p className="dt-ephelp">Chạm đơn giá để sửa · bấm ra ngoài để lưu</p>
        <table className="dt-t">
          <thead>
            <tr>
              <th>Công tác · SL</th>
              <th className="r">Đơn giá</th>
              <th className="r">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {group.members.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="dn">{m.taskName ?? "Chưa gán công tác"}</div>
                  <div className="dsub">
                    {m.taskCode ? <span style={{ color: "var(--dt-terra)" }}>{m.taskCode}</span> : "—"} ·{" "}
                    {qfmt(m.quantity, m.unit)}
                  </div>
                </td>
                <td className="r">
                  <PriceCell value={m.unitPrice} onSave={(v) => onSavePrice(m.id, v)} />
                </td>
                <td className="r amt">{fmt(amountOf(m))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="tk">Tổng mua</td>
              <td></td>
              <td className="r">{fmt(tot)} đ</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function KhSheet({
  khoan,
  onClose,
  onSaveValue,
}: {
  khoan?: Khoan;
  onClose: () => void;
  onSaveValue: (id: string, value: number) => void;
}) {
  if (!khoan) return <SheetHead eye="Hợp đồng khoán" title="—" onClose={onClose} />;
  return (
    <>
      <SheetHead eye="Hợp đồng khoán" title={khoan.name} onClose={onClose} />
      <div className="dt-sbody">
        <div className="dt-kpi">
          <div className="ki">
            <div className="kk">Khối lượng</div>
            <div className="kv" style={{ fontSize: 13 }}>
              {khoan.quantity != null && khoan.unit ? qfmt(Number(khoan.quantity), khoan.unit) : "trọn gói"}
            </div>
          </div>
          <div className="ki">
            <div className="kk">Đơn giá</div>
            <div className="kv" style={{ fontSize: 13 }}>
              {khoan.unitPrice ? fmt(khoan.unitPrice) : "—"}
            </div>
          </div>
          <div className="ki">
            <div className="kk">Giá trị HĐ</div>
            <div className="kv hl">
              <PriceCell value={khoan.value} onSave={(v) => onSaveValue(khoan.id, v)} />
            </div>
          </div>
        </div>
        <p className="dt-ephelp">Chạm giá trị HĐ để sửa · bấm ra ngoài để lưu</p>

        <div className="dt-blabel">Nhà thầu</div>
        <div className="dt-prose">{khoan.contractor || "—"}</div>

        {khoan.note && (
          <>
            <div className="dt-blabel">Ghi chú</div>
            <div className="dt-prose lead">{khoan.note}</div>
          </>
        )}
      </div>
    </>
  );
}
