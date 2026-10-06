"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { ctNorm, matchesKeywords, type CtCrit, type CtPhase, type CtTask } from "@/lib/construction-technique";
import type { CtRow } from "@/lib/construction-technique-db";
import "./ky-thuat.css";

// PC (≥ 900px): 2 cột — danh sách hạng mục bên trái, chi tiết / form sửa bên phải.
// Mobile: danh sách → bấm vào hạng mục mở màn chi tiết toàn màn (nút ‹ quay lại).

type Draft = {
  id: string | null;
  code: string;
  name: string;
  phase: CtPhase;
  matchKeywords: string;
  vtKeywords: string;
  standards: string;
  note: string;
  isActive: boolean;
  tasks: { title: string; when: string; steps: string; criteria: CtCrit[]; notes: string }[];
};

const PHASES: { key: CtPhase; label: string }[] = [
  { key: "tho", label: "Phần thô" },
  { key: "ht", label: "Hoàn thiện" },
];

const toDraft = (r: CtRow | null): Draft =>
  r
    ? {
        id: r.id,
        code: r.code,
        name: r.name,
        phase: r.phase,
        matchKeywords: r.matchKeywords,
        vtKeywords: r.vtKeywords,
        standards: r.standards,
        note: r.note,
        isActive: r.isActive,
        tasks: r.tasks.map((t) => ({
          title: t.title,
          when: t.when,
          steps: t.steps.join("\n"),
          criteria: t.criteria.map((c) => ({ ...c })),
          notes: t.notes.join("\n"),
        })),
      }
    : {
        id: null,
        code: "",
        name: "",
        phase: "tho",
        matchKeywords: "",
        vtKeywords: "",
        standards: "",
        note: "",
        isActive: true,
        tasks: [{ title: "", when: "", steps: "", criteria: [{ noi: "", yc: "" }], notes: "" }],
      };

const lines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.replace(/^\s*(\d+[.)]|[-•])\s*/, "").trim())
    .filter(Boolean);

const fromDraft = (d: Draft) => ({
  code: d.code,
  name: d.name,
  phase: d.phase,
  matchKeywords: d.matchKeywords,
  vtKeywords: d.vtKeywords,
  standards: d.standards,
  note: d.note,
  isActive: d.isActive,
  tasks: d.tasks.map(
    (t): CtTask => ({
      title: t.title.trim(),
      when: t.when.trim(),
      steps: lines(t.steps),
      criteria: t.criteria.filter((c) => c.noi.trim() || c.yc.trim()),
      notes: lines(t.notes),
    }),
  ),
});

const move = <T,>(a: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= a.length) return a;
  const b = a.slice();
  [b[i], b[j]] = [b[j], b[i]];
  return b;
};

export function KyThuatClient({ initial, canEdit }: { initial: CtRow[]; canEdit: boolean }) {
  const [rows, setRows] = useState<CtRow[]>(initial);
  const [selId, setSelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [probe, setProbe] = useState("");
  const [theme, setTheme] = useState<string | undefined>(undefined);
  const [isPc, setIsPc] = useState(false);

  useEffect(() => {
    try {
      const t = localStorage.getItem("hdm-theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {}
    const mq = window.matchMedia("(min-width: 900px)");
    const on = () => setIsPc(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  // PC: luôn có 1 hạng mục đang xem ở cột phải
  useEffect(() => {
    if (isPc && !selId && !draft && rows.length) setSelId(rows[0].id);
  }, [isPc, selId, draft, rows]);

  // mobile: mở / đóng chi tiết → về đầu trang
  const editing = !!draft;
  useEffect(() => {
    if (!isPc) window.scrollTo(0, 0);
  }, [selId, editing, isPc]);

  const toggleTheme = () => {
    const dark = theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const next = dark ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("hdm-theme", next);
    } catch {}
  };

  const reload = async (keepId?: string | null) => {
    const res = await fetch("/api/construction-techniques", { cache: "no-store" });
    if (!res.ok) return;
    const j = (await res.json()) as { techniques: CtRow[] };
    const list = canEdit ? j.techniques : j.techniques.filter((t) => t.isActive);
    setRows(list);
    if (keepId !== undefined) setSelId(keepId);
  };

  const sel = rows.find((r) => r.id === selId) ?? null;
  const nq = ctNorm(q);
  const shown = rows.filter(
    (r) =>
      !nq ||
      ctNorm(
        [r.code, r.name, r.matchKeywords, ...r.tasks.map((t) => `${t.title} ${t.steps.join(" ")} ${t.criteria.map((c) => c.noi).join(" ")}`)].join(
          " ",
        ),
      ).includes(nq),
  );
  // Thử khớp: tên hạng mục HĐ → mẫu nào (giống HD thi công: mẫu đầu tiên theo thứ tự)
  const probeHit = useMemo(() => {
    const p = probe.trim().replace(/^phần\s+/i, "");
    if (!p) return undefined;
    return rows.find((r) => r.isActive && r.matchKeywords.trim() && matchesKeywords(p, r.matchKeywords)) ?? null;
  }, [probe, rows]);

  const openRow = (id: string) => {
    if (draft && !window.confirm("Đang sửa dở — bỏ thay đổi?")) return;
    setDraft(null);
    setSelId(id);
  };
  const startNew = () => {
    if (draft && !window.confirm("Đang sửa dở — bỏ thay đổi?")) return;
    setSelId(null);
    setDraft(toDraft(null));
  };
  const closeDetail = () => {
    if (draft && !window.confirm("Đang sửa dở — bỏ thay đổi?")) return;
    setDraft(null);
    if (!isPc) setSelId(null);
  };

  const save = async () => {
    if (!draft) return;
    const body = fromDraft(draft);
    if (!body.code.trim() || !body.name.trim()) return toast.error("Nhập mã và tên hạng mục");
    if (!body.tasks.length) return toast.error("Cần ít nhất 1 công tác con");
    setSaving(true);
    try {
      const res = await fetch(draft.id ? `/api/construction-techniques/${draft.id}` : "/api/construction-techniques", {
        method: draft.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) throw new Error(j.message || "Lưu thất bại");
      toast.success("Đã lưu mẫu — HD thi công các dự án cập nhật theo");
      const id = draft.id ?? j.id ?? null;
      setDraft(null);
      await reload(id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: CtRow) => {
    const ok = await confirmDialog({
      title: "Xoá mẫu kỹ thuật?",
      message: `Xoá hẳn "${r.name}" (${r.tasks.length} công tác). HD thi công các dự án có hạng mục khớp mẫu này sẽ về điểm dừng chung. Muốn tạm tắt thì dùng "Ngưng dùng" thay vì xoá.`,
      confirmText: "Xoá",
    });
    if (!ok) return;
    const res = await fetch(`/api/construction-techniques/${r.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Xoá thất bại");
    toast.success("Đã xoá");
    setDraft(null);
    await reload(null);
  };

  const reorder = async (r: CtRow, d: number) => {
    const i = rows.findIndex((x) => x.id === r.id);
    const next = move(rows, i, d);
    if (next === rows) return;
    setRows(next);
    const res = await fetch("/api/construction-techniques/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((x) => x.id) }),
    });
    if (!res.ok) toast.error("Đổi thứ tự thất bại");
    await reload();
  };

  const detailOpen = !!draft || !!sel;
  const taskCount = rows.reduce((s, r) => s + (r.isActive ? r.tasks.length : 0), 0);

  return (
    <div className="ktc-app" data-theme={theme} data-detail={detailOpen ? "1" : "0"}>
      <div className="ktc-wrap">
        {/* ───── Cột trái: danh sách ───── */}
        <aside className="ktc-side">
          <div className="ktc-top">
            <div>
              <div className="ktc-eyebrow">Thư viện mẫu · toàn công ty</div>
              <h1 className="ktc-h1">Kỹ thuật thi công</h1>
              <div className="ktc-meta">
                {rows.filter((r) => r.isActive).length} hạng mục · {taskCount} công tác con · nguồn của HD thi công
              </div>
            </div>
            <button type="button" className="ktc-btn icon" onClick={toggleTheme} aria-label="Đổi nền">
              ◑
            </button>
          </div>

          <div className="ktc-tools">
            <input className="ktc-search" placeholder="Tìm hạng mục, công tác, tiêu chí…" value={q} onChange={(e) => setQ(e.target.value)} />
            {canEdit && (
              <button type="button" className="ktc-btn pri" onClick={startNew}>
                + Mẫu
              </button>
            )}
          </div>

          {PHASES.map((ph) => {
            const list = shown.filter((r) => r.phase === ph.key);
            if (!list.length) return null;
            return (
              <div key={ph.key}>
                <div className="ktc-sec">{ph.label}</div>
                <ul className="ktc-list">
                  {list.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className={"ktc-li" + (r.id === selId && !draft ? " on" : "") + (r.isActive ? "" : " off")}
                        onClick={() => openRow(r.id)}
                      >
                        <span className="ktc-code">{r.code}</span>
                        <span className="ktc-li-t">
                          <span className="nm">{r.name}</span>
                          <span className="sub">
                            {r.tasks.length} công tác
                            {!r.isActive && " · ngưng dùng"}
                          </span>
                        </span>
                        <span className="ktc-chev" aria-hidden>
                          ›
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {shown.length === 0 && <div className="ktc-empty">Không có mẫu khớp.</div>}

          <div className="ktc-probe">
            <b>Thử khớp tên hạng mục HĐ</b>
            <input className="ktc-search" placeholder="VD: Phần móng, Sơn nước…" value={probe} onChange={(e) => setProbe(e.target.value)} />
            {probeHit !== undefined && (
              <p>
                {probeHit ? (
                  <>
                    → dùng mẫu{" "}
                    <button type="button" className="ktc-link" onClick={() => openRow(probeHit.id)}>
                      {probeHit.code} · {probeHit.name}
                    </button>
                  </>
                ) : (
                  <>→ không khớp mẫu nào: HD thi công dùng điểm dừng chung. Thêm từ khoá vào mẫu phù hợp.</>
                )}
              </p>
            )}
          </div>
        </aside>

        {/* ───── Cột phải: chi tiết / form ───── */}
        <main className="ktc-main">
          {draft ? (
            <EditForm draft={draft} setDraft={setDraft} saving={saving} onSave={save} onCancel={closeDetail} />
          ) : sel ? (
            <Detail
              r={sel}
              canEdit={canEdit}
              idx={rows.findIndex((x) => x.id === sel.id)}
              total={rows.length}
              onBack={closeDetail}
              onEdit={() => setDraft(toDraft(sel))}
              onRemove={() => remove(sel)}
              onMove={(d) => reorder(sel, d)}
            />
          ) : (
            <div className="ktc-empty">Chọn 1 hạng mục bên trái để xem kỹ thuật thi công.</div>
          )}
        </main>
      </div>
    </div>
  );
}

function Detail({
  r,
  canEdit,
  idx,
  total,
  onBack,
  onEdit,
  onRemove,
  onMove,
}: {
  r: CtRow;
  canEdit: boolean;
  idx: number;
  total: number;
  onBack: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onMove: (d: number) => void;
}) {
  return (
    <div className="ktc-detail">
      <div className="ktc-dtop">
        <button type="button" className="ktc-back" onClick={onBack}>
          ‹ Danh sách
        </button>
        {canEdit && (
          <div className="ktc-acts">
            <button type="button" className="ktc-btn icon" disabled={idx <= 0} onClick={() => onMove(-1)} title="Lên (ưu tiên khớp trước)">
              ↑
            </button>
            <button type="button" className="ktc-btn icon" disabled={idx >= total - 1} onClick={() => onMove(1)} title="Xuống">
              ↓
            </button>
            <button type="button" className="ktc-btn" onClick={onRemove}>
              Xoá
            </button>
            <button type="button" className="ktc-btn pri" onClick={onEdit}>
              Sửa
            </button>
          </div>
        )}
      </div>

      <div className="ktc-eyebrow">
        {r.code} · {r.phase === "ht" ? "Hoàn thiện" : "Phần thô"}
        {!r.isActive && <span className="ktc-tag off">Ngưng dùng</span>}
      </div>
      <h2 className="ktc-h2">{r.name}</h2>

      <div className="ktc-info">
        <div>
          <b>Khớp tên hạng mục HĐ chứa</b>
          {r.matchKeywords ? (
            <span className="ktc-kws">
              {r.matchKeywords.split(/[,;\n|]+/).map((k) => k.trim()).filter(Boolean).map((k) => (
                <span key={k}>{k}</span>
              ))}
            </span>
          ) : (
            <span className="mut">— chưa có từ khoá, không tự áp dụng</span>
          )}
        </div>
        {r.vtKeywords && (
          <div>
            <b>Vật tư HĐ hiển thị</b>
            <span>{r.vtKeywords}</span>
          </div>
        )}
        {r.standards && (
          <div>
            <b>Tiêu chuẩn tham chiếu</b>
            <span>{r.standards}</span>
          </div>
        )}
        {r.note && (
          <div>
            <b>Ghi chú</b>
            <span className="pre">{r.note}</span>
          </div>
        )}
      </div>

      <div className="ktc-sec">Công tác con · điểm dừng nghiệm thu</div>
      {r.tasks.map((t, i) => (
        <section key={i} className="ktc-task">
          <div className="ktc-th">
            <span className="ktc-badge">{i + 1}</span>
            <span className="ktc-tt">{t.title}</span>
          </div>
          {t.when && (
            <div className="ktc-when">
              Chỉ áp dụng khi phạm vi HĐ có: <b>{t.when}</b>
            </div>
          )}
          <div className="ktc-cols">
            <div className="ktc-steps">
              <h4>Trình tự thi công</h4>
              {t.steps.length ? (
                <ol>
                  {t.steps.map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ol>
              ) : (
                <p className="mut">Chưa nhập.</p>
              )}
              {t.notes.length > 0 && (
                <div className="ktc-notes">
                  <h4>Lưu ý</h4>
                  {t.notes.map((n, j) => (
                    <p key={j}>• {n}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="ktc-crit">
              <h4>Tiêu chí nghiệm thu</h4>
              <ol>
                {t.criteria.map((c, j) => (
                  <li key={j}>
                    <b>{c.noi}</b>
                    <span>{c.yc}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function EditForm({
  draft,
  setDraft,
  saving,
  onSave,
  onCancel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  const setTask = (i: number, patch: Partial<Draft["tasks"][number]>) =>
    set(
      "tasks",
      draft.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)),
    );
  const setCrit = (i: number, k: number, patch: Partial<CtCrit>) =>
    setTask(i, { criteria: draft.tasks[i].criteria.map((c, j) => (j === k ? { ...c, ...patch } : c)) });

  const delTask = async (i: number) => {
    const ok = await confirmDialog({ message: `Xoá công tác "${draft.tasks[i].title || i + 1}" khỏi mẫu?`, confirmText: "Xoá" });
    if (ok) set("tasks", draft.tasks.filter((_, j) => j !== i));
  };

  return (
    <div className="ktc-detail ktc-form">
      <div className="ktc-dtop">
        <button type="button" className="ktc-back" onClick={onCancel}>
          ‹ Huỷ
        </button>
        <div className="ktc-acts">
          <button type="button" className="ktc-btn pri" disabled={saving} onClick={onSave}>
            {saving ? "Đang lưu…" : "Lưu mẫu"}
          </button>
        </div>
      </div>
      <div className="ktc-eyebrow">{draft.id ? "Sửa mẫu" : "Mẫu mới"}</div>

      <div className="ktc-grid">
        <label>
          <span>Mã</span>
          <input value={draft.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="VD MONG, XAY-TO" />
        </label>
        <label className="w2">
          <span>Tên hạng mục</span>
          <input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="VD Nền móng" />
        </label>
        <label>
          <span>Nhóm</span>
          <select value={draft.phase} onChange={(e) => set("phase", e.target.value as CtPhase)}>
            {PHASES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="w4">
          <span>Từ khoá khớp tên hạng mục HĐ (cách nhau dấu phẩy, có/không dấu đều được)</span>
          <input value={draft.matchKeywords} onChange={(e) => set("matchKeywords", e.target.value)} placeholder="VD nền móng, móng" />
        </label>
        <label className="w4">
          <span>Lọc vật tư HĐ hiển thị (để trống = tất cả vật tư của hạng mục)</span>
          <input value={draft.vtKeywords} onChange={(e) => set("vtKeywords", e.target.value)} placeholder="VD bê tông, thép, gạch" />
        </label>
        <label className="w4">
          <span>Tiêu chuẩn tham chiếu</span>
          <input value={draft.standards} onChange={(e) => set("standards", e.target.value)} placeholder="VD TCVN 4453:1995" />
        </label>
        <label className="w4">
          <span>Ghi chú chung</span>
          <textarea rows={2} value={draft.note} onChange={(e) => set("note", e.target.value)} />
        </label>
        <label className="ktc-check w4">
          <input type="checkbox" checked={draft.isActive} onChange={(e) => set("isActive", e.target.checked)} />
          <span>Đang dùng (bỏ tick = ngưng, HD thi công không áp mẫu này)</span>
        </label>
      </div>

      <div className="ktc-sec">Công tác con ({draft.tasks.length})</div>
      {draft.tasks.map((t, i) => (
        <section key={i} className="ktc-task edit">
          <div className="ktc-th">
            <span className="ktc-badge">{i + 1}</span>
            <input
              className="ktc-tt-in"
              value={t.title}
              onChange={(e) => setTask(i, { title: e.target.value })}
              placeholder="Tên công tác / điểm dừng, VD Cốp pha + cốt thép móng"
            />
            <span className="ktc-acts">
              <button type="button" className="ktc-btn icon" disabled={i === 0} onClick={() => set("tasks", move(draft.tasks, i, -1))}>
                ↑
              </button>
              <button
                type="button"
                className="ktc-btn icon"
                disabled={i === draft.tasks.length - 1}
                onClick={() => set("tasks", move(draft.tasks, i, 1))}
              >
                ↓
              </button>
              <button type="button" className="ktc-btn icon" onClick={() => delTask(i)} aria-label="Xoá công tác">
                ✕
              </button>
            </span>
          </div>
          <div className="ktc-grid in">
            <label className="w4">
              <span>Chỉ áp dụng khi phạm vi HĐ có từ khoá (để trống = luôn áp dụng)</span>
              <input value={t.when} onChange={(e) => setTask(i, { when: e.target.value })} placeholder="VD bể phốt, tự hoại" />
            </label>
            <label className="w2">
              <span>Trình tự thi công — mỗi dòng 1 bước</span>
              <textarea rows={6} value={t.steps} onChange={(e) => setTask(i, { steps: e.target.value })} />
            </label>
            <label className="w2">
              <span>Lưu ý / lỗi hay gặp / an toàn — mỗi dòng 1 ý</span>
              <textarea rows={6} value={t.notes} onChange={(e) => setTask(i, { notes: e.target.value })} />
            </label>
          </div>
          <div className="ktc-critedit">
            <div className="hd">
              <span>Nội dung kiểm tra</span>
              <span>Yêu cầu / sai số cho phép</span>
              <span />
            </div>
            {t.criteria.map((c, k) => (
              <div key={k} className="row">
                <input value={c.noi} onChange={(e) => setCrit(i, k, { noi: e.target.value })} placeholder="Nội dung kiểm tra" />
                <input value={c.yc} onChange={(e) => setCrit(i, k, { yc: e.target.value })} placeholder="Yêu cầu / sai số" />
                <button
                  type="button"
                  className="ktc-btn icon"
                  onClick={() => setTask(i, { criteria: t.criteria.filter((_, j) => j !== k) })}
                  aria-label="Xoá tiêu chí"
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="ktc-btn" onClick={() => setTask(i, { criteria: [...t.criteria, { noi: "", yc: "" }] })}>
              + Tiêu chí
            </button>
          </div>
        </section>
      ))}
      <button
        type="button"
        className="ktc-btn wide"
        onClick={() => set("tasks", [...draft.tasks, { title: "", when: "", steps: "", criteria: [{ noi: "", yc: "" }], notes: "" }])}
      >
        + Công tác con
      </button>
      <div className="ktc-savebar">
        <button type="button" className="ktc-btn" onClick={onCancel}>
          Huỷ
        </button>
        <button type="button" className="ktc-btn pri" disabled={saving} onClick={onSave}>
          {saving ? "Đang lưu…" : "Lưu mẫu"}
        </button>
      </div>
    </div>
  );
}
