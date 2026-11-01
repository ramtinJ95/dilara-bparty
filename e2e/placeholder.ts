import type { Page } from "@playwright/test";

export type Look = { sky: [string, string]; ink: string; shape: "snowflake" | "star" | "heart" | "crown"; seed: number };

export const LOOKS = {
  snow: { sky: ["#bfe0fb", "#ffffff"], ink: "#4f9be0", shape: "snowflake", seed: 7 },
  dusk: { sky: ["#c9b8f0", "#fbeefe"], ink: "#8a5cc7", shape: "star", seed: 11 },
  mint: { sky: ["#b6ead9", "#f2fffb"], ink: "#2f9c7a", shape: "heart", seed: 23 },
  rose: { sky: ["#f8c6d6", "#fff4f7"], ink: "#d0577f", shape: "crown", seed: 31 },
  sun: { sky: ["#fde3a7", "#fffaf0"], ink: "#d08a1e", shape: "star", seed: 43 },
  sea: { sky: ["#8fc7ef", "#e2f2fd"], ink: "#1d4f84", shape: "heart", seed: 59 },
} satisfies Record<string, Look>;

/** A generated PNG, never a real photo: a gradient sky, snow and one big shape, so different looks are easy to tell apart. */
export async function placeholder(page: Page, look: Look, size: [number, number] = [1200, 1200]): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ look, size: [w, h] }) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, look.sky[0]);
      sky.addColorStop(1, look.sky[1]);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(w * 0.25, h * 0.98, w * 0.6, h * 0.22, 0, 0, Math.PI * 2);
      ctx.ellipse(w * 0.85, h * 1.02, w * 0.5, h * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      let seed = look.seed;
      const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 160; i++) {
        ctx.globalAlpha = 0.5 + rand() / 2;
        ctx.beginPath();
        ctx.arc(rand() * w, rand() * h, 3 + rand() * 9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const r = Math.min(w, h) * 0.26;
      ctx.translate(w / 2, h / 2 - h * 0.05);
      ctx.fillStyle = ctx.strokeStyle = look.ink;
      ctx.lineWidth = r / 13;
      ctx.lineCap = ctx.lineJoin = "round";
      ctx.beginPath();
      if (look.shape === "snowflake") {
        for (let arm = 0; arm < 6; arm++) {
          ctx.rotate(Math.PI / 3);
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -r);
          for (const at of [0.4, 0.7]) {
            ctx.moveTo(0, -r * at);
            ctx.lineTo(-r * 0.24, -r * (at + 0.24));
            ctx.moveTo(0, -r * at);
            ctx.lineTo(r * 0.24, -r * (at + 0.24));
          }
        }
        ctx.stroke();
      } else if (look.shape === "star") {
        for (let i = 0; i < 10; i++) {
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          const d = i % 2 ? r * 0.45 : r;
          ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
        }
        ctx.closePath();
        ctx.fill();
      } else if (look.shape === "heart") {
        ctx.moveTo(0, r * 0.8);
        ctx.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.6, -r * 1.1, 0, -r * 0.4);
        ctx.bezierCurveTo(r * 0.6, -r * 1.1, r * 1.4, -r * 0.1, 0, r * 0.8);
        ctx.fill();
      } else {
        ctx.moveTo(-r, r * 0.5);
        ctx.lineTo(-r, -r * 0.5);
        ctx.lineTo(-r * 0.5, 0);
        ctx.lineTo(0, -r * 0.8);
        ctx.lineTo(r * 0.5, 0);
        ctx.lineTo(r, -r * 0.5);
        ctx.lineTo(r, r * 0.5);
        ctx.closePath();
        ctx.fill();
      }
      return canvas.toDataURL("image/png");
    },
    { look, size },
  );
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

/** Random pixels compress badly, so the phone's JPEG lands near its 400 KB budget and takes a while to send on a slow line. */
export async function noise(page: Page, edge = 900): Promise<Buffer> {
  const dataUrl = await page.evaluate((edge) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = edge;
    const ctx = canvas.getContext("2d")!;
    const pixels = ctx.createImageData(edge, edge);
    for (let i = 0; i < pixels.data.length; i++) pixels.data[i] = i % 4 === 3 ? 255 : Math.random() * 256;
    ctx.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png");
  }, edge);
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

export const pngFile = (name: string, buffer: Buffer) => ({ name: `${name}.png`, mimeType: "image/png", buffer });
