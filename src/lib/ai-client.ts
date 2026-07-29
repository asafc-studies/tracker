/**
 * Shared chat completions for GitHub Models / Gemini / OpenAI.
 * Used by menu improve, today coaching, and workout tips.
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ProviderId = "github" | "gemini" | "openai";

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

/** Prefer AI_PROVIDER / AI_MODEL; fall back to AI_MENU_* for existing setups. */
export function resolveAiProvider(): ResolvedProvider {
  const forced = env("AI_PROVIDER", "AI_MENU_PROVIDER").toLowerCase() as
    | ProviderId
    | "";

  const githubKey = env("GITHUB_MODELS_TOKEN", "GITHUB_TOKEN");
  const geminiKey = env("GEMINI_API_KEY");
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
    "No AI key found. Prefer free GitHub Models: create a PAT with models:read and set GITHUB_MODELS_TOKEN in .env.local (or use GEMINI_API_KEY). Restart the server after saving.",
  );
}

export function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
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
}) {
  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature ?? 0.55,
    messages: opts.messages,
  };
  if (opts.useJsonObjectFormat !== false) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(opts.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      ...opts.extraHeaders,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as {
    error?: { message?: string; type?: string; code?: string };
    message?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!res.ok) {
    const apiMsg =
      data.error?.message ||
      data.message ||
      `${opts.providerLabel} error (${res.status})`;
    if (res.status === 429 || data.error?.code === "insufficient_quota") {
      throw new Error(`${opts.providerLabel} quota/rate limit: ${apiMsg}`);
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
      },
    }),
  });

  const data = (await res.json()) as {
    error?: { message?: string; status?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  if (!res.ok) {
    const apiMsg = data.error?.message || `Gemini error (${res.status})`;
    if (res.status === 429) {
      throw new Error(`Gemini quota/rate limit: ${apiMsg}`);
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
    });
  } else if (provider.id === "gemini") {
    content = await chatCompletionsGemini({
      apiKey: provider.apiKey,
      model: provider.model,
      system: opts.system,
      user: opts.user,
      temperature: opts.temperature,
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
    });
  }

  return {
    content,
    model: `${provider.id}:${provider.model}`,
  };
}
