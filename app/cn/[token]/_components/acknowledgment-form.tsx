"use client";

import { useRef, useState } from "react";

type Props = {
  action: string;
};

type RatingField = "taskRating" | "ksRatingExpertise" | "ksRatingAttitude" | "ksRatingCommunication";

const KS_RATING_FIELDS: Array<{ name: RatingField; label: string }> = [
  { name: "ksRatingExpertise", label: "Chuyên môn & kỹ thuật" },
  { name: "ksRatingAttitude", label: "Thái độ phục vụ" },
  { name: "ksRatingCommunication", label: "Giao tiếp & phản hồi" },
];

function RatingInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="mb-1 text-sm font-medium text-white">{label}</div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className={`h-10 w-10 rounded-xl border text-xl transition ${star <= value ? "border-amber-400 bg-amber-400/15 text-amber-300" : "border-[#444] bg-[#2a2a2a] text-neutral-500"}`}
            aria-label={`${label}: ${star} sao`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

export function AcknowledgmentForm({ action }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signatureData, setSignatureData] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [ratings, setRatings] = useState<Record<RatingField, number>>({
    taskRating: 0,
    ksRatingExpertise: 0,
    ksRatingAttitude: 0,
    ksRatingCommunication: 0,
  });
  const [error, setError] = useState("");

  const canSubmit = confirmed && hasDrawn && Boolean(signatureData) && Object.values(ratings).every((value) => value >= 1 && value <= 5);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  }

  function beginDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const p = pointFromEvent(e);
    if (!ctx || !p) return;

    canvas.setPointerCapture(e.pointerId);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#f8fafc";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setDrawing(true);
  }

  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const p = pointFromEvent(e);
    if (!ctx || !p) return;

    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasDrawn(true);
    setSignatureData(canvas!.toDataURL("image/png"));
    setError("");
  }

  function endDraw() {
    if (!drawing) return;
    const canvas = canvasRef.current;
    setDrawing(false);
    if (canvas && hasDrawn) {
      setSignatureData(canvas.toDataURL("image/png"));
    }
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setSignatureData("");
    setError("");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!canSubmit) {
      e.preventDefault();
      setError("Vui lòng đánh giá đủ 4 mục, vẽ chữ ký và tick xác nhận.");
    }
  }

  function updateRating(name: RatingField, value: number) {
    setRatings((prev) => ({ ...prev, [name]: value }));
    setError("");
  }

  return (
    <form action={action} method="post" className="owner-section border border-amber-500/25 text-sm" onSubmit={onSubmit}>
      <div className="owner-section-title">ĐÁNH GIÁ VÀ XÁC NHẬN NGHIỆM THU</div>
      <p className="mt-1 text-xs owner-muted">Sau khi xác nhận, task sẽ hoàn tất và đánh giá không thể sửa.</p>

      <div className="mt-4 space-y-5">
        <div className="owner-card">
          <RatingInput label="Mức độ hài lòng với chất lượng task" value={ratings.taskRating} onChange={(value) => updateRating("taskRating", value)} />
          <input type="hidden" name="taskRating" value={ratings.taskRating || ""} readOnly />
          <textarea name="taskNote" rows={2} className="owner-textarea mt-3 placeholder:text-neutral-500" placeholder="Ghi chú task (tùy chọn)" />
        </div>

        <div className="owner-card">
          <div className="mb-3 font-semibold text-white">Đánh giá kỹ sư</div>
          <div className="space-y-4">
            {KS_RATING_FIELDS.map((field) => (
              <div key={field.name}>
                <RatingInput label={field.label} value={ratings[field.name]} onChange={(value) => updateRating(field.name, value)} />
                <input type="hidden" name={field.name} value={ratings[field.name] || ""} readOnly />
              </div>
            ))}
          </div>
          <textarea name="ksNote" rows={2} className="owner-textarea mt-3 placeholder:text-neutral-500" placeholder="Ghi chú kỹ sư (tùy chọn)" />
        </div>
      </div>

      <div className="mt-4 font-semibold text-white">Chữ ký nghiệm thu</div>
      <p className="mt-1 text-xs owner-muted">Vui lòng ký tên vào khung bên dưới.</p>

      <div className="mt-2 overflow-hidden rounded-xl border border-[#444] bg-[#2a2a2a]">
        <canvas
          ref={canvasRef}
          width={760}
          height={280}
          className="h-40 w-full touch-none"
          onPointerDown={beginDraw}
          onPointerMove={moveDraw}
          onPointerUp={endDraw}
          onPointerCancel={endDraw}
        />
      </div>

      <input type="hidden" name="signatureUrl" value={signatureData} readOnly />

      <div className="mt-2 flex justify-end">
        <button type="button" className="rounded-lg border border-[#444] px-3 py-1 text-xs text-neutral-200" onClick={clearSignature}>
          Xóa chữ ký
        </button>
      </div>

      <textarea name="note" rows={2} className="owner-textarea mt-2 placeholder:text-neutral-500" placeholder="Ghi chú nghiệm thu (tùy chọn)" />
      <label className="mt-2 flex items-center gap-2 text-xs text-neutral-300">
        <input type="checkbox" required name="confirmed" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        Tôi đã kiểm tra, đồng ý nghiệm thu và xác nhận các đánh giá trên.
      </label>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
      <button disabled={!canSubmit} className="owner-button mt-3 disabled:cursor-not-allowed disabled:opacity-50">
        Xác nhận nghiệm thu
      </button>
    </form>
  );
}
