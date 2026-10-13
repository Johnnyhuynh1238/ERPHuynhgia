"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import type { CompanyDoc } from "@/lib/company-docs";
import "./tai-lieu.css";

const fileUrl = (key: string, download = false) =>
  `/api/company-docs/file?key=${encodeURIComponent(key)}${download ? "&download=1" : ""}`;

const PRINTABLE = new Set(["pdf", "png", "jpg", "jpeg", "webp"]);

function fmtSize(n: number) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function TaiLieuClient({
  initial,
  initialFolders,
  canEdit,
}: {
  initial: CompanyDoc[];
  initialFolders: string[];
  canEdit: boolean;
}) {
  const [docs, setDocs] = useState(initial);
  const [folderList, setFolderList] = useState(initialFolders);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadFolderRef = useRef("");

  const searching = q.trim() !== "";
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? docs.filter((d) => d.fileName.toLowerCase().includes(s) || d.folder.toLowerCase().includes(s)) : docs;
  }, [docs, q]);

  // Nhánh thư mục (A→Z, gồm cả thư mục rỗng) lên trước, file lẻ ngoài thư mục xếp sau. Đang tìm thì chỉ hiện nhánh có kết quả.
  const folders = useMemo(
    () =>
      Array.from(new Set(folderList.concat(docs.map((d) => d.folder)).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "vi"),
      ),
    [docs, folderList],
  );
  // Cây 2 cấp: thư mục gốc → thư mục con ("Cha/Con"). total = file trong cả nhánh.
  const groups = useMemo(() => {
    const inTree = (f: string) => shown.filter((d) => d.folder === f || d.folder.startsWith(`${f}/`));
    return folders
      .filter((f) => !f.includes("/"))
      .map((f) => ({
        folder: f,
        items: shown.filter((d) => d.folder === f),
        total: inTree(f).length,
        subs: folders
          .filter((c) => c.startsWith(`${f}/`))
          .map((c) => ({ folder: c, items: shown.filter((d) => d.folder === c) }))
          .filter((c) => !searching || c.items.length > 0),
      }))
      .filter((g) => !searching || g.total > 0);
  }, [folders, shown, searching]);
  const looseDocs = shown.filter((d) => !d.folder);

  const toggleFolder = (f: string) =>
    setOpenFolders((prev) => {
      const next = new Set(Array.from(prev));
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const pickFiles = (folder: string) => {
    uploadFolderRef.current = folder;
    inputRef.current?.click();
  };

  const reload = async () => {
    const res = await fetch("/api/company-docs", { cache: "no-store" });
    if (!res.ok) return;
    const j = (await res.json()) as { docs: CompanyDoc[]; folders: string[] };
    setDocs(j.docs);
    setFolderList(j.folders);
  };

  // Tạo thư mục ngay cả khi chưa có file (server ghi object đánh dấu).
  const newFolder = async (parent = "") => {
    const input = window.prompt(parent ? `Tên thư mục con trong "${parent}":` : "Tên thư mục mới:", "")?.trim();
    if (!input) return;
    const name = parent ? `${parent}/${input.replace(/\//g, " ")}` : input.replace(/\//g, " ");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("createFolder", name);
      const res = await fetch("/api/company-docs", { method: "POST", body: fd });
      const j = (await res.json().catch(() => null)) as { folder?: string; message?: string } | null;
      if (!res.ok || !j?.folder) return void toast.error(j?.message || "Tạo thư mục lỗi");
      const created = j.folder;
      await reload();
      setOpenFolders((prev) => new Set(Array.from(prev).concat(created, parent || created)));
      toast.success(`Đã tạo thư mục "${created}"`);
    } finally {
      setBusy(false);
    }
  };

  const removeFolder = async (folder: string) => {
    const ok = await confirmDialog({
      title: "Xoá thư mục?",
      message: `Xoá thư mục rỗng "${folder}".`,
      confirmText: "Xoá",
    });
    if (!ok) return;
    const res = await fetch(`/api/company-docs?folder=${encodeURIComponent(folder)}`, { method: "DELETE" });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { message?: string } | null;
      return toast.error(j?.message || "Xoá thư mục lỗi");
    }
    await reload();
    toast.success("Đã xoá thư mục");
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("folder", uploadFolderRef.current);
        const res = await fetch("/api/company-docs", { method: "POST", body: fd });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { message?: string } | null;
          toast.error(`${f.name}: ${j?.message || "Tải lên lỗi"}`);
        }
      }
      await reload();
      const up = uploadFolderRef.current;
      if (up) setOpenFolders((prev) => new Set(Array.from(prev).concat(up, up.split("/")[0])));
      toast.success("Đã tải lên");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (d: CompanyDoc) => {
    const ok = await confirmDialog({
      title: "Xoá tài liệu?",
      message: `Xoá vĩnh viễn "${d.fileName}". Không khôi phục được.`,
      confirmText: "Xoá",
    });
    if (!ok) return;
    const res = await fetch(`/api/company-docs?key=${encodeURIComponent(d.key)}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Xoá lỗi");
    setDocs((prev) => prev.filter((x) => x.key !== d.key));
    toast.success("Đã xoá");
  };

  const move = async (d: CompanyDoc) => {
    const hint = folders.length ? `\nThư mục đang có (thư mục con ghi "Cha/Con"): ${folders.join(", ")}` : "";
    const name = window.prompt(`Chuyển "${d.fileName}" vào thư mục (để trống = ngoài thư mục):${hint}`, d.folder);
    if (name === null || name.trim() === d.folder) return;
    const res = await fetch("/api/company-docs", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: d.key, folder: name.trim() }),
    });
    if (!res.ok) return toast.error("Chuyển lỗi");
    await reload();
    const to = name.trim();
    if (to) setOpenFolders((prev) => new Set(Array.from(prev).concat(to, to.split("/")[0])));
    toast.success("Đã chuyển");
  };

  const view = (d: CompanyDoc) => window.open(fileUrl(d.key), "_blank", "noopener");

  // In: nạp file vào iframe ẩn rồi gọi print() — PDF/ảnh. iOS chặn print iframe → mở tab để in từ viewer.
  const print = (d: CompanyDoc) => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (ios) return view(d);
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    frame.src = fileUrl(d.key);
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        view(d);
      }
      setTimeout(() => frame.remove(), 60_000);
    };
    document.body.appendChild(frame);
  };

  const renderDoc = (d: CompanyDoc, depth: number) => (
    <tr key={d.key} className={depth === 2 ? "tlc-in tlc-in2" : depth === 1 ? "tlc-in" : undefined}>
      <td className="tlc-name">
        <button type="button" onClick={() => view(d)}>
          <span className="tlc-ext">{d.ext || "file"}</span>
          {d.fileName.replace(/\.[^.]+$/, "")}
        </button>
        <div className="tlc-sub">
          {fmtSize(d.size)} · {fmtDate(d.uploadedAt)}
        </div>
      </td>
      <td className="tlc-num tlc-hide-m">{fmtSize(d.size)}</td>
      <td className="tlc-num tlc-hide-m">{fmtDate(d.uploadedAt)}</td>
      <td>
        <div className="tlc-act">
          <button type="button" className="tlc-btn" onClick={() => view(d)} title="Xem">
            Xem
          </button>
          {PRINTABLE.has(d.ext) && (
            <button type="button" className="tlc-btn" onClick={() => print(d)} title="In">
              In
            </button>
          )}
          <a className="tlc-btn" href={fileUrl(d.key, true)} download={d.fileName} title="Lưu về máy">
            Tải
          </a>
          {canEdit && (
            <button type="button" className="tlc-btn" onClick={() => move(d)} title="Chuyển thư mục">
              Chuyển
            </button>
          )}
          {canEdit && (
            <button type="button" className="tlc-btn del" onClick={() => remove(d)} title="Xoá">
              Xoá
            </button>
          )}
        </div>
      </td>
    </tr>
  );

  const folderRow = (folder: string, label: string, count: number, open: boolean, empty: boolean, sub: boolean) => (
    <tr className={sub ? "tlc-folder tlc-folder-sub" : "tlc-folder"}>
      <td colSpan={4}>
        <div className="tlc-folder-row">
          <button type="button" className="tlc-folder-btn" onClick={() => toggleFolder(folder)}>
            <span className="tlc-caret">{open ? "▾" : "▸"}</span>
            <span className="tlc-folder-ico">📁</span>
            {label}
            <span className="tlc-count">{count}</span>
          </button>
          {canEdit && (
            <div className="tlc-act">
              {empty && (
                <button type="button" className="tlc-btn del" disabled={busy} onClick={() => removeFolder(folder)}>
                  Xoá
                </button>
              )}
              {!sub && (
                <button type="button" className="tlc-btn" disabled={busy} onClick={() => newFolder(folder)}>
                  + Thư mục con
                </button>
              )}
              <button type="button" className="tlc-btn" disabled={busy} onClick={() => pickFiles(folder)}>
                + Thêm file
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="tlc-app">
      <div className="tlc-wrap">
        <div className="tlc-top">
          <div>
            <div className="tlc-eyebrow">Lưu trữ · toàn công ty</div>
            <h1 className="tlc-h1">Tài liệu chung</h1>
            <div className="tlc-meta">
              {docs.length} tài liệu{folders.length ? ` · ${folders.length} thư mục` : ""} · xem, in, tải về máy
            </div>
          </div>
          {canEdit && (
            <>
              <input
                ref={inputRef}
                type="file"
                multiple
                hidden
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp"
                onChange={(e) => upload(e.target.files)}
              />
              <div className="tlc-act">
                <button type="button" className="tlc-btn" disabled={busy} onClick={() => newFolder()}>
                  + Thư mục
                </button>
                <button type="button" className="tlc-btn pri" disabled={busy} onClick={() => pickFiles("")}>
                  {busy ? "Đang tải lên…" : "+ Tải lên"}
                </button>
              </div>
            </>
          )}
        </div>

        <input className="tlc-search" placeholder="Tìm tài liệu…" value={q} onChange={(e) => setQ(e.target.value)} />

        <table className="tlc-table">
          <thead>
            <tr>
              <th>Tài liệu</th>
              <th className="tlc-hide-m">Dung lượng</th>
              <th className="tlc-hide-m">Ngày lưu</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && groups.length === 0 && (
              <tr>
                <td colSpan={4} className="tlc-empty">
                  {docs.length === 0 ? "Chưa có tài liệu nào." : "Không tìm thấy tài liệu."}
                </td>
              </tr>
            )}
            {groups.map((g) => {
              const open = searching || openFolders.has(g.folder);
              return (
                <Fragment key={`f:${g.folder}`}>
                  {folderRow(g.folder, g.folder, g.total, open, g.total === 0 && g.subs.length === 0, false)}
                  {open && g.total === 0 && g.subs.length === 0 && (
                    <tr className="tlc-in">
                      <td colSpan={4} className="tlc-empty">
                        Thư mục trống.
                      </td>
                    </tr>
                  )}
                  {open &&
                    g.subs.map((c) => {
                      const subOpen = searching || openFolders.has(c.folder);
                      return (
                        <Fragment key={`f:${c.folder}`}>
                          {folderRow(c.folder, c.folder.slice(g.folder.length + 1), c.items.length, subOpen, c.items.length === 0, true)}
                          {subOpen && c.items.length === 0 && (
                            <tr className="tlc-in tlc-in2">
                              <td colSpan={4} className="tlc-empty">
                                Thư mục trống.
                              </td>
                            </tr>
                          )}
                          {subOpen && c.items.map((d) => renderDoc(d, 2))}
                        </Fragment>
                      );
                    })}
                  {open && g.items.map((d) => renderDoc(d, 1))}
                </Fragment>
              );
            })}
            {looseDocs.map((d) => renderDoc(d, 0))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
