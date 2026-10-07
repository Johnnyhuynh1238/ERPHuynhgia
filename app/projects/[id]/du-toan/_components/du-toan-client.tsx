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
  type Work,
} from "./du-toan-data";
import "./du-toan.css";

// 3 tab: Công tác (KL + NC + VT theo phần) · Vật tư (gộp mua hàng) · Nhân công (khoán theo công tác).
type TabKey = "ct" | "vt" | "nc";
const TABS: { key: TabKey; label: string }[] = [
  { key: "ct", label: "Công tác" },
  { key: "vt", label: "Vật tư" },
  { key: "nc", label: "Nhân công" },
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

// ── ô số sửa trực tiếp: chạm → input, blur/Enter lưu, Esc huỷ ──
// decimal=true cho khối lượng (vi-VN: "." ngăn nghìn, "," thập phân).
function PriceCell({
  value,
  onSave,
  decimal = false,
}: {
  value: number;
  onSave: (n: number) => void;
  decimal?: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [flash, setFlash] = useState(false);
  const show = (n: number) => (decimal ? n.toLocaleString("vi-VN", { maximumFractionDigits: 3 }) : fmt(n));
  const parse = (s: string) =>
    decimal
      ? Number(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "")) || 0
      : Number(s.replace(/[^\d]/g, "")) || 0;
  if (edit) {
    return (
      <input
        className="dt-epin"
        autoFocus
        inputMode={decimal ? "decimal" : "numeric"}
        type="text"
        defaultValue={value ? show(value) : ""}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") setEdit(false);
        }}
        onBlur={(e) => {
          const v = parse(e.target.value);
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
      {show(value)}
      <span className="pen">✎</span>
    </span>
  );
}

// Công tác + VT tiêu hao của nó.
type WorkRow = Work & { mats: Material[]; vt: number };
// Nhóm theo PHẦN dự án: công tác + VT chưa gắn công tác (dự toán cũ).
type CtGroup = {
  key: string; // sectionId | "__none"
  sectionId: string | null;
  name: string;
  kind: SectionKind | null;
  sortOrder: number;
  works: WorkRow[];
  loose: Material[];
  vt: number;
  nc: number;
};
type LooseGroup = { name: string; kind: SectionKind | null; mats: Material[] };

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
  const tab0 = initialTab === "kh" ? "nc" : initialTab; // link cũ ?tab=kh
  const validTab = TABS.some((t) => t.key === tab0) ? (tab0 as TabKey) : "ct";
  const [tab, setTab] = useState<TabKey>(validTab);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [khoan, setKhoan] = useState<Khoan[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ kind: "work" | "loose" | "vt" | "kh"; id: string } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null); // null = theo hệ thống

  // Nút "Đóng session" trong iframe chat.html báo về -> đóng popup + tải lại số AI vừa ghi.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== "https://huynhgia6.com") return;
      if (e.data && e.data.type === "hg-ai-closed") setAiOpen(false);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const loadAll = async () => {
    try {
      const [sec, mat, wk, kh] = await Promise.all([
        api.listSections(projectId),
        api.listMaterials(projectId),
        api.listWorks(projectId),
        api.listKhoan(projectId),
      ]);
      setSections(sec.sections);
      setMaterials(mat.items);
      setWorks(wk.items);
      setKhoan(kh.items);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // AI ghi DB trong lúc popup mở → đóng popup thì tải lại.
  const closeAi = () => {
    setAiOpen(false);
    void loadAll();
  };

  const matTotal = useMemo(() => materials.reduce((s, m) => s + amountOf(m), 0), [materials]);
  const laborTotal = useMemo(() => works.reduce((s, w) => s + w.laborAmount, 0), [works]);
  const khoanTotal = useMemo(() => khoan.reduce((s, k) => s + k.value, 0), [khoan]); // dự toán cũ
  const ncTotal = laborTotal + khoanTotal;
  const grand = matTotal + ncTotal;
  const vtPct = grand ? Math.round((matTotal / grand) * 100) : 0;
  const ncPct = grand ? 100 - vtPct : 0;

  // gộp theo PHẦN: công tác (kèm VT tiêu hao) + VT lẻ chưa gắn công tác
  const ctGroups = useMemo<CtGroup[]>(() => {
    const map = new Map<string, CtGroup>();
    const ensure = (sectionId: string | null, name: string | null, kind: SectionKind | null) => {
      const key = sectionId ?? "__none";
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          sectionId,
          name: name ?? "Chưa gán phần",
          kind,
          sortOrder: Number.MAX_SAFE_INTEGER,
          works: [],
          loose: [],
          vt: 0,
          nc: 0,
        };
        map.set(key, g);
      }
      return g;
    };
    for (const s of sections) ensure(s.id, s.name, s.kind).sortOrder = s.sortOrder;
    const secById = new Map(sections.map((s) => [s.id, s]));
    const rowById = new Map<string, WorkRow>();
    for (const w of works) {
      const s = w.sectionId ? secById.get(w.sectionId) : undefined;
      const g = ensure(s ? s.id : null, s?.name ?? null, s?.kind ?? null);
      const row: WorkRow = { ...w, mats: [], vt: 0 };
      g.works.push(row);
      g.nc += w.laborAmount;
      rowById.set(w.id, row);
    }
    for (const m of materials) {
      const row = m.workId ? rowById.get(m.workId) : undefined;
      if (row) {
        row.mats.push(m);
        row.vt += amountOf(m);
        const w = works.find((x) => x.id === row.id);
        const s = w?.sectionId ? secById.get(w.sectionId) : undefined;
        ensure(s ? s.id : null, s?.name ?? null, s?.kind ?? null).vt += amountOf(m);
      } else {
        const g = ensure(m.sectionId, m.sectionName, m.sectionKind);
        g.loose.push(m);
        g.vt += amountOf(m);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
  }, [materials, sections, works]);

  const workRowById = useMemo(() => {
    const m = new Map<string, WorkRow>();
    ctGroups.forEach((g) => g.works.forEach((w) => m.set(w.id, w)));
    return m;
  }, [ctGroups]);

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
  // gán 1 VT lẻ vào PHẦN (hoặc bỏ gán)
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
  // sửa KL / đơn giá khoán NC 1 công tác
  const saveWork = async (id: string, patch: { quantity?: number; laborPrice?: number }) => {
    setWorks((rows) =>
      rows.map((r) => {
        if (r.id !== id) return r;
        const n = { ...r, ...patch };
        return { ...n, laborAmount: Math.round(n.quantity * n.laborPrice) };
      }),
    );
    try {
      await api.patchWork(id, patch);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const delWork = async (w: WorkRow) => {
    if (
      !window.confirm(
        `Xoá công tác “${w.name}”?\n${w.mats.length} vật tư tiêu hao của công tác cũng bị xoá.`,
      )
    )
      return;
    try {
      await api.delWork(w.id);
      setSheet(null);
      setWorks((rows) => rows.filter((r) => r.id !== w.id));
      setMaterials((rows) => rows.filter((r) => r.workId !== w.id));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  // lưu giá trị 1 HĐ khoán (dự toán cũ)
  const saveKhoanValue = async (id: string, value: number) => {
    setKhoan((rows) => rows.map((r) => (r.id === id ? { ...r, value } : r)));
    try {
      await api.patchKhoan(id, { value });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const looseOf = (key: string): LooseGroup | undefined => {
    const g = ctGroups.find((x) => x.key === key);
    return g ? { name: g.name, kind: g.kind, mats: g.loose } : undefined;
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
              🤖 AI bóc dự toán
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
        <div className="dt-meta">Khối lượng → khoán nhân công + vật tư tiêu hao · AI bóc &amp; ghi</div>

        {err && (
          <div className="dt-formula" style={{ marginTop: 12, color: "#b91c1c" }}>
            Lỗi: {err}
          </div>
        )}

        {/* THÔNG SỐ DỰ TOÁN */}
        <div className="dt-sum">
          <div className="k">Tổng giá vốn dự toán</div>
          <div className="tot">
            {fmt(grand)}
            <span className="u">đ</span>
          </div>
          <div className="note">Vật tư (giá NCC) + nhân công khoán gọn gồm máy · chưa gồm VAT</div>
          <div className="dt-split">
            <div className="c vt">
              <div className="sk">Vật tư</div>
              <div className="sv">{fmt(matTotal)}</div>
              <div className="sp">
                {vtPct}% · {vtGroups.length} chủng loại
              </div>
            </div>
            <div className="c kh">
              <div className="sk">Khoán nhân công</div>
              <div className="sv">{fmt(ncTotal)}</div>
              <div className="sp">
                {ncPct}% · {works.length} công tác
              </div>
            </div>
          </div>
          {grand > 0 && (
            <div className="dt-track">
              <i style={{ width: `${vtPct}%`, background: "var(--dt-terra)" }} />
              <i style={{ width: `${ncPct}%`, background: "var(--dt-orange)" }} />
            </div>
          )}
        </div>

        {/* TABS */}
        <div className="dt-tabs">
          {TABS.map((t) => {
            const n = t.key === "vt" ? vtGroups.length : works.length;
            const unit = t.key === "vt" ? "loại" : t.key === "nc" ? fmt(ncTotal) + " đ" : "công tác";
            return (
              <button
                key={t.key}
                className={"dt-tab" + (tab === t.key ? " on" : "")}
                onClick={() => selectTab(t.key)}
              >
                <span>{t.label}</span>
                <span className="tn">{t.key === "nc" ? unit : `${n} ${unit}`}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="dt-empty">Đang tải…</div>
        ) : tab === "ct" ? (
          <CongTacPanel
            groups={ctGroups}
            total={grand}
            onOpenWork={(id) => setSheet({ kind: "work", id })}
            onOpenLoose={(key) => setSheet({ kind: "loose", id: key })}
            onManage={() => setManageOpen(true)}
          />
        ) : tab === "vt" ? (
          <VatTuPanel superGroups={vtSuperGroups} total={matTotal} onOpen={(id) => setSheet({ kind: "vt", id })} />
        ) : (
          <NhanCongPanel
            groups={ctGroups}
            laborTotal={laborTotal}
            khoan={khoan}
            khoanTotal={khoanTotal}
            onOpenWork={(id) => setSheet({ kind: "work", id })}
            onOpenKhoan={(id) => setSheet({ kind: "kh", id })}
          />
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
              {sheet.kind === "work" && (
                <WorkSheet
                  work={workRowById.get(sheet.id)}
                  sectionName={
                    ctGroups.find((g) => g.works.some((w) => w.id === sheet.id))?.name ?? ""
                  }
                  onClose={() => setSheet(null)}
                  onSaveWork={saveWork}
                  onSavePrice={saveMatPrice}
                  onDelete={delWork}
                />
              )}
              {sheet.kind === "loose" && (
                <CtSheet
                  group={looseOf(sheet.id)}
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
                onChanged={loadAll}
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
          <div className="dt-ai-scrim" onClick={closeAi}>
            <div className="dt-ai-box" onClick={(e) => e.stopPropagation()}>
              <div className="dt-ai-head">
                <b>🤖 AI bóc dự toán — {projectCode}</b>
                <button type="button" className="x" onClick={closeAi} aria-label="Đóng">
                  ✕
                </button>
              </div>
              <iframe
                src={`https://huynhgia6.com/claude/chat?arg=dutoan-${encodeURIComponent(projectCode)}`}
                title="AI bóc dự toán"
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
const sortGroups = (groups: CtGroup[]) =>
  [...groups].sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.sortOrder - b.sortOrder);

// Tab Công tác: Loại (thô/hoàn thiện) ▸ PHẦN ▸ công tác (TT NC + VT).
function CongTacPanel({
  groups,
  total,
  onOpenWork,
  onOpenLoose,
  onManage,
}: {
  groups: CtGroup[];
  total: number;
  onOpenWork: (id: string) => void;
  onOpenLoose: (key: string) => void;
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
        <div className="dt-empty">Chưa có PHẦN nào. Bấm “Quản lý phần” để tạo theo HĐTK, rồi dùng 🤖 AI bóc công tác.</div>
      </div>
    );

  const kindTotal = new Map<SectionKind | null, number>();
  for (const g of groups) kindTotal.set(g.kind, (kindTotal.get(g.kind) ?? 0) + g.vt + g.nc);

  let lastKind: SectionKind | null | undefined = undefined;
  let idx = 0;
  return (
    <div>
      {manageBtn}
      {sortGroups(groups).map((g) => {
        const header =
          g.kind !== lastKind ? (
            <div className="dt-phead">
              <span className="pi">{kindLabel(g.kind)}</span>
              <span className="pn" />
              <span className="pt dt-num">{fmt(kindTotal.get(g.kind) ?? 0)}</span>
            </div>
          ) : null;
        lastKind = g.kind;
        return (
          <div key={g.key}>
            {header}
            <div className="dt-sec">
              <span className="sn">{g.name}</span>
              <span className="sv dt-num">
                NC {fmt(g.nc)} · VT {fmt(g.vt)}
              </span>
            </div>
            {g.works.length === 0 && g.loose.length === 0 && (
              <div className="dt-secempty">Chưa có công tác</div>
            )}
            {g.works.map((w) => {
              idx++;
              return (
                <button className="dt-row" key={w.id} onClick={() => onOpenWork(w.id)}>
                  <span className="stt dt-num">{idx}</span>
                  <span className="rb">
                    <span className="r1">
                      <span className="rn">{w.name}</span>
                      <span className="rav dt-num">{fmt(w.laborAmount + w.vt)}</span>
                    </span>
                    <span className="r2">
                      <span className="rs">
                        <b className="dt-num">{qfmt(w.quantity, w.unit)}</b>
                        {w.location ? " · " + w.location : ""}
                      </span>
                      <span className="rau">
                        NC {fmt(w.laborAmount)} · VT {fmt(w.vt)}
                      </span>
                    </span>
                  </span>
                  <span className="chev">›</span>
                </button>
              );
            })}
            {g.loose.length > 0 && (
              <button className="dt-row" onClick={() => onOpenLoose(g.key)}>
                <span className="stt dt-num">·</span>
                <span className="rb">
                  <span className="r1">
                    <span className="rn">Vật tư chưa gắn công tác</span>
                    <span className="rav dt-num">{fmt(g.loose.reduce((s, m) => s + amountOf(m), 0))}</span>
                  </span>
                  <span className="r2">
                    <span className="rs">{g.loose.length} vật tư</span>
                    <span className="rau">vật tư</span>
                  </span>
                </span>
                <span className="chev">›</span>
              </button>
            )}
          </div>
        );
      })}
      <div className="dt-gstrip">
        <span className="gk">Tổng giá vốn</span>
        <span className="gv dt-num">
          {fmt(total)}
          <span className="u">đ</span>
        </span>
      </div>
    </div>
  );
}

// Tab Nhân công: bảng KL × đơn giá khoán từng công tác → tổng giá trị khoán (căn cứ HĐ nhân công).
function NhanCongPanel({
  groups,
  laborTotal,
  khoan,
  khoanTotal,
  onOpenWork,
  onOpenKhoan,
}: {
  groups: CtGroup[];
  laborTotal: number;
  khoan: Khoan[];
  khoanTotal: number;
  onOpenWork: (id: string) => void;
  onOpenKhoan: (id: string) => void;
}) {
  const withWorks = sortGroups(groups).filter((g) => g.works.length > 0);
  return (
    <div>
      {withWorks.length === 0 ? (
        <div className="dt-empty">Chưa có công tác. Dùng 🤖 AI bóc khối lượng + đơn giá khoán.</div>
      ) : (
        <table className="dt-t dt-nc">
          <thead>
            <tr>
              <th>Công tác</th>
              <th className="r">KL × đơn giá</th>
              <th className="r">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {withWorks.map((g) => [
              <tr className="grp" key={"g-" + g.key}>
                <td colSpan={2}>{g.name}</td>
                <td className="r">{fmt(g.nc)}</td>
              </tr>,
              ...g.works.map((w) => (
                <tr key={w.id} className="clk" onClick={() => onOpenWork(w.id)}>
                  <td>
                    <div className="dn">{w.name}</div>
                    {w.location && <div className="dsub">{w.location}</div>}
                  </td>
                  <td className="r">
                    {qfmt(w.quantity, w.unit)}
                    <div className="dsub">× {fmt(w.laborPrice)}</div>
                  </td>
                  <td className="r amt">{fmt(w.laborAmount)}</td>
                </tr>
              )),
            ])}
          </tbody>
          <tfoot>
            <tr>
              <td className="tk" colSpan={2}>
                Tổng giá trị khoán
              </td>
              <td className="r">{fmt(laborTotal)} đ</td>
            </tr>
          </tfoot>
        </table>
      )}

      {khoan.length > 0 && (
        <>
          <div className="dt-phead">
            <span className="pi">Cũ</span>
            <span className="pn">Khoán trọn gói (dự toán cũ)</span>
            <span className="pt dt-num">{fmt(khoanTotal)}</span>
          </div>
          <KhoanPanel rows={khoan} total={khoanTotal} onOpen={onOpenKhoan} />
        </>
      )}
      <p className="dt-ephelp" style={{ marginTop: 14 }}>
        Đơn giá khoán gọn (gồm máy móc thiết bị) theo giá khu vực. Lập HĐ nhân công ở màn Hợp đồng thầu phụ.
      </p>
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

// Chi tiết 1 công tác: KL + đơn giá khoán (sửa được) + VT tiêu hao (giá NCC).
function WorkSheet({
  work,
  sectionName,
  onClose,
  onSaveWork,
  onSavePrice,
  onDelete,
}: {
  work?: WorkRow;
  sectionName: string;
  onClose: () => void;
  onSaveWork: (id: string, patch: { quantity?: number; laborPrice?: number }) => void;
  onSavePrice: (id: string, price: number) => void;
  onDelete: (w: WorkRow) => void;
}) {
  if (!work) return <SheetHead eye="Công tác" title="—" onClose={onClose} />;
  return (
    <>
      <SheetHead eye={`Công tác · ${sectionName}`} title={work.name} onClose={onClose} />
      <div className="dt-sbody">
        <div className="dt-kpi">
          <div className="ki">
            <div className="kk">Khối lượng</div>
            <div className="kv" style={{ fontSize: 13 }}>
              <PriceCell decimal value={work.quantity} onSave={(v) => onSaveWork(work.id, { quantity: v })} />
              <div className="dsub">{work.unit}</div>
            </div>
          </div>
          <div className="ki">
            <div className="kk">ĐG khoán NC</div>
            <div className="kv" style={{ fontSize: 13 }}>
              <PriceCell value={work.laborPrice} onSave={(v) => onSaveWork(work.id, { laborPrice: v })} />
              <div className="dsub">đ/{work.unit}</div>
            </div>
          </div>
          <div className="ki">
            <div className="kk">TT nhân công</div>
            <div className="kv hl">{fmt(work.laborAmount)}</div>
          </div>
        </div>
        <p className="dt-ephelp">Chạm khối lượng / đơn giá để sửa · bấm ra ngoài để lưu</p>

        {work.location && (
          <>
            <div className="dt-blabel">Vị trí · diễn giải khối lượng</div>
            <div className="dt-prose">{work.location}</div>
          </>
        )}
        {work.note && (
          <>
            <div className="dt-blabel">Ghi chú</div>
            <div className="dt-prose lead">{work.note}</div>
          </>
        )}

        <div className="dt-blabel">Vật tư tiêu hao ({work.mats.length})</div>
        {work.mats.length === 0 ? (
          <div className="dt-empty">Công tác chỉ có nhân công.</div>
        ) : (
          <table className="dt-t">
            <thead>
              <tr>
                <th>Vật tư · SL</th>
                <th className="r">Đơn giá</th>
                <th className="r">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {work.mats.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="dn">{m.name}</div>
                    <div className="dsub">
                      {qfmt(m.quantity, m.unit)}
                      {m.supplierName ? " · giá " + m.supplierName : ""}
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
                <td className="r">{fmt(work.vt)} đ</td>
              </tr>
            </tfoot>
          </table>
        )}

        <button type="button" className="dt-delwork" onClick={() => onDelete(work)}>
          🗑 Xoá công tác
        </button>
      </div>
    </>
  );
}

// VT lẻ chưa gắn công tác trong 1 phần (dự toán cũ).
function CtSheet({
  group,
  sections,
  onClose,
  onSavePrice,
  onSaveSection,
}: {
  group?: LooseGroup;
  sections: Section[];
  onClose: () => void;
  onSavePrice: (id: string, price: number) => void;
  onSaveSection: (id: string, sectionId: string | null) => void;
}) {
  if (!group) return <SheetHead eye="Phần" title="—" onClose={onClose} />;
  const sub = group.mats.reduce((s, m) => s + amountOf(m), 0);
  return (
    <>
      <SheetHead eye={`VT chưa gắn công tác · ${kindLabel(group.kind)}`} title={group.name} onClose={onClose} />
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
  if (!khoan) return <SheetHead eye="Khoán (dự toán cũ)" title="—" onClose={onClose} />;
  return (
    <>
      <SheetHead eye="Khoán (dự toán cũ)" title={khoan.name} onClose={onClose} />
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
    if (!window.confirm(`Xoá phần “${s.name}”?\nCông tác + vật tư trong phần sẽ về “chưa gán phần” (không mất).`)) return;
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
