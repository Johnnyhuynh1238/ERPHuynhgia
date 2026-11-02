"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SwipeLightbox } from "@/components/swipe-lightbox";
import { Camera, CheckCircle2, ChevronDown, Clock, Download, FileText, PenLine, Printer, Trash2 } from "lucide-react";

type Kind = "bien_ban" | "site";

type FileItem = {
  key: string;
  contentType: string;
  name: string;
  uploadedBy: string;
  uploadedAt: string;
};

type Milestone = {
  id: string;
  seq: number;
  title: string;
  description: string | null;
  status: "pending" | "signed";
  signedAt: string | null;
  bienBanPhotos: FileItem[];
  sitePhotos: FileItem[];
  templateFiles: FileItem[];
  esign: Esign | null;
  // Gán mốc: công tác tiến độ gắn với mốc (null = API cũ).
  readiness: { state: "da_ky" | "chua_gan" | "den_han" | "dang_lam" | "chua_toi"; done: number; total: number } | null;
};

// Phiên ký online mới nhất của mốc (API /acceptance trả kèm).
type Esign = {
  status: "ks_draft" | "cho_khach" | "chot" | "xong" | "huy";
  ksLink: string;
  partyLink: string;
  partyName: string | null;
  partyNote: string | null;
};

const fmtDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" }) : "";

const isPdf = (f: FileItem) => f.contentType === "application/pdf";

// Thầu phụ: dòng đầu mô tả = "Đợt N — khối lượng" → gom card theo đợt thanh toán.
const dotOf = (m: Milestone) => (m.description ?? "").split("\n")[0];

// Danh sách đợt nghiệm thu (chủ nhà hoặc thầu phụ/đội khoán). Mỗi đợt: in BB mẫu → ký giấy tại
// công trình → KS chụp BB đã ký + ảnh công trình. Có ảnh BB → đợt chuyển "Đã nghiệm thu".
export function KsAcceptanceClient({
  projectId,
  userId,
  group = "chu_nha",
  initialOpen,
}: {
  projectId: string;
  userId: string;
  group?: "chu_nha" | "thau_phu";
  initialOpen?: string; // từ nhắc việc "BB sắp tới" → mở sẵn card này
}) {
  const [rows, setRows] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [openDot, setOpenDot] = useState<string | null>(null); // thầu phụ: nhóm đợt đang mở
  const [busy, setBusy] = useState<string | null>(null); // `${id}:${kind}` đang tải lên
  const [lightbox, setLightbox] = useState<{ imgs: string[]; idx: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<{ id: string; kind: Kind } | null>(null);
  const opened = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/acceptance?kind=${group}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Lỗi tải dữ liệu");
      const list: Milestone[] = j.milestones;
      setRows(list);
      // Lần đầu mở sẵn đợt đang chờ đầu tiên.
      if (!opened.current) {
        opened.current = true;
        const first = list.find((m) => m.id === initialOpen) ??
          list.find((m) => m.status !== "signed" && m.readiness?.state === "den_han") ??
          list.find((m) => m.status !== "signed");
        setOpen(first?.id ?? null);
        setOpenDot(first ? dotOf(first) : null);
        if (first && first.id === initialOpen) {
          setTimeout(() => document.getElementById(`ms-${first.id}`)?.scrollIntoView({ block: "start" }), 50);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [projectId, group, initialOpen]);

  useEffect(() => {
    void load();
  }, [load]);

  const photoBase = (mid: string) => `/api/projects/${projectId}/acceptance/${mid}/photos`;
  const fileUrl = (mid: string, f: FileItem) => `${photoBase(mid)}/file?key=${encodeURIComponent(f.key)}`;

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
    setBusy(`${t.id}:${t.kind}`);
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
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeFile(mid: string, kind: Kind, f: FileItem) {
    if (!window.confirm(`Xoá file "${f.name}"?`)) return;
    const r = await fetch(`${photoBase(mid)}?kind=${kind}&key=${encodeURIComponent(f.key)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return void toast.error(j.message || "Không xoá được");
    toast.success(j.message || "Đã xoá");
    void load();
  }

  async function startEsign(m: Milestone) {
    setBusy(`${m.id}:esign`);
    try {
      const r = await fetch(`/api/projects/${projectId}/acceptance/${m.id}/esign`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || "Không tạo được biên bản");
      toast.success(j.message || "Đã tạo biên bản ký online");
      void load();
      if (j.esign?.status === "ks_draft") window.location.href = j.esign.ksLink;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tạo được biên bản");
    } finally {
      setBusy(null);
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Đã chép link, anh dán vào Zalo khách");
    } catch {
      window.prompt("Chép link này gửi khách:", link);
    }
  }

  // Ký online (02/11/2026): KS điền + ký trên điện thoại → khách ký qua link Zalo → PDF tự đính vào mục 1.
  function esignBlock(m: Milestone) {
    const e = m.esign;
    if (m.status === "signed" || e?.status === "xong") return null;
    // Chủ nhà tạm chưa ký online (Zalo cty chưa kết bạn khách) — chỉ đội khoán.
    if (group !== "thau_phu" && !e) return null;
    const isBusy = busy === `${m.id}:esign`;
    return (
      <div className="mb-4 rounded-xl border-2 border-[#ff8a3d]/50 bg-[#211a14] p-3">
        <div className="flex items-center gap-2 text-base font-bold text-orange-300">
          <PenLine className="h-5 w-5" /> Ký online
        </div>
        {e?.status === "cho_khach" || e?.status === "chot" ? (
          <>
            <p className="mt-1 text-sm text-[#c9cde4]">
              Anh đã ký. Đang chờ {e.partyName ?? (group === "thau_phu" ? "đội khoán" : "khách")} ký.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <a href={e.ksLink} className="ksql-tap rounded-xl bg-[#252840] px-3 py-3 text-center text-sm font-bold text-[#f0f2ff]">
                Xem biên bản
              </a>
              <button
                type="button"
                onClick={() => void copyLink(e.partyLink)}
                className="ksql-tap rounded-xl bg-[#252840] px-3 py-3 text-sm font-bold text-orange-300"
              >
                Chép link khách
              </button>
            </div>
          </>
        ) : (
          <>
            {e?.partyNote ? (
              <p className="mt-1 rounded-lg bg-[#3a1f1a] px-3 py-2 text-sm text-[#fca5a5]">
                ↩ Khách chưa đồng ý: {e.partyNote}
              </p>
            ) : (
              <p className="mt-1 text-sm text-[#c9cde4]">
                {group === "thau_phu"
                  ? "Anh điền kết quả + chụp ảnh + ký trên máy. Ký xong PDF tự đính vào đây và gửi Zalo cho đội khoán."
                  : "Anh điền kết quả + chụp ảnh + ký trên máy. Ký xong máy gửi Zalo cho khách ký, khách ký xong PDF tự đính vào đây."}
              </p>
            )}
            <button
              type="button"
              disabled={!!busy}
              onClick={() => (e ? (window.location.href = e.ksLink) : void startEsign(m))}
              className="ksql-tap mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff8a3d] px-4 py-3 text-base font-bold text-[#0f1015] disabled:opacity-60"
            >
              <PenLine className="h-5 w-5" />
              {isBusy ? "Đang mở…" : e ? "Mở biên bản để điền + ký" : "Điền + ký biên bản online"}
            </button>
          </>
        )}
      </div>
    );
  }

  if (loading) {
    return <div className="py-10 text-center text-base text-[#8892b0]">Đang tải…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-[#252840] bg-[#13151f] px-5 py-6 text-center text-base text-[#8892b0]">
        {group === "thau_phu"
          ? "Chưa có đợt nghiệm thu thầu phụ cho dự án này."
          : "Admin chưa tạo đợt nghiệm thu cho dự án này."}
      </div>
    );
  }

  const signedCount = rows.filter((m) => m.status === "signed").length;

  const fileGrid = (m: Milestone, kind: Kind, files: FileItem[]) =>
    files.length ? (
      <div className="mt-3 grid grid-cols-3 gap-2">
        {files.map((f) => (
          <div key={f.key} className="relative overflow-hidden rounded-xl border-2 border-[#252840] bg-[#13151f]">
            {isPdf(f) ? (
              <a href={fileUrl(m.id, f)} target="_blank" rel="noopener" className="block">
                <div className="flex aspect-square flex-col items-center justify-center gap-1 px-1 text-center">
                  <FileText className="h-8 w-8 text-orange-300" />
                  <span className="line-clamp-2 break-all text-[11px] text-[#8892b0]">{f.name}</span>
                </div>
              </a>
            ) : (
              <a
                href={fileUrl(m.id, f)}
                className="block"
                onClick={(e) => {
                  e.preventDefault();
                  const imgs = files.filter((x) => !isPdf(x));
                  setLightbox({ imgs: imgs.map((x) => fileUrl(m.id, x)), idx: imgs.indexOf(f) });
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(m.id, f)} alt={f.name} loading="lazy" className="aspect-square w-full object-cover" />
              </a>
            )}
            <a
              href={`${fileUrl(m.id, f)}&download=1`}
              aria-label={`Tải ${f.name}`}
              className="absolute bottom-1 left-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-orange-300"
            >
              <Download className="h-4 w-4" />
            </a>
            {f.uploadedBy === userId ? (
              <button
                type="button"
                onClick={() => void removeFile(m.id, kind, f)}
                aria-label={`Xoá ${f.name}`}
                className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-[#f87171]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    ) : null;

  function uploadButton(m: Milestone, kind: Kind, label: string) {
    const isBusy = busy === `${m.id}:${kind}`;
    return (
      <button
        type="button"
        disabled={!!busy}
        onClick={() => pick(m.id, kind)}
        className="ksql-tap mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff8a3d] px-4 py-3 text-base font-bold text-[#0f1015] disabled:opacity-60"
      >
        <Camera className="h-5 w-5" />
        {isBusy ? "Đang tải lên…" : label}
      </button>
    );
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void upload(e.target.files)}
      />

      <div className="text-center text-base text-[#8892b0]">
        Đã nghiệm thu <b className="text-[#34d399]">{signedCount}</b> / {rows.length}{" "}
        {group === "thau_phu" ? "biên bản" : "đợt"}
      </div>

      {rows.map((m, i) => {
        const done = m.status === "signed";
        const isOpen = open === m.id;
        const dot = group === "thau_phu" ? dotOf(m) : null;
        const dotRows = dot !== null ? rows.filter((r) => dotOf(r) === dot) : [];
        const header =
          dot !== null && (i === 0 || dotOf(rows[i - 1]) !== dot) ? (
            <button
              type="button"
              onClick={() => setOpenDot(openDot === dot ? null : dot)}
              className="ksql-tap mt-2 flex w-full items-center gap-2 rounded-xl bg-[#252840] px-4 py-3 text-left"
            >
              <span className="min-w-0 flex-1 text-base font-bold text-orange-300">{dot}</span>
              <span className="shrink-0 text-sm text-[#8892b0]">
                {dotRows.some((r) => r.status !== "signed" && r.readiness?.state === "den_han") ? (
                  <b className="mr-2 text-[#ff8a3d]">
                    {dotRows.filter((r) => r.status !== "signed" && r.readiness?.state === "den_han").length} đến hạn
                  </b>
                ) : null}
                {dotRows.filter((r) => r.status === "signed").length}/{dotRows.length}
              </span>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-[#8892b0] transition ${openDot === dot ? "rotate-180" : ""}`}
              />
            </button>
          ) : null;
        if (dot !== null && openDot !== dot) return <Fragment key={m.id}>{header}</Fragment>;
        return (
          <Fragment key={m.id}>
          {header}
          <div
            id={`ms-${m.id}`}
            className={`rounded-2xl border-2 ${done ? "border-[#34d399]/50 bg-[#152418]" : "border-[#ff8a3d]/40 bg-[#1a1d2e]"}`}
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : m.id)}
              className="ksql-tap flex w-full items-center gap-3 px-4 py-4 text-left"
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold ${done ? "bg-[#34d399] text-[#0f1015]" : "bg-[#252840] text-orange-300"}`}
              >
                {m.seq}
              </div>
              <div className="min-w-0 flex-1">
                <div className="break-words text-lg font-bold text-[#f0f2ff]">{m.title}</div>
                <div
                  className={`mt-1 flex items-center gap-1 text-sm ${done ? "text-[#34d399]" : m.readiness?.state === "den_han" ? "font-bold text-[#ff8a3d]" : m.readiness?.total ? "text-[#8892b0]" : "text-[#fbbf24]"}`}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  {done
                    ? `Đã nghiệm thu ${fmtDay(m.signedAt)}`
                    : m.readiness?.state === "den_han"
                      ? "Đến hạn nghiệm thu"
                      : m.readiness?.total
                        ? `Chưa tới · xong ${m.readiness.done}/${m.readiness.total} công tác`
                        : "Chờ nghiệm thu"}
                  <span className="text-[#8892b0]">
                    · BB {m.bienBanPhotos.length} · Ảnh {m.sitePhotos.length}
                  </span>
                </div>
              </div>
              <ChevronDown className={`h-6 w-6 shrink-0 text-[#8892b0] transition ${isOpen ? "rotate-180" : ""}`} />
            </button>

            {isOpen ? (
              <div className="border-t-2 border-[#252840] px-4 pb-4 pt-3">
                {m.description ? (
                  <p className="mb-3 whitespace-pre-line text-sm text-[#8892b0]">{m.description}</p>
                ) : null}

                {esignBlock(m)}

                {m.templateFiles.length ? (
                  <div className="mb-4 flex flex-col gap-2">
                    {m.templateFiles.map((f) => (
                      <div key={f.key} className="flex items-center gap-2">
                        <a
                          href={fileUrl(m.id, f)}
                          target="_blank"
                          rel="noopener"
                          className="ksql-tap flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-[#252840] px-4 py-3 text-base text-[#f0f2ff]"
                        >
                          <Printer className="h-5 w-5 shrink-0 text-orange-300" />
                          <span className="min-w-0 flex-1 truncate">Xem / in BB mẫu · {f.name}</span>
                        </a>
                        <a
                          href={`${fileUrl(m.id, f)}&download=1`}
                          aria-label={`Tải ${f.name}`}
                          className="ksql-tap flex h-12 shrink-0 items-center gap-1 rounded-xl bg-[#ff8a3d] px-3 text-sm font-bold text-[#0f1015]"
                        >
                          <Download className="h-5 w-5" />
                          Tải về
                        </a>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="text-base font-bold text-[#f0f2ff]">1. Biên bản đã ký ({m.bienBanPhotos.length})</div>
                {fileGrid(m, "bien_ban", m.bienBanPhotos)}
                {uploadButton(m, "bien_ban", "Chụp / tải biên bản")}

                <div className="mt-5 text-base font-bold text-[#f0f2ff]">2. Ảnh công trình ({m.sitePhotos.length})</div>
                {fileGrid(m, "site", m.sitePhotos)}
                {uploadButton(m, "site", "Chụp / tải ảnh công trình")}
              </div>
            ) : null}
          </div>
          </Fragment>
        );
      })}
      {lightbox && <SwipeLightbox imgs={lightbox.imgs} startIdx={lightbox.idx} onClose={() => setLightbox(null)} />}
    </>
  );
}
