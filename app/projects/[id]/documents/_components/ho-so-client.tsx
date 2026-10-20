"use client";

import type { UserRole } from "@prisma/client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { plexMono, plexSans } from "@/lib/fonts";
import {
  DOC_STATUSES,
  DOC_STATUS_LABEL,
  type DocGroupDto,
  type DocStatus,
  type ProjectDocDto,
} from "@/lib/project-doc-groups-shared";
import { DesignPhotosClient, type DesignGroupDto } from "./design-photos-client";

import "./ho-so.css";

type UserOption = { id: string; fullName: string; email: string; role: UserRole };

const ROLE_LABEL: Record<string, string> = {
  admin: "Quản trị",
  engineer: "Kỹ sư",
  foreman: "Tổ trưởng",
  accountant: "Kế toán",
  construction_manager: "GĐ Thi công",
};

const ICONS = ["📐", "🏠", "🤝", "🦺", "🧾", "📁", "📜", "🧱", "⚡", "🔧", "📸", "🗂️", "🏛️", "📦"];
const ALL = "__all__";
const NONE = "__none__";
const CAD_EXT = new Set(["dwg", "dxf", "dwf", "rvt", "skp", "zip", "rar", "7z"]);

function ext(name: string) {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
}
function fileType(name: string): { cls: string; label: string } {
  const e = ext(name);
  if (e === "pdf") return { cls: "pdf", label: "PDF" };
  if (CAD_EXT.has(e)) return { cls: "cad", label: e.toUpperCase().slice(0, 4) };
  if (["png", "jpg", "jpeg", "webp", "heic"].includes(e)) return { cls: "img", label: "IMG" };
  if (["doc", "docx"].includes(e)) return { cls: "doc", label: "DOC" };
  if (["xls", "xlsx", "csv"].includes(e)) return { cls: "xls", label: "XLS" };
  return { cls: "oth", label: (e || "FILE").toUpperCase().slice(0, 4) };
}
function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function ddmmyy(s: string) {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
}
function stripExt(name: string) {
  return name.replace(/\.[^.]+$/, "");
}
async function errMsg(res: Response, fallback: string) {
  const data = (await res.json().catch(() => null)) as { message?: string } | null;
  return data?.message || fallback;
}

type GroupForm = {
  name: string;
  icon: string;
  description: string;
  subfolders: string[];
  permEngineer: boolean;
  permAccountant: boolean;
  permSubcontractor: boolean;
  permCustomer: boolean;
  asTemplate: boolean;
};

export function HoSoClient({
  projectId,
  projectName,
  isAdmin,
  initialGroups,
  initialDocuments,
  userOptions,
  designGroups,
}: {
  projectId: string;
  projectName: string;
  isAdmin: boolean;
  initialGroups: DocGroupDto[];
  initialDocuments: ProjectDocDto[];
  userOptions: UserOption[];
  designGroups: DesignGroupDto[];
}) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);
  const [groups, setGroups] = useState(initialGroups);
  const [docs, setDocs] = useState(initialDocuments);
  const [activeId, setActiveId] = useState<string | null>(initialGroups[0]?.id ?? null);
  const [sub, setSub] = useState<string>(ALL);
  const [q, setQ] = useState("");
  const [pane, setPane] = useState<"groups" | "docs">("groups");
  const [busy, setBusy] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [overGroupId, setOverGroupId] = useState<string | null>(null);

  const [groupModal, setGroupModal] = useState<{ mode: "create" } | { mode: "edit"; group: DocGroupDto } | null>(null);
  const [uploadModal, setUploadModal] = useState<{ files: File[]; replace?: ProjectDocDto } | null>(null);
  const [docModal, setDocModal] = useState<ProjectDocDto | null>(null);
  const [accessDoc, setAccessDoc] = useState<ProjectDocDto | null>(null);
  const [viewer, setViewer] = useState<ProjectDocDto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("overview-theme"); } catch { /* noop */ }
    if (saved === "light" || saved === "dark") setTheme(saved);
    else if (typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark");
  }, []);
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try { localStorage.setItem("overview-theme", next); } catch { /* noop */ }
  }

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/documents`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { groups: DocGroupDto[]; documents: ProjectDocDto[] };
    setGroups(data.groups);
    setDocs(data.documents);
  }, [projectId]);

  // Bản hiện hành + số bản cũ theo chuỗi phiên bản.
  const current = useMemo(() => docs.filter((d) => d.isCurrent), [docs]);
  const versionsByRoot = useMemo(() => {
    const m: Record<string, ProjectDocDto[]> = {};
    docs.forEach((d) => { (m[d.rootId] ||= []).push(d); });
    Object.keys(m).forEach((k) => m[k].sort((a, b) => b.versionNo - a.versionNo));
    return m;
  }, [docs]);
  const countByGroup = useMemo(() => {
    const m: Record<string, number> = {};
    current.forEach((d) => { const k = d.groupId ?? NONE; m[k] = (m[k] || 0) + 1; });
    return m;
  }, [current]);
  const ungroupedCount = countByGroup[NONE] || 0;

  const active = groups.find((g) => g.id === activeId) ?? null;
  const isUngrouped = activeId === NONE;
  const isBanVe = active?.systemKey === "ban_ve";
  const needle = q.trim().toLowerCase();

  const groupDocs = useMemo(() => {
    if (needle) {
      return current.filter((d) => `${d.title} ${d.fileName}`.toLowerCase().includes(needle));
    }
    return current.filter((d) => (isUngrouped ? !d.groupId : d.groupId === activeId));
  }, [current, activeId, isUngrouped, needle]);

  const subCounts = useMemo(() => {
    const m: Record<string, number> = {};
    groupDocs.forEach((d) => { const k = d.subfolder || NONE; m[k] = (m[k] || 0) + 1; });
    return m;
  }, [groupDocs]);

  const subTabs = useMemo(() => (active && !needle ? active.subfolders : []), [active, needle]);
  const PHOI_CANH = "Phối cảnh 3D";
  const showAlbum = isBanVe && !needle && (sub === ALL || sub === PHOI_CANH);

  // Gom bảng theo mục con (tab "Tất cả") hoặc lọc 1 mục con.
  const sections = useMemo(() => {
    if (needle) return [{ key: "search", label: null as string | null, rows: groupDocs }];
    if (sub !== ALL) {
      return [{ key: sub, label: null, rows: groupDocs.filter((d) => (sub === NONE ? !d.subfolder || !subTabs.includes(d.subfolder) : d.subfolder === sub)) }];
    }
    const out: Array<{ key: string; label: string | null; rows: ProjectDocDto[] }> = [];
    subTabs.forEach((s) => {
      const rows = groupDocs.filter((d) => d.subfolder === s);
      if (rows.length) out.push({ key: s, label: s, rows });
    });
    const rest = groupDocs.filter((d) => !d.subfolder || !subTabs.includes(d.subfolder));
    if (rest.length) out.push({ key: NONE, label: subTabs.length ? "Chưa xếp mục" : null, rows: rest });
    return out;
  }, [groupDocs, sub, subTabs, needle]);
  const orphanCount = groupDocs.filter((d) => !d.subfolder || !subTabs.includes(d.subfolder)).length;

  function selectGroup(id: string) {
    setActiveId(id);
    setSub(ALL);
    setQ("");
    setPane("docs");
  }

  // ---------- upload ----------
  function pickFiles(replace?: ProjectDocDto) {
    if (!fileRef.current) return;
    fileRef.current.dataset.replace = replace?.id ?? "";
    fileRef.current.multiple = !replace;
    fileRef.current.value = "";
    fileRef.current.click();
  }
  function onPicked(list: FileList | null) {
    if (!list || !list.length || !fileRef.current) return;
    const replaceId = fileRef.current.dataset.replace;
    const replace = replaceId ? current.find((d) => d.id === replaceId) : undefined;
    setUploadModal({ files: Array.from(list), replace });
  }
  function onDropFiles(e: React.DragEvent) {
    e.preventDefault();
    setDropOver(false);
    if (!isAdmin || !e.dataTransfer.files.length) return;
    setUploadModal({ files: Array.from(e.dataTransfer.files) });
  }

  async function doUpload(opts: { files: File[]; titles: string[]; groupId: string | null; subfolder: string; status: string; replace?: ProjectDocDto }) {
    setBusy(true);
    let ok = 0;
    for (let i = 0; i < opts.files.length; i++) {
      const fd = new FormData();
      fd.append("file", opts.files[i]);
      fd.append("title", opts.titles[i] || stripExt(opts.files[i].name));
      if (opts.replace) fd.append("replaceId", opts.replace.id);
      else {
        if (opts.groupId) fd.append("groupId", opts.groupId);
        if (opts.subfolder) fd.append("subfolder", opts.subfolder);
      }
      if (opts.status) fd.append("status", opts.status);
      const res = await fetch(`/api/projects/${projectId}/documents`, { method: "POST", body: fd });
      if (res.ok) ok++;
      else toast.error(`${opts.files[i].name}: ${await errMsg(res, "Upload thất bại")}`);
    }
    setBusy(false);
    if (ok) {
      toast.success(opts.replace ? "Đã tải phiên bản mới" : `Đã tải lên ${ok} hồ sơ`);
      setUploadModal(null);
      await refresh();
    }
  }

  // ---------- sửa file ----------
  async function patchDoc(doc: ProjectDocDto, body: Record<string, unknown>, okMsg?: string) {
    const res = await fetch(`/api/projects/${projectId}/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error(await errMsg(res, "Cập nhật thất bại"));
      return false;
    }
    if (okMsg) toast.success(okMsg);
    await refresh();
    return true;
  }
  async function deleteDoc(doc: ProjectDocDto) {
    const chain = versionsByRoot[doc.rootId] || [];
    const more = chain.length > 1 ? ` (chỉ xoá V${doc.versionNo}, còn ${chain.length - 1} bản khác)` : "";
    if (!(await confirmDialog(`Xoá hồ sơ "${doc.title}"${more}? Không thể hoàn tác.`))) return false;
    const res = await fetch(`/api/projects/${projectId}/documents/${doc.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await errMsg(res, "Xoá thất bại"));
      return false;
    }
    toast.success("Đã xoá hồ sơ");
    await refresh();
    return true;
  }

  // ---------- nhóm ----------
  async function saveGroup(form: GroupForm, editing?: DocGroupDto) {
    const body = {
      name: form.name,
      icon: form.icon,
      description: form.description.trim() || null,
      subfolders: form.subfolders,
      permEngineer: form.permEngineer,
      permAccountant: form.permAccountant,
      permSubcontractor: form.permSubcontractor,
      permCustomer: form.permCustomer,
      ...(editing ? {} : { asTemplate: form.asTemplate }),
    };
    const res = await fetch(
      editing ? `/api/projects/${projectId}/doc-groups/${editing.id}` : `/api/projects/${projectId}/doc-groups`,
      { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    if (!res.ok) {
      toast.error(await errMsg(res, "Lưu nhóm thất bại"));
      return;
    }
    const data = (await res.json().catch(() => null)) as { group?: { id: string } } | null;
    toast.success(editing ? "Đã lưu nhóm" : "Đã tạo nhóm");
    setGroupModal(null);
    await refresh();
    if (!editing && data?.group?.id) { setActiveId(data.group.id); setSub(ALL); setPane("docs"); }
  }
  async function deleteGroup(g: DocGroupDto) {
    if ((countByGroup[g.id] || 0) > 0) {
      toast.error("Nhóm còn hồ sơ — chuyển hồ sơ sang nhóm khác trước khi xoá");
      return;
    }
    if (!(await confirmDialog(`Xoá nhóm "${g.name}"?`))) return;
    const res = await fetch(`/api/projects/${projectId}/doc-groups/${g.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await errMsg(res, "Xoá nhóm thất bại"));
      return;
    }
    toast.success("Đã xoá nhóm");
    setGroupModal(null);
    setActiveId(groups.find((x) => x.id !== g.id)?.id ?? null);
    await refresh();
  }
  async function addSubfolder() {
    if (!active) return;
    const name = window.prompt("Tên mục con mới:")?.trim();
    if (!name) return;
    if (active.subfolders.includes(name)) { setSub(name); return; }
    const res = await fetch(`/api/projects/${projectId}/doc-groups/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subfolders: [...active.subfolders, name] }),
    });
    if (!res.ok) { toast.error(await errMsg(res, "Thêm mục con thất bại")); return; }
    await refresh();
    setSub(name);
  }
  async function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    const ids = groups.map((g) => g.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    const prev = groups;
    setGroups(ids.map((id) => groups.find((g) => g.id === id)!));
    const res = await fetch(`/api/projects/${projectId}/doc-groups`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: ids }),
    });
    if (!res.ok) { setGroups(prev); toast.error(await errMsg(res, "Đổi thứ tự thất bại")); }
  }

  const portal = (node: React.ReactNode) =>
    mounted ? createPortal(<div className={`${plexSans.variable} ${plexMono.variable}`}>{node}</div>, document.body) : null;
  const pcls = `hsportal ${plexSans.variable} ${plexMono.variable}`;

  const totalCurrent = current.length;

  return (
    <div
      className={`hsdoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable} pane-${pane}`}
      data-theme={theme}
    >
      <input ref={fileRef} type="file" hidden onChange={(e) => onPicked(e.target.files)} />

      <div className="hs-top">
        <div className="hs-mark">HG</div>
        <div className="hs-crumb">
          <Link href="/projects">Dự án</Link> / <Link href={`/projects/${projectId}`}>{projectName}</Link> / <b>Hồ sơ</b>
        </div>
        <div className="sp" />
        <button type="button" className="hs-icobtn" onClick={toggleTheme} aria-label="Đổi nền">◑</button>
      </div>

      <div className="hs-head">
        <div>
          <div className="eyebrow">Hồ sơ dự án · <span className="num">{totalCurrent}</span> file</div>
          <h1>Hồ sơ dự án</h1>
        </div>
        <div className="sp" />
        <input className="hs-search" placeholder="Tìm tên file…" value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value) setPane("docs"); }} />
        {isAdmin ? (
          <>
            <button type="button" className="btn d-only" onClick={() => setGroupModal({ mode: "create" })}>+ Nhóm mới</button>
            <button type="button" className="btn pri d-only" onClick={() => pickFiles()}>⬆ Tải hồ sơ lên</button>
          </>
        ) : null}
      </div>

      <div className="hs-body">
        {/* ---------- danh sách nhóm ---------- */}
        <aside className="hs-side">
          <div className="hs-sidelbl">Nhóm theo chức năng</div>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`hs-g ${g.id === activeId && !needle ? "on" : ""} ${overGroupId === g.id ? "drop-over" : ""}`}
              onClick={() => selectGroup(g.id)}
              draggable={isAdmin}
              onDragStart={(e) => { setDragGroupId(g.id); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { if (dragGroupId) { e.preventDefault(); setOverGroupId(g.id); } }}
              onDragLeave={() => setOverGroupId(null)}
              onDrop={(e) => { e.preventDefault(); setOverGroupId(null); if (dragGroupId) void reorder(dragGroupId, g.id); setDragGroupId(null); }}
              onDragEnd={() => { setDragGroupId(null); setOverGroupId(null); }}
            >
              <span className="ic">{g.icon}</span>
              <span className="t">
                <b>{g.name}</b>
                <small>{g.description || (g.subfolders.length ? g.subfolders.join(" · ") : "—")}</small>
              </span>
              <span className="c num">{countByGroup[g.id] || 0}</span>
              <span className="chev">›</span>
            </button>
          ))}
          {ungroupedCount > 0 ? (
            <>
              <div className="hs-sep" />
              <button type="button" className={`hs-g ${isUngrouped && !needle ? "on" : ""}`} onClick={() => selectGroup(NONE)}>
                <span className="ic">📎</span>
                <span className="t"><b>Chưa xếp nhóm</b><small>File cũ chưa có nhóm</small></span>
                <span className="c num">{ungroupedCount}</span>
                <span className="chev">›</span>
              </button>
            </>
          ) : null}
          {isAdmin ? (
            <>
              <button type="button" className="hs-addg" onClick={() => setGroupModal({ mode: "create" })}>+ Tạo nhóm mới</button>
              <p className="hint" style={{ margin: "10px 6px 0" }}>Kéo thả để đổi thứ tự. 5 nhóm gốc không xoá được, đổi tên/quyền thoải mái.</p>
            </>
          ) : null}
          {isAdmin ? (
            <div className="m-fab">
              <button type="button" className="btn" onClick={() => setGroupModal({ mode: "create" })}>+ Nhóm mới</button>
              <button type="button" className="btn pri" onClick={() => pickFiles()}>⬆ Tải lên</button>
            </div>
          ) : null}
        </aside>

        {/* ---------- nội dung nhóm ---------- */}
        <section className="hs-main">
          <div className="hs-gh">
            <div style={{ flex: 1, minWidth: 0 }}>
              <button type="button" className="hs-back" onClick={() => { setPane("groups"); setQ(""); }}>‹ Nhóm hồ sơ</button>
              {needle ? (
                <>
                  <h2>Kết quả tìm “{q.trim()}”</h2>
                  <p><span className="num">{groupDocs.length}</span> file trong mọi nhóm</p>
                </>
              ) : isUngrouped ? (
                <>
                  <h2>📎 Chưa xếp nhóm</h2>
                  <p>File cũ chưa có nhóm — bấm vào file để chuyển nhóm.</p>
                </>
              ) : active ? (
                <>
                  <h2>{active.icon} {active.name}</h2>
                  {active.description ? <p>{active.description}</p> : null}
                  <div className="perm">
                    <span className="hint" style={{ marginRight: 2 }}>Ai xem được:</span>
                    <span className="chip">Admin</span>
                    <span className={`chip ${active.permEngineer ? "" : "off"}`}>Kỹ sư</span>
                    <span className={`chip ${active.permAccountant ? "" : "off"}`}>Kế toán</span>
                    <span className={`chip ${active.permSubcontractor ? "" : "off"}`}>Thầu phụ</span>
                    <span className={`chip ${active.permCustomer ? "cus" : "off"}`}>Chủ nhà</span>
                    {isAdmin ? <button type="button" className="linkbtn" onClick={() => setGroupModal({ mode: "edit", group: active })}>sửa quyền</button> : null}
                  </div>
                </>
              ) : (
                <h2>Chưa có nhóm</h2>
              )}
            </div>
            {isAdmin && active && !needle ? (
              <div className="d-only" style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn sm" onClick={() => setGroupModal({ mode: "edit", group: active })}>✎ Sửa nhóm</button>
                <button type="button" className="btn sm pri" onClick={() => pickFiles()}>⬆ Tải lên</button>
              </div>
            ) : null}
          </div>

          {active && !needle ? (
            <div className="tabs">
              <button type="button" className={`tab ${sub === ALL ? "on" : ""}`} onClick={() => setSub(ALL)}>
                Tất cả<span className="num">{groupDocs.length}</span>
              </button>
              {subTabs.map((s) => (
                <button key={s} type="button" className={`tab ${sub === s ? "on" : ""}`} onClick={() => setSub(s)}>
                  {s}<span className="num">{s === PHOI_CANH && isBanVe ? (subCounts[s] || 0) + designGroups.length : subCounts[s] || 0}</span>
                </button>
              ))}
              {orphanCount > 0 && subTabs.length > 0 ? (
                <button type="button" className={`tab ${sub === NONE ? "on" : ""}`} onClick={() => setSub(NONE)}>
                  Chưa xếp mục<span className="num">{orphanCount}</span>
                </button>
              ) : null}
              {isAdmin ? <button type="button" className="tab add" onClick={addSubfolder}>+ mục con</button> : null}
            </div>
          ) : null}

          <table className="hs-t">
            <thead>
              <tr>
                <th>Tên hồ sơ</th>
                <th className="d-col">Phiên bản</th>
                <th className="d-col">Trạng thái</th>
                <th className="d-col">Người tải · ngày</th>
                {isAdmin ? <th className="d-col">Chủ nhà</th> : null}
                <th style={{ textAlign: "right" }}>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {sections.every((s) => s.rows.length === 0) ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="hs-empty">
                    {needle ? "Không tìm thấy file nào." : showAlbum ? "Chưa có file bản vẽ — xem album phối cảnh bên dưới." : "Chưa có hồ sơ trong mục này."}
                  </td>
                </tr>
              ) : (
                sections.map((s) => (
                  <SectionRows
                    key={s.key}
                    label={s.label}
                    rows={s.rows}
                    isAdmin={isAdmin}
                    showGroup={!!needle}
                    groups={groups}
                    versionsByRoot={versionsByRoot}
                    onOpen={(d) => (isAdmin ? setDocModal(d) : setViewer(d))}
                    onView={setViewer}
                    onReplace={pickFiles}
                    onDelete={(d) => void deleteDoc(d)}
                    onToggleCustomer={(d) => void patchDoc(d, { visibleToCustomer: !d.visibleToCustomer }, d.visibleToCustomer ? "Đã ẩn khỏi chủ nhà" : "Chủ nhà xem được")}
                    onStatus={(d, st) => void patchDoc(d, { status: st || null })}
                  />
                ))
              )}
            </tbody>
          </table>

          {isAdmin && (active || isUngrouped) && !needle ? (
            <div
              className={`drop ${dropOver ? "over" : ""}`}
              onClick={() => pickFiles()}
              onDragOver={(e) => { if (!dragGroupId) { e.preventDefault(); setDropOver(true); } }}
              onDragLeave={() => setDropOver(false)}
              onDrop={onDropFiles}
            >
              {busy ? "Đang tải lên…" : (
                <>Kéo thả file vào đây hoặc <b>chọn file</b> — tự vào nhóm <b>{active?.name ?? "Chưa xếp nhóm"}</b>{sub !== ALL && sub !== NONE ? <> / <b>{sub}</b></> : null}. PDF, DWG, ảnh… tối đa 50MB.</>
              )}
            </div>
          ) : null}

          {showAlbum ? (
            <div className="hs-album">
              <h3>📸 Phối cảnh 3D · album ảnh</h3>
              <div className="hs-legacy">
                <DesignPhotosClient projectId={projectId} isAdmin={isAdmin} initialGroups={designGroups} userOptions={userOptions} />
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {/* ---------- modals ---------- */}
      {groupModal
        ? portal(
            <GroupModal
              cls={pcls}
              theme={theme}
              editing={groupModal.mode === "edit" ? groupModal.group : undefined}
              docCount={groupModal.mode === "edit" ? countByGroup[groupModal.group.id] || 0 : 0}
              onClose={() => setGroupModal(null)}
              onSave={saveGroup}
              onDelete={deleteGroup}
            />,
          )
        : null}
      {uploadModal
        ? portal(
            <UploadModal
              cls={pcls}
              theme={theme}
              files={uploadModal.files}
              replace={uploadModal.replace}
              groups={groups}
              defaultGroupId={active?.id ?? groups[0]?.id ?? null}
              defaultSub={sub !== ALL && sub !== NONE ? sub : ""}
              busy={busy}
              onClose={() => setUploadModal(null)}
              onSubmit={doUpload}
            />,
          )
        : null}
      {docModal
        ? portal(
            <DocModal
              cls={pcls}
              theme={theme}
              doc={current.find((d) => d.id === docModal.id) ?? docModal}
              versions={versionsByRoot[docModal.rootId] || [docModal]}
              groups={groups}
              onClose={() => setDocModal(null)}
              onView={setViewer}
              onReplace={(d) => { setDocModal(null); pickFiles(d); }}
              onAccess={(d) => setAccessDoc(d)}
              onPatch={patchDoc}
              onDelete={async (d) => { if (await deleteDoc(d)) setDocModal(null); }}
            />,
          )
        : null}
      {accessDoc
        ? portal(
            <AccessModal
              cls={pcls}
              theme={theme}
              projectId={projectId}
              doc={accessDoc}
              userOptions={userOptions}
              onClose={() => setAccessDoc(null)}
              onSaved={async () => { setAccessDoc(null); await refresh(); }}
            />,
          )
        : null}
      {viewer
        ? portal(
            <div className={`${pcls} viewer`} data-theme={theme} onClick={() => setViewer(null)}>
              <div className="vh" onClick={(e) => e.stopPropagation()}>
                <b>{viewer.title} <span className="num" style={{ opacity: 0.6 }}>V{viewer.versionNo}</span></b>
                <a className="btn sm" href={`${viewer.viewUrl}?download=1`} download>⬇ Tải</a>
                <button type="button" className="btn sm" onClick={() => setViewer(null)}>✕</button>
              </div>
              <div className="vb" onClick={(e) => e.stopPropagation()}>
                {viewer.mimeType === "application/pdf" || ext(viewer.fileName) === "pdf" ? (
                  <iframe src={viewer.viewUrl} title={viewer.title} />
                ) : viewer.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={viewer.viewUrl} alt={viewer.title} />
                ) : (
                  <div className="nopv">
                    <div style={{ fontSize: 40 }}>📄</div>
                    <div>File {fileType(viewer.fileName).label} không xem trước được trên trình duyệt.</div>
                    <a className="btn pri" href={`${viewer.viewUrl}?download=1`} download>⬇ Tải về máy</a>
                  </div>
                )}
              </div>
            </div>,
          )
        : null}
    </div>
  );
}

// ============================================================
function SectionRows({
  label, rows, isAdmin, showGroup, groups, versionsByRoot, onOpen, onView, onReplace, onDelete, onToggleCustomer, onStatus,
}: {
  label: string | null;
  rows: ProjectDocDto[];
  isAdmin: boolean;
  showGroup: boolean;
  groups: DocGroupDto[];
  versionsByRoot: Record<string, ProjectDocDto[]>;
  onOpen: (d: ProjectDocDto) => void;
  onView: (d: ProjectDocDto) => void;
  onReplace: (d: ProjectDocDto) => void;
  onDelete: (d: ProjectDocDto) => void;
  onToggleCustomer: (d: ProjectDocDto) => void;
  onStatus: (d: ProjectDocDto, st: string) => void;
}) {
  const cols = isAdmin ? 6 : 5;
  return (
    <>
      {label ? (
        <tr className="sub"><td colSpan={cols}>{label} · <span className="num">{rows.length}</span></td></tr>
      ) : null}
      {rows.map((d) => {
        const ft = fileType(d.fileName);
        const old = (versionsByRoot[d.rootId]?.length || 1) - 1;
        const cad = CAD_EXT.has(ext(d.fileName));
        const st = (d.status || "") as DocStatus | "";
        const g = showGroup ? groups.find((x) => x.id === d.groupId) : null;
        return (
          <tr key={d.id} className="row" onClick={() => onOpen(d)}>
            <td>
              <div className="fn">
                <span className={`ft ${ft.cls}`}>{ft.label}</span>
                <div>
                  <b>{d.title}</b>
                  <small>
                    {g ? `${g.icon} ${g.name}${d.subfolder ? ` / ${d.subfolder}` : ""} · ` : ""}
                    <span className="num">{fmtSize(d.fileSize)}</span>
                    {d.accessMode === "custom" ? " · 🔒 quyền riêng" : ""}
                    <span className="m-only"> · V{d.versionNo}{st ? ` · ${DOC_STATUS_LABEL[st]}` : ""}</span>
                  </small>
                </div>
              </div>
            </td>
            <td className="d-col">
              <span className="ver cur num">V{d.versionNo}</span>
              {old > 0 ? <span className="hint" style={{ marginLeft: 6 }}>+{old} bản cũ</span> : null}
            </td>
            <td className="d-col" onClick={(e) => e.stopPropagation()}>
              {isAdmin ? (
                <select
                  className={`st ${st}`}
                  style={{ border: 0, background: "none", cursor: "pointer", padding: 0 }}
                  value={st}
                  onChange={(e) => onStatus(d, e.target.value)}
                >
                  <option value="">—</option>
                  {DOC_STATUSES.map((s) => <option key={s} value={s}>{DOC_STATUS_LABEL[s]}</option>)}
                </select>
              ) : st ? <span className={`st ${st}`}>● {DOC_STATUS_LABEL[st]}</span> : <span className="mut">—</span>}
            </td>
            <td className="d-col mut" style={{ whiteSpace: "nowrap" }}>
              {d.uploader.fullName} · <span className="num">{ddmmyy(d.uploadedAt)}</span>
            </td>
            {isAdmin ? (
              <td className="d-col" onClick={(e) => e.stopPropagation()}>
                {cad ? (
                  <span className="hint">CAD — không</span>
                ) : (
                  <button
                    type="button"
                    className={`chip ${d.visibleToCustomer ? "cus" : "off"}`}
                    style={{ background: d.visibleToCustomer ? undefined : "none", cursor: "pointer", textDecoration: "none" }}
                    onClick={() => onToggleCustomer(d)}
                    title={d.accessMode === "custom" ? "Quyền riêng của file" : "Theo quyền nhóm — bấm để đặt riêng"}
                  >
                    {d.visibleToCustomer ? "✓ Xem được" : "Ẩn"}
                  </button>
                )}
              </td>
            ) : null}
            <td onClick={(e) => e.stopPropagation()}>
              <div className="acts">
                <button type="button" title="Xem" onClick={() => onView(d)}>👁</button>
                <a title="Tải về" href={`${d.viewUrl}?download=1`} download className="d-only">⬇</a>
                {isAdmin ? (
                  <>
                    <button type="button" title="Tải phiên bản mới" className="d-only" onClick={() => onReplace(d)}>⟳</button>
                    <button type="button" title="Xoá" className="d-only" onClick={() => onDelete(d)}>🗑</button>
                  </>
                ) : null}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ============================================================
function GroupModal({
  cls, theme, editing, docCount, onClose, onSave, onDelete,
}: {
  cls: string;
  theme: string;
  editing?: DocGroupDto;
  docCount: number;
  onClose: () => void;
  onSave: (f: GroupForm, editing?: DocGroupDto) => Promise<void>;
  onDelete: (g: DocGroupDto) => Promise<void>;
}) {
  const [f, setF] = useState<GroupForm>({
    name: editing?.name ?? "",
    icon: editing?.icon ?? "📁",
    description: editing?.description ?? "",
    subfolders: editing?.subfolders ?? [],
    permEngineer: editing?.permEngineer ?? true,
    permAccountant: editing?.permAccountant ?? false,
    permSubcontractor: editing?.permSubcontractor ?? false,
    permCustomer: editing?.permCustomer ?? false,
    asTemplate: false,
  });
  const [newSub, setNewSub] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof GroupForm>(k: K, v: GroupForm[K]) => setF((p) => ({ ...p, [k]: v }));
  function addSub() {
    const s = newSub.trim();
    if (s && !f.subfolders.includes(s)) set("subfolders", [...f.subfolders, s]);
    setNewSub("");
  }
  const icons = ICONS.includes(f.icon) ? ICONS : [f.icon, ...ICONS];

  return (
    <div className={`${cls} ov`} data-theme={theme} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">{editing ? "Sửa nhóm hồ sơ" : "Tạo nhóm hồ sơ mới"}<button type="button" className="x" onClick={onClose}>✕</button></div>
        <div className="mb">
          <div className="f">
            <label>Tên nhóm</label>
            <input className="inp" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="VD: Pháp lý – Giấy phép" autoFocus />
          </div>
          <div className="f">
            <label>Biểu tượng</label>
            <div className="icons">
              {icons.map((ic) => (
                <button key={ic} type="button" className={f.icon === ic ? "on" : ""} onClick={() => set("icon", ic)}>{ic}</button>
              ))}
            </div>
          </div>
          <div className="f">
            <label>Mô tả ngắn</label>
            <input className="inp" value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="VD: Giấy phép xây dựng, sổ đỏ, cam kết" />
          </div>
          <div className="f">
            <label>Mục con</label>
            <div className="subs">
              {f.subfolders.map((s) => (
                <span key={s} className="chip">
                  {s}
                  <button type="button" onClick={() => set("subfolders", f.subfolders.filter((x) => x !== s))} aria-label="Bỏ">✕</button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input
                className="inp"
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }}
                placeholder="Thêm mục con…"
              />
              <button type="button" className="btn" onClick={addSub}>+</button>
            </div>
            {editing ? <p className="hint" style={{ marginTop: 6 }}>Bỏ mục con → file trong mục đó về “Chưa xếp mục” (không mất file).</p> : null}
          </div>
          <div className="f">
            <label>Ai được xem file trong nhóm</label>
            <div className="ck">
              <label><input type="checkbox" checked disabled /> Admin</label>
              <label><input type="checkbox" checked={f.permEngineer} onChange={(e) => set("permEngineer", e.target.checked)} /> Kỹ sư giám sát</label>
              <label><input type="checkbox" checked={f.permAccountant} onChange={(e) => set("permAccountant", e.target.checked)} /> Kế toán</label>
              <label><input type="checkbox" checked={f.permSubcontractor} onChange={(e) => set("permSubcontractor", e.target.checked)} /> Thầu phụ (link mời thầu)</label>
              <label><input type="checkbox" checked={f.permCustomer} onChange={(e) => set("permCustomer", e.target.checked)} /> Chủ nhà (cổng khách)</label>
            </div>
            <p className="hint" style={{ marginTop: 6 }}>File mới vào nhóm tự hưởng quyền này. Từng file vẫn đặt quyền riêng được. File CAD không bao giờ hiện cho chủ nhà.</p>
          </div>
          {!editing ? (
            <div className="ck one">
              <label><input type="checkbox" checked={f.asTemplate} onChange={(e) => set("asTemplate", e.target.checked)} /> Dùng nhóm này cho mọi dự án mới (lưu làm mẫu)</label>
            </div>
          ) : null}
        </div>
        <div className="mf">
          {editing && !editing.systemKey ? (
            <button
              type="button"
              className="btn danger left"
              disabled={docCount > 0}
              title={docCount > 0 ? "Nhóm còn file — chuyển file đi trước" : undefined}
              onClick={() => void onDelete(editing)}
            >🗑 Xoá nhóm</button>
          ) : editing ? <span className="hint left">Nhóm gốc — không xoá được</span> : null}
          <button type="button" className="btn" onClick={onClose}>Huỷ</button>
          <button
            type="button"
            className="btn pri"
            disabled={saving || !f.name.trim()}
            onClick={async () => { setSaving(true); await onSave(f, editing); setSaving(false); }}
          >{saving ? "Đang lưu…" : editing ? "Lưu" : "Tạo nhóm"}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
function UploadModal({
  cls, theme, files, replace, groups, defaultGroupId, defaultSub, busy, onClose, onSubmit,
}: {
  cls: string;
  theme: string;
  files: File[];
  replace?: ProjectDocDto;
  groups: DocGroupDto[];
  defaultGroupId: string | null;
  defaultSub: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (o: { files: File[]; titles: string[]; groupId: string | null; subfolder: string; status: string; replace?: ProjectDocDto }) => Promise<void>;
}) {
  const [groupId, setGroupId] = useState(defaultGroupId);
  const [subfolder, setSubfolder] = useState(defaultSub);
  const [status, setStatus] = useState(replace?.status ?? "");
  const [titles, setTitles] = useState(files.map((f) => (replace ? replace.title : stripExt(f.name))));
  const g = groups.find((x) => x.id === groupId);
  const subs = g?.subfolders ?? [];

  return (
    <div className={`${cls} ov`} data-theme={theme} onClick={busy ? undefined : onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="mh">{replace ? `Tải phiên bản mới · V${replace.versionNo + 1}` : `Tải ${files.length} hồ sơ lên`}<button type="button" className="x" onClick={onClose} disabled={busy}>✕</button></div>
        <div className="mb">
          {replace ? (
            <p className="hint">Thay cho <b>{replace.title}</b> (V{replace.versionNo}). Bản cũ vẫn lưu trong lịch sử, ẩn khỏi kỹ sư/chủ nhà/thầu phụ. Nhóm + quyền giữ nguyên.</p>
          ) : (
            <div className="row2">
              <div className="f">
                <label>Nhóm</label>
                <select className="inp" value={groupId ?? ""} onChange={(e) => { setGroupId(e.target.value || null); setSubfolder(""); }}>
                  {groups.map((x) => <option key={x.id} value={x.id}>{x.icon} {x.name}</option>)}
                </select>
              </div>
              <div className="f">
                <label>Mục con</label>
                <select className="inp" value={subfolder} onChange={(e) => setSubfolder(e.target.value)} disabled={!subs.length}>
                  <option value="">— Không —</option>
                  {subs.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          )}
          <div className="f">
            <label>Trạng thái</label>
            <select className="inp" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">— Không ghi —</option>
              {DOC_STATUSES.map((s) => <option key={s} value={s}>{DOC_STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="f">
            <span className="flbl">File · tên hiển thị</span>
            <div className="files">
              {files.map((file, i) => {
                const ft = fileType(file.name);
                return (
                  <div key={i}>
                    <span className={`ft ${ft.cls}`} style={{ width: 28, height: 32 }}>{ft.label}</span>
                    <input
                      className="inp"
                      value={titles[i]}
                      onChange={(e) => setTitles((p) => p.map((t, j) => (j === i ? e.target.value : t)))}
                    />
                    <span className="hint num" style={{ whiteSpace: "nowrap" }}>{fmtSize(file.size)}</span>
                  </div>
                );
              })}
            </div>
            {!replace && g ? (
              <p className="hint" style={{ marginTop: 6 }}>
                Quyền theo nhóm: Admin{g.permEngineer ? " · Kỹ sư" : ""}{g.permAccountant ? " · Kế toán" : ""}{g.permSubcontractor ? " · Thầu phụ" : ""}{g.permCustomer ? " · Chủ nhà" : ""}.
              </p>
            ) : null}
          </div>
        </div>
        <div className="mf">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Huỷ</button>
          <button
            type="button"
            className="btn pri"
            disabled={busy || titles.some((t) => !t.trim())}
            onClick={() => void onSubmit({ files, titles: titles.map((t) => t.trim()), groupId, subfolder, status, replace })}
          >{busy ? "Đang tải…" : "⬆ Tải lên"}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
function DocModal({
  cls, theme, doc, versions, groups, onClose, onView, onReplace, onAccess, onPatch, onDelete,
}: {
  cls: string;
  theme: string;
  doc: ProjectDocDto;
  versions: ProjectDocDto[];
  groups: DocGroupDto[];
  onClose: () => void;
  onView: (d: ProjectDocDto) => void;
  onReplace: (d: ProjectDocDto) => void;
  onAccess: (d: ProjectDocDto) => void;
  onPatch: (d: ProjectDocDto, body: Record<string, unknown>, okMsg?: string) => Promise<boolean>;
  onDelete: (d: ProjectDocDto) => Promise<void>;
}) {
  const [title, setTitle] = useState(doc.title);
  const [groupId, setGroupId] = useState(doc.groupId ?? "");
  const [subfolder, setSubfolder] = useState(doc.subfolder ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setTitle(doc.title); setGroupId(doc.groupId ?? ""); setSubfolder(doc.subfolder ?? ""); }, [doc]);
  const g = groups.find((x) => x.id === groupId);
  const ft = fileType(doc.fileName);
  const cad = CAD_EXT.has(ext(doc.fileName));
  const dirty = title.trim() !== doc.title || groupId !== (doc.groupId ?? "") || subfolder !== (doc.subfolder ?? "");

  async function save() {
    const body: Record<string, unknown> = {};
    if (title.trim() !== doc.title) body.title = title.trim();
    if (groupId && groupId !== (doc.groupId ?? "")) body.groupId = groupId;
    if (subfolder !== (doc.subfolder ?? "")) body.subfolder = subfolder || null;
    setSaving(true);
    const ok = await onPatch(doc, body, "Đã lưu");
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div className={`${cls} ov`} data-theme={theme} onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <span className={`ft ${ft.cls}`} style={{ width: 28, height: 32 }}>{ft.label}</span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</span>
          <button type="button" className="x" onClick={onClose}>✕</button>
        </div>
        <div className="mb">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn sm" onClick={() => onView(doc)}>👁 Xem</button>
            <a className="btn sm" href={`${doc.viewUrl}?download=1`} download>⬇ Tải về</a>
            <button type="button" className="btn sm" onClick={() => onReplace(doc)}>⟳ Phiên bản mới</button>
          </div>
          <div className="f">
            <label>Tên hiển thị</label>
            <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="row2">
            <div className="f">
              <label>Chuyển nhóm</label>
              <select className="inp" value={groupId} onChange={(e) => { setGroupId(e.target.value); setSubfolder(""); }}>
                {!doc.groupId ? <option value="">— Chưa xếp nhóm —</option> : null}
                {groups.map((x) => <option key={x.id} value={x.id}>{x.icon} {x.name}</option>)}
              </select>
            </div>
            <div className="f">
              <label>Mục con</label>
              <select className="inp" value={subfolder} onChange={(e) => setSubfolder(e.target.value)} disabled={!g?.subfolders.length}>
                <option value="">— Không —</option>
                {(g?.subfolders ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                {subfolder && g && !g.subfolders.includes(subfolder) ? <option value={subfolder}>{subfolder}</option> : null}
              </select>
            </div>
          </div>

          <div className="f">
            <span className="flbl">Quyền xem</span>
            <div className="seg">
              <button
                type="button"
                className={doc.accessMode === "group" ? "on" : ""}
                onClick={() => { if (doc.accessMode !== "group") void onPatch(doc, { accessMode: "group" }, "Đã về quyền theo nhóm"); }}
              >Theo nhóm</button>
              <button
                type="button"
                className={doc.accessMode === "custom" ? "on" : ""}
                onClick={async () => {
                  if (doc.accessMode !== "custom") await onPatch(doc, { accessMode: "custom" }, "Đã chuyển quyền riêng");
                  onAccess(doc);
                }}
              >Quyền riêng</button>
            </div>
            <p className="hint" style={{ marginTop: 6 }}>
              {doc.accessMode === "group"
                ? `Theo nhóm “${groups.find((x) => x.id === doc.groupId)?.name ?? "—"}”.`
                : `Chỉ admin + ${doc.grantedUsers?.length ? doc.grantedUsers.map((u) => u.fullName).join(", ") : "người tải lên"}${doc.visibleToCustomer ? " + chủ nhà" : ""}.`}
              {doc.accessMode === "custom" ? <> <button type="button" className="linkbtn" onClick={() => onAccess(doc)} style={{ color: "var(--terra)" }}>chọn người</button></> : null}
            </p>
            <div className="ck one" style={{ marginTop: 8 }}>
              <label style={{ opacity: cad ? 0.5 : 1 }}>
                <input
                  type="checkbox"
                  disabled={cad}
                  checked={doc.visibleToCustomer}
                  onChange={() => void onPatch(doc, { visibleToCustomer: !doc.visibleToCustomer })}
                />
                {cad ? "File CAD — không hiện cho chủ nhà" : "Chủ nhà xem được (cổng khách)"}
              </label>
            </div>
          </div>

          <div className="f">
            <span className="flbl">Lịch sử phiên bản</span>
            <div className="vlist">
              {versions.map((v) => (
                <div key={v.id}>
                  <span className={`ver num ${v.isCurrent ? "cur" : ""}`}>V{v.versionNo}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="mut">{v.uploader.fullName} · <span className="num">{ddmmyy(v.uploadedAt)} · {fmtSize(v.fileSize)}</span></span>
                    {v.isCurrent ? <span className="hint"> · hiện hành</span> : null}
                  </span>
                  <button type="button" className="linkbtn" onClick={() => onView(v)} style={{ color: "var(--terra)" }}>xem</button>
                  {!v.isCurrent ? <button type="button" className="linkbtn" onClick={() => void onDelete(v)}>xoá</button> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mf">
          <button type="button" className="btn danger left" onClick={() => void onDelete(doc)}>🗑 Xoá</button>
          <button type="button" className="btn" onClick={onClose}>Đóng</button>
          <button type="button" className="btn pri" disabled={!dirty || saving || !title.trim()} onClick={() => void save()}>{saving ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
function AccessModal({
  cls, theme, projectId, doc, userOptions, onClose, onSaved,
}: {
  cls: string;
  theme: string;
  projectId: string;
  doc: ProjectDocDto;
  userOptions: UserOption[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set((doc.grantedUsers ?? []).map((u) => u.id)));
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const shown = userOptions.filter((u) => `${u.fullName} ${u.email}`.toLowerCase().includes(filter.trim().toLowerCase()));

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/documents/${doc.id}/access`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: Array.from(picked) }),
    });
    setSaving(false);
    if (!res.ok) { toast.error(await errMsg(res, "Lưu quyền thất bại")); return; }
    toast.success("Đã lưu quyền xem");
    await onSaved();
  }

  return (
    <div className={`${cls} ov`} data-theme={theme} onClick={onClose} style={{ zIndex: 205 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">Cấp quyền xem · {doc.title}<button type="button" className="x" onClick={onClose}>✕</button></div>
        <div className="mb">
          <input className="inp" placeholder="Tìm người…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="ulist">
            {shown.map((u) => (
              <label key={u.id}>
                <input
                  type="checkbox"
                  checked={picked.has(u.id)}
                  onChange={(e) => setPicked((p) => { const n = new Set(Array.from(p)); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n; })}
                />
                <span style={{ flex: 1 }}>{u.fullName}</span>
                <span className="hint">{ROLE_LABEL[u.role] ?? u.role}</span>
              </label>
            ))}
            {!shown.length ? <div className="hint" style={{ padding: 10 }}>Không có người phù hợp.</div> : null}
          </div>
          <p className="hint">Admin luôn xem được. Quyền riêng: chỉ những người được chọn (và người tải lên) thấy file.</p>
        </div>
        <div className="mf">
          <button type="button" className="btn" onClick={onClose}>Huỷ</button>
          <button type="button" className="btn pri" disabled={saving} onClick={() => void save()}>{saving ? "Đang lưu…" : `Lưu (${picked.size})`}</button>
        </div>
      </div>
    </div>
  );
}
