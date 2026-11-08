/** Deterministic ink plate. Colors match the app tokens in styles.css. */

const INK = "#0c0e12";
const PAPER = "#ece8e1";
const GOLD = "#e3a34a";
const MUTED = "#9b9488";

function mulberry(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Arc = {
  cx: number;
  cy: number;
  r: number;
  a: number;
  sweep: number;
  dir: number;
  width: number;
};

function layout(seed: number): Arc[] {
  const rand = mulberry(seed);
  return Array.from({ length: 5 }, () => ({
    cx: 0.58 + rand() * 0.36,
    cy: 0.16 + rand() * 0.68,
    r: 0.08 + rand() * 0.22,
    a: rand() * Math.PI * 2,
    sweep: 0.7 + rand() * 1.5,
    dir: rand() > 0.5 ? 1 : -1,
    width: rand() > 0.65 ? 2 : 1.15,
  }));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    const last = lines[maxLines - 1] ?? "";
    lines[maxLines - 1] = last.replace(/[,\s]+$/, "") + "…";
  }
  return lines.length ? lines : ["Untitled plate"];
}

export function drawPlate(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  prompt: string,
  seed: number,
  t: number,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w * 0.32, h * 0.38, 20, w * 0.45, h * 0.45, w * 0.72);
  glow.addColorStop(0, "rgba(227,163,74,0.16)");
  glow.addColorStop(0.45, "rgba(227,163,74,0.04)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const rand = mulberry(seed ^ 0x9e3779b9);
  ctx.fillStyle = "rgba(236,232,225,0.035)";
  for (let i = 0; i < 80; i++) {
    const x = rand() * w;
    const y = rand() * h;
    ctx.fillRect(x, y, 1.2, 1.2);
  }

  for (const arc of layout(seed)) {
    ctx.beginPath();
    ctx.strokeStyle = GOLD;
    ctx.globalAlpha = 0.55 + (arc.width > 2 ? 0.3 : 0);
    ctx.lineWidth = arc.width;
    const spin = t * Math.PI * 2 * arc.dir * 0.18;
    const start = arc.a + spin;
    ctx.arc(arc.cx * w, arc.cy * h, arc.r * Math.min(w, h), start, start + arc.sweep);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const pad = Math.round(Math.min(w, h) * 0.055);
  ctx.strokeStyle = "rgba(227,163,74,0.45)";
  ctx.lineWidth = 1;
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

  ctx.fillStyle = "rgba(12,14,18,0.78)";
  ctx.fillRect(pad + 1, pad + 1, Math.round(w * 0.56), h - pad * 2 - 2);

  ctx.strokeStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(pad + 22, pad + 36);
  ctx.lineTo(pad + 22, h - pad - 72);
  ctx.stroke();

  const titleSize = Math.max(26, Math.round(w / 22));
  ctx.fillStyle = PAPER;
  ctx.font = `560 ${titleSize}px Fraunces, Georgia, serif`;
  ctx.textBaseline = "top";
  const lines = wrap(ctx, prompt || "Untitled plate", w * 0.46, 5);
  let y = pad + 48;
  for (const line of lines) {
    ctx.fillText(line, pad + 40, y);
    y += titleSize * 1.2;
  }

  ctx.fillStyle = MUTED;
  ctx.font = "400 12px Outfit, sans-serif";
  ctx.fillText("POOJA", pad + 40, h - pad - 48);
  ctx.fillStyle = GOLD;
  ctx.font = "500 13px Outfit, sans-serif";
  ctx.fillText("EZZ_PP   ·   INK PLATE", pad + 40, h - pad - 28);
}
