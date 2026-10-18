"use client";

import { useEffect, useRef, useState } from "react";

type Row = { id: string; projectName: string; tasksDone: string; issues: string; photoCount: number; locked: boolean };
type Photo = { blob: Blob; url: string };

const MAX_NEW = 10;
const MAX_TOTAL = 20;

/** Nén ảnh điện thoại: cạnh dài ≤1600px, JPEG 0.8 (ảnh 4–8MB → ~300–500KB). */
async function compress(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.8));
    return blob || file;
  } catch {
    return file;
  }
}

export function EodFormClient({ token, rows }: { token: string; rows: Row[] }) {
  const [text, setText] = useState<Record<string, { tasksDone: string; issues: string }>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, { tasksDone: r.tasksDone, issues: r.issues }])),
  );
  const [photos, setPhotos] = useState<Record<string, Photo[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => () => Object.values(photosRef.current).flat().forEach((p) => URL.revokeObjectURL(p.url)), []);

  const setField = (id: string, k: "tasksDone" | "issues", v: string) =>
    setText((s) => ({ ...s, [id]: { ...s[id], [k]: v } }));

  async function addFiles(row: Row, files: FileList | null) {
    if (!files?.length) return;
    const have = photos[row.id]?.length || 0;
    const room = Math.min(MAX_NEW - have, MAX_TOTAL - row.photoCount - have);
    if (room <= 0) {
      setError(`${row.projectName}: tối đa ${MAX_NEW} ảnh.`);
      return;
    }
    setBusy("Đang xử lý ảnh…");
    const list: Photo[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      if (!f.type.startsWith("image/")) continue;
      const blob = await compress(f);
      list.push({ blob, url: URL.createObjectURL(blob) });
    }
    setBusy(null);
    setPhotos((s) => ({ ...s, [row.id]: [...(s[row.id] || []), ...list] }));
  }

  function removePhoto(id: string, i: number) {
    setPhotos((s) => {
      const list = (s[id] || []).slice();
      const [p] = list.splice(i, 1);
      if (p) URL.revokeObjectURL(p.url);
      return { ...s, [id]: list };
    });
  }

  async function save() {
    setError(null);
    for (const r of rows) {
      if (r.locked) continue;
      if (!text[r.id]?.tasksDone.trim()) {
        setError(`${r.projectName}: anh ghi công việc + khối lượng hôm nay.`);
        return;
      }
      if (r.photoCount + (photos[r.id]?.length || 0) === 0) {
        setError(`${r.projectName}: cần ít nhất 1 ảnh.`);
        return;
      }
    }
    if (!window.confirm("Lưu báo cáo cuối ngày?\nLưu xong không sửa được.")) return;

    const fd = new FormData();
    fd.append("data", JSON.stringify(text));
    for (const r of rows) {
      (photos[r.id] || []).forEach((p, i) => fd.append(`photo_${r.id}`, p.blob, `${i + 1}.jpg`));
    }
    setBusy("Đang gửi…");
    try {
      const res = await fetch(`/nv/${encodeURIComponent(token)}/submit`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message || "Lưu không được, anh thử lại.");
        return;
      }
      setSaved(true);
      window.scrollTo({ top: 0 });
    } catch {
      setError("Mất mạng, anh thử lại.");
    } finally {
      setBusy(null);
    }
  }

  if (saved) {
    return (
      <>
        <div className="bt-banner ok">✓ Đã lưu — link đã khoá, anh đóng trang được rồi</div>
        {rows.map((r) => (
          <div key={r.id} className="eo-proj">
            <h2>{r.projectName}</h2>
            <p className="eo-text">{text[r.id]?.tasksDone}</p>
            <div className="eo-had">{r.photoCount + (photos[r.id]?.length || 0)} ảnh</div>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {rows.map((r) => {
        const list = photos[r.id] || [];
        if (r.locked) {
          return (
            <div key={r.id} className="eo-proj">
              <h2>{r.projectName}</h2>
              <div className="eo-lock">Nhật ký hôm nay đã được duyệt — không cần báo thêm.</div>
            </div>
          );
        }
        return (
          <div key={r.id} className="eo-proj">
            <h2>{r.projectName}</h2>
            <label className="eo-lbl">Công việc + khối lượng hôm nay</label>
            <textarea
              className="eo-ta"
              placeholder="VD: Đổ bê tông sàn tầng 2 ~18m³; xây tường trục A–B ~25m²"
              value={text[r.id]?.tasksDone ?? ""}
              onChange={(e) => setField(r.id, "tasksDone", e.target.value)}
            />
            <label className="eo-lbl">
              Vấn đề / cần hỗ trợ <i>(không có thì bỏ trống)</i>
            </label>
            <textarea
              className="eo-ta sm"
              value={text[r.id]?.issues ?? ""}
              onChange={(e) => setField(r.id, "issues", e.target.value)}
            />
            <label className="eo-lbl">Ảnh công trình</label>
            <div className="eo-photos">
              {list.map((p, i) => (
                <div key={p.url} className="eo-ph">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" />
                  <button type="button" aria-label="Xoá ảnh" onClick={() => removePhoto(r.id, i)}>
                    ×
                  </button>
                </div>
              ))}
              {list.length < MAX_NEW && r.photoCount + list.length < MAX_TOTAL && (
                <button type="button" className="eo-add" onClick={() => inputs.current[r.id]?.click()}>
                  <span>＋</span>Thêm ảnh
                </button>
              )}
            </div>
            <input
              ref={(el) => {
                inputs.current[r.id] = el;
              }}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void addFiles(r, e.target.files);
                e.target.value = "";
              }}
            />
            {r.photoCount > 0 && <div className="eo-had">✓ Đã có {r.photoCount} ảnh trong nhật ký hôm nay</div>}
          </div>
        );
      })}
      {error && <div className="bt-err">{error}</div>}
      <button type="button" className="bt-btn" disabled={!!busy} onClick={save}>
        {busy || "Lưu báo cáo"}
      </button>
      <div className="bt-note">Lưu 1 lần, không sửa được. Mỗi công trình cần ít nhất 1 ảnh.</div>
    </>
  );
}
