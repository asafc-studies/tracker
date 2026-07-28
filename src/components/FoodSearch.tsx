"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FoodSearchResult } from "@/lib/food-reference";
import { scaleFood } from "@/lib/food-reference";

type Props = {
  onSelect: (food: FoodSearchResult, quantity: number, mlAmount?: number) => void;
  onManual?: () => void;
};

export function FoodSearch({ onSelect, onManual }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [recent, setRecent] = useState<FoodSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<FoodSearchResult | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [mlAmount, setMlAmount] = useState(250);
  const [barcodeMode, setBarcodeMode] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const field =
    "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

  useEffect(() => {
    fetch("/api/foods/search?recent=1")
      .then((r) => r.json())
      .then((d) => setRecent(d.results ?? []))
      .catch(() => {});
  }, []);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/foods/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((d) => {
          setResults(d.results ?? []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      stopScanner();
    };
  }, []);

  function stopScanner() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function startScanner() {
    setScanError("");
    setBarcodeMode(true);
    if (!("BarcodeDetector" in window)) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);

      const Detector = window.BarcodeDetector;
      if (!Detector) return;
      const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a"] as string[] });
      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            stopScanner();
            await lookupBarcode(codes[0].rawValue);
            return;
          }
        } catch {
          // continue scanning
        }
        if (streamRef.current) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setScanError("Camera access denied or unavailable.");
    }
  }

  async function lookupBarcode(code: string) {
    setLoading(true);
    setScanError("");
    try {
      const res = await fetch(`/api/foods/barcode?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error || "Product not found");
        return;
      }
      setSelected(data.food);
      setQuantity(1);
      setBarcodeMode(false);
      setBarcodeInput("");
    } finally {
      setLoading(false);
    }
  }

  function pickFood(food: FoodSearchResult) {
    setSelected(food);
    setQuantity(1);
    if (food.servingUnit === "ml" && food.servingAmount) {
      setMlAmount(food.servingAmount);
    }
    setOpen(false);
    setQuery(food.name);
  }

  function confirmAdd() {
    if (!selected) return;
    if (selected.servingUnit === "ml" && selected.servingAmount) {
      onSelect(
        selected,
        mlAmount / selected.servingAmount,
        mlAmount,
      );
    } else {
      onSelect(selected, quantity);
    }
    setSelected(null);
    setQuery("");
    setQuantity(1);
    setMlAmount(250);
    fetch("/api/foods/search?recent=1")
      .then((r) => r.json())
      .then((d) => setRecent(d.results ?? []))
      .catch(() => {});
  }

  const scaled = selected
    ? selected.servingUnit === "ml" && selected.servingAmount
      ? scaleFood(selected, 1, mlAmount)
      : scaleFood(selected, quantity)
    : null;

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          className={field}
          placeholder="Search food (Hebrew or English)…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            search(e.target.value);
          }}
          onFocus={() => setOpen(true)}
        />
        {open && query.length >= 2 ? (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-lg max-h-64 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-2 text-xs text-[var(--muted)]">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[var(--muted)]">No matches — try manual entry</p>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-[var(--surface-2)] border-b border-[var(--border)] last:border-0"
                  onClick={() => pickFood(r)}
                >
                  <span className="block text-sm font-medium">{r.name}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {r.brand ? `${r.brand} · ` : ""}
                    {r.proteinG}g P · {r.calories} kcal · {r.servingLabel}
                    {r.source === "reference" ? " · staple" : ""}
                    {r.dataSourceLabel ? ` · ${r.dataSourceLabel}` : ""}
                    {r.offScope === "global" && !r.dataSourceLabel ? " · global" : ""}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setBarcodeMode((v) => !v);
            if (!barcodeMode) void startScanner();
            else stopScanner();
          }}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--accent)]"
        >
          {barcodeMode ? "Close scanner" : "Scan barcode"}
        </button>
        {onManual ? (
          <button
            type="button"
            onClick={onManual}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--accent)]"
          >
            Enter manually
          </button>
        ) : null}
      </div>

      {barcodeMode ? (
        <div className="space-y-2 rounded-lg border border-[var(--border)] p-3">
          {scanning ? (
            <video ref={videoRef} className="w-full max-h-48 rounded-md bg-black" muted playsInline />
          ) : (
            <p className="text-xs text-[var(--muted)]">
              Camera scanning not supported on this browser — enter barcode manually:
            </p>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void lookupBarcode(barcodeInput);
            }}
          >
            <input
              className={field}
              placeholder="Barcode number"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
            />
            <button
              type="submit"
              className="shrink-0 rounded-md bg-[var(--accent)] text-[var(--background)] px-3 py-2 text-xs font-medium"
            >
              Look up
            </button>
          </form>
          {scanError ? <p className="text-xs text-red-400">{scanError}</p> : null}
        </div>
      ) : null}

      {recent.length > 0 && !selected ? (
        <div>
          <p className="text-xs text-[var(--muted)] mb-2">Recent & favorites</p>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => pickFood(r)}
                className="rounded-full border border-[var(--border)] px-3 py-1 text-xs hover:border-[var(--accent)]"
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {selected && scaled ? (
        <div className="rounded-lg border border-[var(--accent)] bg-[var(--surface)] p-4 space-y-3">
          <div>
            <p className="font-medium">{selected.name}</p>
            {selected.brand ? (
              <p className="text-xs text-[var(--muted)]">{selected.brand}</p>
            ) : null}
            <p className="text-xs text-[var(--muted)] mt-1">{scaled.label}</p>
          </div>
          <div className="flex items-center gap-3">
            {selected.servingUnit === "ml" && selected.servingAmount ? (
              <>
                <label className="text-xs text-[var(--muted)]">Amount (ml)</label>
                <input
                  type="number"
                  min={10}
                  step={10}
                  value={mlAmount}
                  onChange={(e) =>
                    setMlAmount(
                      Number(e.target.value) ||
                        (selected.servingAmount ?? 250),
                    )
                  }
                  className="w-24 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-sm"
                />
                <span className="text-xs text-[var(--muted)]">
                  Full package: {selected.servingAmount} ml
                </span>
              </>
            ) : (
              <>
                <label className="text-xs text-[var(--muted)]">Quantity</label>
                <input
                  type="number"
                  min={0.25}
                  step={0.25}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value) || 1)}
                  className="w-20 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-sm"
                />
              </>
            )}
          </div>
          <p className="text-sm">
            {scaled.proteinG}g P · {scaled.carbsG}g C · {scaled.fatG}g F · {scaled.calories} kcal
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmAdd}
              className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2 text-sm font-medium"
            >
              Add to log
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type { FoodSearchResult };
