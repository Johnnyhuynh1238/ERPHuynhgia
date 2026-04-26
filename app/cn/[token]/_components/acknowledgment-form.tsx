"use client";

import { useRef, useState } from "react";

type Props = {
  action: string;
};

export function AcknowledgmentForm({ action }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signatureData, setSignatureData] = useState("");
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
    if (!hasDrawn || !signatureData) {
      e.preventDefault();
      setError("Vui lòng vẽ chữ ký trước khi xác nhận.");
      return;
    }
  }

  return (
    <form action={action} method="post" className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm" onSubmit={onSubmit}>
      <div className="font-semibold">Xác nhận nghiệm thu</div>
      <p className="mt-1 text-xs text-[#8892b0]">Vui lòng ký tên vào khung bên dưới.</p>

      <div className="mt-2 overflow-hidden rounded-xl border border-[#2d3249] bg-[#13151f]">
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
        <button type="button" className="rounded-lg border border-[#2d3249] px-3 py-1 text-xs" onClick={clearSignature}>
          Xóa chữ ký
        </button>
      </div>

      <textarea name="note" rows={2} className="mt-2 w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2" placeholder="Ghi chú (tùy chọn)" />
      <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" required name="confirmed" /> Tôi đã kiểm tra và đồng ý nghiệm thu công đoạn này</label>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
      <button className="mt-3 rounded-lg bg-[#f97316] px-3 py-2 text-xs font-semibold text-black">Xác nhận nghiệm thu</button>
    </form>
  );
}
