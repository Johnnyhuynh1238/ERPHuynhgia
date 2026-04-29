import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getUserProjectRoles } from "@/lib/task-centric";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const roles = await getUserProjectRoles(user.id, params.id);
  return NextResponse.json({ roles });
}
