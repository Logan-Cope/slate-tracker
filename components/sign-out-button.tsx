"use client";

import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/(app)/settings/actions";

export function SignOutButton({ variant = "link" }: { variant?: "link" | "button" }) {
  const onClick = async () => {
    // Drop anything the service worker cached for this origin before leaving.
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_CACHES" });
    await signOutAction();
  };
  if (variant === "button") {
    return (
      <button type="button" className="btn-secondary w-full" onClick={onClick} data-testid="sign-out">
        <LogOut size={18} /> Sign out
      </button>
    );
  }
  return (
    <button type="button" className="tap inline-flex items-center gap-1.5 text-sm font-semibold text-muted px-2 py-2" onClick={onClick} data-testid="sign-out">
      <LogOut size={16} /> Sign out
    </button>
  );
}
