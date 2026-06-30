import { prisma } from "@/lib/prisma";

// Sinh code NCC dạng NCC0001 tăng dần.
export async function generateNextSupplierCode(): Promise<string> {
  const last = await prisma.supplier.findFirst({
    where: { code: { startsWith: "NCC" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNum = last ? Number(last.code.replace(/^NCC/, "")) || 0 : 0;
  const next = String(lastNum + 1).padStart(4, "0");
  return `NCC${next}`;
}
