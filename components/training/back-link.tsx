import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function BackLink({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link href={href} aria-label={label} className="tap -ml-2 mt-0.5 grid h-9 w-9 place-items-center rounded-full text-muted">
      <ArrowLeft size={24} aria-hidden />
    </Link>
  );
}
