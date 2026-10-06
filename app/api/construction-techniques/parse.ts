import { parseTasks, type CtTask } from "@/lib/construction-technique";

export type TechniqueBody = {
  code: string;
  name: string;
  phase: "tho" | "ht";
  matchKeywords: string;
  vtKeywords: string;
  standards: string;
  note: string;
  tasks: CtTask[];
  isActive: boolean;
};

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseTechniqueBody(body: unknown): TechniqueBody | { message: string } {
  if (!body || typeof body !== "object") return { message: "Dữ liệu không hợp lệ" };
  const b = body as Record<string, unknown>;
  const code = s(b.code, 30)
    .toUpperCase()
    .replace(/\s+/g, "-");
  const name = s(b.name, 200);
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) return { message: "Mã chỉ gồm chữ in hoa không dấu, số, gạch ngang (VD MONG, XAY-TO)" };
  if (name.length < 2) return { message: "Nhập tên hạng mục" };
  const tasks = parseTasks(b.tasks);
  return {
    code,
    name,
    phase: b.phase === "ht" ? "ht" : "tho",
    matchKeywords: s(b.matchKeywords, 1000),
    vtKeywords: s(b.vtKeywords, 1000),
    standards: s(b.standards, 1000),
    note: s(b.note, 4000),
    tasks,
    isActive: b.isActive !== false,
  };
}
