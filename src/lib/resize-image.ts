const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.85;

/** Resize image client-side; returns JPEG base64 (no data: prefix) + mime. */
export async function resizeImageForUpload(file: File): Promise<{
  base64: string;
  mimeType: "image/jpeg";
  previewUrl: string;
}> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode image"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });

  const base64 = await blobToBase64(blob);
  return {
    base64,
    mimeType: "image/jpeg",
    previewUrl: URL.createObjectURL(blob),
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read image"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}
