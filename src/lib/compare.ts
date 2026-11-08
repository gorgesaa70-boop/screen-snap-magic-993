import { useSyncExternalStore } from "react";

/** The listings picked for «قارن»: kept on this device, no account needed. */
const KEY = "va-compare";
export const COMPARE_MAX = 4;
const NONE: string[] = [];

let current: string[] | null = null;
const listeners = new Set<() => void>();

function read(): string[] {
  if (current) return current;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    current = Array.isArray(saved) ? saved.filter((x): x is string => typeof x === "string").slice(0, COMPARE_MAX) : [];
  } catch { current = []; }
  return current;
}

function write(next: string[]) {
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: lasts until the page closes */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const useCompareIds = () => useSyncExternalStore(subscribe, read, () => NONE);

/** false when the list is already full. */
export function toggleCompare(id: string) {
  const ids = read();
  if (ids.includes(id)) { write(ids.filter((x) => x !== id)); return true; }
  if (ids.length >= COMPARE_MAX) return false;
  write([...ids, id]);
  return true;
}

export const removeCompare = (id: string) => write(read().filter((x) => x !== id));
export const clearCompare = () => write([]);
