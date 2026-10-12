import { z } from "zod";
import { OVERHEAD_GROUPS } from "@/lib/company-forecast";

const GROUP_KEYS = OVERHEAD_GROUPS.map((g) => g.key) as [string, ...string[]];

export const overheadSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên khoản").max(200),
  groupKey: z.enum(GROUP_KEYS),
  monthlyAmount: z.number().min(0).max(1e12),
  note: z.string().trim().max(500).nullable().optional(),
});
