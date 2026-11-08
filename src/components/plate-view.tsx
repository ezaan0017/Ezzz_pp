import { useEffect, useRef } from "react";
import { drawPlate } from "@/lib/plate";

export function PlateView({
  prompt,
  seed,
  live = false,
}: {
  prompt: string;
  seed: number;
  live?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0;
    if (!live) {
      drawPlate(ctx, canvas.width, canvas.height, prompt, seed, 0.35);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      drawPlate(ctx, canvas.width, canvas.height, prompt, seed, 0.35);
      return;
    }
    const start = performance.now();
    const loop = (now: number) => {
      const t = ((now - start) % 8000) / 8000;
      drawPlate(ctx, canvas.width, canvas.height, prompt, seed, t);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [live, prompt, seed]);

  return (
    <canvas
      ref={ref}
      width={960}
      height={600}
      className="h-auto w-full rounded-lg border border-line"
      aria-label={prompt}
    />
  );
}

export async function recordMotion(prompt: string, seed: number): Promise<string | null> {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
    return null;
  }
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "";
  if (!mime) return null;

  const stream = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
  });
  recorder.start();
  const seconds = 6;
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / (seconds * 1000));
      drawPlate(ctx, canvas.width, canvas.height, prompt, seed, t);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  const blob = await done;
  return URL.createObjectURL(blob);
}

export function downloadPlate(prompt: string, seed: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 750;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawPlate(ctx, canvas.width, canvas.height, prompt, seed, 0.35);
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/jpeg", 0.92);
  link.download = "ezz-pp-plate.jpg";
  link.click();
}
