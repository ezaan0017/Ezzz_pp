import { createServerFn } from "@tanstack/react-start";
import { FAMILY_BRIEF, tryFamilyAnswer } from "./family";

const CHAT_MODEL = "grok-4.5";
const IMAGE_MODEL = "grok-imagine-image";
const VIDEO_MODEL = "grok-imagine-video-1.5-lite";

type ChatTurn = { role: "user" | "assistant"; content: string };
type StyleName = "brief" | "balanced" | "deep";
type Source = { title: string; url: string; extract: string };

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function apiKey(): string {
  return process.env.XAI_API_KEY ?? "";
}

async function failure(res: Response): Promise<{ error: string; code: "credits" | "error" }> {
  const text = await res.text();
  const credits = res.status === 402 || /spending-limit|out of credits|need a grok subscription/i.test(text);
  if (credits) {
    return {
      code: "credits",
      error: "Live Imagine credits are used up on this account.",
    };
  }
  let detail = "";
  try {
    const body = asRecord(JSON.parse(text));
    const err = body?.error;
    if (typeof err === "string") detail = err;
    else if (asRecord(err)?.message && typeof asRecord(err)?.message === "string") {
      detail = String(asRecord(err)?.message);
    }
  } catch {
    detail = "";
  }
  if (detail.length > 180 || /key|bearer|token/i.test(detail)) detail = "";
  return {
    code: "error",
    error: detail || `The model returned ${res.status}. Try again in a moment.`,
  };
}

const STYLE: Record<StyleName, { hint: string; tokens: number }> = {
  brief: { hint: "Answer in a short paragraph, or a tight list when the user asks for steps.", tokens: 420 },
  balanced: { hint: "Be clear and concrete. Use a little structure when it helps. Stay under 250 words.", tokens: 800 },
  deep: { hint: "Be thorough, specific, and well ordered. Stay under 450 words.", tokens: 1200 },
};

function systemPrompt(style: StyleName): string {
  return [
    "You are Pooja, the assistant of Ezz_pp.",
    "You sound calm, exact, and warm — never cutesy, never a corporate chatbot.",
    "Do not claim to be ChatGPT, Gemini, or Grok. If asked what you are, say you are Pooja inside Ezz_pp.",
    STYLE[style].hint,
    "Family book (ground truth — never contradict it, never invent extra relatives, ages, jobs, or which side an uncle belongs to):",
    FAMILY_BRIEF,
    "The book does not say whether Shivang or Atmaj is a brother of Ezaan or of Krishnaa.",
    "For every other topic, answer from general knowledge. If you are unsure, say so.",
  ].join("\n");
}

export const askPooja = createServerFn({ method: "POST" })
  .validator((input: { messages: ChatTurn[]; style?: StyleName }) => {
    if (!input || !Array.isArray(input.messages) || input.messages.length === 0) {
      throw new Error("Missing messages");
    }
    const messages = input.messages.slice(-12).map((turn) => ({
      role: turn.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: clip(String(turn.content ?? ""), 4000),
    }));
    const style: StyleName =
      input.style === "brief" || input.style === "deep" ? input.style : "balanced";
    return { messages, style };
  })
  .handler(async ({ data }) => {
    const latest = data.messages[data.messages.length - 1];
    if (latest?.role === "user") {
      const family = tryFamilyAnswer(latest.content);
      if (family) return { ok: true as const, text: family, kind: "family" as const };
    }

    const key = apiKey();
    if (!key) return { ok: false as const, error: "Pooja is not available in this environment.", code: "unavailable" as const };

    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          model: CHAT_MODEL,
          temperature: 0.5,
          max_tokens: STYLE[data.style].tokens,
          messages: [{ role: "system", content: systemPrompt(data.style) }, ...data.messages],
        }),
      });
      if (!res.ok) {
        const fail = await failure(res);
        return { ok: false as const, error: fail.error, code: fail.code };
      }
      const body = asRecord(await res.json());
      const choices = Array.isArray(body?.choices) ? body.choices : [];
      const first = asRecord(choices[0]);
      const message = asRecord(first?.message);
      const text = typeof message?.content === "string" ? message.content.trim() : "";
      if (!text) return { ok: false as const, error: "Pooja returned an empty reply.", code: "error" as const };
      return { ok: true as const, text, kind: "chat" as const };
    } catch {
      return { ok: false as const, error: "Pooja could not finish that reply. Try again.", code: "unavailable" as const };
    }
  });

type WikiHit = Source;

async function wikiSearch(query: string): Promise<WikiHit[]> {
  const search = new URL("https://en.wikipedia.org/w/api.php");
  search.searchParams.set("action", "query");
  search.searchParams.set("list", "search");
  search.searchParams.set("srsearch", query);
  search.searchParams.set("srlimit", "3");
  search.searchParams.set("format", "json");
  search.searchParams.set("utf8", "1");
  const found = await fetch(search, {
    headers: {
      Accept: "application/json",
      "User-Agent": "EzzPP/1.0 (Pooja assistant; educational)",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!found.ok) return [];
  const payload = asRecord(await found.json());
  const queryBody = asRecord(payload?.query);
  const rows = Array.isArray(queryBody?.search) ? queryBody.search : [];
  const titles = rows
    .map((row) => asRecord(row)?.title)
    .filter((title): title is string => typeof title === "string")
    .slice(0, 3);
  if (!titles.length) return [];

  const detail = new URL("https://en.wikipedia.org/w/api.php");
  detail.searchParams.set("action", "query");
  detail.searchParams.set("prop", "extracts|info");
  detail.searchParams.set("inprop", "url");
  detail.searchParams.set("exintro", "1");
  detail.searchParams.set("explaintext", "1");
  detail.searchParams.set("redirects", "1");
  detail.searchParams.set("format", "json");
  detail.searchParams.set("utf8", "1");
  detail.searchParams.set("titles", titles.join("|"));
  const pagesRes = await fetch(detail, {
    headers: {
      Accept: "application/json",
      "User-Agent": "EzzPP/1.0 (Pooja assistant; educational)",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!pagesRes.ok) return [];
  const pagesBody = asRecord(await pagesRes.json());
  const pages = asRecord(asRecord(pagesBody?.query)?.pages);
  if (!pages) return [];
  const hits: WikiHit[] = [];
  for (const page of Object.values(pages)) {
    const row = asRecord(page);
    if (!row || row.missing) continue;
    const title = typeof row.title === "string" ? row.title : "";
    const extract = typeof row.extract === "string" ? clip(row.extract, 900) : "";
    const url = typeof row.fullurl === "string" ? row.fullurl : "";
    if (title && extract && url) hits.push({ title, url, extract });
  }
  return hits;
}

export const askWikipedia = createServerFn({ method: "POST" })
  .validator((input: { question: string; style?: StyleName }) => {
    const question = clip(String(input?.question ?? ""), 400);
    if (!question) throw new Error("Missing question");
    const style: StyleName =
      input.style === "brief" || input.style === "deep" ? input.style : "balanced";
    return { question, style };
  })
  .handler(async ({ data }) => {
    const family = tryFamilyAnswer(data.question);
    if (family) {
      return {
        ok: true as const,
        text: family,
        sources: [] as Source[],
        kind: "family" as const,
      };
    }

    let sources: Source[] = [];
    try {
      sources = await wikiSearch(data.question);
    } catch {
      sources = [];
    }
    if (!sources.length) {
      return {
        ok: false as const,
        error: "Wikipedia had no page for that. Try a simpler name or topic.",
        code: "error" as const,
      };
    }

    const packet = sources
      .map((source, index) => `(${index + 1}) ${source.title}\n${source.extract}`)
      .join("\n\n");

    const key = apiKey();
    if (!key) {
      return {
        ok: true as const,
        text: sources.map((source) => `${source.title}: ${source.extract}`).join("\n\n"),
        sources,
        kind: "wiki" as const,
      };
    }

    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          model: CHAT_MODEL,
          temperature: 0.2,
          max_tokens: STYLE[data.style].tokens,
          messages: [
            {
              role: "system",
              content:
                "You are Pooja. Answer using only the Wikipedia excerpts. Cite page titles in the prose. If the excerpts do not contain the answer, say so and summarize what they do say. Do not invent facts.",
            },
            {
              role: "user",
              content: `Question: ${data.question}\n\nExcerpts:\n${packet}`,
            },
          ],
        }),
      });
      if (!res.ok) {
        return {
          ok: true as const,
          text: sources.map((source) => `${source.title}: ${source.extract}`).join("\n\n"),
          sources,
          kind: "wiki" as const,
        };
      }
      const body = asRecord(await res.json());
      const choices = Array.isArray(body?.choices) ? body.choices : [];
      const message = asRecord(asRecord(choices[0])?.message);
      const text = typeof message?.content === "string" ? message.content.trim() : "";
      return {
        ok: true as const,
        text: text || sources.map((source) => source.extract).join("\n\n"),
        sources,
        kind: "wiki" as const,
      };
    } catch {
      return {
        ok: true as const,
        text: sources.map((source) => `${source.title}: ${source.extract}`).join("\n\n"),
        sources,
        kind: "wiki" as const,
      };
    }
  });

function imageUrl(body: unknown): string | null {
  const record = asRecord(body);
  if (!record) return null;
  if (typeof record.url === "string") return record.url;
  const data = Array.isArray(record.data) ? asRecord(record.data[0]) : null;
  if (typeof data?.url === "string") return data.url;
  if (typeof data?.b64_json === "string") return `data:image/png;base64,${data.b64_json}`;
  return null;
}

export const imagineImage = createServerFn({ method: "POST" })
  .validator((input: { prompt: string }) => {
    const prompt = clip(String(input?.prompt ?? ""), 1000);
    if (!prompt) throw new Error("Missing prompt");
    return { prompt };
  })
  .handler(async ({ data }) => {
    const key = apiKey();
    if (!key) {
      return { ok: false as const, error: "Imagine is not available.", code: "unavailable" as const };
    }
    try {
      const res = await fetch("https://api.x.ai/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          model: IMAGE_MODEL,
          prompt: data.prompt,
          n: 1,
          response_format: "url",
        }),
      });
      if (!res.ok) {
        const fail = await failure(res);
        return { ok: false as const, error: fail.error, code: fail.code };
      }
      const url = imageUrl(await res.json());
      if (!url) return { ok: false as const, error: "Imagine did not return an image.", code: "error" as const };
      return { ok: true as const, url };
    } catch {
      return { ok: false as const, error: "Imagine did not respond.", code: "unavailable" as const };
    }
  });

export const startVideo = createServerFn({ method: "POST" })
  .validator((input: { prompt: string }) => {
    const prompt = clip(String(input?.prompt ?? ""), 500);
    if (!prompt) throw new Error("Missing prompt");
    return { prompt };
  })
  .handler(async ({ data }) => {
    const key = apiKey();
    if (!key) {
      return { ok: false as const, error: "Video is not available.", code: "unavailable" as const };
    }
    try {
      const res = await fetch("https://api.x.ai/v1/videos/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          model: VIDEO_MODEL,
          prompt: data.prompt,
          duration: 6,
        }),
      });
      if (!res.ok) {
        const fail = await failure(res);
        return { ok: false as const, error: fail.error, code: fail.code };
      }
      const body = asRecord(await res.json());
      const requestId =
        (typeof body?.request_id === "string" && body.request_id) ||
        (typeof body?.id === "string" && body.id) ||
        "";
      if (!requestId) {
        return { ok: false as const, error: "Video did not start.", code: "error" as const };
      }
      return { ok: true as const, requestId };
    } catch {
      return { ok: false as const, error: "Video did not start.", code: "unavailable" as const };
    }
  });

export const pollVideo = createServerFn({ method: "POST" })
  .validator((input: { requestId: string }) => {
    const requestId = String(input?.requestId ?? "").trim();
    if (!requestId || requestId.length > 200) throw new Error("Missing video");
    return { requestId };
  })
  .handler(async ({ data }) => {
    const key = apiKey();
    if (!key) return { ok: false as const, error: "Video is not available.", code: "unavailable" as const };
    try {
      const res = await fetch(`https://api.x.ai/v1/videos/${encodeURIComponent(data.requestId)}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        const fail = await failure(res);
        return { ok: false as const, error: fail.error, code: fail.code };
      }
      const body = asRecord(await res.json());
      const status = typeof body?.status === "string" ? body.status : "pending";
      const video = asRecord(body?.video);
      const url = typeof video?.url === "string" ? video.url : "";
      if (status === "failed" || status === "expired") {
        return { ok: false as const, error: "That clip could not be finished.", code: "error" as const };
      }
      return { ok: true as const, status, url };
    } catch {
      return { ok: false as const, error: "Could not check the clip.", code: "unavailable" as const };
    }
  });

export const speakPooja = createServerFn({ method: "POST" })
  .validator((input: { text: string }) => {
    const text = clip(String(input?.text ?? ""), 500);
    if (!text) throw new Error("Nothing to speak");
    return { text };
  })
  .handler(async ({ data }) => {
    const key = apiKey();
    if (!key) return { ok: false as const, error: "Voice is not available.", code: "unavailable" as const };
    try {
      const res = await fetch("https://api.x.ai/v1/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          text: data.text,
          voice_id: "ara",
          language: "en",
        }),
      });
      if (!res.ok) {
        const fail = await failure(res);
        return { ok: false as const, error: fail.error, code: fail.code };
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const { Buffer } = await import("node:buffer");
      const audio = `data:audio/mpeg;base64,${Buffer.from(bytes).toString("base64")}`;
      return { ok: true as const, audio };
    } catch {
      return { ok: false as const, error: "Pooja could not speak just then.", code: "unavailable" as const };
    }
  });
