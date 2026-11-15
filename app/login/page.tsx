import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { googleEnabled } from "@/lib/auth/auth";
import { listUsers } from "@/lib/db/queries/users";
import { LoginForm } from "./login-form";
import { loginAsDemoUser, loginWithGoogle } from "./actions";
import { isDemo } from "@/lib/demo/mode";
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
      {isDemo() ? (
        <div className="flex flex-col gap-3" data-testid="demo-login">
          {users.map((u) => (
            <form key={u.handle} action={loginAsDemoUser}>
              <input type="hidden" name="handle" value={u.handle} />
              <button
                type="submit"
                data-testid={`demo-${u.handle}`}
                className={`tap w-full rounded-2xl border px-5 py-4 text-left ${u.role === "client" ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}
              >
                <span className="block text-xl font-black">{u.name}</span>
                <span className={`block text-sm font-medium ${u.role === "client" ? "text-accent-ink" : "text-muted"}`}>{u.role === "coach" ? "Coach" : "Athlete"}</span>
              </button>
            </form>
          ))}
        </div>
      ) : users.length === 0 ? (
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
