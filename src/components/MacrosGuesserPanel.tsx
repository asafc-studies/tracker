"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { nutritionFieldClass } from "@/components/nutrition-ui";
import { apiFetch } from "@/lib/api-fetch";
import { caloriesFromMacros, formatMacroShort } from "@/lib/macros";
import { invalidateAfterMacros } from "@/lib/query-invalidate";

type Guess = {
  name: string;
  servingLabel: string;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  calories: number;
  rationale: string;
};

type Props = {
  date: string;
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function MacrosGuesserPanel({ date }: Props) {
  const queryClient = useQueryClient();
  const field = nutritionFieldClass();
  const [description, setDescription] = useState("");
  const [guessing, setGuessing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState("");
  const [loggedHint, setLoggedHint] = useState("");
  const [guess, setGuess] = useState<Guess | null>(null);

  async function runGuess() {
    const text = description.trim();
    if (text.length < 2) return;
    setGuessing(true);
    setError("");
    setLoggedHint("");
    try {
      const data = await apiFetch<{ guess: Guess }>("/api/macros/guess", {
        method: "POST",
        body: JSON.stringify({ description: text }),
      });
      setGuess({
        name: data.guess.name,
        servingLabel: data.guess.servingLabel || "1 serving",
        proteinG: data.guess.proteinG,
        carbsG: data.guess.carbsG,
        fatG: data.guess.fatG,
        fiberG: data.guess.fiberG ?? 0,
        calories:
          data.guess.calories ||
          caloriesFromMacros(
            data.guess.proteinG,
            data.guess.carbsG,
            data.guess.fatG,
          ),
        rationale: data.guess.rationale || "",
      });
    } catch (err) {
      setGuess(null);
      setError(err instanceof Error ? err.message : "Guess failed");
    } finally {
      setGuessing(false);
    }
  }

  function patchGuess(partial: Partial<Guess>) {
    setGuess((g) => {
      if (!g) return g;
      const next = { ...g, ...partial };
      if (
        partial.proteinG != null ||
        partial.carbsG != null ||
        partial.fatG != null
      ) {
        next.calories = caloriesFromMacros(
          next.proteinG,
          next.carbsG,
          next.fatG,
        );
      }
      return next;
    });
  }

  async function logGuess() {
    if (!guess) return;
    setLogging(true);
    setError("");
    try {
      await apiFetch("/api/macros", {
        method: "POST",
        body: JSON.stringify({
          date,
          name: guess.name.trim(),
          proteinG: round1(guess.proteinG),
          carbsG: round1(guess.carbsG),
          fatG: round1(guess.fatG),
          fiberG: round1(guess.fiberG || 0),
          calories: Math.round(guess.calories),
          quantity: 1,
          servingLabel: guess.servingLabel,
        }),
      });
      await invalidateAfterMacros(queryClient, date);
      setLoggedHint(`Logged “${guess.name.trim()}”`);
      setGuess(null);
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log food");
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <section className="space-y-2">
        <h2 className="text-sm text-[var(--muted)]">Macros guesser</h2>
        <p className="text-sm text-[var(--muted)]">
          Describe a recipe, a swap (“changed rice with quinoa, 200g”), or
          something vague like “big cup of coffee”. AI returns an editable log
          entry for this date.
        </p>
      </section>

      <section className="space-y-3">
        <textarea
          className={`${field} min-h-[120px] resize-y`}
          placeholder="e.g. chicken stir-fry, I used olive oil instead of butter, about a big plate…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!guessing) void runGuess();
            }
          }}
        />
        <button
          type="button"
          disabled={guessing || description.trim().length < 2}
          onClick={() => void runGuess()}
          className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2.5 text-sm font-medium min-h-[44px] w-full sm:w-auto disabled:opacity-50"
        >
          {guessing ? "Guessing…" : "Guess macros"}
        </button>
      </section>

      {error ? <p className="text-sm text-[var(--warn)]">{error}</p> : null}
      {loggedHint ? (
        <p className="text-sm text-[var(--accent)]">{loggedHint}</p>
      ) : null}

      {guess ? (
        <div className="rounded-lg border border-[var(--accent)] bg-[var(--surface)] p-4 space-y-3">
          <label className="space-y-1 block">
            <span className="text-xs text-[var(--muted)]">Name</span>
            <input
              className={field}
              value={guess.name}
              onChange={(e) => patchGuess({ name: e.target.value })}
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs text-[var(--muted)]">Serving</span>
            <input
              className={field}
              value={guess.servingLabel}
              onChange={(e) => patchGuess({ servingLabel: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="space-y-1 block">
              <span className="text-xs text-[var(--muted)]">P</span>
              <input
                className={field}
                type="number"
                step="0.1"
                value={guess.proteinG || ""}
                onChange={(e) =>
                  patchGuess({ proteinG: Number(e.target.value) })
                }
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-xs text-[var(--muted)]">C</span>
              <input
                className={field}
                type="number"
                step="0.1"
                value={guess.carbsG || ""}
                onChange={(e) =>
                  patchGuess({ carbsG: Number(e.target.value) })
                }
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-xs text-[var(--muted)]">F</span>
              <input
                className={field}
                type="number"
                step="0.1"
                value={guess.fatG || ""}
                onChange={(e) => patchGuess({ fatG: Number(e.target.value) })}
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-xs text-[var(--muted)]">Fi</span>
              <input
                className={field}
                type="number"
                step="0.1"
                value={guess.fiberG || ""}
                onChange={(e) =>
                  patchGuess({ fiberG: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <p className="text-sm">{formatMacroShort(guess)}</p>
          {guess.rationale ? (
            <p className="text-xs text-[var(--muted)]">{guess.rationale}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={logging || !guess.name.trim()}
              onClick={() => void logGuess()}
              className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2 text-sm font-medium min-h-[44px] disabled:opacity-50"
            >
              {logging ? "Logging…" : "Log"}
            </button>
            <button
              type="button"
              onClick={() => setGuess(null)}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm min-h-[44px]"
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
