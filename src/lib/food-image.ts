import { aiChatWithImage } from "@/lib/ai-client";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 4 * 1024 * 1024;

export function validateFoodImageInput(imageBase64: string, mimeType: string) {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error("Image must be JPEG, PNG, or WebP");
  }
  const raw = imageBase64.trim();
  if (!raw) throw new Error("Image data is required");
  const bytes = Math.ceil((raw.length * 3) / 4);
  if (bytes > MAX_BYTES) {
    throw new Error("Image too large (max 4 MB after resize)");
  }
}

export async function describeFoodFromImage(
  imageBase64: string,
  mimeType: string,
  hint?: string,
): Promise<{ description: string; model: string }> {
  validateFoodImageInput(imageBase64, mimeType);

  const system = `You describe food photos for nutrition logging.
Return one concise paragraph listing identifiable items, estimated portions/sizes, visible cooking method, sauces/dressings, and drinks.
Use specific amounts when possible (e.g. "~200g chicken", "1 medium bowl").
State assumptions when unclear. No markdown, no bullet lists.`;

  let user = "Describe this food for logging.";
  const trimmedHint = hint?.trim();
  if (trimmedHint) user += `\n\nUser note: ${trimmedHint}`;

  const { content, model } = await aiChatWithImage({
    system,
    user,
    imageBase64,
    mimeType,
    temperature: 0.2,
  });

  const description = content.trim();
  if (description.length < 4) {
    throw new Error("Could not describe food from photo");
  }

  return { description, model };
}
