"use client";

import { useActionState } from "react";
import { loginWithPassphrase, type LoginState } from "./actions";

type UserOption = { handle: string; name: string };

export function LoginForm({ users, defaultHandle }: { users: UserOption[]; defaultHandle: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginWithPassphrase, { error: null });

  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-muted mb-2">Who are you?</legend>
        <div className="grid grid-cols-2 gap-2">
          {users.map((u) => (
            <label
              key={u.handle}
              className="flex items-center justify-center rounded-2xl border border-line bg-surface px-4 py-4 text-base font-semibold has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent cursor-pointer"
            >
              <input
                type="radio"
                name="handle"
                value={u.handle}
                defaultChecked={u.handle === defaultHandle}
                className="sr-only"
              />
              {u.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Passphrase</span>
          <input
            name="passphrase"
            type="password"
            autoComplete="current-password"
            required
            className="input"
            data-testid="passphrase"
          />
        </label>
        <p role="alert" data-testid="login-error" className={state.error ? "mt-3 text-sm text-danger" : ""}>
          {state.error}
        </p>
      </div>
      <button
        type="submit"
        aria-disabled={pending}
        onClick={(e) => {
          if (pending) e.preventDefault();
        }}
        className="btn-primary"
        data-testid="login-submit"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
