/**
 * Shared chat completions for GitHub Models / Gemini / OpenAI / Mistral.
 * Used by menu improve, today coaching, macros guesser, and workout tips.
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ProviderId = "github" | "gemini" | "openai" | "mistral";

export type ResolvedProvider = {
  id: ProviderId;
  apiKey: string;
  model: string;
};

function env(...names: string[]) {
  for (const name of names) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return "";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse Retry-After or X-RateLimit-Reset into an absolute UTC ms timestamp. */
function parseResetAtMs(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  const n = Number(s);
  if (Number.isFinite(n) && n >= 0) {
    if (n > 1e12) return n; // epoch ms
    if (n > 1e9) return n * 1000; // epoch seconds
    return Date.now() + n * 1000; // relative seconds
  }
  const when = Date.parse(s);
  return Number.isFinite(when) ? when : null;
}

function formatWait(ms: number) {
  const sec = Math.max(1, Math.ceil(ms / 1000));
  if (sec < 60) return `~${sec}s`;
  const min = Math.ceil(sec / 60);
  if (min < 60) return `~${min} min`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin ? `~${hr}h ${remMin}m` : `~${hr}h`;
}

function formatLocalTime(atMs: number) {
  try {
    return new Date(atMs).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(atMs).toISOString();
  }
}

/** Mistral/OpenAI-style limit headers vary a lot — collect every match. */
function collectRateLimitHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k.includes("ratelimit") || k === "retry-after") out[k] = value;
  });
  return out;
}

function headerPick(
  headers: Record<string, string>,
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const v = headers[name.toLowerCase()];
    if (v != null && v !== "") return v;
  }
  return undefined;
}

function parseFinite(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

type RateWindow = {
  label: string;
  remaining: number;
  limit: number;
  kind: "requests" | "tokens";
};

/**
 * Strip provider prefixes so "ratelimit" doesn't false-match "limit".
 * x-ratelimit-remaining-req-minute → { kind: remaining, suffix: -req-minute }
 */
function rateLimitMetric(
  key: string,
): { kind: "remaining" | "limit"; suffix: string } | null {
  const stripped = key
    .toLowerCase()
    .replace(/^x-/, "")
    .replace(/^ratelimitbysize-/, "")
    .replace(/^ratelimit-/, "");
  if (stripped === "remaining" || stripped.startsWith("remaining-")) {
    return {
      kind: "remaining",
      suffix: stripped === "remaining" ? "" : stripped.slice("remaining".length),
    };
  }
  if (stripped === "limit" || stripped.startsWith("limit-")) {
    return {
      kind: "limit",
      suffix: stripped === "limit" ? "" : stripped.slice("limit".length),
    };
  }
  return null;
}

/**
 * Pair remaining/limit headers that share a window suffix
 * (e.g. both end with -req-minute or -tokens-minute).
 */
function parseRateWindows(headers: Record<string, string>): RateWindow[] {
  const bySuffix = new Map<
    string,
    { remaining?: number; limit?: number; kind: "requests" | "tokens" }
  >();

  for (const [key, raw] of Object.entries(headers)) {
    const metric = rateLimitMetric(key);
    if (!metric) continue;
    const n = parseFinite(raw);
    if (n == null) continue;
    const kind = metric.suffix.includes("token") ? "tokens" : "requests";
    const slot = bySuffix.get(metric.suffix) ?? { kind };
    slot.kind = kind;
    if (metric.kind === "remaining") slot.remaining = n;
    else slot.limit = n;
    bySuffix.set(metric.suffix, slot);
  }

  const windows: RateWindow[] = [];
  for (const [suffix, slot] of bySuffix) {
    if (slot.remaining == null || slot.limit == null) continue;
    const label =
      suffix.replace(/^-+/, "").replace(/-/g, " ") ||
      (slot.kind === "tokens" ? "tokens" : "requests");
    windows.push({
      label,
      remaining: slot.remaining,
      limit: slot.limit,
      kind: slot.kind,
    });
  }
  return windows;
}

function guessWaitFromWindows(windows: RateWindow[]): string | null {
  const zeroLimit = windows.some((w) => w.limit <= 0);
  if (zeroLimit) {
    return "this model has 0 RPM on your Mistral plan — switch MISTRAL_MODEL / AI_MODEL (e.g. ministral-8b-2512 or mistral-small-latest)";
  }
  const depleted = windows.filter((w) => w.remaining <= 0);
  const pool = depleted.length ? depleted : windows;
  if (!pool.length) return null;
  const labels = pool.map((w) => w.label).join(" ");
  if (/\bsecond\b|\bsec\b|\brps\b/.test(labels)) {
    return "try again in ~2s (per-second window)";
  }
  if (/\bhour\b/.test(labels)) return "try again in ~1h (hourly window)";
  if (/\bday\b|\bdaily\b/.test(labels)) {
    return "try again tomorrow (daily window)";
  }
  if (/\bmonth\b/.test(labels)) {
    return "try again next month (monthly window)";
  }
  if (/\bminute\b|\bmin\b|\bmins\b/.test(labels)) {
    return "try again in ~1 min (per-minute window)";
  }
  return "try again in ~1 min";
}

/**
 * Human-readable rate-limit hint from response headers.
 * Mistral uses names like x-ratelimit-remaining-req-minute.
 */
function rateLimitHint(res: Response): string {
  const headers = collectRateLimitHeaders(res);
  if (Object.keys(headers).length === 0) {
    console.warn("[ai] 429 with no rate-limit headers");
  } else {
    console.warn("[ai] rate-limit headers", headers);
  }

  const resetRaw =
    headerPick(
      headers,
      "retry-after",
      "x-ratelimit-reset",
      "x-ratelimit-reset-requests",
      "x-ratelimit-reset-tokens",
      "ratelimit-reset",
      "ratelimitbysize-reset",
    ) ??
    Object.entries(headers).find(([k]) => {
      const m = rateLimitMetric(k);
      return !m && k.includes("reset");
    })?.[1];

  const windows = parseRateWindows(headers);
  const ranked = [...windows].sort((a, b) => {
    const aEmpty = a.remaining <= 0 || a.limit <= 0 ? 0 : 1;
    const bEmpty = b.remaining <= 0 || b.limit <= 0 ? 0 : 1;
    if (aEmpty !== bEmpty) return aEmpty - bEmpty;
    if (a.limit <= 0 && b.limit <= 0) return 0;
    if (a.limit <= 0) return 1;
    if (b.limit <= 0) return -1;
    return a.remaining / a.limit - b.remaining / b.limit;
  });

  const parts: string[] = [];
  for (const w of ranked.slice(0, 2)) {
    if (w.limit <= 0) {
      parts.push(`${w.label} blocked (limit ${w.limit})`);
    } else {
      parts.push(`${w.remaining}/${w.limit} ${w.label} left`);
    }
  }

  const resetAt = parseResetAtMs(resetRaw);
  if (resetAt != null) {
    const waitMs = resetAt - Date.now();
    if (waitMs <= 0) {
      parts.push("limit window already resetting — retry now");
    } else {
      parts.push(
        `try again in ${formatWait(waitMs)} (resets ~${formatLocalTime(resetAt)})`,
      );
    }
  } else {
    const guessed = guessWaitFromWindows(windows);
    if (guessed) parts.push(guessed);
  }

  if (parts.length) return parts.join("; ");

  const keys = Object.keys(headers);
  if (keys.length) {
    return `rate-limit headers present but unusable (${keys.join(", ")})`;
  }
  return "wait a few seconds and retry (provider sent no reset headers)";
}

/** Wait before retrying 429/5xx. Prefer Retry-After / reset headers; else backoff. */
function retryDelayMs(res: Response, attempt: number) {
  const headers = collectRateLimitHeaders(res);
  const resetRaw =
    headerPick(headers, "retry-after") ??
    headerPick(
      headers,
      "x-ratelimit-reset",
      "x-ratelimit-reset-requests",
      "x-ratelimit-reset-tokens",
      "ratelimit-reset",
      "ratelimitbysize-reset",
    ) ??
    Object.entries(headers).find(([k]) => k.includes("reset"))?.[1];
  const resetAt = parseResetAtMs(resetRaw);
  if (resetAt != null) {
    const wait = resetAt - Date.now();
    // Cap so a serverless invoke doesn't sleep for an hourly/daily window.
    if (wait > 0) return Math.min(Math.max(wait, 500), 30_000);
  }
  // Medium/small free tiers are ~1 RPS; 1.5s was too short and burned a second slot.
  return Math.min(3000 * 2 ** attempt, 15_000);
}

async function readResponseBody(res: Response) {
  const text = await res.text();
  if (!text) return { data: null as unknown, text: "" };
  try {
    return { data: JSON.parse(text) as unknown, text };
  } catch {
    return { data: null, text };
  }
}

function apiErrorMessage(
  data: unknown,
  text: string,
  providerLabel: string,
  status: number,
) {
  if (data && typeof data === "object") {
    const err = data as { error?: { message?: string }; message?: string };
    if (err.error?.message) return err.error.message;
    if (err.message) return err.message;
  }
  const snippet = text.trim().slice(0, 160);
  if (snippet) return snippet;
  return `${providerLabel} error (${status})`;
}

/** Prefer AI_PROVIDER / AI_MODEL; fall back to AI_MENU_* for existing setups. */
export function resolveAiProvider(): ResolvedProvider {
  const forcedRaw = env("AI_PROVIDER", "AI_MENU_PROVIDER").toLowerCase();
  // Accept common typo "ministral" / "minstral" as mistral.
  const forced = (
    forcedRaw === "ministral" || forcedRaw === "minstral"
      ? "mistral"
      : forcedRaw
  ) as ProviderId | "";

  const githubKey = env("GITHUB_MODELS_TOKEN", "GITHUB_TOKEN");
  const geminiKey = env("GEMINI_API_KEY");
  const mistralKey = env("MISTRAL_API_KEY");
  const openaiKey = env("OPENAI_API_KEY", "OPENAI_KEY", "OPENAIKEY");

  if (forced === "github" || (!forced && githubKey)) {
    if (!githubKey) {
      throw new Error(
        "AI_PROVIDER=github but GITHUB_MODELS_TOKEN (or GITHUB_TOKEN) is missing.",
      );
    }
    return {
      id: "github",
      apiKey: githubKey,
      model:
        env("AI_MODEL", "AI_MENU_MODEL", "GITHUB_MODELS_MODEL") ||
        "openai/gpt-4o-mini",
    };
  }

  if (forced === "gemini" || (!forced && geminiKey)) {
    if (!geminiKey) {
      throw new Error("AI_PROVIDER=gemini but GEMINI_API_KEY is missing.");
    }
    return {
      id: "gemini",
      apiKey: geminiKey,
      model:
        env("AI_MODEL", "AI_MENU_MODEL", "GEMINI_MENU_MODEL") ||
        "gemini-2.0-flash",
    };
  }

  if (forced === "mistral" || (!forced && mistralKey)) {
    if (!mistralKey) {
      throw new Error("AI_PROVIDER=mistral but MISTRAL_API_KEY is missing.");
    }
    return {
      id: "mistral",
      apiKey: mistralKey,
      model:
        env("AI_MODEL", "AI_MENU_MODEL", "MISTRAL_MODEL") ||
        "mistral-small-latest",
    };
  }

  if (forced === "openai" || openaiKey) {
    if (!openaiKey) {
      throw new Error("AI_PROVIDER=openai but OPENAI_API_KEY is missing.");
    }
    return {
      id: "openai",
      apiKey: openaiKey,
      model:
        env("AI_MODEL", "AI_MENU_MODEL", "OPENAI_MENU_MODEL") || "gpt-4o-mini",
    };
  }

  throw new Error(
    "No AI key found. Set MISTRAL_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY in .env.local (and AI_PROVIDER if you have more than one). Restart the server after saving.",
  );
}

export function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fence?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return candidate;
}

/** Parse model JSON; tolerate fences, fancy quotes, trailing commas. */
export function parseJsonObjectLoose(text: string): Record<string, unknown> {
  let raw = extractJsonObject(text)
    .replace(/^\uFEFF/, "")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");

  for (const attempt of [raw, raw.replace(/,\s*([}\]])/g, "$1")]) {
    try {
      const v = JSON.parse(attempt) as unknown;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return v as Record<string, unknown>;
      }
    } catch {
      /* try next */
    }
  }

  // Last resort: scrape known scalar fields from a broken object.
  const out: Record<string, unknown> = {};
  const str = (key: string) => {
    const m = raw.match(
      new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s"),
    );
    return m?.[1]
      ?.replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\\\/g, "\\");
  };
  const num = (key: string) => {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
    return m ? Number(m[1]) : undefined;
  };
  for (const key of ["name", "servingLabel", "rationale"] as const) {
    const v = str(key);
    if (v != null) out[key] = v;
  }
  for (const key of [
    "proteinG",
    "carbsG",
    "fatG",
    "fiberG",
    "calories",
  ] as const) {
    const v = num(key);
    if (v != null) out[key] = v;
  }
  if (typeof out.name === "string" && out.name.trim()) return out;
  throw new Error("Could not parse AI JSON");
}

async function chatCompletionsOpenAICompatible(opts: {
  url: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  extraHeaders?: Record<string, string>;
  providerLabel: string;
  useJsonObjectFormat?: boolean;
  temperature?: number;
  maxTokens?: number;
}) {
  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature ?? 0.55,
    messages: opts.messages,
  };
  if (opts.maxTokens != null) body.max_tokens = opts.maxTokens;
  if (opts.useJsonObjectFormat !== false) {
    body.response_format = { type: "json_object" };
  }

  let res: Response | null = null;
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    res = await fetch(opts.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
        ...opts.extraHeaders,
      },
      body: JSON.stringify(body),
    });
    if (
      attempt < maxAttempts - 1 &&
      (res.status === 429 || res.status === 502 || res.status === 503)
    ) {
      await sleep(retryDelayMs(res, attempt));
      continue;
    }
    break;
  }
  if (!res) throw new Error(`${opts.providerLabel} request failed`);

  const { data: raw, text } = await readResponseBody(res);
  const data = (raw ?? {}) as {
    error?: { message?: string; type?: string; code?: string };
    message?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!res.ok) {
    const apiMsg = apiErrorMessage(raw, text, opts.providerLabel, res.status);
    if (data.error?.code === "insufficient_quota") {
      throw new Error(`${opts.providerLabel} quota exceeded: ${apiMsg}`);
    }
    if (res.status === 429) {
      throw new Error(
        `${opts.providerLabel} rate limited (${opts.model}) — ${rateLimitHint(res)}. ${apiMsg}`,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `${opts.providerLabel} auth failed (${res.status}). Check the token/key in .env.local and restart the server. ${apiMsg}`,
      );
    }
    throw new Error(`${opts.providerLabel} ${res.status}: ${apiMsg}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Empty response from ${opts.providerLabel}`);
  return content;
}

async function chatCompletionsGemini(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: [{ text: opts.user }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.55,
        responseMimeType: "application/json",
        ...(opts.maxTokens != null
          ? { maxOutputTokens: opts.maxTokens }
          : {}),
      },
    }),
  });

  const { data: raw, text } = await readResponseBody(res);
  const data = (raw ?? {}) as {
    error?: { message?: string; status?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  if (!res.ok) {
    const apiMsg = apiErrorMessage(raw, text, "Gemini", res.status);
    if (res.status === 429) {
      throw new Error(`Gemini rate limited — ${rateLimitHint(res)}. ${apiMsg}`);
    }
    if (res.status === 400 || res.status === 403) {
      throw new Error(`Gemini auth/config (${res.status}): ${apiMsg}`);
    }
    throw new Error(`Gemini ${res.status}: ${apiMsg}`);
  }

  const content = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("")
    .trim();
  if (!content) throw new Error("Empty response from Gemini");
  return content;
}

/** Call the configured provider; returns raw model text (usually JSON). */
export async function aiChatJson(opts: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ content: string; model: string }> {
  const provider = resolveAiProvider();
  const messages: ChatMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];

  let content: string;
  if (provider.id === "github") {
    content = await chatCompletionsOpenAICompatible({
      url: "https://models.github.ai/inference/chat/completions",
      apiKey: provider.apiKey,
      model: provider.model,
      messages,
      extraHeaders: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      providerLabel: "GitHub Models",
      useJsonObjectFormat: false,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    });
  } else if (provider.id === "gemini") {
    content = await chatCompletionsGemini({
      apiKey: provider.apiKey,
      model: provider.model,
      system: opts.system,
      user: opts.user,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    });
  } else if (provider.id === "mistral") {
    content = await chatCompletionsOpenAICompatible({
      url: "https://api.mistral.ai/v1/chat/completions",
      apiKey: provider.apiKey,
      model: provider.model,
      messages,
      providerLabel: "Mistral",
      useJsonObjectFormat: true,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    });
  } else {
    content = await chatCompletionsOpenAICompatible({
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: provider.apiKey,
      model: provider.model,
      messages,
      providerLabel: "OpenAI",
      useJsonObjectFormat: true,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    });
  }

  return {
    content,
    model: `${provider.id}:${provider.model}`,
  };
}

function resolveMistralVisionModel() {
  return env("MISTRAL_VISION_MODEL") || "ministral-14b-latest";
}

/** Mistral vision chat — plain text, always uses MISTRAL_API_KEY. */
export async function aiChatWithImage(opts: {
  system: string;
  user: string;
  imageBase64: string;
  mimeType: string;
  temperature?: number;
}): Promise<{ content: string; model: string }> {
  const apiKey = env("MISTRAL_API_KEY");
  if (!apiKey) {
    throw new Error(
      "MISTRAL_API_KEY is missing. Set it in .env.local for photo food guessing.",
    );
  }

  const model = resolveMistralVisionModel();
  const dataUrl = `data:${opts.mimeType};base64,${opts.imageBase64}`;

  let res: Response | null = null;
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: opts.temperature ?? 0.3,
        messages: [
          { role: "system", content: opts.system },
          {
            role: "user",
            content: [
              { type: "text", text: opts.user },
              { type: "image_url", image_url: dataUrl },
            ],
          },
        ],
      }),
    });
    if (
      attempt < maxAttempts - 1 &&
      (res.status === 429 || res.status === 502 || res.status === 503)
    ) {
      await sleep(retryDelayMs(res, attempt));
      continue;
    }
    break;
  }
  if (!res) throw new Error("Mistral vision request failed");

  const { data: raw, text } = await readResponseBody(res);
  const data = (raw ?? {}) as {
    error?: { message?: string; code?: string };
    message?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!res.ok) {
    const apiMsg = apiErrorMessage(raw, text, "Mistral", res.status);
    if (data.error?.code === "insufficient_quota") {
      throw new Error(`Mistral quota exceeded: ${apiMsg}`);
    }
    if (res.status === 429) {
      throw new Error(
        `Mistral rate limited (${model}) — ${rateLimitHint(res)}. ${apiMsg}`,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Mistral auth failed (${res.status}). Check MISTRAL_API_KEY in .env.local. ${apiMsg}`,
      );
    }
    throw new Error(`Mistral ${res.status}: ${apiMsg}`);
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty response from Mistral vision");
  return { content, model: `mistral:${model}` };
}
