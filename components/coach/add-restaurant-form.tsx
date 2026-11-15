"use client";

import { useActionState, useState } from "react";
import { findMenuAction, type FindState } from "@/app/(app)/coach/restaurants/actions";

export function AddRestaurantForm() {
  const [state, action, pending] = useActionState<FindState, FormData>(findMenuAction, {});
  const [showUrl, setShowUrl] = useState(false);

  return (
    <form action={action} className="mt-3 space-y-2">
      <input
        name="name"
        type="text"
        autoComplete="off"
        placeholder="Chipotle, Sweetgreen, Cava"
        className="input"
        disabled={pending}
        required
        data-testid="restaurant-name"
      />
      {showUrl ? (
        <input
          name="url"
          type="text"
          inputMode="url"
          autoComplete="off"
          placeholder="https://"
          className="input"
          disabled={pending}
          data-testid="restaurant-url"
        />
      ) : (
        <button type="button" className="tap text-sm font-semibold text-accent-ink py-1" onClick={() => setShowUrl(true)}>
          Use a specific page
        </button>
      )}
      <button
        type="submit"
        className="btn-primary w-full"
        aria-disabled={pending}
        onClick={(e) => {
          if (pending) e.preventDefault();
        }}
        data-testid="restaurant-find"
      >
        {pending ? "Reading the menu, usually about a minute" : "Find menu"}
      </button>
      <p className={state.error && !pending ? "text-sm text-danger" : ""} role="alert" data-testid="restaurant-error">
        {state.error && !pending ? state.error : ""}
      </p>
    </form>
  );
}
