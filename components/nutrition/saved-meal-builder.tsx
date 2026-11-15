"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";
import { createSavedMealAction, deleteSavedMealAction, updateSavedMealAction } from "@/app/(app)/today/actions";
import { NumberField } from "@/components/ui/number-field";
import { FieldError } from "@/components/ui/field-error";
import { AMOUNT_ERROR } from "@/lib/nutrition/amount-check";
import { parseQuantityQuery } from "@/lib/nutrition/quantity-parser";
import { availableUnits } from "@/lib/nutrition/servings";
import { fmtG, fmtKcal, fmtQty, parseDecimal } from "@/lib/utils/format";
import { newId } from "@/lib/utils/uuid";
import { pickAmount, safeCompute } from "./amounts";
import { FoodTile, TileList } from "./food-tile";
import { DeleteButton, Field, FormHeader } from "./form-bits";
import { fetchJson, useDebounced } from "./hooks";
import type { FoodSummary, MealSlot, SavedMealDto, SearchResponse } from "./types";

type Common = { date: string; meal: MealSlot };
type Props = (Common & { mode: "create" }) | (Common & { mode: "edit"; savedMeal: SavedMealDto });

type Item = { key: string; food: FoodSummary; qtyText: string; unit: string };

/** Build a saved meal: name it, search foods in, set each amount, save. Logs later as one line. */
export function SavedMealBuilder(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  // Field errors show only after a submit attempt, then track the fields live.
  const [attempted, setAttempted] = useState(false);
  const idBase = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(props.mode === "edit" ? props.savedMeal.name : "");
  const [items, setItems] = useState<Item[]>(() =>
    props.mode === "edit" ? props.savedMeal.items.map((i, idx) => ({ key: `${i.foodId}-${idx}`, food: i.food, qtyText: fmtQty(i.qty), unit: i.unit })) : [],
  );
  const [text, setText] = useState("");
  const debounced = useDebounced(text, 150);
  const parsed = parseQuantityQuery(debounced);
  const query = parsed.query.trim();
  const typed = parsed.qty !== null && parsed.unitWord !== null ? { qty: parsed.qty, unitWord: parsed.unitWord } : null;

  const search = useQuery({
    queryKey: ["food-search", query],
    queryFn: () => fetchJson<SearchResponse>(`/api/foods/search?q=${encodeURIComponent(query)}`),
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const backHref = `/today/add?date=${props.date}&meal=${props.meal}&tab=meals`;

  function addItem(food: FoodSummary) {
    const amount = pickAmount(food, typed);
    setItems((list) => [...list, { key: newId(), food, qtyText: fmtQty(amount.qty), unit: amount.unit }]);
    setText("");
  }

  function updateItem(key: string, patch: Partial<Pick<Item, "qtyText" | "unit">>) {
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  const rows = items.map((item) => {
    const qty = parseDecimal(item.qtyText);
    const c = qty !== null && qty > 0 ? safeCompute(item.food, qty, item.unit) : null;
    return { item, qty, c };
  });
  const totals = rows.reduce(
    (t, r) => ({ kcal: t.kcal + (r.c?.kcal ?? 0), proteinG: t.proteinG + (r.c?.proteinG ?? 0) }),
    { kcal: 0, proteinG: 0 },
  );
  const nameMissing = name.trim().length === 0;
  const nameError = attempted && nameMissing ? "Enter a name for the meal" : null;
  const amountError = (key: string) => (attempted && rows.some((r) => r.item.key === key && r.c === null) ? AMOUNT_ERROR : null);
  const valid = !nameMissing && rows.length > 0 && rows.every((r) => r.c !== null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!valid) {
      setAttempted(true);
      if (rows.length === 0) {
        setError("Add at least one food. Search below to find it.");
        searchRef.current?.focus();
        return;
      }
      setError(null);
      if (nameMissing) nameRef.current?.focus();
      else {
        const bad = rows.find((r) => r.c === null);
        if (bad) document.getElementById(`${idBase}-qty-${bad.item.key}`)?.focus();
      }
      return;
    }
    const payload = {
      name: name.trim(),
      items: rows.flatMap((r) => (r.qty === null ? [] : [{ foodId: r.item.food.id, qty: r.qty, unit: r.item.unit }])),
    };
    setError(null);
    startTransition(async () => {
      try {
        if (props.mode === "edit") await updateSavedMealAction({ id: props.savedMeal.id, ...payload });
        else await createSavedMealAction(payload);
        router.replace(backHref);
      } catch {
        setError("Could not save the meal. Try again.");
      }
    });
  }

  function remove() {
    if (props.mode !== "edit") return;
    if (!armed) {
      setArmed(true);
      return;
    }
    const id = props.savedMeal.id;
    startTransition(async () => {
      try {
        const res = await deleteSavedMealAction({ id });
        if (!res.ok) {
          setError("Could not delete the meal. Go back to Add food and try again.");
          return;
        }
        router.replace(backHref);
      } catch {
        setError("Could not delete the meal. Try again.");
      }
    });
  }

  const hits = (search.data?.hits ?? []).filter((h) => !h.isMeal);

  return (
    <div className="pb-8">
      <FormHeader title={props.mode === "edit" ? "Edit meal" : "New meal"} backHref={backHref} />
      <form onSubmit={submit} className="flex flex-col gap-5 px-5" data-testid="meal-form">
        <div>
          <Field label="Meal name">
            <input
              ref={nameRef}
              className="input aria-invalid:border-danger"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={!name}
              autoComplete="off"
              placeholder="Usual breakfast"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${idBase}-name-error` : undefined}
              data-testid="meal-name"
            />
          </Field>
          <FieldError id={`${idBase}-name-error`} message={nameError} data-testid="meal-name-error" />
        </div>

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted">Items</h2>
            <span className="tnum text-xs font-semibold text-muted" data-testid="meal-totals">
              {fmtKcal(totals.kcal)} cal · {fmtG(totals.proteinG)} g protein
            </span>
          </div>
          {rows.length > 0 ? (
            <ul className="card divide-y divide-line overflow-hidden" data-testid="meal-items">
              {rows.map(({ item, c }) => {
                const units = availableUnits(item.food, item.food.servings);
                const itemError = amountError(item.key);
                return (
                  <li key={item.key} className="flex flex-col gap-2 px-4 py-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-pretty break-words font-semibold leading-snug">{item.food.name}</div>
                        {item.food.brand ? <div className="text-pretty break-words text-sm text-muted">{item.food.brand}</div> : null}
                      </div>
                      <div className="tnum shrink-0 text-right">
                        <div className="font-bold text-accent-ink">{c ? fmtKcal(c.kcal) : "?"}</div>
                        <div className="text-xs font-semibold text-protein-ink">{c ? `${fmtG(c.proteinG)} g` : ""}</div>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${item.food.name}`}
                        onClick={() => setItems((list) => list.filter((i) => i.key !== item.key))}
                        className="tap -mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <NumberField
                        id={`${idBase}-qty-${item.key}`}
                        value={item.qtyText}
                        onChange={(t) => updateItem(item.key, { qtyText: t })}
                        aria-label="Amount"
                        aria-invalid={itemError ? true : undefined}
                        aria-describedby={itemError ? `${idBase}-qty-${item.key}-error` : undefined}
                        className="w-28 shrink-0"
                      />
                      <select className="input min-w-0 flex-1" value={item.unit} onChange={(e) => updateItem(item.key, { unit: e.target.value })} aria-label="Unit">
                        {units.map((u) => (
                          <option key={u.unit} value={u.unit}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <FieldError id={`${idBase}-qty-${item.key}-error`} message={itemError} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-1 text-sm text-muted">Nothing in it yet. Search below to add foods.</p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input
              ref={searchRef}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="2 eggs, oatmeal"
              aria-label="Search foods to add"
              data-testid="meal-search"
              className="input pl-11"
              onKeyDown={(e) => {
                // Enter here adds, it never submits the meal.
                if (e.key === "Enter") e.preventDefault();
              }}
            />
            {search.isFetching ? <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-muted" aria-label="Searching" /> : null}
          </div>
          {query && search.data ? (
            hits.length > 0 ? (
              <TileList testId="meal-search-results">
                {hits.slice(0, 8).map((food) => {
                  const amount = pickAmount(food, typed);
                  return <FoodTile key={food.id} food={food} amount={amount} onOpen={() => addItem(food)} onAdd={() => addItem(food)} />;
                })}
              </TileList>
            ) : (
              <p className="px-1 text-sm text-muted">Nothing called &ldquo;{query}&rdquo;.</p>
            )
          ) : null}
        </section>

        <p role="alert" className={error ? "text-sm font-medium text-danger" : ""} data-testid="meal-form-error">
          {error}
        </p>

        <button type="submit" className="btn-primary w-full" aria-disabled={pending} data-testid="meal-form-submit">
          {pending ? "Saving…" : props.mode === "edit" ? "Save changes" : "Save meal"}
        </button>
        {props.mode === "edit" ? <DeleteButton armed={armed} onClick={remove} pending={pending} label="meal" testId="meal-form-delete" /> : null}
      </form>
    </div>
  );
}
