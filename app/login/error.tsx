"use client";

import { useEffect } from "react";

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[LOGIN_ERROR]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <div className="w-full rounded-xl border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-red-700">Có lỗi khi tải màn đăng nhập</h2>
        <p className="mb-4 text-sm text-slate-600">Anh vui lòng thử lại sau vài giây.</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-600"
        >
          Thử lại
        </button>
      </div>
    </div>
  );
}
