import Link from "next/link";

/** The framework's fallback for a missing page, with a way forward instead of a bare 404. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-3 px-5 text-center">
      <h1 className="text-2xl font-black tracking-tight text-pretty">That page is not here</h1>
      <p className="text-sm text-muted text-pretty">The link may be old, or the workout or food it pointed at was removed.</p>
      <Link href="/today" className="btn-primary mt-3">
        Back to Today
      </Link>
    </main>
  );
}
