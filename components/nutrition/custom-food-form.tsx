"use client";

import { useId, useState, useTransition } from "react";
import { ScanText } from "lucide-react";
import { useRouter } from "next/navigation";
import { createCustomFoodAction, deleteCustomFoodAction, updateCustomFoodAction } from "@/app/(app)/today/actions";
import { NumberField } from "@/components/ui/number-field";
import { FieldError } from "@/components/ui/field-error";
import { fmtQty, parseDecimal } from "@/lib/utils/format";
import { draftFormValues, type LabelDraft } from "@/lib/nutrition/label-fields";
import { DeleteButton, Field, FormHeader, optionalNumber } from "./form-bits";
import { LabelSheet } from "./label-sheet";
import type { FoodSummary, MealSlot } from "./types";

type Common = { date: string; meal: MealSlot };
/** create: `scanLabel` opens the label camera on arrival (from a barcode with no match). */
type Props = (Common & { mode: "create"; upc: string; name: string; scanLabel?: boolean }) | (Common & { mode: "edit"; food: FoodSummary });

type FieldKey = "name" | "servingLabel" | "servingGrams" | "kcal" | "protein" | "carbs" | "fat" | "fiber";

/** What goes under a field that fails on submit: what to enter, phrased positively. */
const FIELD_ERRORS: Record<FieldKey, string> = {
  name: "Enter a name",
  servingLabel: "Enter the serving as the label writes it",
  servingGrams: "Enter grams above 0, or leave it blank",
  kcal: "Enter calories, 0 or more",
  protein: "Enter grams, or leave it blank",
  carbs: "Enter grams, or leave it blank",
  fat: "Enter grams, or leave it blank",
  fiber: "Enter grams, or leave it blank",
};

/** Create or edit an own custom food. Nutrients are per the label serving typed here. */
export function CustomFoodForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  // Field errors show only after a submit attempt, then track the fields live.
  const [attempted, setAttempted] = useState(false);
  const idBase = useId();
  const food = props.mode === "edit" ? props.food : null;

  const [name, setName] = useState(food?.name ?? (props.mode === "create" ? props.name : ""));
  const [brand, setBrand] = useState(food?.brand ?? "");
  const [servingLabel, setServingLabel] = useState(food?.servingLabel ?? "1 serving");
  const [servingGrams, setServingGrams] = useState(food?.servingGrams != null ? fmtQty(food.servingGrams) : "");
  const [kcal, setKcal] = useState(food ? fmtQty(food.kcal) : "");
  const [protein, setProtein] = useState(food ? fmtQty(food.proteinG) : "");
  const [carbs, setCarbs] = useState(food?.carbsG != null ? fmtQty(food.carbsG) : "");
  const [fat, setFat] = useState(food?.fatG != null ? fmtQty(food.fatG) : "");
  const [fiber, setFiber] = useState(food?.fiberG != null ? fmtQty(food.fiberG) : "");
  const [upc, setUpc] = useState(food?.upc ?? (props.mode === "create" ? props.upc : ""));
  const [labelOpen, setLabelOpen] = useState(props.mode === "create" && Boolean(props.scanLabel));

  const backHref = `/today/add?date=${props.date}&meal=${props.meal}`;

  const grams = optionalNumber(servingGrams);
  const kcalN = parseDecimal(kcal);
  const proteinN = protein.trim() === "" ? 0 : parseDecimal(protein);
  const carbsO = optionalNumber(carbs);
  const fatO = optionalNumber(fat);
  const fiberO = optionalNumber(fiber);
  const gramsOk = grams.ok && (grams.value === null || grams.value > 0);

  const failing: FieldKey[] = [];
  if (name.trim().length === 0) failing.push("name");
  if (servingLabel.trim().length === 0) failing.push("servingLabel");
  if (!gramsOk) failing.push("servingGrams");
  if (kcalN === null) failing.push("kcal");
  if (proteinN === null) failing.push("protein");
  if (!carbsO.ok) failing.push("carbs");
  if (!fatO.ok) failing.push("fat");
  if (!fiberO.ok) failing.push("fiber");

  const fieldId = (key: FieldKey) => `${idBase}-${key}`;
  const fieldError = (key: FieldKey) => (attempted && failing.includes(key) ? FIELD_ERRORS[key] : null);
  /** aria-invalid and aria-describedby for one field, present only while it fails. */
  const invalid = (key: FieldKey) =>
    fieldError(key) ? ({ "aria-invalid": true, "aria-describedby": `${fieldId(key)}-error` } as const) : ({} as const);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (failing.length > 0 || kcalN === null || proteinN === null) {
      setAttempted(true);
      const first = failing[0];
      if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }
    const input = {
      name: name.trim(),
      brand: brand.trim() || null,
      servingLabel: servingLabel.trim(),
      servingGrams: grams.value,
      kcal: kcalN,
      proteinG: proteinN,
      carbsG: carbsO.value,
      fatG: fatO.value,
      fiberG: fiberO.value,
      upc: upc.replace(/\D/g, "") || null,
    };
    setError(null);
    startTransition(async () => {
      try {
        const res = props.mode === "edit" ? await updateCustomFoodAction({ id: props.food.id, ...input }) : await createCustomFoodAction(input);
        router.replace(`${backHref}&food=${res.id}`);
      } catch {
        setError("Could not save. Check the numbers and try again.");
      }
    });
  }

  /** Fill the form from a label read. A name or brand already typed stays; every number is replaced. */
  function fillFromLabel(draft: LabelDraft) {
    const v = draftFormValues(draft);
    const keepName = name.trim() !== "";
    // Functional updates, so a value typed while the read was out is never overwritten.
    setName((n) => (n.trim() === "" ? v.name : n));
    setBrand((b) => (b.trim() === "" ? v.brand : b));
    setServingLabel(v.servingLabel);
    setServingGrams(v.servingGrams);
    setKcal(v.kcal);
    setProtein(v.protein);
    setCarbs(v.carbs);
    setFat(v.fat);
    setFiber(v.fiber);
    setLabelOpen(false);
    if (!keepName && v.name === "") requestAnimationFrame(() => document.getElementById(fieldId("name"))?.focus());
  }

  function remove() {
    if (props.mode !== "edit") return;
    if (!armed) {
      setArmed(true);
      return;
    }
    const id = props.food.id;
    startTransition(async () => {
      try {
        const res = await deleteCustomFoodAction({ id });
        if (!res.ok) {
          setError("Could not delete that food. Go back to Add food and try again.");
          return;
        }
        router.replace(`${backHref}&tab=my-foods`);
      } catch {
        setError("Could not delete that food. Try again.");
      }
    });
  }

  return (
    <div className="pb-8">
      <FormHeader
        title={props.mode === "edit" ? "Edit food" : "New food"}
        backHref={backHref}
        right={
          props.mode === "create" ? (
            <button
              type="button"
              onClick={() => setLabelOpen(true)}
              aria-label="Scan label"
              data-testid="food-scan-label"
              className="tap grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-fg active:bg-line"
            >
              <ScanText size={20} />
            </button>
          ) : undefined
        }
      />
      {props.mode === "create" ? <LabelSheet open={labelOpen} onClose={() => setLabelOpen(false)} onRead={fillFromLabel} /> : null}
      <form onSubmit={submit} className="flex flex-col gap-4 px-5" data-testid="food-form">
        <div>
          <Field label="Name">
            <input
              id={fieldId("name")}
              className="input aria-invalid:border-danger"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={!name && !labelOpen}
              autoComplete="off"
              placeholder="Protein pancakes"
              data-testid="food-name"
              {...invalid("name")}
            />
          </Field>
          <FieldError id={`${fieldId("name")}-error`} message={fieldError("name")} data-testid="food-name-error" />
        </div>
        <Field label="Brand (optional)">
          <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} autoComplete="off" placeholder="Kodiak" data-testid="food-brand" />
        </Field>
        <div className="grid grid-cols-[1.4fr_1fr] gap-3">
          <div>
            <Field label="Serving" hint="As written on the label">
              <input
                id={fieldId("servingLabel")}
                className="input aria-invalid:border-danger"
                value={servingLabel}
                onChange={(e) => setServingLabel(e.target.value)}
                autoComplete="off"
                placeholder="1 scoop"
                data-testid="food-serving-label"
                {...invalid("servingLabel")}
              />
            </Field>
            <FieldError id={`${fieldId("servingLabel")}-error`} message={fieldError("servingLabel")} data-testid="food-serving-label-error" />
          </div>
          <div>
            <Field label="Serving weight" hint="Optional, unlocks grams">
              <NumberField id={fieldId("servingGrams")} value={servingGrams} onChange={setServingGrams} suffix="g" data-testid="food-serving-grams" placeholder="31" {...invalid("servingGrams")} />
            </Field>
            <FieldError id={`${fieldId("servingGrams")}-error`} message={fieldError("servingGrams")} data-testid="food-serving-grams-error" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Field label="Calories">
              <NumberField id={fieldId("kcal")} value={kcal} onChange={setKcal} suffix="cal" data-testid="food-kcal" placeholder="0" {...invalid("kcal")} />
            </Field>
            <FieldError id={`${fieldId("kcal")}-error`} message={fieldError("kcal")} data-testid="food-kcal-error" />
          </div>
          <div>
            <Field label="Protein">
              <NumberField id={fieldId("protein")} value={protein} onChange={setProtein} suffix="g" data-testid="food-protein" placeholder="0" {...invalid("protein")} />
            </Field>
            <FieldError id={`${fieldId("protein")}-error`} message={fieldError("protein")} data-testid="food-protein-error" />
          </div>
          <div>
            <Field label="Carbs">
              <NumberField id={fieldId("carbs")} value={carbs} onChange={setCarbs} suffix="g" data-testid="food-carbs" placeholder="optional" {...invalid("carbs")} />
            </Field>
            <FieldError id={`${fieldId("carbs")}-error`} message={fieldError("carbs")} data-testid="food-carbs-error" />
          </div>
          <div>
            <Field label="Fat">
              <NumberField id={fieldId("fat")} value={fat} onChange={setFat} suffix="g" data-testid="food-fat" placeholder="optional" {...invalid("fat")} />
            </Field>
            <FieldError id={`${fieldId("fat")}-error`} message={fieldError("fat")} data-testid="food-fat-error" />
          </div>
          <div>
            <Field label="Fiber">
              <NumberField id={fieldId("fiber")} value={fiber} onChange={setFiber} suffix="g" data-testid="food-fiber" placeholder="optional" {...invalid("fiber")} />
            </Field>
            <FieldError id={`${fieldId("fiber")}-error`} message={fieldError("fiber")} data-testid="food-fiber-error" />
          </div>
          <Field label="Barcode">
            <input
              className="input tnum"
              type="text"
              inputMode="numeric"
              value={upc}
              onChange={(e) => setUpc(e.target.value)}
              autoComplete="off"
              placeholder="optional"
              data-testid="food-upc"
            />
          </Field>
        </div>

        <p role="alert" className={error ? "text-sm font-medium text-danger" : ""} data-testid="food-form-error">
          {error}
        </p>

        <button type="submit" className="btn-primary mt-1 w-full" aria-disabled={pending} data-testid="food-form-submit">
          {pending ? "Saving…" : props.mode === "edit" ? "Save changes" : "Save food"}
        </button>
        {props.mode === "edit" ? <DeleteButton armed={armed} onClick={remove} pending={pending} label="food" testId="food-form-delete" /> : null}
      </form>
    </div>
  );
}
