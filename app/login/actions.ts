"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth/auth";

export type LoginState = { error: string | null };

export async function loginWithPassphrase(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const handle = String(formData.get("handle") ?? "");
  const passphrase = String(formData.get("passphrase") ?? "");
  if (!handle || !passphrase) return { error: "Pick who you are and enter the passphrase." };
  try {
    await signIn("passphrase", { handle, passphrase, redirectTo: "/today" });
    return { error: null };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "That passphrase is not right. Try again." };
    }
    // signIn redirects by throwing; let Next handle it.
    throw err;
  }
}

export async function loginWithGoogle(): Promise<void> {
  await signIn("google", { redirectTo: "/today" });
}
