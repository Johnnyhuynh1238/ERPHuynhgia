import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./_components/login-form";

type LoginPageProps = {
  searchParams?: {
    callbackUrl?: string;
    error?: string;
  };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();

  if (session?.user?.id) {
    if (session.user.mustChangePassword) {
      redirect("/change-password");
    }
    redirect("/");
  }

  const rawCallback = searchParams?.callbackUrl || "/";
  // Chỉ cho phép path nội bộ (bắt đầu bằng "/" và không phải "//..." hay "/\..." để chặn open redirect)
  const callbackUrl = /^\/(?![/\\])/.test(rawCallback) ? rawCallback : "/";
  const hasCredentialError = searchParams?.error === "CredentialsSignin";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <div className="w-full rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-3 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/a6-logo.png" alt="Huỳnh Gia A6" className="h-20 w-20 object-contain" />
        </div>
        <h1 className="mb-2 text-center text-xl font-semibold text-orange-500">Đăng nhập ERP Huỳnh Gia</h1>
        <p className="mb-6 text-center text-sm text-slate-500">Nhập email và mật khẩu để vào hệ thống.</p>

        <LoginForm callbackUrl={callbackUrl} hasCredentialError={hasCredentialError} />
      </div>
    </div>
  );
}
