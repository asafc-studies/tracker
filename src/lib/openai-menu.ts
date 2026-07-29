import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getMacroWarnings, sumMacros } from "@/lib/macros";
import {
  getStandingMenu,
  type StandingMenuItemInput,
} from "@/lib/standing-menu";
import {
  DEFAULT_DEFICIT_KCAL,
  DEFAULT_PROTEIN_PER_KG,
  resolveTargets,
  todayISODate,
  type ActivityLevel,
} from "@/lib/tdee";

const MEAL_SLOTS = new Set(["breakfast", "lunch", "dinner", "snack"]);

export type ImprovedMenuResult = {
  items: StandingMenuItemInput[];
  rationale: string;
  model: string;
};

function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function parseAiItems(raw: unknown): StandingMenuItemInput[] {
  if (!Array.isArray(raw)) return [];
  const items: StandingMenuItemInput[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name = String(r.name || "").trim();
    if (!name) continue;
    const proteinG = Number(r.proteinG ?? 0);
    const carbsG = Number(r.carbsG ?? 0);
    const fatG = Number(r.fatG ?? 0);
    let calories = Number(r.calories ?? 0);
    if (!calories) calories = Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
    const slot = String(r.mealSlot || "snack").toLowerCase();
    items.push({
      name,
      brand: r.brand ? String(r.brand) : null,
      quantity: Number(r.quantity ?? 1) || 1,
      proteinG: Number.isFinite(proteinG) ? proteinG : 0,
      carbsG: Number.isFinite(carbsG) ? carbsG : 0,
      fatG: Number.isFinite(fatG) ? fatG : 0,
      calories: Number.isFinite(calories) ? calories : 0,
      mealSlot: MEAL_SLOTS.has(slot) ? slot : "snack",
      sortOrder: items.length,
    });
  }
  return items;
}

export async function buildMenuImproveContext(userId: string) {
  const db = await getDb();
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });
  const targets =
    profile?.weightKg && profile.bodyFatPercent != null
      ? resolveTargets({
          weightKg: profile.weightKg,
          heightCm: profile.heightCm,
          age: profile.age,
          sex: (profile.sex as "male" | "female" | null) ?? null,
          bodyFatPercent: profile.bodyFatPercent,
          activityLevel: (profile.activityLevel ??
            "moderate") as ActivityLevel,
          deficitKcal: profile.deficitKcal ?? DEFAULT_DEFICIT_KCAL,
          proteinPerKg: profile.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG,
          calorieTargetOverride: profile.calorieTargetOverride ?? null,
          proteinTargetOverride: profile.proteinTargetOverride ?? null,
        })
      : null;

  if (!targets) {
    throw new Error("Complete profile targets before improving the menu.");
  }

  const since = daysAgoISO(7);
  const logs = await db.query.foodLogs.findMany({
    where: and(
      eq(schema.foodLogs.userId, userId),
      gte(schema.foodLogs.date, since),
    ),
    orderBy: [desc(schema.foodLogs.date)],
  });

  const byDate = new Map<string, typeof logs>();
  for (const log of logs) {
    const list = byDate.get(log.date) ?? [];
    list.push(log);
    byDate.set(log.date, list);
  }

  const recentDays = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, 5)
    .map(([date, foods]) => {
      const totals = sumMacros(foods);
      const warnings = getMacroWarnings(totals, {
        calorieTarget: targets.calorieTarget,
        proteinG: targets.proteinG,
        carbsG: targets.carbsG,
        fatG: targets.fatG,
      });
      return {
        date,
        totals,
        warnings: warnings.map((w) => w.title),
        foods: foods.slice(0, 12).map((f) => ({
          name: f.name,
          proteinG: f.proteinG,
          carbsG: f.carbsG,
          fatG: f.fatG,
          calories: f.calories,
        })),
      };
    });

  const today = todayISODate();
  const todayLogs = byDate.get(today) ?? [];
  const todayTotals = sumMacros(todayLogs);
  const todayWarnings = getMacroWarnings(todayTotals, {
    calorieTarget: targets.calorieTarget,
    proteinG: targets.proteinG,
    carbsG: targets.carbsG,
    fatG: targets.fatG,
  });

  let standing = await getStandingMenu(userId);
  if (standing.length === 0) {
    const daily = await db.query.dailyMenuItems.findMany({
      where: and(
        eq(schema.dailyMenuItems.userId, userId),
        eq(schema.dailyMenuItems.date, today),
      ),
    });
    standing = daily.map((item) => ({
      id: item.id,
      userId: item.userId,
      name: item.name,
      brand: item.brand,
      savedFoodId: item.savedFoodId,
      quantity: item.quantity,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      calories: item.calories,
      mealSlot: item.mealSlot,
      sortOrder: item.sortOrder,
      updatedAt: item.createdAt,
    }));
  }

  return {
    targets: {
      calorieTarget: targets.calorieTarget,
      proteinG: targets.proteinG,
      carbsG: targets.carbsG,
      fatG: targets.fatG,
      tdee: targets.tdee,
      deficit: targets.deficit,
    },
    todayWarnings: todayWarnings.map((w) => ({
      title: w.title,
      detail: w.detail,
    })),
    currentPlan: standing.map((item) => ({
      name: item.name,
      brand: item.brand,
      quantity: item.quantity,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      calories: item.calories,
      mealSlot: item.mealSlot,
    })),
    recentDays,
  };
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ProviderId = "github" | "gemini" | "openai";

function env(...names: string[]) {
  for (const name of names) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return "";
}

function resolveProvider(): {
  id: ProviderId;
  apiKey: string;
  model: string;
} {
  const forced = env("AI_MENU_PROVIDER").toLowerCase() as ProviderId | "";

  const githubKey = env("GITHUB_MODELS_TOKEN", "GITHUB_TOKEN");
  const geminiKey = env("GEMINI_API_KEY");
  const openaiKey = env("OPENAI_API_KEY", "OPENAI_KEY", "OPENAIKEY");

  if (forced === "github" || (!forced && githubKey)) {
    if (!githubKey) {
      throw new Error(
        "AI_MENU_PROVIDER=github but GITHUB_MODELS_TOKEN (or GITHUB_TOKEN) is missing.",
      );
    }
    return {
      id: "github",
      apiKey: githubKey,
      model: env("AI_MENU_MODEL", "GITHUB_MODELS_MODEL") || "openai/gpt-4o-mini",
    };
  }

  if (forced === "gemini" || (!forced && geminiKey)) {
    if (!geminiKey) {
      throw new Error(
        "AI_MENU_PROVIDER=gemini but GEMINI_API_KEY is missing.",
      );
    }
    return {
      id: "gemini",
      apiKey: geminiKey,
      model: env("AI_MENU_MODEL", "GEMINI_MENU_MODEL") || "gemini-2.0-flash",
    };
  }

  if (forced === "openai" || openaiKey) {
    if (!openaiKey) {
      throw new Error(
        "AI_MENU_PROVIDER=openai but OPENAI_API_KEY is missing.",
      );
    }
    return {
      id: "openai",
      apiKey: openaiKey,
      model: env("AI_MENU_MODEL", "OPENAI_MENU_MODEL") || "gpt-4o-mini",
    };
  }

  throw new Error(
    "No AI key found. Prefer free GitHub Models: create a PAT with models:read and set GITHUB_MODELS_TOKEN in .env.local (or use GEMINI_API_KEY). Restart the server after saving.",
  );
}

function extractJsonObject(text: string): string {
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
}) {
  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: 0.55,
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
      data.error?.message || data.message || `${opts.providerLabel} error (${res.status})`;
    if (res.status === 429 || data.error?.code === "insufficient_quota") {
      throw new Error(
        `${opts.providerLabel} quota/rate limit: ${apiMsg}`,
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
}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: [{ text: opts.user }] }],
      generationConfig: {
        temperature: 0.55,
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

export async function improveMenuWithAI(
  userId: string,
  userRequest?: string,
): Promise<ImprovedMenuResult> {
  const provider = resolveProvider();
  const context = await buildMenuImproveContext(userId);

  const planTotals = sumMacros(
    context.currentPlan.map((item) => ({
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      calories: item.calories,
    })),
  );

  const gaps = {
    proteinG: Math.round(context.targets.proteinG - planTotals.proteinG),
    carbsG: Math.round(context.targets.carbsG - planTotals.carbsG),
    fatG: Math.round(context.targets.fatG - planTotals.fatG),
    calories: Math.round(context.targets.calorieTarget - planTotals.calories),
  };

  const system = `You are a body-recomposition meal planner.
Primary goal: hit the user's daily macro TARGETS as closely as possible.
Secondary goal: keep the menu recognizable — same meal pattern and mostly familiar foods.

PRIORITY ORDER (strict):
1) Protein within ±10g of target (highest priority)
2) Calories within ±80 kcal of target
3) Fat within ±5g of target (do not overshoot fat)
4) Carbs fill remaining calories (within ±20g when possible)

RULES:
- Start from currentStandingPlan. Keep meal slots (breakfast/lunch/dinner/snack) when possible.
- Prefer portion changes and lean swaps over inventing a totally new diet.
- If fat is high: reduce oils/sauces/fatty cuts; replace with leaner protein + carbs.
- If protein is low: add/increase whey, chicken, turkey, fish, low-fat dairy, egg whites.
- If carbs are low and fat is fine: add rice, pasta, potato, fruit, oats — not more fat.
- Do NOT make tiny cosmetic edits. If gaps are large, change portions enough to close them.
- Keep 4–10 items. Use realistic macro numbers that sum near the targets.
- Rationale must mention the old vs new totals and the key swaps.

Return ONLY valid JSON (no markdown):
{"rationale":"2-4 sentences","items":[{"name":"string","mealSlot":"breakfast|lunch|dinner|snack","quantity":1,"proteinG":0,"carbsG":0,"fatG":0,"calories":0}],"projectedTotals":{"proteinG":0,"carbsG":0,"fatG":0,"calories":0}}`;

  const user = JSON.stringify({
    instruction:
      "Rewrite the standing daily menu so projectedTotals land on targets. Close the gaps below. Keep foods familiar.",
    ...(userRequest
      ? { userPriorityRequest: userRequest, note: "The userPriorityRequest is the MOST IMPORTANT instruction — follow it above all other rules." }
      : {}),
    mustHitTargets: context.targets,
    currentPlanTotals: planTotals,
    gapsToClose: gaps,
    meaningOfGaps:
      "Positive gap = need more of that macro. Negative gap = need less.",
    recentProblems: context.todayWarnings,
    currentStandingPlan: context.currentPlan,
    recentLoggedDays: context.recentDays,
    acceptance:
      "Reject tiny edits. Protein and calories must clearly move toward targets.",
  });

  let content: string;
  if (provider.id === "github") {
    content = await chatCompletionsOpenAICompatible({
      url: "https://models.github.ai/inference/chat/completions",
      apiKey: provider.apiKey,
      model: provider.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      extraHeaders: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      providerLabel: "GitHub Models",
      // Some GitHub-hosted models reject response_format
      useJsonObjectFormat: false,
    });
  } else if (provider.id === "gemini") {
    content = await chatCompletionsGemini({
      apiKey: provider.apiKey,
      model: provider.model,
      system,
      user,
    });
  } else {
    content = await chatCompletionsOpenAICompatible({
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: provider.apiKey,
      model: provider.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      providerLabel: "OpenAI",
      useJsonObjectFormat: true,
    });
  }

  let parsed: { rationale?: string; items?: unknown };
  try {
    parsed = JSON.parse(extractJsonObject(content)) as {
      rationale?: string;
      items?: unknown;
    };
  } catch {
    throw new Error("Could not parse AI menu JSON");
  }

  const items = parseAiItems(parsed.items);
  if (items.length === 0) {
    throw new Error("AI returned no menu items");
  }

  return {
    items,
    rationale: String(
      parsed.rationale || "Improved menu for your recomp targets.",
    ),
    model: `${provider.id}:${provider.model}`,
  };
}

/** @deprecated Use improveMenuWithAI */
export async function improveMenuWithOpenAI(userId: string) {
  return improveMenuWithAI(userId);
}
