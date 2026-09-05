import { aiChatJson, parseJsonObjectLoose } from "@/lib/ai-client";
import { caloriesFromMacros } from "@/lib/macros";

export type MacroGuess = {
  name: string;
  servingLabel: string;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  calories: number;
  rationale: string;
  model: string;
};

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : fallback;
}

/** Keep prompts small enough that one guess won't spike TPM on low free-tier models. */
const MAX_GUESS_CHARS = 6_000;

export async function guessMacrosFromText(
  description: string,
): Promise<MacroGuess> {
  let text = description.trim();
  if (text.length < 2) throw new Error("Describe the food or recipe first");
  if (text.length > MAX_GUESS_CHARS) {
    text = `${text.slice(0, MAX_GUESS_CHARS)}\n…[truncated for estimate]`;
  }

  const system = `You estimate nutrition macros for body-recomposition logging.
The user describes a food, drink, recipe, or substitution in free text (any language).
Infer a realistic single log entry for what they likely ate/drank.

Rules:
- Prefer common Israeli / Mediterranean portions when ambiguous (e.g. "big cup of coffee").
- If they paste a full recipe (many ingredients / cook steps), estimate ONE typical cooked serving of the finished dish (e.g. 1 piece / ~150–200g chicken with coating+glaze), NOT the entire batch (not 1kg).
- If they mention swaps ("I changed X with Y", size W), apply those to the estimate.
- Macros must be internally consistent (calories ≈ P×4 + C×4 + F×9, ±15 kcal OK).
- fiberG is dietary fiber in grams (0 when none / unknown).
- servingLabel should describe the assumed amount (e.g. "1 piece (~180g cooked)", "1 plate").
- name should be short and log-friendly (Hebrew OK).
- rationale: one short sentence; do not use quotation marks inside it.
- If the text was truncated, estimate from the ingredients/amounts you can see.
- All macro fields must be JSON numbers, not strings.

Return ONLY valid JSON (no markdown, no extra text):
{"name":"string","servingLabel":"string","proteinG":0,"carbsG":0,"fatG":0,"fiberG":0,"calories":0,"rationale":"string"}`;

  const { content, model } = await aiChatJson({
    system,
    user: text,
    temperature: 0.2,
    maxTokens: 500,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonObjectLoose(content);
  } catch {
    console.error(
      "[macros/guess] bad JSON from model:",
      content.slice(0, 400),
    );
    throw new Error("Could not parse AI macro guess");
  }

  const name = String(parsed.name || "").trim();
  if (!name) throw new Error("AI returned no food name");

  const proteinG = num(parsed.proteinG);
  const carbsG = num(parsed.carbsG);
  const fatG = num(parsed.fatG);
  const fiberG = num(parsed.fiberG);
  let calories = Math.round(num(parsed.calories, 0));
  if (!calories) calories = caloriesFromMacros(proteinG, carbsG, fatG);

  return {
    name,
    servingLabel: String(parsed.servingLabel || "1 serving").trim() || "1 serving",
    proteinG,
    carbsG,
    fatG,
    fiberG,
    calories,
    rationale: String(parsed.rationale || "").trim(),
    model,
  };
}
