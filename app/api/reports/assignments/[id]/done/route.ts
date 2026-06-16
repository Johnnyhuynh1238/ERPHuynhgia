import { DailyAssignmentType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireEngineerForTodayAssignment } from "../../_helpers";

const bodySchema = z.object({
  photoUrl: z
    .string()
    .trim()
    .min(1)
    .refine((value) => value.startsWith("/") || /^https?:\/\//i.test(value), {
      message: "URL ảnh không hợp lệ",
    })
    .optional()
    .nullable(),
  note: z.string().trim().optional().nullable(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireEngineerForTodayAssignment(params.id);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  if (auth.assignment.requirePhoto && !parsed.data.photoUrl) {
    return NextResponse.json({ message: "Nhiệm vụ này bắt buộc upload ảnh" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.taskDailyAssignment.update({
      where: { id: auth.assignment.id },
      data: {
        status: "done",
        photoUrl: parsed.data.photoUrl || null,
        note: parsed.data.note || null,
        doneAt: new Date(),
      },
    });

    if (auth.assignment.type === DailyAssignmentType.tptc_assignment && auth.assignment.tptcAssignmentId) {
      await tx.tptcAssignment.update({
        where: { id: auth.assignment.tptcAssignmentId },
        data: {
          status: "done",
          completedAt: new Date(),
          ksNote: parsed.data.note || undefined,
        },
      });
    }
  });

  return NextResponse.json({ message: "Đã đánh dấu hoàn thành" });
}
