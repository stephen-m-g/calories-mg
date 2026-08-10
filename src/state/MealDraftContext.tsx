import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { MealType, ReferenceUnit } from '../types/models';
import type { SearchResultFood } from '../types/search';

/**
 * A single food on its way into the log, shared by the voice and photo flows.
 *
 * Both pipelines converge here: an AI names foods and estimates amounts, those names are matched
 * against the food database, and the user corrects whatever is wrong before anything is written.
 * Keeping one shape for both is what lets them share a review screen.
 */
export interface DraftItem {
  key: string;
  /** What the AI called it, kept so the item is still identifiable if no match was found. */
  originalName: string;
  /** The chosen database food. Null when nothing matched and the user hasn't picked one. */
  match: SearchResultFood | null;
  quantity: number;
  unit: ReferenceUnit;
  /** 0-1 from photo analysis; null for voice, where the editable transcript is the check. */
  confidence: number | null;
  /** Runner-up names from the vision model, for when the top identification is wrong. */
  suggestedNames: string[];
  /** Ranked database candidates for the current name — the next-best matches. */
  candidates: SearchResultFood[];
}

export type DraftSource = 'voice' | 'photo';

interface MealDraft {
  items: DraftItem[];
  source: DraftSource;
  mealType: MealType;
  logDate: string;
  /** Original transcript (voice) — persisted onto each log for audit. */
  transcript: string | null;
  /** Saved photo path (photo flow) — persisted onto each log. */
  photoUri: string | null;
}

interface MealDraftValue extends MealDraft {
  startDraft: (draft: MealDraft) => void;
  setMealType: (mealType: MealType) => void;
  updateItem: (key: string, changes: Partial<DraftItem>) => void;
  removeItem: (key: string) => void;
  addItem: (item: DraftItem) => void;
  clearDraft: () => void;
}

const EMPTY: MealDraft = {
  items: [],
  source: 'voice',
  mealType: 'breakfast',
  logDate: '',
  transcript: null,
  photoUri: null,
};

const MealDraftContext = createContext<MealDraftValue | null>(null);

/**
 * Holds the in-progress meal above the navigation stack.
 *
 * The review screen and the per-item edit screen are separate routes but operate on the same
 * list, and React Navigation params are meant to be serializable — passing food objects and
 * mutation callbacks through them would be both lossy and fragile. A provider around the stack
 * keeps one source of truth that survives navigating in and back out of an item.
 */
export function MealDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<MealDraft>(EMPTY);

  const startDraft = useCallback((next: MealDraft) => setDraft(next), []);
  const clearDraft = useCallback(() => setDraft(EMPTY), []);

  const setMealType = useCallback((mealType: MealType) => {
    setDraft((prev) => ({ ...prev, mealType }));
  }, []);

  const updateItem = useCallback((key: string, changes: Partial<DraftItem>) => {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    }));
  }, []);

  const removeItem = useCallback((key: string) => {
    setDraft((prev) => ({ ...prev, items: prev.items.filter((item) => item.key !== key) }));
  }, []);

  const addItem = useCallback((item: DraftItem) => {
    setDraft((prev) => ({ ...prev, items: [...prev.items, item] }));
  }, []);

  const value = useMemo<MealDraftValue>(
    () => ({ ...draft, startDraft, clearDraft, setMealType, updateItem, removeItem, addItem }),
    [draft, startDraft, clearDraft, setMealType, updateItem, removeItem, addItem]
  );

  return <MealDraftContext.Provider value={value}>{children}</MealDraftContext.Provider>;
}

export function useMealDraft(): MealDraftValue {
  const context = useContext(MealDraftContext);
  if (!context) {
    throw new Error('useMealDraft must be used inside a MealDraftProvider');
  }
  return context;
}

let draftKeyCounter = 0;
/** Stable unique key for a draft row — list identity has to survive edits and reordering. */
export function nextDraftKey(prefix: string): string {
  draftKeyCounter += 1;
  return `${prefix}-${draftKeyCounter}`;
}
