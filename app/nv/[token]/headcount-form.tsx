"use client";

import { useState } from "react";

type Row = { id: string; projectName: string };

export function HeadcountFormClient({ token, rows }: { token: string; rows: Row[] }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, number> | null>(null);

  const setVal = (id: string, v: string) => setVals((s) => ({ ...s, [id]: v.replace(/\D/g, "").slice(0, 3) }));
  const bump = (id: string, d: number) =>
    setVals((s) => ({ ...s, [id]: String(Math.max(0, (Number(s[id]) || 0) + d)) }));

  const filled = rows.every((r) => (vals[r.id] ?? "") !== "");
  const total = rows.reduce((a, r) => a + (Number(vals[r.id]) || 0), 0);

  async function save() {
    setError(null);
    if (!filled) {
      setError("Anh điền đủ số thợ cho tất cả công trình (không có thợ ghi 0).");
      return;
    }
    const lines = rows.map((r) => `${r.projectName}: ${vals[r.id]} thợ`).join("\n");
    if (!window.confirm(`Lưu số thợ?\n\n${lines}\n\nLưu xong không sửa được.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/nv/${encodeURIComponent(token)}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ counts: Object.fromEntries(rows.map((r) => [r.id, Number(vals[r.id])])) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message || "Lưu không được, anh thử lại.");
        return;
      }
      setSaved(Object.fromEntries(rows.map((r) => [r.id, Number(vals[r.id])])));
    } catch {
      setError("Mất mạng, anh thử lại.");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="bt-card">
        <div className="bt-banner ok">✓ Đã lưu — link đã khoá, anh đóng trang được rồi</div>
        {rows.map((r) => (
          <div key={r.id} className="bt-row">
            <span className="bt-name">{r.projectName}</span>
            <b>{saved[r.id]} thợ</b>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="bt-card">
        {rows.map((r) => (
          <div key={r.id} className="bt-row">
            <span className="bt-name">{r.projectName}</span>
            <div className="bt-step">
              <button type="button" aria-label="Bớt" onClick={() => bump(r.id, -1)}>−</button>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="?"
                value={vals[r.id] ?? ""}
                onChange={(e) => setVal(r.id, e.target.value)}
              />
              <button type="button" aria-label="Thêm" onClick={() => bump(r.id, 1)}>+</button>
            </div>
          </div>
        ))}
      </div>
      {rows.length > 1 && (
        <div className="bt-total">
          <span>Tổng</span>
          <b>{total} thợ</b>
        </div>
      )}
      {error && <div className="bt-err">{error}</div>}
      <button type="button" className="bt-btn" disabled={saving} onClick={save}>
        {saving ? "Đang lưu…" : "Lưu"}
      </button>
      <div className="bt-note">Lưu 1 lần, không sửa được. Không có thợ ghi 0.</div>
    </>
  );
}
