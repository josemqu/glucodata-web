"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Search, Star, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InsetField, insetControlClass } from "@/components/ui/inset-field";
import type { Food } from "@/lib/foods";

interface LibreSession {
  token: string;
  userId: string;
  region: string;
}

export interface MealSelection {
  food: Food;
  quantity: number;
  sourceMealItemId?: string;
}

interface MealComposerProps {
  session: LibreSession;
  value: MealSelection[];
  onChange: (value: MealSelection[]) => void;
  disabled?: boolean;
}

function requestHeaders(session: LibreSession) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.token}`,
    "X-Libre-User-Id": session.userId,
    "X-Libre-Region": session.region ?? "",
  };
}

function foodPayload(food: Food) {
  return {
    name: food.name,
    serving_size: Number(food.serving_size),
    serving_unit: food.serving_unit,
    carbs_g: Number(food.carbs_g),
    protein_g: Number(food.protein_g),
    fat_g: Number(food.fat_g),
    calories: food.calories == null ? null : Number(food.calories),
    favorite: food.favorite,
  };
}

function formatMacro(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function MealComposer({ session, value, onChange, disabled = false }: MealComposerProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingFood, setSavingFood] = useState(false);
  const [name, setName] = useState("");
  const [servingSize, setServingSize] = useState("100");
  const [servingUnit, setServingUnit] = useState("g");
  const [foodCarbs, setFoodCarbs] = useState("");
  const [foodProtein, setFoodProtein] = useState("0");
  const [foodFat, setFoodFat] = useState("0");
  const [foodCalories, setFoodCalories] = useState("");

  useEffect(() => {
    if (!pickerOpen) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("search", search.trim());
        const response = await fetch(`/api/foods?${params}`, {
          headers: requestHeaders(session),
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "No se pudieron cargar los alimentos.");
        setFoods(result.data ?? []);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar los alimentos.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [pickerOpen, search, session]);

  useEffect(() => {
    if (!pickerOpen) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [pickerOpen]);

  const availableFoods = useMemo(() => {
    const selected = new Set(value.map((item) => item.food.id));
    return foods.filter((food) => !selected.has(food.id)).slice(0, 8);
  }, [foods, value]);

  const totals = useMemo(() => value.reduce((sum, item) => ({
    carbs: sum.carbs + Number(item.food.carbs_g) * item.quantity,
    protein: sum.protein + Number(item.food.protein_g) * item.quantity,
    fat: sum.fat + Number(item.food.fat_g) * item.quantity,
    calories: sum.calories + Number(item.food.calories ?? 0) * item.quantity,
  }), { carbs: 0, protein: 0, fat: 0, calories: 0 }), [value]);

  const addFood = (food: Food) => onChange([...value, { food, quantity: 1 }]);

  const updateQuantity = (foodId: string, quantity: number) => {
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    onChange(value.map((item) => item.food.id === foodId ? { ...item, quantity: Math.min(quantity, 10000) } : item));
  };

  const toggleFavorite = async (food: Food) => {
    setError(null);
    try {
      const response = await fetch(`/api/foods/${food.id}`, {
        method: "PATCH",
        headers: requestHeaders(session),
        body: JSON.stringify({ ...foodPayload(food), favorite: !food.favorite }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar el favorito.");
      setFoods((current) => current.map((item) => item.id === food.id ? result.data : item));
      onChange(value.map((item) => item.food.id === food.id ? { ...item, food: result.data } : item));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo actualizar el favorito.");
    }
  };

  const createFood = async () => {
    setSavingFood(true);
    setError(null);
    try {
      const response = await fetch("/api/foods", {
        method: "POST",
        headers: requestHeaders(session),
        body: JSON.stringify({
          name,
          serving_size: Number(servingSize),
          serving_unit: servingUnit,
          carbs_g: Number(foodCarbs),
          protein_g: Number(foodProtein),
          fat_g: Number(foodFat),
          calories: foodCalories === "" ? null : Number(foodCalories),
          favorite: false,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar el alimento.");
      setFoods((current) => [result.data, ...current]);
      addFood(result.data);
      setCreating(false);
      setName("");
      setServingSize("100");
      setServingUnit("g");
      setFoodCarbs("");
      setFoodProtein("0");
      setFoodFat("0");
      setFoodCalories("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar el alimento.");
    } finally {
      setSavingFood(false);
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="meal-composer-title">
      <div className="flex items-center justify-between gap-3">
        <h4 id="meal-composer-title" className="text-sm font-semibold">Alimentos <span className="font-normal text-muted-foreground">· opcional</span></h4>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2" onClick={() => setPickerOpen(true)} disabled={disabled}>
          <Search />{value.length ? "Agregar más" : "Agregar alimentos"}
        </Button>
      </div>

      {value.length ? (
        <div className="space-y-2">
          {value.map((item) => (
            <div key={item.food.id} className="grid grid-cols-[minmax(0,1fr)_5.25rem_2.75rem] items-center gap-2 rounded-xl bg-background px-3 py-2.5">
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.food.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{formatMacro(Number(item.food.carbs_g) * item.quantity)} g CH</p></div>
              <div className="relative"><Input aria-label={`Cantidad de ${item.food.name}`} className="h-11 pr-7 text-right font-numbers" type="number" inputMode="decimal" min="0.001" step="any" value={item.quantity} onChange={(event) => updateQuantity(item.food.id, Number(event.target.value))} /><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">×</span></div>
              <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => onChange(value.filter((candidate) => candidate.food.id !== item.food.id))} disabled={disabled} aria-label={`Quitar ${item.food.name}`}><Trash2 /></Button>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t px-1 pt-3 text-xs min-[420px]:grid-cols-4">
            <span><span className="text-muted-foreground">CH</span> <strong className="font-numbers">{formatMacro(totals.carbs)} g</strong></span>
            <span><span className="text-muted-foreground">Proteínas</span> <strong className="font-numbers">{formatMacro(totals.protein)} g</strong></span>
            <span><span className="text-muted-foreground">Grasas</span> <strong className="font-numbers">{formatMacro(totals.fat)} g</strong></span>
            <span><span className="text-muted-foreground">Energía</span> <strong className="font-numbers">{formatMacro(totals.calories)} kcal</strong></span>
          </div>
        </div>
      ) : null}

      {pickerOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) {
            setPickerOpen(false);
            setCreating(false);
          }
        }} onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setPickerOpen(false);
            setCreating(false);
          }
        }}>
          <div role="dialog" aria-modal="true" aria-labelledby="food-picker-title" className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-background shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4 border-b px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 sm:pt-4">
              <div className="min-w-0">
                <h3 id="food-picker-title" className="text-base font-bold">Agregar alimentos</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{value.length ? `${value.length} ${value.length === 1 ? "seleccionado" : "seleccionados"}` : "Buscá o creá un alimento propio"}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => { setPickerOpen(false); setCreating(false); }} aria-label="Cerrar selector de alimentos"><X /></Button>
            </div>

            <div className="border-b px-4 py-3 sm:px-5">
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input ref={searchRef} aria-label="Buscar alimentos propios" className="h-11 pl-9 pr-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar alimentos" disabled={disabled} />
                  {loading ? <Loader2 aria-label="Buscando alimentos" className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
                </div>
                <Button type="button" variant={creating ? "secondary" : "outline"} className="h-11 shrink-0 gap-1.5" onClick={() => setCreating((current) => !current)} disabled={disabled}>
                  {creating ? <X /> : <Plus />}{creating ? "Cerrar" : "Nuevo"}
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
              {creating ? (
                <div className="mb-3 space-y-3 rounded-xl bg-muted/50 p-3">
                  <InsetField id="food-name" label="Nombre del alimento"><Input id="food-name" className={insetControlClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Arroz cocido" maxLength={120} /></InsetField>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(5.5rem,0.65fr)] gap-2">
                    <InsetField id="food-serving-size" label="Porción"><Input id="food-serving-size" className={insetControlClass} type="number" inputMode="decimal" min="0.001" step="any" value={servingSize} onChange={(event) => setServingSize(event.target.value)} /></InsetField>
                    <InsetField id="food-serving-unit" label="Unidad"><Input id="food-serving-unit" className={insetControlClass} value={servingUnit} onChange={(event) => setServingUnit(event.target.value)} maxLength={24} /></InsetField>
                  </div>
                  <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-4">
                    <InsetField id="food-carbs" label="CH (g)"><Input id="food-carbs" className={insetControlClass} type="number" min="0" step="0.1" value={foodCarbs} onChange={(event) => setFoodCarbs(event.target.value)} /></InsetField>
                    <InsetField id="food-protein" label="Prot. (g)"><Input id="food-protein" className={insetControlClass} type="number" min="0" step="0.1" value={foodProtein} onChange={(event) => setFoodProtein(event.target.value)} /></InsetField>
                    <InsetField id="food-fat" label="Grasa (g)"><Input id="food-fat" className={insetControlClass} type="number" min="0" step="0.1" value={foodFat} onChange={(event) => setFoodFat(event.target.value)} /></InsetField>
                    <InsetField id="food-calories" label="kcal"><Input id="food-calories" className={insetControlClass} type="number" min="0" step="1" value={foodCalories} onChange={(event) => setFoodCalories(event.target.value)} /></InsetField>
                  </div>
                  <Button type="button" className="w-full" onClick={() => void createFood()} disabled={disabled || savingFood || !name.trim() || !foodCarbs}>
                    {savingFood ? <Loader2 className="animate-spin" /> : <Plus />}{savingFood ? "Guardando…" : "Guardar y agregar"}
                  </Button>
                </div>
              ) : null}

              {error ? <p role="alert" className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}

              {availableFoods.length ? (
                <div className="divide-y overflow-hidden rounded-xl bg-muted/40">
                  {availableFoods.map((food) => (
                    <div key={food.id} className="flex min-h-14 items-center gap-2 px-3 py-2">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => addFood(food)} disabled={disabled}>
                        <span className="block truncate text-sm font-medium">{food.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{formatMacro(Number(food.carbs_g))} g CH · {formatMacro(Number(food.serving_size))} {food.serving_unit}</span>
                      </button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => void toggleFavorite(food)} disabled={disabled} aria-label={food.favorite ? `Quitar ${food.name} de favoritos` : `Agregar ${food.name} a favoritos`}><Star className={food.favorite ? "fill-current text-amber-500" : "text-muted-foreground"} /></Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => addFood(food)} disabled={disabled} aria-label={`Agregar ${food.name}`}><Plus /></Button>
                    </div>
                  ))}
                </div>
              ) : !loading ? <div className="py-10 text-center"><Search className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{search ? "No encontramos alimentos" : "No hay más alimentos para agregar"}</p><p className="mt-1 text-xs text-muted-foreground">{search ? "Probá otro nombre o creá uno nuevo." : "Podés crear uno nuevo desde este selector."}</p></div> : null}
            </div>

            <div className="border-t bg-muted/20 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
              <Button type="button" className="w-full" onClick={() => { setPickerOpen(false); setCreating(false); }}>Listo{value.length ? ` · ${value.length}` : ""}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
