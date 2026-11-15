import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { googleEnabled } from "@/lib/auth/auth";
import { listUsers } from "@/lib/db/queries/users";
import { LoginForm } from "./login-form";
import { loginWithGoogle } from "./actions";
import { APP_NAME } from "@/lib/app-name";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const existing = await getSessionUser();
  if (existing) redirect("/today");

  const users = await listUsers();
  const defaultHandle = users.find((u) => u.role === "client")?.handle ?? users[0]?.handle ?? "";

  return (
    <main className="min-h-dvh flex flex-col justify-center px-6 py-12 max-w-sm mx-auto">
      <div className="mb-10">
        <div className="text-5xl font-black tracking-tight">{APP_NAME}</div>
        <p className="text-muted mt-2">Food, lifts and weight. Nothing else.</p>
      </div>
      {users.length === 0 ? (
        <p className="text-danger">No users yet. Run `npm run db:seed`.</p>
      ) : (
        <LoginForm users={users.map((u) => ({ handle: u.handle, name: u.name }))} defaultHandle={defaultHandle} />
      )}
      {googleEnabled() ? (
        <form action={loginWithGoogle} className="mt-6">
          <button type="submit" className="btn-secondary w-full">
            Continue with Google
          </button>
        </form>
      ) : null}
    </main>
  );
}
