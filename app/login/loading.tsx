export default function LoginLoading() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <div className="w-full animate-pulse rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 h-6 w-52 rounded bg-slate-200" />
        <div className="mb-2 h-4 w-24 rounded bg-slate-200" />
        <div className="mb-4 h-10 w-full rounded bg-slate-200" />
        <div className="mb-2 h-4 w-24 rounded bg-slate-200" />
        <div className="mb-6 h-10 w-full rounded bg-slate-200" />
        <div className="h-10 w-full rounded bg-slate-200" />
      </div>
    </div>
  );
}
