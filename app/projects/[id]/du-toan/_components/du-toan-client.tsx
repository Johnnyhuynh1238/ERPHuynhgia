"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { buildVtGroups, buildSuperGroups, type VtGroup, type SuperGroup } from "@/lib/estimate-vt-groups";
import {
  api,
  fmt,
  kindLabel,
  SECTION_KINDS,
  type Khoan,
  type Material,
  type Section,
  type SectionKind,
} from "./du-toan-data";
import "./du-toan.css";

type TabKey = "ct" | "vt" | "kh";
const TABS: { key: TabKey; label: string }[] = [
  { key: "ct", label: "Phần" },
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

// Nhóm theo PHẦN dự án (thay công tác catalog).
type CtGroup = {
  sectionId: string | null;
  name: string;
  kind: SectionKind | null;
  sortOrder: number;
  mats: Material[];
  value: number;
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
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ kind: TabKey; id: string } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null); // null = theo hệ thống

  // Nút "Đóng session" trong iframe chat.html báo về -> đóng popup.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== "https://huynhgia6.com") return;
      if (e.data && e.data.type === "hg-ai-closed") setAiOpen(false);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    Promise.all([api.listSections(projectId), api.listMaterials(projectId), api.listKhoan(projectId)])
      .then(([sec, mat, kh]) => {
        setSections(sec.sections);
        setMaterials(mat.items);
        setKhoan(kh.items);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  // reload PHẦN + VT (xoá/đổi tên phần ảnh hưởng nhãn VT)
  const reloadAll = async () => {
    try {
      const [sec, mat] = await Promise.all([
        api.listSections(projectId),
        api.listMaterials(projectId),
      ]);
      setSections(sec.sections);
      setMaterials(mat.items);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const matTotal = useMemo(() => materials.reduce((s, m) => s + amountOf(m), 0), [materials]);
  const khoanTotal = useMemo(() => khoan.reduce((s, k) => s + k.value, 0), [khoan]);
  const grand = matTotal + khoanTotal;
  const vtPct = grand ? Math.round((matTotal / grand) * 100) : 0;
  const khPct = grand ? 100 - vtPct : 0;

  // gộp theo PHẦN dự án (kể cả phần rỗng — để hiển thị & gán VT vào)
  const ctGroups = useMemo<CtGroup[]>(() => {
    const map = new Map<string, CtGroup>();
    for (const s of sections) {
      map.set(s.id, {
        sectionId: s.id,
        name: s.name,
        kind: s.kind,
        sortOrder: s.sortOrder,
        mats: [],
        value: 0,
      });
    }
    for (const m of materials) {
      const key = m.sectionId ?? "__none";
      let g = map.get(key);
      if (!g) {
        g = {
          sectionId: m.sectionId,
          name: m.sectionName ?? "Chưa gán phần",
          kind: m.sectionKind,
          sortOrder: Number.MAX_SAFE_INTEGER,
          mats: [],
          value: 0,
        };
        map.set(key, g);
      }
      g.mats.push(m);
      g.value += amountOf(m);
    }
    return Array.from(map.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
  }, [materials, sections]);

  // gộp theo vật tư (tên + đvt) — nguồn chung với màn Mua hàng (lib/estimate-vt-groups)
  const vtGroups = useMemo<VtGroup<Material>[]>(
    () => buildVtGroups(materials, { priorityCats: ["Cát", "Đá 4x6", "Đá 1x2", "Xi măng", "Bê tông", "Thép", "Gạch ống", "Gạch đinh"] }),
    [materials],
  );
  const vtSuperGroups = useMemo<SuperGroup<Material>[]>(() => buildSuperGroups(vtGroups), [vtGroups]);

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
  // gán 1 VT vào PHẦN (hoặc bỏ gán)
  const saveMatSection = async (id: string, sectionId: string | null) => {
    const s = sections.find((x) => x.id === sectionId) ?? null;
    setMaterials((rows) =>
      rows.map((r) =>
        r.id === id
          ? { ...r, sectionId, sectionName: s?.name ?? null, sectionKind: s?.kind ?? null }
          : r,
      ),
    );
    try {
      await api.patchMaterial(id, { sectionId });
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
            const unit = t.key === "ct" ? "phần" : t.key === "vt" ? "loại" : "HĐ";
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
          <CongTacPanel
            groups={ctGroups}
            total={matTotal}
            onOpen={(id) => setSheet({ kind: "ct", id })}
            onManage={() => setManageOpen(true)}
          />
        ) : tab === "vt" ? (
          <VatTuPanel superGroups={vtSuperGroups} total={matTotal} onOpen={(id) => setSheet({ kind: "vt", id })} />
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
                  group={ctGroups.find((g) => (g.sectionId ?? "__none") === sheet.id)}
                  sections={sections}
                  onClose={() => setSheet(null)}
                  onSavePrice={saveMatPrice}
                  onSaveSection={saveMatSection}
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

      {/* Quản lý PHẦN */}
      {manageOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="dt-portal" data-theme={theme ?? undefined}>
            <div className="dt-scrim show" onClick={() => setManageOpen(false)} />
            <div className="dt-sheet show" role="dialog" aria-modal="true">
              <div className="dt-grip" />
              <ManageSections
                projectId={projectId}
                sections={sections}
                onClose={() => setManageOpen(false)}
                onChanged={reloadAll}
                onError={(m) => setErr(m)}
              />
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
// thứ tự loại để gom siêu nhóm; null (chưa gán) xếp cuối
const kindRank = (k: SectionKind | null) => {
  const i = SECTION_KINDS.findIndex((x) => x.key === k);
  return i < 0 ? SECTION_KINDS.length : i;
};

function CongTacPanel({
  groups,
  total,
  onOpen,
  onManage,
}: {
  groups: CtGroup[];
  total: number;
  onOpen: (id: string) => void;
  onManage: () => void;
}) {
  const manageBtn = (
    <button type="button" className="dt-manage" onClick={onManage}>
      ⚙ Quản lý phần
    </button>
  );
  if (groups.length === 0)
    return (
      <div>
        {manageBtn}
        <div className="dt-empty">Chưa có PHẦN nào. Bấm “Quản lý phần” để tạo theo HĐTK.</div>
      </div>
    );

  // tổng theo loại (thô / hoàn thiện / …)
  const kindTotal = new Map<SectionKind | null, number>();
  for (const g of groups) kindTotal.set(g.kind, (kindTotal.get(g.kind) ?? 0) + g.value);

  const sorted = [...groups].sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.sortOrder - b.sortOrder);
  let lastKind: SectionKind | null | undefined = undefined;
  let idx = 0;
  return (
    <div>
      {manageBtn}
      {sorted.map((g) => {
        idx++;
        const header =
          g.kind !== lastKind ? (
            <div className="dt-phead" key={"h-" + (g.kind ?? "none")}>
              <span className="pi">{kindLabel(g.kind)}</span>
              <span className="pn" />
              <span className="pt dt-num">{fmt(kindTotal.get(g.kind) ?? 0)}</span>
            </div>
          ) : null;
        lastKind = g.kind;
        return (
          <div key={g.sectionId ?? "__none"}>
            {header}
            <button className="dt-row" onClick={() => onOpen(g.sectionId ?? "__none")}>
              <span className="stt dt-num">{idx}</span>
              <span className="rb">
                <span className="r1">
                  <span className="rn">{g.name}</span>
                  <span className="rav dt-num">{fmt(g.value)}</span>
                </span>
                <span className="r2">
                  <span className="rs">
                    {g.mats.length} vật tư{g.sectionId == null ? " · chưa gán phần" : ""}
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
        <span className="gk">Tổng vật tư {groups.length} phần</span>
        <span className="gv dt-num">
          {fmt(total)}
          <span className="u">đ</span>
        </span>
      </div>
    </div>
  );
}

// 1 dòng chủng loại (giữ nguyên markup cũ) — dùng trong các siêu nhóm.
function ChungLoaiRow({ g, onOpen }: { g: VtGroup<Material>; onOpen: (id: string) => void }) {
  const cta = new Set<string>();
  g.items.forEach((it) => it.members.forEach((m) => cta.add(m.sectionId ?? "__none")));
  // Tổng SL theo đơn vị (1 chủng loại có thể nhiều đvt: Thép có cây + kg)
  const byUnit = new Map<string, number>();
  g.items.forEach((it) => byUnit.set(it.unit, (byUnit.get(it.unit) ?? 0) + it.qty));
  const qtyStr = Array.from(byUnit.entries())
    .map(([u, q]) => qfmt(q, u))
    .join(" · ");
  return (
    <button className="dt-row" onClick={() => onOpen(g.key)}>
      <span className="swatch" style={{ background: swatchOf(g.categoryName) }} />
      <span className="rb">
        <span className="r1">
          <span className="rn">{g.categoryName ?? "Chưa phân loại"}</span>
          <span className="rav dt-num">{fmt(g.amount)}</span>
        </span>
        <span className="r2">
          <span className="rs">
            {g.items.length} vật tư · <b className="dt-num">{qtyStr}</b>
          </span>
          <span className="rau">{cta.size} phần</span>
        </span>
      </span>
      <span className="chev">›</span>
    </button>
  );
}

// Vật tư gộp thành 3 siêu nhóm Thô / ME / Hoàn thiện (nguồn chung với màn Mua hàng).
function VatTuPanel({
  superGroups,
  total,
  onOpen,
}: {
  superGroups: SuperGroup<Material>[];
  total: number;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (superGroups.length === 0) return <div className="dt-empty">Chưa có vật tư. Dùng 🤖 AI để bóc vật tư.</div>;
  return (
    <div>
      {superGroups.map((sg) => {
        const isOpen = open[sg.key] ?? true; // mặc định mở
        return (
          <div className="dt-super" key={sg.key}>
            <button
              className="dt-suphead"
              onClick={() => setOpen((o) => ({ ...o, [sg.key]: !isOpen }))}
              aria-expanded={isOpen}
            >
              <span className={"sc" + (isOpen ? " open" : "")}>▸</span>
              <span className="sl">{sg.label}</span>
              <span className="sm">{sg.groups.length} chủng loại</span>
              <span className="sv dt-num">{fmt(sg.amount)}</span>
            </button>
            {isOpen && sg.groups.map((g) => <ChungLoaiRow key={g.key} g={g} onOpen={onOpen} />)}
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
  sections,
  onClose,
  onSavePrice,
  onSaveSection,
}: {
  group?: CtGroup;
  sections: Section[];
  onClose: () => void;
  onSavePrice: (id: string, price: number) => void;
  onSaveSection: (id: string, sectionId: string | null) => void;
}) {
  if (!group) return <SheetHead eye="Phần" title="—" onClose={onClose} />;
  const sub = group.mats.reduce((s, m) => s + amountOf(m), 0);
  return (
    <>
      <SheetHead eye={`Phần · ${kindLabel(group.kind)}`} title={group.name} onClose={onClose} />
      <div className="dt-sbody">
        <div className="dt-kpi">
          <div className="ki">
            <div className="kk">Loại</div>
            <div className="kv" style={{ fontSize: 13 }}>
              {kindLabel(group.kind)}
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
        <p className="dt-ephelp">Chạm đơn giá để sửa · đổi ô “Phần” để chuyển vật tư sang phần khác</p>
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
                  <select
                    className="dt-msel"
                    value={m.sectionId ?? ""}
                    onChange={(e) => onSaveSection(m.id, e.target.value || null)}
                  >
                    <option value="">— chưa gán phần —</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
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
  group?: VtGroup<Material>;
  onClose: () => void;
  onSavePrice: (id: string, price: number) => void;
}) {
  if (!group) return <SheetHead eye="Vật tư" title="—" onClose={onClose} />;
  const tot = group.amount;
  const cta = new Set<string>();
  group.items.forEach((it) => it.members.forEach((m) => cta.add(m.sectionId ?? "__none")));
  return (
    <>
      <SheetHead eye="Vật tư · chủng loại" title={group.categoryName ?? "Chưa phân loại"} onClose={onClose} />
      <div className="dt-sbody">
        <div className="dt-kpi">
          <div className="ki">
            <div className="kk">Số vật tư</div>
            <div className="kv">{group.items.length}</div>
          </div>
          <div className="ki">
            <div className="kk">Phần</div>
            <div className="kv">{cta.size}</div>
          </div>
          <div className="ki">
            <div className="kk">Thành tiền</div>
            <div className="kv hl">{fmt(tot)}</div>
          </div>
        </div>
        <p className="dt-ephelp">Chạm đơn giá để sửa · áp cho mọi phần dùng vật tư đó</p>

        <div className="dt-blabel">Vật tư trong chủng loại ({group.items.length})</div>
        <table className="dt-t">
          <thead>
            <tr>
              <th>Vật tư · SL</th>
              <th className="r">Đơn giá</th>
              <th className="r">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {group.items.map((it) => {
              const shown = it.uniformPrice ?? it.members[0]?.unitPrice ?? 0;
              const apply = (v: number) => it.members.forEach((m) => onSavePrice(m.id, v));
              return (
                <tr key={it.key}>
                  <td>
                    <div className="dn">{it.name}</div>
                    <div className="dsub">
                      {qfmt(it.qty, it.unit)} · {it.members.length} phần
                    </div>
                  </td>
                  <td className="r">
                    <PriceCell value={shown} onSave={apply} />
                    <div className="dsub">đ/{it.unit}</div>
                  </td>
                  <td className="r amt">{fmt(it.amount)}</td>
                </tr>
              );
            })}
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

// ───────────────────────── QUẢN LÝ PHẦN ─────────────────────────
function ManageSections({
  projectId,
  sections,
  onClose,
  onChanged,
  onError,
}: {
  projectId: string;
  sections: Section[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SectionKind>("tho");
  const [busy, setBusy] = useState(false);

  const wrap = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const n = name.trim();
    if (!n) return;
    void wrap(async () => {
      await api.addSection(projectId, { name: n, kind });
      setName("");
    });
  };
  const rename = (s: Section) => {
    const n = window.prompt("Tên phần:", s.name);
    if (n == null) return;
    const t = n.trim();
    if (!t || t === s.name) return;
    void wrap(() => api.patchSection(projectId, s.id, { name: t }));
  };
  const changeKind = (s: Section, k: SectionKind) =>
    void wrap(() => api.patchSection(projectId, s.id, { kind: k }));
  const del = (s: Section) => {
    if (!window.confirm(`Xoá phần “${s.name}”?\nVật tư trong phần sẽ về “chưa gán” (không mất).`)) return;
    void wrap(() => api.delSection(projectId, s.id));
  };
  const move = (s: Section, dir: -1 | 1) => {
    const sorted = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
    const i = sorted.findIndex((x) => x.id === s.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    const a = sorted[i];
    const b = sorted[j];
    void wrap(() =>
      Promise.all([
        api.patchSection(projectId, a.id, { sortOrder: b.sortOrder }),
        api.patchSection(projectId, b.id, { sortOrder: a.sortOrder }),
      ]),
    );
  };

  const ordered = [...sections].sort((x, y) => x.sortOrder - y.sortOrder);
  return (
    <>
      <SheetHead eye="Dự toán" title="Quản lý phần (theo HĐTK)" onClose={onClose} />
      <div className="dt-sbody">
        <div className="dt-addph">
          <input
            className="dt-in"
            placeholder="Tên phần (VD: Phần nền móng)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <select className="dt-msel" value={kind} onChange={(e) => setKind(e.target.value as SectionKind)}>
            {SECTION_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
          <button className="dt-addbtn" onClick={add} disabled={busy || !name.trim()}>
            ＋ Thêm
          </button>
        </div>

        <div className="dt-blabel">Danh sách phần ({ordered.length})</div>
        {ordered.length === 0 ? (
          <div className="dt-empty">Chưa có phần nào — thêm theo cách HĐTK chia.</div>
        ) : (
          <div className="dt-phlist">
            {ordered.map((s, i) => (
              <div className="dt-phrow" key={s.id}>
                <div className="ord">
                  <button onClick={() => move(s, -1)} disabled={busy || i === 0} aria-label="Lên">
                    ▲
                  </button>
                  <button onClick={() => move(s, 1)} disabled={busy || i === ordered.length - 1} aria-label="Xuống">
                    ▼
                  </button>
                </div>
                <div className="nm">
                  <button className="link" onClick={() => rename(s)}>
                    {s.name}
                  </button>
                  <div className="sub">
                    {s.matCount} VT · {fmt(s.total)} đ
                  </div>
                </div>
                <select
                  className="dt-msel"
                  value={s.kind}
                  onChange={(e) => changeKind(s, e.target.value as SectionKind)}
                  disabled={busy}
                >
                  {SECTION_KINDS.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <button className="del" onClick={() => del(s)} disabled={busy} aria-label="Xoá">
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
