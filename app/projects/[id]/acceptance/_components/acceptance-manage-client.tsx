"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { plexSans, plexMono } from "@/lib/fonts";
import { SwipeLightbox } from "@/components/swipe-lightbox";
import "./nghiem-thu.css";

export type AcceptancePhotoItem = {
  key: string;
  contentType: string;
  name: string;
  uploadedBy: string;
  uploadedAt: string;
};

type Kind = "bien_ban" | "site" | "mau";

type Milestone = {
  id: string;
  seq: number;
  title: string;
  description: string | null;
  status: "pending" | "signed";
  signerName: string | null;
  signedAt: string | null;
  customerNote: string | null;
  hasSignature: boolean;
  bienBanPhotos: AcceptancePhotoItem[];
  sitePhotos: AcceptancePhotoItem[];
  templateFiles: AcceptancePhotoItem[];
  createdAt: string;
  creator: { fullName: string } | null;
};

type ProjectInfo = { code: string; name: string; customerName: string | null; statusLabel: string };

const emptyForm = { seq: "", title: "", description: "" };
const THUMBS = 4;

const fmtDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) : "";

// Màn Nghiệm thu: ký BB giấy tại công trình → KS/admin chụp BB đã ký + ảnh công trình đưa lên mốc.
// Admin + KS in BB mẫu (chủ nhà không thấy). Admin bấm tên mốc để sửa / xoá / đổi BB mẫu.
export function AcceptanceManageClient({
  projectId,
  project,
  canManage,
  userId,
  backHref,
  group = "chu_nha",
}: {
  projectId: string;
  project: ProjectInfo;
  canManage: boolean;
  userId: string;
  backHref: string;
  group?: "chu_nha" | "thau_phu";
}) {
  const [rows, setRows] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<string | null>(null); // "new" = tạo mốc, id = sửa mốc
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null); // `${milestoneId}:${kind}` đang tải lên
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); // dải ảnh đang mở hết
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [lightbox, setLightbox] = useState<{ imgs: string[]; idx: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<{ id: string; kind: Kind } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("nghiemthu-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* noop */
    }
  }, []);
  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("nghiemthu-theme", next);
      } catch {
        /* noop */
      }
      return next;
    });

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/acceptance?kind=${group}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Lỗi tải dữ liệu");
      setRows(j.milestones);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [projectId, group]);

  useEffect(() => {
    void load();
  }, [load]);

  const photoBase = (mid: string) => `/api/projects/${projectId}/acceptance/${mid}/photos`;
  const fileUrl = (mid: string, p: AcceptancePhotoItem) => `${photoBase(mid)}/file?key=${encodeURIComponent(p.key)}`;

  function pick(id: string, kind: Kind) {
    target.current = { id, kind };
    if (fileRef.current) {
      fileRef.current.accept = kind === "site" ? "image/*" : "image/*,application/pdf";
      fileRef.current.click();
    }
  }

  async function upload(files: FileList | null) {
    const t = target.current;
    if (!t || !files?.length) return;
    setBusyKey(`${t.id}:${t.kind}`);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      const r = await fetch(`${photoBase(t.id)}?kind=${t.kind}`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || "Tải lên thất bại");
      toast.success(j.message || "Đã tải lên");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tải lên thất bại");
    } finally {
      setBusyKey(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeFile(mid: string, kind: Kind, p: AcceptancePhotoItem) {
    if (!window.confirm(`Xoá file "${p.name}"?`)) return;
    const r = await fetch(`${photoBase(mid)}?kind=${kind}&key=${encodeURIComponent(p.key)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return void toast.error(j.message || "Không xoá được");
    toast.success(j.message || "Đã xoá");
    void load();
  }

  function openCreate() {
    const nextSeq = rows.reduce((m, r) => Math.max(m, r.seq), 0) + 1;
    setForm({ ...emptyForm, seq: String(nextSeq) });
    setPanel("new");
  }

  function openEdit(m: Milestone) {
    if (panel === m.id) return setPanel(null);
    setForm({ seq: String(m.seq), title: m.title, description: m.description ?? "" });
    setPanel(m.id);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        seq: Number(form.seq),
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        ...(panel === "new" ? { kind: group } : {}),
      };
      const editing = panel && panel !== "new" ? panel : null;
      const url = editing
        ? `/api/projects/${projectId}/acceptance/${editing}`
        : `/api/projects/${projectId}/acceptance`;
      const r = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Lỗi lưu");
      toast.success(j.message);
      setPanel(null);
      setForm(emptyForm);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi lưu");
    } finally {
      setSaving(false);
    }
  }

  async function remove(m: Milestone) {
    if (!window.confirm(`Xoá mốc #${m.seq} — ${m.title}?`)) return;
    const r = await fetch(`/api/projects/${projectId}/acceptance/${m.id}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) return void toast.error(j.message || "Không xoá được");
    toast.success(j.message);
    setPanel(null);
    void load();
  }

  const signedCount = rows.filter((m) => m.status === "signed").length;
  const nextPendingId = rows.find((m) => m.status !== "signed")?.id;

  // Dải ảnh: tối đa 4 ảnh + "+N" (bấm mở hết) + nút thêm. Nút × xoá: admin hoặc ảnh mình tải.
  const strip = (m: Milestone, kind: "bien_ban" | "site", photos: AcceptancePhotoItem[]) => {
    const k = `${m.id}:${kind}`;
    const all = expanded.has(k);
    const shown = all ? photos : photos.slice(0, THUMBS);
    return (
      <div className="ths">
        {photos.length === 0 && <span className="empty">Chưa có</span>}
        {shown.map((p) => (
          <div key={p.key} className="th">
            {p.contentType === "application/pdf" ? (
              <a href={fileUrl(m.id, p)} target="_blank" rel="noreferrer" title={p.name}>
                <span className="pdf">PDF</span>
              </a>
            ) : (
              <a
                href={fileUrl(m.id, p)}
                title={p.name}
                onClick={(e) => {
                  e.preventDefault();
                  const imgs = photos.filter((x) => x.contentType !== "application/pdf");
                  setLightbox({ imgs: imgs.map((x) => fileUrl(m.id, x)), idx: imgs.indexOf(p) });
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(m.id, p)} alt={p.name} loading="lazy" />
              </a>
            )}
            {(canManage || p.uploadedBy === userId) && (
              <button type="button" className="x" onClick={() => void removeFile(m.id, kind, p)} title="Xoá">
                ×
              </button>
            )}
          </div>
        ))}
        {!all && photos.length > THUMBS && (
          <button
            type="button"
            className="more"
            onClick={() => setExpanded((prev) => new Set(Array.from(prev).concat(k)))}
            title="Xem hết"
          >
            +{photos.length - THUMBS}
          </button>
        )}
        <button
          type="button"
          className="add"
          disabled={busyKey === k}
          onClick={() => pick(m.id, kind)}
          title={kind === "bien_ban" ? "Thêm ảnh BB đã ký" : "Thêm ảnh công trình"}
        >
          {busyKey === k ? "…" : "＋"}
        </button>
      </div>
    );
  };

  const formPanel = (m: Milestone | null) => (
    <form className="panel" onSubmit={submit}>
      <h3>{m ? `Sửa mốc #${m.seq}` : "Tạo mốc nghiệm thu"}</h3>
      <div className="fgrid">
        <label className="fld">
          <span>Số TT *</span>
          <input
            type="number"
            min={1}
            value={form.seq}
            onChange={(e) => setForm({ ...form, seq: e.target.value })}
            required
          />
        </label>
        <label className="fld">
          <span>Tên mốc *</span>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            placeholder="VD: Móng, giằng móng"
          />
        </label>
      </div>
      <label className="fld">
        <span>Mô tả / nội dung nghiệm thu</span>
        <textarea
          rows={2}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="VD: CT6 – CT9 theo bộ tài liệu giám sát"
        />
      </label>
      {m && (
        <div className="fld">
          <span>BB mẫu để in (chủ nhà không thấy)</span>
          <div className="mau-list">
            {m.templateFiles.map((p) => (
              <span key={p.key} className="mau-item">
                <a href={fileUrl(m.id, p)} target="_blank" rel="noreferrer">
                  🖨 {p.name}
                </a>
                <button type="button" onClick={() => void removeFile(m.id, "mau", p)} title="Xoá BB mẫu">
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              className="qbtn"
              disabled={busyKey === `${m.id}:mau`}
              onClick={() => pick(m.id, "mau")}
            >
              {busyKey === `${m.id}:mau` ? "Đang tải…" : "＋ BB mẫu"}
            </button>
          </div>
        </div>
      )}
      <div className="pacts">
        <button type="submit" className="btn pri" disabled={saving}>
          {saving ? "Đang lưu…" : m ? "Cập nhật" : "Tạo mốc"}
        </button>
        <button type="button" className="btn" onClick={() => setPanel(null)}>
          Đóng
        </button>
        {m && !m.hasSignature && (
          <button type="button" className="btn del" onClick={() => void remove(m)}>
            Xoá mốc
          </button>
        )}
      </div>
    </form>
  );

  return (
    <div className={`ntdoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} />
      <div className="wrap">
        <div className="topbar">
          <div className="brand">
            <Link href={backHref} className="iconbtn" aria-label="Quay lại">
              ←
            </Link>
            <div className="mark">HG</div>
            <div>
              <b>HUỲNH GIA</b>
              <span className="brand-sub">Nghiệm thu</span>
            </div>
          </div>
          <div className="tbtns">
            <button className="iconbtn" onClick={toggleTheme} type="button" aria-label="Đổi nền sáng/tối">
              ◑
            </button>
            {canManage && (
              <button className="iconbtn pri" onClick={openCreate} type="button" aria-label="Thêm mốc">
                ＋<span className="txt"> Mốc</span>
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, margin: "4px 0 10px" }}>
          <Link
            href={`/projects/${projectId}/acceptance`}
            className={`iconbtn${group === "chu_nha" ? " pri" : ""}`}
            style={{ width: "auto", padding: "0 12px" }}
          >
            Chủ nhà
          </Link>
          <Link
            href={`/projects/${projectId}/acceptance?kind=thau_phu`}
            className={`iconbtn${group === "thau_phu" ? " pri" : ""}`}
            style={{ width: "auto", padding: "0 12px" }}
          >
            Thầu phụ
          </Link>
        </div>

        <div className="eyebrow">
          Nghiệm thu {group === "thau_phu" ? "thầu phụ" : "chủ nhà"} · {project.code}
        </div>
        <h1>{project.name}</h1>
        <div className="meta">
          {project.customerName ? (
            <>
              <span>Chủ nhà: {project.customerName}</span>
              <span className="d">·</span>
            </>
          ) : null}
          <span>{project.statusLabel}</span>
        </div>

        <div className="tot">
          <div className="tot-top">
            <b>Đã nghiệm thu</b>
            <span className="tot-pc num">
              {signedCount}/{rows.length}
            </span>
          </div>
          <div className="bar">
            <i style={{ width: `${rows.length ? (signedCount / rows.length) * 100 : 0}%` }} />
          </div>
          <div className="tot-m">
            {group === "thau_phu"
              ? "KS + tổ trưởng đội khoán ký BB công tác → KS chụp BB đã ký đưa lên đợt → đợt đủ điều kiện thanh toán. Chỉ nội bộ, chủ nhà không thấy."
              : "Ký giấy tại công trình → chụp BB đã ký đưa lên mốc → mốc thành “Đã nghiệm thu”. Chủ nhà chỉ thấy BB đã ký + ảnh công trình."}
          </div>
        </div>

        {panel === "new" && <div style={{ marginTop: 10 }}>{formPanel(null)}</div>}

        {loading ? (
          <div className="state">Đang tải…</div>
        ) : rows.length === 0 ? (
          <div className="state">Chưa có mốc nghiệm thu nào.</div>
        ) : (
          <>
            <div className="hd">
              <span>#</span>
              <span>Mốc</span>
              <span>BB mẫu</span>
              <span>BB đã ký</span>
              <span>Ảnh công trình</span>
            </div>
            {rows.map((m) => {
              const signed = m.status === "signed";
              const cls = signed ? "ok" : m.id === nextPendingId ? "cur" : "";
              const bare = m.bienBanPhotos.length === 0 && m.sitePhotos.length === 0;
              return (
                <Fragment key={m.id}>
                  <div className={`row ${cls}${bare ? " bare" : ""}`}>
                    <div className="c-no num">{String(m.seq).padStart(2, "0")}</div>
                    <div className="c-name">
                      {canManage ? (
                        <button type="button" className="nm" onClick={() => openEdit(m)} title="Sửa mốc">
                          {m.title}
                        </button>
                      ) : (
                        <span className="nm">{m.title}</span>
                      )}
                      {m.description ? <div className="desc">{m.description}</div> : null}
                      <div className="chips">
                        {signed ? (
                          <span className="chip ok">Đã nghiệm thu{m.signedAt ? ` · ${fmtDay(m.signedAt)}` : ""}</span>
                        ) : (
                          <span className={`chip${cls === "cur" ? " cur" : ""}`}>
                            {cls === "cur" ? "Đang chờ ký" : "Chưa"}
                          </span>
                        )}
                        {m.hasSignature && (
                          <Link href={`/projects/${projectId}/acceptance/${m.id}/bien-ban`} className="lnk">
                            BB ký cổng CN{m.signerName ? ` (${m.signerName})` : ""}
                          </Link>
                        )}
                        {m.customerNote ? <span className="desc">Ghi chú: {m.customerNote}</span> : null}
                      </div>
                    </div>
                    <div className="c-mau">
                      {m.templateFiles.length === 0 ? (
                        <span className="none">—</span>
                      ) : (
                        m.templateFiles.map((p, i) => (
                          <a
                            key={p.key}
                            href={fileUrl(m.id, p)}
                            target="_blank"
                            rel="noreferrer"
                            className="pbtn"
                            title={p.name}
                          >
                            🖨 In BB{m.templateFiles.length > 1 ? ` ${i + 1}` : ""}
                          </a>
                        ))
                      )}
                    </div>
                    <div className="c-bb">
                      <span className="lab">BB đã ký</span>
                      {strip(m, "bien_ban", m.bienBanPhotos)}
                    </div>
                    <div className="c-site">
                      <span className="lab">Ảnh công trình</span>
                      {strip(m, "site", m.sitePhotos)}
                    </div>
                    <div className="c-quick">
                      <button
                        type="button"
                        className="qbtn"
                        disabled={busyKey === `${m.id}:bien_ban`}
                        onClick={() => pick(m.id, "bien_ban")}
                      >
                        {busyKey === `${m.id}:bien_ban` ? "Đang tải…" : "＋ BB đã ký"}
                      </button>
                      <button
                        type="button"
                        className="qbtn"
                        disabled={busyKey === `${m.id}:site`}
                        onClick={() => pick(m.id, "site")}
                      >
                        {busyKey === `${m.id}:site` ? "Đang tải…" : "＋ Ảnh"}
                      </button>
                    </div>
                  </div>
                  {panel === m.id && formPanel(m)}
                </Fragment>
              );
            })}
            <div className="note">
              🖨 BB mẫu chỉ admin + giám sát thấy để in.
              {canManage ? " Sửa / xoá mốc, đổi BB mẫu: bấm vào tên mốc." : ""}
            </div>
          </>
        )}
      </div>
      {lightbox && <SwipeLightbox imgs={lightbox.imgs} startIdx={lightbox.idx} onClose={() => setLightbox(null)} />}
    </div>
  );
}
