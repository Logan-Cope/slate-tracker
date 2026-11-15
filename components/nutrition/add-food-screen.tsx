"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Plus, ScanBarcode, Search, X, Zap } from "lucide-react";
import { logFoodAction, quickAddAction } from "@/app/(app)/today/actions";
import { Segmented } from "@/components/ui/segmented";
import { parseQuantityQuery } from "@/lib/nutrition/quantity-parser";
import { humanDate } from "@/lib/utils/date";
import { fmtG, fmtKcal } from "@/lib/utils/format";
import { newId } from "@/lib/utils/uuid";
import { addTotals, formatTyped, pickAmount, safeCompute, uniqueById, ZERO_TOTALS } from "./amounts";
import { FoodDetailSheet } from "./food-detail-sheet";
import { FoodTile, SectionTitle, TileList } from "./food-tile";
import { fetchJson, useDebounced, useTodayLocal } from "./hooks";
import { QuickAddSheet, type QuickAddInput } from "./quick-add-sheet";
import { ScanSheet } from "./scan-sheet";
import { Toast, useToast } from "./toast";
import {
  MEAL_LABELS,
  type Amount,
  type FoodSummary,
  type GoTosResponse,
  type MealSlot,
  type SearchResponse,
  type TargetDto,
  type Totals,
} from "./types";

export type AddTab = "my-foods" | "meals";

type Props = {
  date: string;
  meal: MealSlot;
  serverToday: string;
  /** What the day already holds when the screen opened; logs here add on top. */
  dayTotals: Totals;
  target: TargetDto | null;
  myFoods: FoodSummary[];
  meals: FoodSummary[];
  /** Opens the detail sheet straight away (after creating a custom food, or a deep link). */
  initialFood: FoodSummary | null;
  initialTab: AddTab;
};

type Typed = { qty: number; unitWord: string } | null;

type LogVars = { id: string; food: FoodSummary; amount: Amount; preview: Totals };
type QuickVars = { id: string; input: QuickAddInput };

export function AddFoodScreen({ date, meal, serverToday, dayTotals, target, myFoods, meals, initialFood, initialTab }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const today = useTodayLocal(serverToday);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast, show, dismiss } = useToast();

  const [text, setText] = useState("");
  const debounced = useDebounced(text, 150);
  const parsed = parseQuantityQuery(debounced);
  const query = parsed.query.trim();
  const typed: Typed = parsed.qty !== null && parsed.unitWord !== null ? { qty: parsed.qty, unitWord: parsed.unitWord } : null;

  const [added, setAdded] = useState<Totals>(ZERO_TOTALS);
  const [base] = useState(dayTotals);
  const totals = addTotals(base, added);

  const [detail, setDetail] = useState<{ food: FoodSummary; amount: Amount } | null>(() =>
    initialFood ? { food: initialFood, amount: pickAmount(initialFood, null) } : null,
  );
  const [quickOpen, setQuickOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [tab, setTab] = useState<AddTab>(initialTab);

  const search = useQuery({
    queryKey: ["food-search", query],
    queryFn: () => fetchJson<SearchResponse>(`/api/foods/search?q=${encodeURIComponent(query)}`),
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const goTos = useQuery({
    queryKey: ["go-tos"],
    queryFn: () => fetchJson<GoTosResponse>("/api/foods/go-tos"),
  });

  const logMutation = useMutation({
    mutationFn: ({ id, food, amount }: LogVars) => logFoodAction({ id, date, meal, foodId: food.id, qty: amount.qty, unit: amount.unit }),
    onMutate: ({ preview }) => {
      setAdded((a) => addTotals(a, preview));
      show(`Added · ${fmtKcal(preview.kcal)} cal · ${fmtG(preview.proteinG)} g protein`);
    },
    onError: (_err, { preview, food }) => {
      setAdded((a) => addTotals(a, preview, -1));
      show(`Could not add ${food.name}. Tap + to try again.`, "danger");
    },
    onSuccess: () => {
      // Recents changed; refetch next time the screen opens, not under her thumb.
      void queryClient.invalidateQueries({ queryKey: ["go-tos"], refetchType: "none" });
    },
  });

  const quickMutation = useMutation({
    mutationFn: ({ id, input }: QuickVars) =>
      quickAddAction({ id, date, meal, kcal: input.kcal, proteinG: input.proteinG, name: input.name || undefined }),
    onMutate: ({ input }) => {
      setAdded((a) => addTotals(a, { kcal: input.kcal, proteinG: input.proteinG, carbsG: null, fatG: null }));
      show(`Added · ${fmtKcal(input.kcal)} cal · ${fmtG(input.proteinG)} g protein`);
    },
    onError: (_err, { input }) => {
      setAdded((a) => addTotals(a, { kcal: input.kcal, proteinG: input.proteinG, carbsG: null, fatG: null }, -1));
      show("Could not add that. Try again.", "danger");
    },
  });

  function refocus() {
    setText("");
    inputRef.current?.focus();
  }

  function addFood(food: FoodSummary, amount: Amount) {
    const c = safeCompute(food, amount.qty, amount.unit);
    if (!c) {
      show("That amount does not work for this food. Pick another unit.", "danger");
      return;
    }
    logMutation.mutate({ id: newId(), food, amount, preview: { kcal: c.kcal, proteinG: c.proteinG, carbsG: c.carbsG ?? 0, fatG: c.fatG ?? 0 } });
    refocus();
  }

  function openDetail(food: FoodSummary, amount: Amount) {
    setDetail({ food, amount });
  }

  function closeDetail() {
    setDetail(null);
    if (initialFood) router.replace(`/today/add?date=${date}&meal=${meal}`);
  }

  function editHref(food: FoodSummary): string | undefined {
    if (!food.isCustom) return undefined;
    return `/today/${food.isMeal ? "meals" : "foods"}/${food.id}/edit?date=${date}&meal=${meal}`;
  }

  const newFoodHref = `/today/foods/new?date=${date}&meal=${meal}${query ? `&name=${encodeURIComponent(query)}` : ""}`;
  const newMealHref = `/today/meals/new?date=${date}&meal=${meal}`;

  const goToList = goTos.data?.goTos ?? [];
  const recentList = uniqueById(goTos.data?.recents ?? [], new Set(goToList.map((g) => g.food.id)));

  const renderTile = (food: FoodSummary) => {
    const amount = pickAmount(food, typed);
    return <FoodTile key={food.id} food={food} amount={amount} onOpen={() => openDetail(food, amount)} onAdd={() => addFood(food, amount)} />;
  };

  return (
    <div className="pb-8">
      <header className="sticky top-[env(safe-area-inset-top)] z-20 bg-bg/95 px-5 pb-3 pt-2 backdrop-blur" data-scroll-clearance="add-food">
        <div className="flex items-center gap-1">
          <Link href={`/today?date=${date}`} aria-label="Back to diary" data-testid="add-back" className="tap -ml-3 grid h-11 w-11 place-items-center rounded-full text-muted">
            <ChevronLeft size={26} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-pretty text-lg font-bold leading-tight">Add to {MEAL_LABELS[meal]}</h1>
            <p className="text-xs font-medium text-muted">{humanDate(date, today)}</p>
          </div>
          <button
            type="button"
            onClick={() => setQuickOpen(true)}
            aria-label="Quick add"
            data-testid="quick-add"
            className="tap grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-fg active:bg-line"
          >
            <Zap size={20} />
          </button>
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            aria-label="Scan barcode"
            data-testid="scan"
            className="tap grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-fg active:bg-line"
          >
            <ScanBarcode size={20} />
          </button>
        </div>

        <div className="relative mt-3">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="150g chicken, quest bar"
            aria-label="Search foods"
            data-testid="add-food-search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // "Search" on the iOS keyboard just puts the keyboard away so the list is readable.
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="input pl-11 pr-11"
          />
          {text ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={refocus}
              className="tap absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-muted"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>

        <RunningTotal totals={totals} target={target} />
      </header>

      <main className="flex flex-col gap-6 px-5 pt-2">
        {query ? (
          <section>
            <SectionTitle right={search.isFetching ? <Loader2 size={14} className="animate-spin text-muted" aria-label="Searching" /> : null}>
              Results{typed ? ` · ${formatTyped(typed.qty, typed.unitWord)}` : ""}
            </SectionTitle>
            {search.data && search.data.hits.length > 0 ? (
              <TileList testId="search-results">{search.data.hits.map(renderTile)}</TileList>
            ) : search.data ? (
              <div className="card px-5 py-6 text-center" data-testid="search-empty">
                <p className="font-semibold">Nothing called &ldquo;{query}&rdquo;</p>
                <p className="mt-1 text-sm text-muted">Try fewer words, or add it yourself.</p>
              </div>
            ) : search.isError ? (
              <div className="card px-5 py-6 text-center text-sm text-danger">
                Search is unavailable. Check your connection, or clear the search to use your go-tos.
              </div>
            ) : (
              <div className="card px-5 py-6 text-center text-sm text-muted">Searching…</div>
            )}
            <Link href={newFoodHref} className="btn-ghost mt-2 w-full" data-testid="search-new-food">
              <Plus size={18} aria-hidden />
              Create a custom food
            </Link>
          </section>
        ) : (
          <>
            {typed ? (
              <p className="-mb-3 text-sm font-medium text-muted" data-testid="typed-amount">
                Logging {formatTyped(typed.qty, typed.unitWord)} of whatever you tap
              </p>
            ) : null}

            {goToList.length > 0 ? (
              <section>
                <SectionTitle>Go-tos</SectionTitle>
                <TileList testId="go-tos">{goToList.map((g) => renderTile(g.food))}</TileList>
              </section>
            ) : null}

            {recentList.length > 0 ? (
              <section>
                <SectionTitle>Recent</SectionTitle>
                <TileList testId="recents">{recentList.map((g) => renderTile(g.food))}</TileList>
              </section>
            ) : null}

            {goTos.isError ? (
              <div className="card px-5 py-6 text-center" data-testid="go-tos-error">
                <p className="font-semibold">Your go-tos did not load.</p>
                <p className="mt-1 text-sm text-muted">Check your connection, or search above.</p>
              </div>
            ) : null}

            {goTos.isSuccess && goToList.length === 0 && recentList.length === 0 ? (
              <div className="card px-5 py-6 text-center" data-testid="go-tos-empty">
                <p className="font-semibold">Your go-tos will show up here</p>
                <p className="mt-1 text-sm text-muted">Search above, scan a barcode, or quick add.</p>
              </div>
            ) : null}

            <section>
              <div className="mb-2 flex items-center justify-between">
                <Segmented<AddTab>
                  ariaLabel="Your foods"
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: "my-foods", label: "My foods" },
                    { value: "meals", label: "Meals" },
                  ]}
                />
                <Link
                  href={tab === "meals" ? newMealHref : newFoodHref}
                  data-testid={tab === "meals" ? "new-meal" : "new-food"}
                  className="tap inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-accent-ink active:bg-accent-soft"
                >
                  <Plus size={18} strokeWidth={2.5} aria-hidden />
                  {tab === "meals" ? "New meal" : "New food"}
                </Link>
              </div>
              {tab === "my-foods" ? (
                myFoods.length > 0 ? (
                  <TileList testId="my-foods">{myFoods.map(renderTile)}</TileList>
                ) : (
                  <p className="px-1 text-sm text-muted" data-testid="my-foods-empty">
                    Foods you create live here. Handy for things the database gets wrong.
                  </p>
                )
              ) : meals.length > 0 ? (
                <TileList testId="saved-meals">{meals.map(renderTile)}</TileList>
              ) : (
                <p className="px-1 text-sm text-muted" data-testid="saved-meals-empty">
                  Save a combo you eat often and log it as one line.
                </p>
              )}
            </section>
          </>
        )}
      </main>

      <FoodDetailSheet
        food={detail?.food ?? null}
        initialAmount={detail?.amount ?? { qty: 1, unit: "serving" }}
        meal={meal}
        editHref={detail ? editHref(detail.food) : undefined}
        onClose={closeDetail}
        onAdd={(amount) => {
          if (detail) addFood(detail.food, amount);
          closeDetail();
        }}
      />
      <QuickAddSheet
        open={quickOpen}
        meal={meal}
        onClose={() => setQuickOpen(false)}
        onSubmit={(input) => {
          quickMutation.mutate({ id: newId(), input });
          setQuickOpen(false);
        }}
      />
      <ScanSheet
        open={scanOpen}
        date={date}
        meal={meal}
        onClose={() => setScanOpen(false)}
        onFound={(food) => {
          setScanOpen(false);
          openDetail(food, pickAmount(food, null));
        }}
      />
      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}

/** Thin bar under the search box: what is left for the day after what was just added. */
function RunningTotal({ totals, target }: { totals: Totals; target: TargetDto | null }) {
  if (!target) {
    return (
      <p className="tnum mt-2 text-xs font-medium text-muted" data-testid="running-total">
        {fmtKcal(totals.kcal)} cal · {fmtG(totals.proteinG)} g protein today
      </p>
    );
  }
  const left = target.kcal - totals.kcal;
  const proteinLeft = target.proteinG - totals.proteinG;
  const pct = Math.max(0, Math.min(1, totals.kcal / target.kcal)) * 100;
  return (
    <div className="mt-2.5 flex items-center gap-3" data-testid="running-total">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
        <div
          className="h-full w-full rounded-full motion-safe:transition-transform motion-safe:duration-400 motion-safe:ease-out"
          style={{ transform: `translateX(${pct - 100}%)`, background: left < 0 ? "var(--danger)" : "var(--accent)" }}
        />
      </div>
      <span className={`tnum shrink-0 text-xs font-semibold ${left < 0 ? "text-danger" : "text-muted"}`}>
        {left < 0 ? `${fmtKcal(-left)} over` : `${fmtKcal(left)} left`} · {proteinLeft > 0 ? `${fmtG(proteinLeft)} g protein to go` : "protein done"}
      </span>
    </div>
  );
}
