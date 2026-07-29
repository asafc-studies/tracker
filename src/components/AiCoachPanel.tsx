"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";

export type CoachAdvicePayload = {
  scope: "today" | "workout";
  summary: string;
  keepDoing: string[];
  improve: string[];
  watchOut: string[];
  model: string;
};

type Props = {
  scope: "today" | "workout";
  title?: string;
  placeholder?: string;
  buttonLabel?: string;
};

function BulletBlock({
  label,
  items,
}: {
  label: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="text-sm text-[var(--muted)] leading-relaxed pl-3 border-l-2 border-[var(--border)]"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AiCoachPanel({
  scope,
  title = "AI tips",
  placeholder = "Optional focus, e.g. more protein / knee-friendly cardio",
  buttonLabel = "Get AI tips",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [userRequest, setUserRequest] = useState("");
  const [advice, setAdvice] = useState<CoachAdvicePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<CoachAdvicePayload>("/api/coach", {
        method: "POST",
        body: JSON.stringify({
          scope,
          userRequest: userRequest.trim() || undefined,
        }),
      });
      setAdvice(data);
      setShowPrompt(false);
      setUserRequest("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI tips failed");
    } finally {
      setLoading(false);
    }
  }

  function openPrompt() {
    setShowPrompt(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
            {title}
          </p>
          <p className="text-sm text-[var(--muted)] mt-1">
            Uses your profile Target, recent food, and workouts.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() =>
            showPrompt ? setShowPrompt(false) : openPrompt()
          }
          className="shrink-0 rounded-md bg-[var(--accent)] text-[var(--background)] px-3 py-2.5 text-xs font-medium min-h-[44px] disabled:opacity-50"
        >
          {loading ? "Thinking…" : showPrompt ? "Cancel" : buttonLabel}
        </button>
      </div>

      {showPrompt ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={userRequest}
            onChange={(e) => setUserRequest(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!loading) void run();
              }
            }}
            placeholder={placeholder}
            className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs placeholder:text-[var(--muted)] resize-none min-h-[52px]"
            rows={2}
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => void run()}
            className="shrink-0 rounded-md bg-[var(--accent)] text-[var(--background)] px-3 py-2.5 text-xs font-medium min-h-[44px] disabled:opacity-50"
          >
            {loading ? "…" : "Send"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-400/90">{error}</p>
      ) : null}

      {advice ? (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-[var(--foreground)]">
            {advice.summary}
          </p>
          <BulletBlock label="Keep doing" items={advice.keepDoing} />
          <BulletBlock label="Improve" items={advice.improve} />
          <BulletBlock label="Watch out" items={advice.watchOut} />
          <p className="text-[10px] text-[var(--muted)]">{advice.model}</p>
        </div>
      ) : !showPrompt && !error ? (
        <p className="text-sm text-[var(--muted)]">
          Tap the button for a trend-aware summary. Optional note steers the
          advice.
        </p>
      ) : null}
    </section>
  );
}
