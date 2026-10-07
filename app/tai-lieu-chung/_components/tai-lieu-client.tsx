"use client";

import { useMemo, useRef, useState } from "react";
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

export function TaiLieuClient({ initial, canEdit }: { initial: CompanyDoc[]; canEdit: boolean }) {
  const [docs, setDocs] = useState(initial);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? docs.filter((d) => d.fileName.toLowerCase().includes(s)) : docs;
  }, [docs, q]);

  const reload = async () => {
    const res = await fetch("/api/company-docs", { cache: "no-store" });
    if (res.ok) setDocs(((await res.json()) as { docs: CompanyDoc[] }).docs);
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/company-docs", { method: "POST", body: fd });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { message?: string } | null;
          toast.error(`${f.name}: ${j?.message || "Tải lên lỗi"}`);
        }
      }
      await reload();
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

  return (
    <div className="tlc-app">
      <div className="tlc-wrap">
        <div className="tlc-top">
          <div>
            <div className="tlc-eyebrow">Lưu trữ · toàn công ty</div>
            <h1 className="tlc-h1">Tài liệu chung</h1>
            <div className="tlc-meta">{docs.length} tài liệu · xem, in, tải về máy</div>
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
              <button type="button" className="tlc-btn pri" disabled={busy} onClick={() => inputRef.current?.click()}>
                {busy ? "Đang tải lên…" : "+ Tải lên"}
              </button>
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
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="tlc-empty">
                  {docs.length === 0 ? "Chưa có tài liệu nào." : "Không tìm thấy tài liệu."}
                </td>
              </tr>
            )}
            {shown.map((d) => (
              <tr key={d.key}>
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
                      <button type="button" className="tlc-btn del" onClick={() => remove(d)} title="Xoá">
                        Xoá
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
