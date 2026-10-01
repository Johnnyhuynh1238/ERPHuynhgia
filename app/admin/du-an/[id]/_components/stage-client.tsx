"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { plexMono, plexSans } from "@/lib/fonts";
import { PIPELINE_STAGES, PUBLIC_SITE_URL, pipelinePublicUrl } from "@/lib/pipeline";
import "@/app/projects/_components/pipeline.css";

type Pipeline = {
  id: string;
  name: string;
  customerName: string;
  customerPhone: string | null;
  address: string | null;
  slug: string;
  stage: number;
  status: string;
  stageDates: Record<string, string>;
  descriptionUpdatedAt: string | null;
  projectId: string | null;
  createdAt: string;
};

const STAGE_NUMS = [1, 2, 3, 4, 5, 6];
const MAX_HTML_CHARS = 3 * 1024 * 1024;

function fmtDay(iso: string | null | undefined, withTime = false) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p2 = (n: number) => String(n).padStart(2, "0");
  const day = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
  return withTime ? `${day} ${p2(d.getHours())}:${p2(d.getMinutes())}` : day;
}

export function StageClient({ pipeline, initialView }: { pipeline: Pipeline; initialView: number }) {
  const router = useRouter();
  const [stage, setStage] = useState(pipeline.stage);
  const [status, setStatus] = useState(pipeline.status);
  const [stageDates, setStageDates] = useState(pipeline.stageDates);
  const [descAt, setDescAt] = useState(pipeline.descriptionUpdatedAt);
  const [view, setView] = useState(initialView);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [frameH, setFrameH] = useState(900);
  const [frameKey, setFrameKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const publicUrl = pipelinePublicUrl(pipeline.slug);
  const past = view < stage;
  const stageName = (n: number) => PIPELINE_STAGES[n - 1];

  // Trang mô tả (khung sandbox) báo chiều cao nội dung → khung cao đúng bằng trang, không cuộn riêng.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const d = e.data as { type?: string; h?: number } | null;
      if (!d || d.type !== "hg-mota-height" || typeof d.h !== "number") return;
      setFrameH(Math.min(60000, Math.max(300, Math.ceil(d.h))));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/pipeline/${pipeline.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || "Không lưu được");
        return null;
      }
      setStage(json.stage);
      setStatus(json.status);
      setStageDates((json.stageDates || {}) as Record<string, string>);
      setDescAt(json.descriptionUpdatedAt || null);
      return json as { stage: number };
    } catch {
      setError("Lỗi mạng, thử lại");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    if (stage >= 6) return;
    if (!window.confirm(`Chốt giai đoạn ${stage} · ${stageName(stage)} và chuyển sang ${stageName(stage + 1)}?`)) return;
    const r = await patch({ stage: stage + 1 });
    if (r) setView(r.stage);
  };

  const reopen = async () => {
    if (
      !window.confirm(
        `Mở lại giai đoạn ${view} · ${stageName(view)}? Dự án sẽ lùi từ ${stageName(stage)} về ${stageName(view)}.`,
      )
    )
      return;
    await patch({ stage: view, status: "active" });
  };

  const finish = async () => {
    if (!window.confirm("Đánh dấu dự án đã bàn giao xong?")) return;
    await patch({ status: "done" });
  };

  const remove = async () => {
    if (!window.confirm(`Xoá dự án "${pipeline.name}"? Link gửi khách sẽ ngừng hoạt động. Không hoàn tác được.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/pipeline/${pipeline.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.message || "Không xoá được");
        setBusy(false);
        return;
      }
      router.push("/projects");
    } catch {
      setError("Lỗi mạng, thử lại");
      setBusy(false);
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.html?$/i.test(file.name)) {
      setError("Chỉ nhận file .html");
      return;
    }
    const html = await file.text();
    if (html.length > MAX_HTML_CHARS) {
      setError("File quá lớn (tối đa 3MB)");
      return;
    }
    if (descAt && !window.confirm("Thay trang mô tả hiện tại bằng file mới? Khách mở link sẽ thấy bản mới ngay.")) return;
    const r = await patch({ descriptionHtml: html });
    if (r) {
      setFrameH(900);
      setFrameKey((k) => k + 1);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Chép link gửi khách:", publicUrl);
    }
  };

  const subParts = [pipeline.customerName, pipeline.customerPhone, pipeline.address, `tạo ${fmtDay(pipeline.createdAt)}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`pldoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`}>
      <Link className="pl-back" href="/projects">
        ← Dự án
      </Link>
      <div className="pl-head">
        <div>
          <div className="pl-eyebrow">
            Giai đoạn {view} · {stageName(view)}
          </div>
          <h1 className="pl-h1">{pipeline.name}</h1>
          <div className="pl-sub">{subParts}</div>
        </div>
        <div className="pl-hact">
          <button type="button" className="pl-btn danger" onClick={remove} disabled={busy}>
            Xoá
          </button>
          {past ? (
            <button type="button" className="pl-btn ghost" onClick={reopen} disabled={busy}>
              ↩ Mở lại giai đoạn này
            </button>
          ) : stage < 6 ? (
            <button type="button" className="pl-btn" onClick={advance} disabled={busy}>
              Chốt {stageName(stage)} → {stageName(stage + 1)}
            </button>
          ) : status !== "done" ? (
            <button type="button" className="pl-btn" onClick={finish} disabled={busy}>
              ✓ Đã bàn giao xong
            </button>
          ) : null}
        </div>
      </div>

      <div className="pl-steps">
        {STAGE_NUMS.map((k) => {
          const cls = k < stage || (k === stage && status === "done") ? "done" : k === stage ? "cur" : "";
          const info =
            cls === "done"
              ? stageDates[String(k)]
                ? `Chốt ${fmtDay(stageDates[String(k)])}`
                : "Đã xong"
              : cls === "cur"
                ? status === "paused"
                  ? "Tạm ngưng"
                  : "Đang làm"
                : "";
          return (
            <button
              type="button"
              key={k}
              className={`pl-stp ${cls} ${k === view ? "view" : ""}`}
              disabled={k > stage}
              onClick={() => setView(k)}
            >
              <i className="pl-num">{cls === "done" ? "✓" : k}</i>
              <span>
                {stageName(k)}
                {info ? <small>{info}</small> : null}
              </span>
            </button>
          );
        })}
      </div>

      {past ? (
        <div className="pl-review">
          ✓ Đang xem lại giai đoạn {view} · {stageName(view)} (đã chốt). Dự án hiện ở giai đoạn {stage} ·{" "}
          {stageName(stage)}.
        </div>
      ) : null}
      {error ? <div className="pl-err">{error}</div> : null}

      <input ref={fileRef} type="file" accept=".html,.htm,text/html" hidden onChange={onPickFile} />

      {view === 1 ? (
        <>
          <div className="pl-linkbar">
            <span className="lb">Link gửi khách</span>
            <div className="pl-url pl-num">
              {PUBLIC_SITE_URL}/<b>{pipeline.slug}</b>
            </div>
            <button type="button" className="pl-btn ghost" onClick={copyLink}>
              {copied ? "✓ Đã chép" : "⧉ Chép link"}
            </button>
            <a className="pl-btn ghost" href={publicUrl} target="_blank" rel="noreferrer">
              ↗ Mở tab mới
            </a>
            <button type="button" className="pl-btn ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
              {descAt ? "⬆ Thay file mô tả" : "⬆ Tải file mô tả"}
            </button>
          </div>
          <div className="pl-linknote">
            {descAt
              ? `Trang mô tả cập nhật ${fmtDay(descAt, true)} · bên dưới là đúng trang khách thấy khi mở link.`
              : "Chưa có trang mô tả — khách mở link sẽ thấy thông báo đang chuẩn bị."}
          </div>
          {descAt ? (
            <div className="pl-pvw">
              <iframe
                key={frameKey}
                ref={frameRef}
                src={`/mo-ta/${pipeline.slug}?embed=1`}
                title="Trang mô tả gói thi công"
                scrolling="no"
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                style={{ height: frameH }}
              />
            </div>
          ) : (
            <div className="pl-ph">
              <b>Chưa có trang mô tả</b>
              Tải file mô tả (.html) của khách lên để hiện ở đây và ở link gửi khách.
              <div>
                <button type="button" className="pl-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
                  ⬆ Tải file mô tả
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="pl-ph">
          <b>
            Giai đoạn {view} · {stageName(view)}
          </b>
          Màn chi tiết của giai đoạn này sẽ làm ở đợt sau.
          {pipeline.projectId && view >= 5 ? (
            <div>
              <Link className="pl-btn" href={`/projects/${pipeline.projectId}`}>
                Mở màn dự án thi công
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
