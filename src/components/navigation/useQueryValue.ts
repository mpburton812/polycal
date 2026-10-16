"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/**
 * Mirrors a dialog flag into the URL. On the first paint, a value already in
 * the query wins so refresh reopens the dialog. Later state changes write the
 * query (PC-540).
 */
export function useQueryValue(
  key: string,
  value: string | null,
  onValue: (next: string) => void,
): void {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromQuery = searchParams.get(key);
  const adoptQuery = useRef(fromQuery != null);

  useEffect(() => {
    if (adoptQuery.current) {
      adoptQuery.current = false;
      if (fromQuery) onValue(fromQuery);
      return;
    }
    if ((value ?? null) === (fromQuery ?? null)) return;
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [fromQuery, key, onValue, pathname, router, searchParams, value]);
}

/** Suspense child so `useSearchParams` does not bail out the whole page. */
export function QueryValueSync({
  queryKey,
  value,
  onValue,
}: {
  queryKey: string;
  value: string | null;
  onValue: (next: string) => void;
}) {
  const stable = useCallback((next: string) => onValue(next), [onValue]);
  useQueryValue(queryKey, value, stable);
  return null;
}
