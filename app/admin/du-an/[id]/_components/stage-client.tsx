"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { plexMono, plexSans } from "@/lib/fonts";
import {
  PIPELINE_DOC_KEYS,
  PIPELINE_STAGES,
  PUBLIC_SITE_URL,
  pipelinePublicUrl,
} from "@/lib/pipeline";
import type { PipelineDocKind } from "@/lib/pipeline";
import type { PipelineState } from "@/lib/pipeline-server";
import "@/app/projects/_components/pipeline.css";

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

function fmtMoney(n: number | null) {
  return n === null ? "" : n.toLocaleString("vi-VN");
}

export function StageClient({
  pipeline,
  initialView,
}: {
  pipeline: PipelineState;
  initialView: number;
}) {
  const router = useRouter();
  const [state, setState] = useState(pipeline);
  const [view, setView] = useState(initialView);
  const [ver, setVer] = useState(
    pipeline.versions.length
      ? pipeline.versions[pipeline.versions.length - 1].versionNo
      : 1,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [frameH, setFrameH] = useState(900);
  const [frameKey, setFrameKey] = useState(0);
  const [totalDraft, setTotalDraft] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [qtab, setQtab] = useState<"quote" | "cost">("quote");
  const [adminDoc, setAdminDoc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const contractFileRef = useRef<HTMLInputElement>(null);
  const [contractDoc, setContractDoc] = useState<string | null>(null);

  const {
    stage,
    status,
    stageDates,
    versions,
    contractVersionNo,
    contractUpdatedAt,
  } = state;
  const latestNo = versions.length
    ? versions[versions.length - 1].versionNo
    : 1;
  const cur =
    versions.filter((v) => v.versionNo === ver)[0] ||
    versions[versions.length - 1];
  const curNo = cur ? cur.versionNo : 1;
  const isLatest = curNo === latestNo;

  const kind: PipelineDocKind = view === 2 ? "quote" : "description";
  // Giai đoạn 2 có 2 phần: báo giá (khách xem sau khi chốt) và giá vốn (nội bộ, khách không bao giờ thấy).
  const isCost = view === 2 && qtab === "cost";
  const kindLabel = isCost ? "giá vốn" : kind === "quote" ? "báo giá" : "mô tả";
  const docAt = cur
    ? isCost
      ? cur.costUpdatedAt
      : kind === "quote"
        ? cur.quoteUpdatedAt
        : cur.descriptionUpdatedAt
    : null;
  // Khách chỉ có 1 link cho cả dự án (trang cổng: mọi phiên bản mô tả + báo giá).
  const publicUrl = pipelinePublicUrl(state.slug);
  // Mở tab mới thì vào thẳng tab + phiên bản đang xem.
  const openUrl = pipelinePublicUrl(state.slug, kind, curNo);
  const embedSrc = `/mo-ta/${state.slug}?doc=${PIPELINE_DOC_KEYS[kind]}&v=${curNo}&embed=1`;

  const past = view < stage;
  const stageName = (n: number) => PIPELINE_STAGES[n - 1];

  // Trang mô tả / báo giá (khung sandbox) báo chiều cao nội dung → khung cao đúng bằng trang, không cuộn riêng.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow)
        return;
      const d = e.data as { type?: string; h?: number } | null;
      if (!d || d.type !== "hg-mota-height" || typeof d.h !== "number") return;
      setFrameH(Math.min(60000, Math.max(300, Math.ceil(d.h))));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const call = async (
    path: string,
    method: string,
    body?: Record<string, unknown>,
  ) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/pipeline/${state.id}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || "Không lưu được");
        return null;
      }
      setState(json as PipelineState);
      return json as PipelineState;
    } catch {
      setError("Lỗi mạng, thử lại");
      return null;
    } finally {
      setBusy(false);
    }
  };

  // Báo giá + giá vốn ở giai đoạn 2 lấy qua API admin (báo giá chưa chốt và giá vốn không có ở link khách).
  useEffect(() => {
    if (view !== 2 || !docAt) {
      setAdminDoc(null);
      return;
    }
    let alive = true;
    setAdminDoc(null);
    fetch(
      `/api/admin/pipeline/${state.id}/versions/${curNo}/doc?kind=${isCost ? "cost" : "quote"}`,
    )
      .then((r) => (r.ok ? r.json() : { html: "" }))
      .then((j: { html?: string }) => {
        if (alive) setAdminDoc(j.html || "");
      })
      .catch(() => {
        if (alive) setAdminDoc("");
      });
    return () => {
      alive = false;
    };
  }, [view, isCost, curNo, docAt, frameKey, state.id]);

  // File hợp đồng soạn sẵn ở giai đoạn 3 (chỉ admin, không nằm ở link khách).
  useEffect(() => {
    if (view !== 3 || !contractUpdatedAt) {
      setContractDoc(null);
      return;
    }
    let alive = true;
    setContractDoc(null);
    fetch(`/api/admin/pipeline/${state.id}/contract`)
      .then((r) => (r.ok ? r.json() : { html: "" }))
      .then((j: { html?: string }) => {
        if (alive) setContractDoc(j.html || "");
      })
      .catch(() => {
        if (alive) setContractDoc("");
      });
    return () => {
      alive = false;
    };
  }, [view, contractUpdatedAt, state.id]);

  const pickTab = (t: "quote" | "cost") => {
    setQtab(t);
    setTotalDraft(null);
    setFrameH(900);
  };

  const pickVer = (n: number) => {
    setVer(n);
    setTotalDraft(null);
    setFrameH(900);
  };

  const advance = async () => {
    if (stage >= 6) return;
    const by =
      stage === 3 && contractVersionNo
        ? ` theo báo giá V${contractVersionNo}`
        : "";
    if (
      !window.confirm(
        `Chốt giai đoạn ${stage} · ${stageName(stage)}${by} và chuyển sang ${stageName(stage + 1)}?`,
      )
    )
      return;
    const r = await call("", "PATCH", { stage: stage + 1 });
    if (r) setView(r.stage);
  };

  const reopen = async () => {
    if (
      !window.confirm(
        `Mở lại giai đoạn ${view} · ${stageName(view)}? Dự án sẽ lùi từ ${stageName(stage)} về ${stageName(view)}. Mô tả và báo giá các phiên bản vẫn giữ nguyên.`,
      )
    )
      return;
    await call("", "PATCH", { stage: view, status: "active" });
  };

  const finish = async () => {
    if (!window.confirm("Đánh dấu dự án đã bàn giao xong?")) return;
    await call("", "PATCH", { status: "done" });
  };

  const remove = async () => {
    if (
      !window.confirm(
        `Xoá dự án "${state.name}"? Link gửi khách sẽ ngừng hoạt động. Không hoàn tác được.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/pipeline/${state.id}`, {
        method: "DELETE",
      });
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

  const addVersion = async () => {
    const nextNo = latestNo + 1;
    const note = window.prompt(
      `Tạo phiên bản V${nextNo} (mô tả V${nextNo} + báo giá V${nextNo}).` +
        (stage > 1
          ? `\nDự án sẽ quay về giai đoạn 1 · Mô tả. Các bản cũ vẫn giữ nguyên.`
          : "") +
        `\n\nGhi chú thay đổi (có thể để trống):`,
      "",
    );
    if (note === null) return;
    const r = await call("/versions", "POST", {
      note: note.trim().slice(0, 200) || null,
    });
    if (r) {
      pickVer(r.versions[r.versions.length - 1].versionNo);
      setView(1);
    }
  };

  const editNote = async () => {
    const note = window.prompt(
      `Ghi chú cho phiên bản V${curNo}:`,
      (cur && cur.note) || "",
    );
    if (note === null) return;
    await call(`/versions/${curNo}`, "PATCH", {
      note: note.trim().slice(0, 200) || null,
    });
  };

  const removeVersion = async () => {
    if (
      !window.confirm(
        `Xoá phiên bản V${curNo}? Mô tả và báo giá V${curNo} sẽ mất, khách không còn thấy V${curNo}. Không hoàn tác được.`,
      )
    )
      return;
    const r = await call(`/versions/${curNo}`, "DELETE");
    if (r) pickVer(r.versions[r.versions.length - 1].versionNo);
  };

  const chooseContract = async (n: number) => {
    if (!window.confirm(`Chốt hợp đồng theo báo giá V${n}?`)) return;
    await call("", "PATCH", { contractVersionNo: n });
  };

  const setQuotePublished = async (on: boolean) => {
    if (
      !window.confirm(
        on
          ? `Chốt báo giá V${curNo}? Khách mở link sẽ thấy giá ngay.`
          : `Ẩn báo giá V${curNo} khỏi link khách và mở khoá để sửa? Chỉ dùng khi chốt nhầm — chốt lại thì ngày báo giá tính lại từ đầu.`,
      )
    )
      return;
    await call(`/versions/${curNo}`, "PATCH", { quotePublished: on });
  };

  const saveTotal = async () => {
    if (totalDraft === null) return;
    const digits = totalDraft.replace(/[^0-9]/g, "");
    const n = digits ? Number(digits) : null;
    const r = await call(
      `/versions/${curNo}`,
      "PATCH",
      isCost ? { costTotal: n } : { quoteTotal: n },
    );
    if (r) setTotalDraft(null);
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
    if (
      docAt &&
      !window.confirm(
        isCost
          ? `Thay bảng giá vốn V${curNo} bằng file mới? (Nội bộ, khách không thấy.)`
          : kind === "quote"
            ? `Thay trang báo giá V${curNo} bằng file mới? Báo giá sẽ ẩn với khách cho tới khi anh chốt lại.`
            : `Thay trang ${kindLabel} V${curNo} bằng file mới? Khách mở link sẽ thấy bản mới ngay.`,
      )
    )
      return;
    const r = await call(
      `/versions/${curNo}`,
      "PATCH",
      isCost
        ? { costHtml: html }
        : kind === "quote"
          ? { quoteHtml: html }
          : { descriptionHtml: html },
    );
    if (r) {
      setFrameH(900);
      setFrameKey((k) => k + 1);
    }
  };

  const onPickContract = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    if (
      contractUpdatedAt &&
      !window.confirm("Thay file hợp đồng hiện tại bằng file mới?")
    )
      return;
    const r = await call("", "PATCH", { contractHtml: html });
    if (r) setFrameH(900);
  };

  const removeContract = async () => {
    if (
      !window.confirm(
        "Xoá file hợp đồng của dự án này? Không hoàn tác được (cần tải lại file).",
      )
    )
      return;
    await call("", "PATCH", { contractHtml: null });
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

  const subParts = [
    state.customerName,
    state.customerPhone,
    state.address,
    `tạo ${fmtDay(state.createdAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const canAddVersion = stage <= 3 && status !== "done";
  const canRemoveVersion =
    isLatest &&
    versions.length > 1 &&
    contractVersionNo !== curNo &&
    stage <= 3;
  const totalValue =
    totalDraft !== null
      ? totalDraft
      : fmtMoney(cur ? (isCost ? cur.costTotal : cur.quoteTotal) : null);
  // Báo giá đã chốt cho khách thì khoá file + tổng (giá vốn nội bộ vẫn sửa được).
  const quoteLocked =
    view === 2 && !isCost && Boolean(cur && cur.quotePublishedAt);
  const profit =
    cur &&
    cur.quoteTotal !== null &&
    cur.costTotal !== null &&
    cur.costTotal > 0
      ? cur.quoteTotal - cur.costTotal
      : null;

  return (
    <div
      className={`pldoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`}
    >
      <Link className="pl-back" href="/projects">
        ← Dự án
      </Link>
      <div className="pl-head">
        <div>
          <div className="pl-eyebrow">
            Giai đoạn {view} · {stageName(view)}
          </div>
          <h1 className="pl-h1">{state.name}</h1>
          <div className="pl-sub">{subParts}</div>
        </div>
        <div className="pl-hact">
          <button
            type="button"
            className="pl-btn danger"
            onClick={remove}
            disabled={busy}
          >
            Xoá
          </button>
          {past ? (
            <button
              type="button"
              className="pl-btn ghost"
              onClick={reopen}
              disabled={busy}
            >
              ↩ Mở lại giai đoạn này
            </button>
          ) : stage < 6 ? (
            <button
              type="button"
              className="pl-btn"
              onClick={advance}
              disabled={busy}
            >
              Chốt {stageName(stage)} → {stageName(stage + 1)}
            </button>
          ) : status !== "done" ? (
            <button
              type="button"
              className="pl-btn"
              onClick={finish}
              disabled={busy}
            >
              ✓ Đã bàn giao xong
            </button>
          ) : null}
        </div>
      </div>

      <div className="pl-steps">
        {STAGE_NUMS.map((k) => {
          const cls =
            k < stage || (k === stage && status === "done")
              ? "done"
              : k === stage
                ? "cur"
                : "";
          let info =
            cls === "done"
              ? stageDates[String(k)]
                ? `Chốt ${fmtDay(stageDates[String(k)])}`
                : "Đã xong"
              : cls === "cur"
                ? status === "paused"
                  ? "Tạm ngưng"
                  : "Đang làm"
                : "";
          if (info && k <= 2 && versions.length > 1)
            info += ` · ${versions.length} bản`;
          if (info && k === 3 && contractVersionNo)
            info += ` · theo V${contractVersionNo}`;
          return (
            <button
              type="button"
              key={k}
              className={`pl-stp ${cls} ${k === view ? "view" : ""}`}
              disabled={k > stage}
              onClick={() => {
                setView(k);
                setTotalDraft(null);
                setFrameH(900);
              }}
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
          ✓ Đang xem lại giai đoạn {view} · {stageName(view)} (đã chốt). Dự án
          hiện ở giai đoạn {stage} · {stageName(stage)}.
        </div>
      ) : null}
      {error ? <div className="pl-err">{error}</div> : null}

      <input
        ref={fileRef}
        type="file"
        accept=".html,.htm,text/html"
        hidden
        onChange={onPickFile}
      />

      {view <= 2 ? (
        <>
          <div className="pl-vers">
            <span className="lb">Phiên bản</span>
            {versions.map((v) => (
              <button
                type="button"
                key={v.versionNo}
                className={`pl-vt ${v.versionNo === curNo ? "on" : ""}`}
                onClick={() => pickVer(v.versionNo)}
              >
                <b className="pl-num">V{v.versionNo}</b>
                {v.versionNo === latestNo && versions.length > 1 ? (
                  <span className="pl-tag new">mới nhất</span>
                ) : null}
                {v.versionNo === contractVersionNo ? (
                  <span className="pl-tag ct">chốt HĐ</span>
                ) : null}
                <small>
                  {fmtDay(v.createdAt).slice(0, 5)}
                  {v.note ? ` · ${v.note}` : ""}
                </small>
              </button>
            ))}
            {canAddVersion ? (
              <button
                type="button"
                className="pl-vadd"
                onClick={addVersion}
                disabled={busy}
              >
                + Tạo phiên bản V{latestNo + 1}
                <small>mô tả mới + báo giá mới</small>
              </button>
            ) : null}
            <span className="pl-vact">
              <button
                type="button"
                className="pl-btn ghost"
                onClick={editNote}
                disabled={busy}
              >
                ✎ Ghi chú V{curNo}
              </button>
              {canRemoveVersion ? (
                <button
                  type="button"
                  className="pl-btn danger"
                  onClick={removeVersion}
                  disabled={busy}
                >
                  Xoá V{curNo}
                </button>
              ) : null}
            </span>
          </div>

          {view === 2 ? (
            <div className="pl-qtabs">
              <button
                type="button"
                className={`pl-qtab${isCost ? "" : " on"}`}
                onClick={() => pickTab("quote")}
              >
                Báo giá
                <small>khách xem sau khi anh chốt</small>
              </button>
              <button
                type="button"
                className={`pl-qtab${isCost ? " on" : ""}`}
                onClick={() => pickTab("cost")}
              >
                🔒 Giá vốn
                <small>nội bộ, khách không thấy</small>
              </button>
              {profit !== null && cur && cur.costTotal ? (
                <span className="pl-qprofit pl-num">
                  Lãi gộp <b>{fmtMoney(profit)} đ</b> ·{" "}
                  {((profit * 100) / cur.costTotal).toFixed(1)}% trên vốn
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="pl-linkbar">
            <span className="lb">Link gửi khách</span>
            <div className="pl-url pl-num">
              {PUBLIC_SITE_URL}/<b>{state.slug}</b>
            </div>
            <button type="button" className="pl-btn ghost" onClick={copyLink}>
              {copied ? "✓ Đã chép" : "⧉ Chép link"}
            </button>
            <a
              className="pl-btn ghost"
              href={openUrl}
              target="_blank"
              rel="noreferrer"
            >
              ↗ Mở tab mới
            </a>
            <button
              type="button"
              className="pl-btn ghost"
              onClick={() => fileRef.current?.click()}
              disabled={busy || quoteLocked}
              title={
                quoteLocked
                  ? "Báo giá đã chốt cho khách. Tạo phiên bản mới để báo giá lại."
                  : undefined
              }
            >
              {docAt
                ? `⬆ Thay file ${kindLabel} V${curNo}`
                : `⬆ Tải file ${kindLabel} V${curNo}`}
            </button>
          </div>
          <div className="pl-linknote">
            {isCost
              ? docAt
                ? `Bảng giá vốn V${curNo} cập nhật ${fmtDay(docAt, true)} · chỉ xem được trong ERP, không nằm ở link khách. `
                : `Chưa có bảng giá vốn V${curNo}. `
              : docAt
                ? `Trang ${kindLabel} V${curNo} cập nhật ${fmtDay(docAt, true)} · bên dưới là đúng trang khách thấy. `
                : `Chưa có trang ${kindLabel} V${curNo}. `}
            Một link cho cả dự án: khách mở ra chọn Mô tả / Báo giá
            {versions.length > 1 ? " và phiên bản V1, V2…" : ""} ngay trên
            trang.
          </div>

          {view === 2 ? (
            <div className="pl-qtotal">
              <span className="lb">
                {isCost ? "Tổng giá vốn" : "Tổng báo giá"} V{curNo}
              </span>
              <input
                className="pl-num"
                inputMode="numeric"
                placeholder="chưa nhập"
                readOnly={quoteLocked}
                value={totalValue}
                onChange={(e) => {
                  const digits = e.target.value
                    .replace(/[^0-9]/g, "")
                    .slice(0, 12);
                  setTotalDraft(
                    digits ? Number(digits).toLocaleString("vi-VN") : "",
                  );
                }}
              />
              <span>đ</span>
              {totalDraft !== null ? (
                <button
                  type="button"
                  className="pl-btn"
                  onClick={saveTotal}
                  disabled={busy}
                >
                  Lưu
                </button>
              ) : null}
              <span className="hint">
                {isCost
                  ? "Chỉ anh thấy. Dùng để tính lãi gộp so với tổng báo giá."
                  : "Số này hiện ở màn Hợp đồng để chọn báo giá chốt."}
              </span>
            </div>
          ) : null}

          {view === 2 && !isCost && docAt ? (
            <div
              className={`pl-qpub${cur && cur.quotePublishedAt ? " on" : ""}`}
            >
              {cur && cur.quotePublishedAt ? (
                <>
                  <span>
                    <b>Đã chốt</b> — khách đang thấy báo giá V{curNo} (
                    {fmtDay(cur.quotePublishedAt)}). Đã khoá, muốn sửa thì tạo
                    phiên bản mới.
                  </span>
                  <button
                    type="button"
                    className="pl-btn"
                    onClick={() => setQuotePublished(false)}
                    disabled={busy}
                  >
                    Ẩn lại
                  </button>
                </>
              ) : (
                <>
                  <span>
                    <b>Chưa chốt</b> — chỉ anh xem được, khách chưa thấy giá.
                  </span>
                  <button
                    type="button"
                    className="pl-btn"
                    onClick={() => setQuotePublished(true)}
                    disabled={busy}
                  >
                    ✓ Chốt, hiện giá cho khách
                  </button>
                </>
              )}
            </div>
          ) : null}

          {docAt ? (
            <div className="pl-pvw">
              <iframe
                key={`${isCost ? "cost" : kind}-${curNo}-${frameKey}`}
                ref={frameRef}
                {...(view === 2
                  ? { srcDoc: adminDoc === null ? "" : adminDoc }
                  : { src: embedSrc })}
                title={`Trang ${kindLabel} V${curNo}`}
                scrolling="no"
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                style={{ height: frameH }}
              />
            </div>
          ) : (
            <div className="pl-ph">
              <b>
                Chưa có trang {kindLabel} V{curNo}
              </b>
              {isCost
                ? "Tải file giá vốn (.html) lên để lưu nội bộ. Khách không thấy."
                : `Tải file ${kindLabel} (.html) lên để hiện ở đây và ở link gửi khách.`}
              <div>
                <button
                  type="button"
                  className="pl-btn"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  ⬆ Tải file {kindLabel} V{curNo}
                </button>
              </div>
            </div>
          )}
        </>
      ) : view === 3 ? (
        <>
          <div className="pl-pick">
            <h3>Hợp đồng chốt theo báo giá nào?</h3>
            <table>
              <tbody>
                {versions.map((v) => {
                  const sel = v.versionNo === contractVersionNo;
                  return (
                    <tr key={v.versionNo} className={sel ? "sel" : ""}>
                      <td className="v pl-num">V{v.versionNo}</td>
                      <td>
                        {v.note || (v.versionNo === 1 ? "Bản đầu" : "—")}
                        <div className="pl-sub">tạo {fmtDay(v.createdAt)}</div>
                      </td>
                      <td className="lk">
                        {v.descriptionUpdatedAt ? (
                          <a
                            href={pipelinePublicUrl(
                              state.slug,
                              "description",
                              v.versionNo,
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Xem mô tả V{v.versionNo}
                          </a>
                        ) : (
                          <span>Chưa có mô tả</span>
                        )}
                        {v.quoteUpdatedAt ? (
                          <a
                            href={pipelinePublicUrl(
                              state.slug,
                              "quote",
                              v.versionNo,
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Xem báo giá V{v.versionNo}
                          </a>
                        ) : (
                          <span>Chưa có báo giá</span>
                        )}
                      </td>
                      <td className="r pl-num">
                        <b>
                          {v.quoteTotal === null ? "—" : fmtMoney(v.quoteTotal)}
                        </b>
                      </td>
                      <td className="r act">
                        {sel ? (
                          <span className="pl-tag ct">✓ Đang chốt</span>
                        ) : past ? null : (
                          <button
                            type="button"
                            className="pl-btn ghost"
                            onClick={() => chooseContract(v.versionNo)}
                            disabled={busy}
                          >
                            Chọn bản này
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <input
            ref={contractFileRef}
            type="file"
            accept=".html,.htm,text/html"
            hidden
            onChange={onPickContract}
          />
          <div className="pl-linkbar">
            <span className="lb">File hợp đồng</span>
            <div className="pl-url pl-num">
              {contractUpdatedAt
                ? `Cập nhật ${fmtDay(contractUpdatedAt, true)}`
                : "Chưa có"}
            </div>
            {contractUpdatedAt ? (
              <a
                className="pl-btn ghost"
                href={`/api/admin/pipeline/${state.id}/contract?print=1`}
                target="_blank"
                rel="noreferrer"
              >
                🖨 In / lưu PDF
              </a>
            ) : null}
            <button
              type="button"
              className="pl-btn ghost"
              onClick={() => contractFileRef.current?.click()}
              disabled={busy}
            >
              {contractUpdatedAt ? "⬆ Thay file HĐ" : "⬆ Tải file HĐ"}
            </button>
            {contractUpdatedAt ? (
              <button
                type="button"
                className="pl-btn ghost"
                onClick={removeContract}
                disabled={busy}
              >
                Xoá
              </button>
            ) : null}
          </div>
          <div className="pl-linknote">
            Hợp đồng chỉ xem được trong ERP, không nằm ở link khách. Bấm In →
            chọn &quot;Lưu thành PDF&quot; để gửi khách.
          </div>
          {contractUpdatedAt ? (
            <div className="pl-pvw">
              <iframe
                key={`contract-${contractUpdatedAt}`}
                ref={frameRef}
                srcDoc={contractDoc === null ? "" : contractDoc}
                title="Hợp đồng"
                scrolling="no"
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                style={{ height: frameH }}
              />
            </div>
          ) : (
            <div className="pl-ph">
              <b>Chưa có file hợp đồng</b>
              Tải file hợp đồng soạn sẵn (.html) lên để xem và in ở đây.
              <div>
                <button
                  type="button"
                  className="pl-btn"
                  onClick={() => contractFileRef.current?.click()}
                  disabled={busy}
                >
                  ⬆ Tải file HĐ
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
          {state.projectId && view >= 5 ? (
            <div>
              <Link className="pl-btn" href={`/projects/${state.projectId}`}>
                Mở màn dự án thi công
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
