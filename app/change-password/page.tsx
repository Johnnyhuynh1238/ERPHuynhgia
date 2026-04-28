import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "./_components/change-password-form";

export default async function ChangePasswordPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      mustChangePassword: true,
      fullName: true,
    },
  });

  if (!currentUser) {
    redirect("/login");
  }

  if (!currentUser.mustChangePassword) {
    // Tránh vòng lặp khi JWT session cũ vẫn giữ mustChangePassword=true.
    // Sign out để tạo phiên sạch, đăng nhập lại sẽ vào dashboard bình thường.
    redirect("/api/auth/signout?callbackUrl=/login");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <div className="w-full rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-orange-300">Đổi mật khẩu bắt buộc</h1>
        <p className="mb-6 text-sm text-slate-600">
          Chào {currentUser.fullName}, anh cần đổi mật khẩu trước khi tiếp tục sử dụng hệ thống.
        </p>

        <ChangePasswordForm email={session.user.email || ""} />
      </div>
    </div>
  );
}
