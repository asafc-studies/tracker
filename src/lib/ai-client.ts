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
  } else if (provider.id === "mistral") {
    content = await chatCompletionsOpenAICompatible({
      url: "https://api.mistral.ai/v1/chat/completions",
      apiKey: provider.apiKey,
      model: provider.model,
      messages,
      providerLabel: "Mistral",
      useJsonObjectFormat: true,
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

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
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

  const data = (await res.json()) as {
    error?: { message?: string; code?: string };
    message?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!res.ok) {
    const apiMsg =
      data.error?.message || data.message || `Mistral error (${res.status})`;
    if (res.status === 429 || data.error?.code === "insufficient_quota") {
      throw new Error(`Mistral quota/rate limit: ${apiMsg}`);
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
