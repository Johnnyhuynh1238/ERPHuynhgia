"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PREP_GROUPS, PREP_STEPS, type PrepStepKey } from "@/lib/prep-steps";

type Info = Record<string, { text: string; warn?: boolean }>;
type SubDoc = {
  id: string;
  code: string;
  title: string;
  subcontractor: string;
  value: number;
  files: { id: string; fileName: string; pdf: boolean; url: string }[];
};

function dateVn(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
}

// GĐ 5 Chuẩn bị: checklist trước thi công.
// Mỗi dòng = tiêu đề mục + file PDF (Xem/Tải) + nút chốt; chốt đủ mới sang GĐ 6 Thi công (API chặn).
export function PrepStage({ projectId }: { projectId: string }) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<Info>({});
  const [contracts, setContracts] = useState<SubDoc[]>([]);
  const [docs, setDocs] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/prep`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || "Không tải được checklist");
        return;
      }
      setDone(json.done || {});
      setInfo(json.info || {});
      setContracts(json.contracts || []);
      setDocs(json.docs || {});
    } catch {
      setError("Lỗi mạng, thử lại");
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (key: PrepStepKey, label: string) => {
    const next = !done[key];
    if (
      !window.confirm(
        next ? `Chốt mục "${label}" — đã chuẩn bị xong?` : `Mở lại mục "${label}"?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/prep`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: key, done: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || "Không lưu được");
        return;
      }
      setDone(json.done || {});
    } catch {
      setError("Lỗi mạng, thử lại");
    } finally {
      setBusy(false);
    }
  };

  const doneCount = PREP_STEPS.filter((s) => done[s.key]).length;

  // File của 1 mục: hồ sơ PDF làm tay (MinIO) hoặc file PDF HĐ thầu phụ.
  const filesOf = (key: PrepStepKey, label: string) =>
    key === "thau_phu"
      ? contracts.flatMap((c) => {
          const pdf = c.files.find((f) => f.pdf);
          return pdf ? [{ id: c.id, name: pdf.fileName, url: pdf.url, sub: `${c.code} · ${c.subcontractor}` }] : [];
        })
      : docs[key]
        ? [
            {
              id: key,
              name: `${label}.pdf`,
              url: `/api/projects/${projectId}/prep/doc/${key}`,
              sub: `Cập nhật ${dateVn(docs[key])}`,
            },
          ]
        : [];

  // 1 dòng mục: tiêu đề + file (Xem / Tải) ngay bên cạnh + nút chốt. Không có khung chi tiết riêng.
  const row = (key: PrepStepKey, label: string, path: string, sub: boolean) => {
    const ok = Boolean(done[key]);
    const files = filesOf(key, label);
    return (
      <div key={key} className={`pl-pr${sub ? " sub" : ""}${ok ? " ok" : ""}`}>
        <span className="dot">{ok ? "✓" : ""}</span>
        <div className="pl-pr-main">
          <div className="pl-pr-t">
            <b>{label}</b>
            {ok ? <small>Đã chốt {dateVn(done[key])}</small> : null}
          </div>
          {key === "nhan_su" ? (
            <div className={`pl-pr-info${info[key]?.warn ? " warn" : ""}`}>
              {info[key]?.text || "…"}{" "}
              <Link href={`/projects/${projectId}/${path}`}>Mở ›</Link>
            </div>
          ) : null}
          {files.map((f) => (
            <div className="pl-pr-file" key={f.id}>
              <span className="pl-fileIc">PDF</span>
              <span className="pl-fileNm">
                {f.name}
                <small>{f.sub}</small>
              </span>
              <a className="pl-btn ghost" href={f.url} target="_blank" rel="noreferrer">
                Xem
              </a>
              <a className="pl-btn ghost" href={f.url} download={f.name}>
                Tải
              </a>
            </div>
          ))}
        </div>
        <button
          type="button"
          className={`pl-btn pl-pr-chot${ok ? " ghost" : ""}`}
          onClick={() => toggle(key, label)}
          disabled={busy}
        >
          {ok ? "Mở lại" : "✓ Chốt"}
        </button>
      </div>
    );
  };

  return (
    <div className="pl-design">
      {error ? <div className="pl-err">{error}</div> : null}
      <div
        className={doneCount === PREP_STEPS.length ? "pl-ok" : "pl-prepbar"}
      >
        {doneCount === PREP_STEPS.length
          ? "✓ Đã chuẩn bị đủ — có thể chốt sang Thi công."
          : `Đã chốt ${doneCount}/${PREP_STEPS.length} mục — chốt đủ mới được sang Thi công.`}
      </div>

      <div className="pl-prlist">
        {PREP_GROUPS.map((g) => {
          const steps = PREP_STEPS.filter((s) => s.group === g.group);
          if (steps.length === 1) return row(steps[0].key, g.title, steps[0].path, false);
          return (
            <div key={g.group}>
              <div className={`pl-pr-head${steps.every((s) => done[s.key]) ? " ok" : ""}`}>
                {g.title}
              </div>
              {steps.map((s) => row(s.key, s.label, s.path, true))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
