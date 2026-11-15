"use client";

import Link from "next/link";

/** The framework's fallback when a page throws, with a retry and a way back instead of a bare error. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-3 px-5 text-center">
      <h1 className="text-2xl font-black tracking-tight text-pretty">This page did not load</h1>
      <p className="text-sm text-muted text-pretty">Try again, or go back to Today. Anything already saved is still there.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/today" className="btn-secondary">
          Back to Today
        </Link>
      </div>
    </main>
  );
}
