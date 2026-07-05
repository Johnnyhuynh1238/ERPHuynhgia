/* Biên bản nghiệm thu — render dùng chung cho staff (/projects/[id]/acceptance/[mid]/bien-ban)
   và chủ nhà (/cn/[token]/acceptance/[id]/bien-ban). Nền trắng để in / lưu PDF. */

type MilestoneForBienBan = {
  seq: number;
  title: string;
  description: string | null;
  signatureUrl: string | null;
  signerName: string | null;
  signedAt: Date | null;
  ipAddress: string | null;
  userAgent: string | null;
  customerNote: string | null;
};

type ProjectForBienBan = {
  code: string;
  name: string;
  customerName: string;
  address: string;
};

function fmtDateTime(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
}

export function AcceptanceBienBan({ milestone, project }: { milestone: MilestoneForBienBan; project: ProjectForBienBan }) {
  const signedDate = milestone.signedAt;
  const dd = signedDate ? String(signedDate.getDate()).padStart(2, "0") : "…";
  const mm = signedDate ? String(signedDate.getMonth() + 1).padStart(2, "0") : "…";
  const yyyy = signedDate ? signedDate.getFullYear() : "……";

  return (
    <div className="mx-auto max-w-[720px] bg-white px-8 py-10 text-[15px] leading-relaxed text-black print:max-w-none print:px-0 print:py-0">
      <div className="text-center">
        <div className="font-semibold uppercase">Cộng hoà xã hội chủ nghĩa Việt Nam</div>
        <div className="font-semibold">Độc lập – Tự do – Hạnh phúc</div>
        <div className="mx-auto mt-1 h-px w-48 bg-black" />
      </div>

      <h1 className="mt-8 text-center text-xl font-bold uppercase">Biên bản nghiệm thu công việc xây dựng</h1>
      <div className="mt-1 text-center text-sm">
        Số: NT-{String(milestone.seq).padStart(2, "0")}/{project.code}
      </div>

      <div className="mt-8 space-y-2">
        <p>
          <span className="font-semibold">Công trình:</span> {project.name}
        </p>
        <p>
          <span className="font-semibold">Địa điểm xây dựng:</span> {project.address}
        </p>
        <p>
          <span className="font-semibold">Thời gian nghiệm thu:</span> {fmtDateTime(milestone.signedAt)}
        </p>
      </div>

      <div className="mt-6">
        <div className="font-semibold">1. Đối tượng nghiệm thu:</div>
        <p className="mt-1 pl-4">{milestone.title}</p>
        {milestone.description ? <p className="mt-1 whitespace-pre-wrap pl-4 text-[14px]">{milestone.description}</p> : null}
      </div>

      <div className="mt-4">
        <div className="font-semibold">2. Thành phần tham gia nghiệm thu:</div>
        <div className="mt-1 space-y-1 pl-4">
          <p>
            <span className="font-semibold">Bên A (Chủ đầu tư):</span> Ông/Bà {milestone.signerName || project.customerName}
          </p>
          <p>
            <span className="font-semibold">Bên B (Đơn vị thi công):</span> Xây dựng Huỳnh Gia
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="font-semibold">3. Kết luận:</div>
        <p className="mt-1 pl-4">
          Bên A đã kiểm tra hạng mục nêu trên, xác nhận công việc thi công đạt yêu cầu và{" "}
          <span className="font-semibold">đồng ý nghiệm thu</span>, cho phép triển khai các công việc tiếp theo.
        </p>
        {milestone.customerNote ? (
          <p className="mt-1 pl-4">
            <span className="font-semibold">Ý kiến của Bên A:</span> {milestone.customerNote}
          </p>
        ) : null}
      </div>

      <p className="mt-6 text-right text-sm italic">
        Ngày {dd} tháng {mm} năm {yyyy}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4 text-center">
        <div>
          <div className="font-semibold uppercase">Đại diện Bên A</div>
          <div className="text-sm">(Chủ đầu tư ký xác nhận)</div>
          {milestone.signatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={milestone.signatureUrl} alt="Chữ ký chủ nhà" className="mx-auto mt-2 h-28 object-contain" />
          ) : (
            <div className="mt-16 text-sm text-neutral-400">(Chưa ký)</div>
          )}
          <div className="mt-1 font-semibold">{milestone.signerName || project.customerName}</div>
        </div>
        <div>
          <div className="font-semibold uppercase">Đại diện Bên B</div>
          <div className="text-sm">(Đơn vị thi công)</div>
          <div className="mt-24 font-semibold">Xây dựng Huỳnh Gia</div>
        </div>
      </div>

      {milestone.signedAt ? (
        <div className="mt-10 border-t border-neutral-300 pt-2 text-[11px] text-neutral-500">
          Chữ ký điện tử được ghi nhận lúc {fmtDateTime(milestone.signedAt)}
          {milestone.ipAddress ? ` · IP ${milestone.ipAddress}` : ""}
          {milestone.userAgent ? ` · Thiết bị: ${milestone.userAgent.slice(0, 120)}` : ""}
        </div>
      ) : null}
    </div>
  );
}
