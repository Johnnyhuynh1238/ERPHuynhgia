"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function fillWhite(canvas: HTMLCanvasElement | null) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export function AcceptanceSignForm({ action, defaultSignerName }: { action: string; defaultSignerName: string }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [note, setNote] = useState("Đồng ý nghiệm thu và tiếp tục thi công các hạng mục khác");

  useEffect(() => {
    fillWhite(canvasRef.current);
  }, []);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const point = pointFromEvent(e);
    if (!canvas || !point) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.setPointerCapture(e.pointerId);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    setDrawing(true);
  }

  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const canvas = canvasRef.current;
    const point = pointFromEvent(e);
    if (!canvas || !point) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    setHasDrawn(true);
  }

  function endDraw() {
    setDrawing(false);
  }

  function clearCanvas() {
    fillWhite(canvasRef.current);
    setHasDrawn(false);
  }

  async function submit() {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) {
      setError("Vui lòng ký vào ô chữ ký");
      return;
    }
    if (!confirmed) {
      setError("Vui lòng tick xác nhận đồng ý nghiệm thu");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const r = await fetch(action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatureUrl: canvas.toDataURL("image/png"),
          signerName: signerName.trim(),
          note: note.trim(),
          confirmed: true,
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.message || "Không ký được, thử lại");
      router.push(j.redirect);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không ký được, thử lại");
      setSubmitting(false);
    }
  }

  return (
    <div className="owner-card space-y-4">
      <div className="font-semibold text-white">Ký xác nhận nghiệm thu</div>

      <label className="block">
        <span className="text-sm owner-muted">Họ tên người ký</span>
        <input
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          className="mt-1 w-full rounded-xl border border-[#444] bg-[#1c1c1c] px-3 py-2.5 text-white"
        />
      </label>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm owner-muted">Chữ ký (ký bằng tay trên ô bên dưới)</span>
          <button type="button" onClick={clearCanvas} className="text-xs text-orange-300 underline">
            Ký lại
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={640}
          height={240}
          onPointerDown={startDraw}
          onPointerMove={moveDraw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
          className="h-40 w-full touch-none rounded-xl border border-dashed border-[#666] bg-white"
        />
      </div>

      <label className="block">
        <span className="text-sm owner-muted">Ý kiến / ghi chú (tuỳ chọn, sẽ hiện trong biên bản)</span>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-xl border border-[#444] bg-[#1c1c1c] px-3 py-2.5 text-white"
        />
      </label>

      <label className="flex items-start gap-2 text-sm text-white">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <span>
          Tôi đã kiểm tra hạng mục nêu trên, xác nhận <span className="font-semibold">đồng ý nghiệm thu</span> và cho
          phép triển khai công việc tiếp theo.
        </span>
      </label>

      {error ? <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div> : null}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="w-full rounded-xl bg-[#ff8a3d] px-4 py-3 text-base font-bold text-black disabled:opacity-50"
      >
        {submitting ? "Đang gửi…" : "Ký nghiệm thu"}
      </button>
    </div>
  );
}
