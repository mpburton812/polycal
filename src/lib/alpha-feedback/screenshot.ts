/**
 * Compresses a canvas capture to a JPEG data URL under the size budget (PC-120).
 */
export async function canvasToJpegBase64(
  canvas: HTMLCanvasElement,
  maxBytes = 1_400_000,
): Promise<{ base64: string; mimeType: "image/jpeg" } | null> {
  let quality = 0.72;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
    const bytes = Math.ceil((base64.length * 3) / 4);
    if (bytes <= maxBytes) {
      return { base64, mimeType: "image/jpeg" };
    }
    quality -= 0.1;
  }
  return null;
}

/**
 * Captures the current viewport as a compressed JPEG (best-effort).
 */
export async function captureViewportScreenshot(): Promise<{
  base64: string;
  mimeType: "image/jpeg";
} | null> {
  try {
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      allowTaint: true,
      logging: false,
      scale: Math.min(window.devicePixelRatio || 1, 1.5),
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
    });
    return canvasToJpegBase64(canvas);
  } catch {
    return null;
  }
}
