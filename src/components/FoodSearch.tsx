"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FoodSearchResult } from "@/lib/food-reference";
import { scaleFood } from "@/lib/food-reference";
import { formatMacroShort } from "@/lib/macros";

type Props = {
  onSelect: (food: FoodSearchResult, quantity: number, mlAmount?: number) => void;
  onManual?: () => void;
  confirmLabel?: string;
};

export function FoodSearch({
  onSelect,
  onManual,
  confirmLabel = "Add to log",
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [recent, setRecent] = useState<FoodSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<FoodSearchResult | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [mlAmount, setMlAmount] = useState("250");
  const [barcodeMode, setBarcodeMode] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [detectorSupported, setDetectorSupported] = useState(true);
  const [scanError, setScanError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectLoopRef = useRef(0);
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

  const stopScanner = useCallback(() => {
    cancelAnimationFrame(detectLoopRef.current);
    detectLoopRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      stopScanner();
    };
  }, [stopScanner]);

  /** Start camera only after the <video> is in the DOM (barcodeMode). */
  useEffect(() => {
    if (!barcodeMode) {
      stopScanner();
      return;
    }

    let cancelled = false;
    const hasDetector = typeof window !== "undefined" && "BarcodeDetector" in window;
    setDetectorSupported(hasDetector);
    setScanError("");
    setCameraReady(false);

    async function lookupAndSelect(code: string) {
      setLoading(true);
      setScanError("");
      try {
        const res = await fetch(
          `/api/foods/barcode?code=${encodeURIComponent(code)}`,
        );
        const data = await res.json();
        if (!res.ok) {
          setScanError(data.error || "Product not found");
          return;
        }
        setSelected(data.food);
        setQuantity("1");
        setBarcodeMode(false);
        setBarcodeInput("");
      } finally {
        setLoading(false);
      }
    }

    async function start() {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          setScanError("Camera preview failed to load. Try again.");
          return;
        }

        video.srcObject = stream;
        video.muted = true;
        video.setAttribute("playsinline", "true");
        await video.play();
        if (cancelled) return;
        setCameraReady(true);

        if (!hasDetector || !window.BarcodeDetector) return;

        const detector = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
        });

        const tick = async () => {
          if (cancelled || !videoRef.current || !streamRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              const code = codes[0].rawValue;
              stopScanner();
              setBarcodeMode(false);
              await lookupAndSelect(code);
              return;
            }
          } catch {
            // keep scanning
          }
          if (!cancelled && streamRef.current) {
            detectLoopRef.current = requestAnimationFrame(() => {
              void tick();
            });
          }
        };
        detectLoopRef.current = requestAnimationFrame(() => {
          void tick();
        });
      } catch {
        if (!cancelled) {
          setScanError(
            "Camera access denied or unavailable. Enter the barcode manually.",
          );
        }
      }
    }

    const raf = requestAnimationFrame(() => {
      void start();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopScanner();
    };
  }, [barcodeMode, stopScanner]);

  async function lookupBarcode(code: string) {
    setLoading(true);
    setScanError("");
    try {
      const res = await fetch(
        `/api/foods/barcode?code=${encodeURIComponent(code)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error || "Product not found");
        return;
      }
      setSelected(data.food);
      setQuantity("1");
      setBarcodeMode(false);
      setBarcodeInput("");
    } finally {
      setLoading(false);
    }
  }

  function pickFood(food: FoodSearchResult) {
    setSelected(food);
    setQuantity("1");
    if (food.servingUnit === "ml" && food.servingAmount) {
      setMlAmount(String(food.servingAmount));
    } else {
      setMlAmount("250");
    }
    setOpen(false);
    setQuery(food.name);
  }

  function confirmAdd() {
    if (!selected) return;
    if (selected.servingUnit === "ml" && selected.servingAmount) {
      const ml = Number(mlAmount);
      if (!Number.isFinite(ml) || ml <= 0) return;
      onSelect(selected, ml / selected.servingAmount, ml);
    } else {
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty <= 0) return;
      onSelect(selected, qty);
    }
    setSelected(null);
    setQuery("");
    setQuantity("1");
    setMlAmount("250");
    fetch("/api/foods/search?recent=1")
      .then((r) => r.json())
      .then((d) => setRecent(d.results ?? []))
      .catch(() => {});
  }

  const quantityNum = Number(quantity);
  const mlNum = Number(mlAmount);
  const scaled = selected
    ? selected.servingUnit === "ml" && selected.servingAmount
      ? Number.isFinite(mlNum) && mlNum > 0
        ? scaleFood(selected, 1, mlNum)
        : scaleFood(selected, 1, selected.servingAmount)
      : Number.isFinite(quantityNum) && quantityNum > 0
        ? scaleFood(selected, quantityNum)
        : scaleFood(selected, 1)
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
              <p className="px-3 py-2 text-xs text-[var(--muted)]">
                No matches — try manual entry
              </p>
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
                    {formatMacroShort(r)} · {r.servingLabel}
                    {r.source === "reference" ? " · staple" : ""}
                    {r.dataSourceLabel ? ` · ${r.dataSourceLabel}` : ""}
                    {r.offScope === "global" && !r.dataSourceLabel
                      ? " · global"
                      : ""}
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
          onClick={() => setBarcodeMode((v) => !v)}
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
          <div className="relative overflow-hidden rounded-md bg-black aspect-[4/3] max-h-56">
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              muted
              playsInline
              autoPlay
            />
            {!cameraReady && !scanError ? (
              <p className="absolute inset-0 flex items-center justify-center text-xs text-white/80 px-4 text-center">
                Starting camera…
              </p>
            ) : null}
          </div>
          {!detectorSupported ? (
            <p className="text-xs text-[var(--muted)]">
              Live barcode detection isn’t supported in this browser — use the
              field below, or try Chrome / Edge on Android.
            </p>
          ) : cameraReady ? (
            <p className="text-xs text-[var(--muted)]">
              Point at the barcode — it scans automatically.
            </p>
          ) : null}
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
              inputMode="numeric"
            />
            <button
              type="submit"
              className="shrink-0 rounded-md bg-[var(--accent)] text-[var(--background)] px-3 py-2 text-xs font-medium"
            >
              Look up
            </button>
          </form>
          {scanError ? (
            <p className="text-xs text-red-400">{scanError}</p>
          ) : null}
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
            <p className="text-xs text-[var(--muted)] mt-1">
              Per {selected.servingLabel}
              {selected.lastLoggedQuantity != null &&
              selected.lastLoggedQuantity > 0 ? (
                <>
                  {" "}
                  · last time ×{selected.lastLoggedQuantity}
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {selected.servingUnit === "ml" && selected.servingAmount ? (
              <>
                <label className="space-y-1 block">
                  <span className="text-xs text-[var(--muted)]">Amount (ml)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    value={mlAmount}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      const next = e.target.value.replace(",", ".");
                      if (next === "" || /^\d*\.?\d*$/.test(next)) {
                        setMlAmount(next);
                      }
                    }}
                    className="w-28 min-h-[44px] rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-base"
                  />
                </label>
                <span className="text-xs text-[var(--muted)] pb-3">
                  Full package: {selected.servingAmount} ml
                </span>
              </>
            ) : (
              <label className="space-y-1 block">
                <span className="text-xs text-[var(--muted)]">
                  Portions of {selected.servingLabel}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={quantity}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const next = e.target.value.replace(",", ".");
                    if (next === "" || /^\d*\.?\d*$/.test(next)) {
                      setQuantity(next);
                    }
                  }}
                  className="w-28 min-h-[44px] rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-base"
                />
              </label>
            )}
          </div>
          <p className="text-sm">{formatMacroShort(scaled)}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmAdd}
              disabled={
                selected.servingUnit === "ml" && selected.servingAmount
                  ? !Number.isFinite(mlNum) || mlNum <= 0
                  : !Number.isFinite(quantityNum) || quantityNum <= 0
              }
              className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2 text-sm font-medium min-h-[44px] disabled:opacity-50"
            >
              {confirmLabel}
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
