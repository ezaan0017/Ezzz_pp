import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUp,
  BookOpen,
  Clapperboard,
  Copy,
  Download,
  Image as ImageIcon,
  Library,
  Menu,
  MessageCircle,
  Pin,
  Plus,
  Trash2,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { FamilyBook } from "@/components/family-book";
import { downloadPlate, PlateView, recordMotion } from "@/components/plate-view";
import { tryFamilyAnswer, type PersonId } from "@/lib/family";
import { RichText } from "@/lib/markdown";
import { hashSeed } from "@/lib/plate";
import { askPooja, askWikipedia, imagineImage, pollVideo, speakPooja, startVideo } from "@/lib/pooja";

type Mode = "chat" | "image" | "video" | "wiki" | "family";
type StyleName = "brief" | "balanced" | "deep";
type Source = { title: string; url: string; extract: string };
type Media =
  | { kind: "image"; url: string }
  | { kind: "video"; url: string }
  | { kind: "plate"; seed: number; prompt: string }
  | { kind: "motion"; seed: number; prompt: string; sessionUrl?: string };

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode: Mode;
  sources?: Source[];
  media?: Media;
  caption?: string;
  failed?: boolean;
};

type Thread = { id: string; title: string; messages: Message[] };
type Kept = { id: string; text: string };

const STORE = "ezz-pp.threads.v1";
const KEPT = "ezz-pp.kept.v1";

const MODES: { id: Mode; label: string; icon: typeof MessageCircle; hint: string }[] = [
  { id: "chat", label: "Chat", icon: MessageCircle, hint: "Ask anything. Pooja answers in her own voice." },
  { id: "image", label: "Image", icon: ImageIcon, hint: "Describe a picture. Imagine paints it, or an ink plate if credits are paused." },
  { id: "video", label: "Video", icon: Clapperboard, hint: "Describe a short clip. If live video is paused, Pooja makes a motion plate." },
  { id: "wiki", label: "Wikipedia", icon: Library, hint: "Questions are answered from Wikipedia, with the pages she used." },
  { id: "family", label: "Family", icon: Users, hint: "Ask about Ezaan, Krishnaa, Devraj, Shivang, or Atmaj." },
];

const PROMPTS: Record<Mode, string[]> = {
  chat: [
    "Who is Ezaan?",
    "Explain black holes in plain language",
    "Plan a quiet evening in Jaipur",
    "Write a short poem about rain on a tin roof",
  ],
  image: [
    "A brass lamp in a dark study, one pool of gold light",
    "Monsoon street at night, film still, saffron and ink",
    "A single marigold on black paper",
  ],
  video: [
    "Slow drift across a brass lamp in a dark room",
    "Rain moving over an empty courtyard at dusk",
    "Pages of an old book turning in warm light",
  ],
  wiki: ["What is the Taj Mahal?", "Who was Ramanujan?", "History of the Silk Road"],
  family: [
    "Who is Ezaan?",
    "Who are Devraj's parents?",
    "How is Shivang related to Devraj?",
    "Who is the nephew of Atmaj?",
  ],
};

function creativeIntent(text: string): "image" | "video" | null {
  const n = text.toLowerCase();
  const verb = /\b(make|create|generate|render|produce|draw|paint)\b/.test(n);
  if (verb && /\b(video|film|clip|animate|animation)\b/.test(n)) return "video";
  if (verb && /\b(image|picture|photo|portrait|illustration|sketch)\b/.test(n)) return "image";
  if (/^(draw|paint|sketch)\b/.test(n.trim())) return "image";
  return null;
}

function nid(): string {
  return crypto.randomUUID();
}

function blankThread(): Thread {
  return { id: "draft", title: "New chat", messages: [] };
}

function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
}

function sanitizeThreads(value: unknown): Thread[] | null {
  if (!Array.isArray(value)) return null;
  const threads: Thread[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<Thread>;
    if (typeof row.id !== "string" || !Array.isArray(row.messages)) continue;
    const messages: Message[] = [];
    for (const message of row.messages) {
      if (!message || typeof message !== "object") continue;
      const entry = message as Partial<Message>;
      if (typeof entry.content !== "string" || (entry.role !== "user" && entry.role !== "assistant")) continue;
      const media = entry.media;
      let safeMedia: Media | undefined;
      if (media && typeof media === "object" && "kind" in media) {
        if ((media.kind === "image" || media.kind === "video") && typeof media.url === "string") {
          safeMedia = { kind: media.kind, url: media.url };
        } else if ((media.kind === "plate" || media.kind === "motion") && typeof media.seed === "number") {
          safeMedia = {
            kind: media.kind,
            seed: media.seed,
            prompt: typeof media.prompt === "string" ? media.prompt : entry.content,
          };
        }
      }
      messages.push({
        id: typeof entry.id === "string" ? entry.id : nid(),
        role: entry.role,
        content: entry.content,
        mode: entry.mode ?? "chat",
        sources: Array.isArray(entry.sources) ? entry.sources : undefined,
        media: safeMedia,
        caption: typeof entry.caption === "string" ? entry.caption : undefined,
        failed: entry.failed === true,
      });
    }
    threads.push({
      id: row.id,
      title: typeof row.title === "string" && row.title ? row.title.slice(0, 80) : "Chat",
      messages: messages.slice(-80),
    });
  }
  return threads.slice(0, 40);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function EzzApp() {
  const [threads, setThreads] = useState<Thread[]>([blankThread()]);
  const [activeId, setActiveId] = useState("draft");
  const [kept, setKept] = useState<Kept[]>([]);
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("chat");
  const [style, setStyle] = useState<StyleName>("balanced");
  const [busy, setBusy] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState(false);
  const [book, setBook] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const ticket = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const active = threads.find((thread) => thread.id === activeId) ?? threads[0] ?? blankThread();
  const modeMeta = MODES.find((item) => item.id === mode) ?? MODES[0]!;

  useEffect(() => {
    try {
      const stored = sanitizeThreads(JSON.parse(localStorage.getItem(STORE) || "null"));
      if (stored?.length) {
        setThreads(stored);
        setActiveId(stored[0]!.id);
      }
      const pins = JSON.parse(localStorage.getItem(KEPT) || "null") as unknown;
      if (Array.isArray(pins)) {
        setKept(
          pins
            .filter((pin): pin is Kept => !!pin && typeof pin.id === "string" && typeof pin.text === "string")
            .slice(0, 24),
        );
      }
    } catch {
      /* keep the fresh thread */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORE, JSON.stringify(threads));
      localStorage.setItem(KEPT, JSON.stringify(kept));
    } catch {
      /* storage full — the session still works */
    }
  }, [threads, kept, ready]);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [active.messages, busy]);

  const suggestions = useMemo(() => PROMPTS[mode], [mode]);

  function writeThread(threadId: string, recipe: (thread: Thread) => Thread) {
    setThreads((current) => current.map((thread) => (thread.id === threadId ? recipe(thread) : thread)));
  }

  function pushMessage(threadId: string, message: Message) {
    writeThread(threadId, (thread) => ({ ...thread, messages: [...thread.messages, message] }));
  }

  async function submit(raw?: string, forced?: Mode) {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    const useMode = forced ?? mode;
    setInput("");
    setSidebar(false);
    const mine = ticket.current + 1;
    ticket.current = mine;

    const threadId = active.id === "draft" ? nid() : active.id;
    const userMessage: Message = { id: nid(), role: "user", content: text, mode: useMode };
    setThreads((current) => {
      const exists = current.some((thread) => thread.id === threadId);
      const nextThread: Thread = {
        id: threadId,
        title: active.messages.length === 0 ? titleFrom(text) : active.title,
        messages: [...active.messages, userMessage],
      };
      if (!exists) return [nextThread, ...current.filter((thread) => thread.id !== "draft")].slice(0, 40);
      return current.map((thread) => (thread.id === active.id ? nextThread : thread));
    });
    setActiveId(threadId);

    const history = [...active.messages, userMessage]
      .filter((message) => message.content && !message.failed)
      .slice(-12)
      .map((message) => ({ role: message.role, content: message.content }));

    const family = tryFamilyAnswer(text);
    const intent = useMode === "chat" ? creativeIntent(text) : null;
    const asImage = !family && (useMode === "image" || intent === "image");
    const asVideo = !family && (useMode === "video" || intent === "video");

    const alive = () => ticket.current === mine;

    if (useMode === "family" || (family && !asImage && !asVideo)) {
      const answer =
        family ??
        "The family book knows Ezaan, Krishnaa, Devraj, Shivang, and Atmaj. Ask who someone is, or how two of them are related.";
      if (!alive()) return;
      pushMessage(threadId, {
        id: nid(),
        role: "assistant",
        content: answer,
        mode: "family",
        caption: "Family book",
      });
      return;
    }

    if (asImage) {
      setBusy("Asking Imagine");
      const result = await imagineImage({ data: { prompt: text } });
      if (!alive()) return;
      if (result.ok) {
        pushMessage(threadId, {
          id: nid(),
          role: "assistant",
          content: text,
          mode: "image",
          caption: "Imagine",
          media: { kind: "image", url: result.url },
        });
      } else if (result.code === "credits" || result.code === "unavailable") {
        pushMessage(threadId, {
          id: nid(),
          role: "assistant",
          content: text,
          mode: "image",
          caption: "Ink plate — live Imagine credits are paused",
          media: { kind: "plate", seed: hashSeed(text), prompt: text },
        });
      } else {
        pushMessage(threadId, {
          id: nid(),
          role: "assistant",
          content: result.error,
          mode: "image",
          failed: true,
        });
      }
      setBusy(null);
      return;
    }

    if (asVideo) {
      setBusy("Starting a clip");
      const started = await startVideo({ data: { prompt: text } });
      if (!alive()) return;
      if (started.ok) {
        for (let attempt = 0; attempt < 24; attempt++) {
          await sleep(3000);
          if (!alive()) return;
          setBusy("Rendering the clip");
          const polled = await pollVideo({ data: { requestId: started.requestId } });
          if (!alive()) return;
          if (!polled.ok) break;
          if (polled.url) {
            pushMessage(threadId, {
              id: nid(),
              role: "assistant",
              content: text,
              mode: "video",
              caption: "Imagine video",
              media: { kind: "video", url: polled.url },
            });
            setBusy(null);
            return;
          }
        }
      }
      setBusy("Composing a motion plate");
      const sessionUrl = await recordMotion(text, hashSeed(text));
      if (!alive()) return;
      const reason = started.ok
        ? "The live clip did not finish, so this is a studio motion plate."
        : started.code === "credits" || started.code === "unavailable"
          ? "Live video credits are paused, so this is a studio motion plate."
          : started.error;
      pushMessage(threadId, {
        id: nid(),
        role: "assistant",
        content: text,
        mode: "video",
        caption: reason,
        media: { kind: "motion", seed: hashSeed(text), prompt: text, sessionUrl: sessionUrl ?? undefined },
      });
      setBusy(null);
      return;
    }

    if (useMode === "wiki") {
      setBusy("Reading Wikipedia");
      const result = await askWikipedia({ data: { question: text, style } });
      if (!alive()) return;
      if (result.ok) {
        pushMessage(threadId, {
          id: nid(),
          role: "assistant",
          content: result.text,
          mode: result.kind === "family" ? "family" : "wiki",
          caption: result.kind === "family" ? "Family book" : "Wikipedia",
          sources: result.sources,
        });
      } else {
        pushMessage(threadId, {
          id: nid(),
          role: "assistant",
          content: result.error,
          mode: "wiki",
          failed: true,
        });
      }
      setBusy(null);
      return;
    }

    setBusy("Pooja is thinking");
    const result = await askPooja({ data: { messages: history, style } });
    if (!alive()) return;
    pushMessage(threadId, {
      id: nid(),
      role: "assistant",
      content: result.ok ? result.text : result.error,
      mode: "chat",
      caption: result.ok && result.kind === "family" ? "Family book" : undefined,
      failed: !result.ok,
    });
    setBusy(null);
  }

  function removeThread(id: string) {
    setThreads((current) => {
      const next = current.filter((thread) => thread.id !== id);
      if (!next.length) {
        setActiveId("draft");
        return [blankThread()];
      }
      if (id === activeId) setActiveId(next[0]!.id);
      return next;
    });
  }

  function startNew() {
    if (active.messages.length === 0) {
      setSidebar(false);
      return;
    }
    const thread = { id: nid(), title: "New chat", messages: [] };
    setThreads((current) => [thread, ...current].slice(0, 40));
    setActiveId(thread.id);
    setSidebar(false);
  }

  async function copyText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1200);
    } catch {
      setCopied(null);
    }
  }

  async function speak(id: string, text: string) {
    if (speaking) return;
    setSpeaking(id);
    const result = await speakPooja({ data: { text } });
    if (!result.ok) {
      setSpeaking(null);
      pushMessage(active.id, {
        id: nid(),
        role: "assistant",
        content: result.error,
        mode: "chat",
        failed: true,
      });
      return;
    }
    const audio = new Audio(result.audio);
    audioRef.current?.pause();
    audioRef.current = audio;
    audio.onended = () => setSpeaking((current) => (current === id ? null : current));
    try {
      await audio.play();
    } catch {
      setSpeaking(null);
    }
  }

  function keep(text: string) {
    setKept((current) => [{ id: nid(), text }, ...current.filter((item) => item.text !== text)].slice(0, 24));
  }

  function exportThread() {
    const lines = active.messages.map((message) => `${message.role === "user" ? "You" : "Pooja"}: ${message.content}`);
    const blob = new Blob([lines.join("\n\n")], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${active.title.replace(/[^\w]+/g, "-").slice(0, 40) || "ezz-pp"}.txt`;
    link.click();
  }

  function askPerson(person: PersonId) {
    setBook(false);
    setMode("family");
    const name = person[0]!.toUpperCase() + person.slice(1);
    void submit(`Who is ${name}?`, "family");
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-fg">
      {sidebar ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-20 bg-bg/70 md:hidden"
          onClick={() => setSidebar(false)}
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-line bg-surface transition-transform duration-200 md:static md:translate-x-0 ${
          sidebar ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-4 py-5">
          <span className="grid size-11 place-items-center rounded-full border border-gold/50 font-display text-lg text-gold">
            P
          </span>
          <div>
            <p className="font-display text-2xl leading-none">Ezz_pp</p>
            <p className="mt-1 text-sm text-muted">Private assistant</p>
          </div>
        </div>
        <div className="px-3">
          <button
            type="button"
            onClick={startNew}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gold text-sm font-medium text-ink"
          >
            <Plus className="size-4" />
            New chat
          </button>
        </div>
        <div className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          <p className="px-2 pb-1 text-sm text-muted">Chats</p>
          {threads.map((thread) => (
            <div key={thread.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setActiveId(thread.id);
                  setSidebar(false);
                }}
                className={`min-w-0 flex-1 truncate rounded-md px-2 py-2 text-left text-sm ${
                  thread.id === active.id ? "bg-raised text-fg" : "text-muted"
                }`}
              >
                {thread.title}
              </button>
              <button
                type="button"
                aria-label={`Delete ${thread.title}`}
                onClick={() => removeThread(thread.id)}
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          {kept.length ? (
            <div className="pt-4">
              <p className="px-2 pb-1 text-sm text-muted">Kept</p>
              {kept.map((pin) => (
                <button
                  key={pin.id}
                  type="button"
                  onClick={() => {
                    setInput(pin.text);
                    setSidebar(false);
                  }}
                  className="block w-full truncate rounded-md px-2 py-2 text-left text-sm text-muted"
                >
                  {pin.text}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line px-3 py-3 md:px-5">
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full border border-line md:hidden"
            aria-label="Open menu"
            onClick={() => setSidebar(true)}
          >
            <Menu className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl leading-none">{active.title}</p>
            <p className="mt-1 truncate text-sm text-muted">{modeMeta.hint}</p>
          </div>
          <div className="hidden items-center gap-1 sm:flex">
            {(["brief", "balanced", "deep"] as StyleName[]).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setStyle(name)}
                aria-pressed={style === name}
                className={`h-9 rounded-full px-3 text-sm capitalize ${
                  style === name ? "bg-raised text-fg" : "text-muted"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setBook(true)}
            className="grid size-11 place-items-center rounded-full border border-line text-gold"
            aria-label="Open family book"
          >
            <BookOpen className="size-4" />
          </button>
          <button
            type="button"
            onClick={exportThread}
            className="grid size-11 place-items-center rounded-full border border-line"
            aria-label="Export chat"
          >
            <Download className="size-4" />
          </button>
        </header>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
          {active.messages.length === 0 ? (
            <div className="mx-auto flex max-w-2xl flex-col items-start gap-8 pt-8 md:pt-16">
              <div>
                <p className="text-sm tracking-wide text-gold">Ezz_pp</p>
                <h1 className="mt-2 font-display text-5xl text-balance italic md:text-6xl">Pooja</h1>
                <p className="mt-4 max-w-lg text-lg text-pretty text-muted">
                  A private assistant. She answers like a person, reads Wikipedia, keeps your family book, and composes images and short films.
                </p>
              </div>
              <div className="grid w-full gap-3 sm:grid-cols-2">
                {MODES.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMode(item.id)}
                      className={`rounded-lg border px-4 py-4 text-left ${
                        mode === item.id ? "border-gold bg-raised" : "border-line bg-surface"
                      }`}
                    >
                      <Icon className="size-4 text-gold" />
                      <span className="mt-3 block font-medium">{item.label}</span>
                      <span className="mt-1 block text-sm text-muted">{item.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <ol className="mx-auto flex max-w-2xl flex-col gap-6">
              {active.messages.map((message) => (
                <li key={message.id} className={message.role === "user" ? "flex justify-end" : ""}>
                  {message.role === "user" ? (
                    <p className="max-w-[85%] rounded-2xl bg-gold px-4 py-3 text-ink">{message.content}</p>
                  ) : (
                    <article className="w-full">
                      <div className="mb-2 flex items-center gap-2 text-sm text-gold">
                        <span className="grid size-6 place-items-center rounded-full border border-gold/40 font-display">P</span>
                        Pooja
                        {message.caption ? <span className="text-muted">· {message.caption}</span> : null}
                      </div>
                      {message.failed ? (
                        <p className="text-danger">{message.content}</p>
                      ) : message.media?.kind === "image" ? (
                        <img
                          src={message.media.url}
                          alt={message.content}
                          className="w-full rounded-lg border border-line"
                        />
                      ) : message.media?.kind === "video" || (message.media?.kind === "motion" && message.media.sessionUrl) ? (
                        <video
                          controls
                          playsInline
                          preload="auto"
                          src={message.media.kind === "video" ? message.media.url : message.media.sessionUrl}
                          className="w-full rounded-lg border border-line"
                        />
                      ) : message.media?.kind === "plate" || message.media?.kind === "motion" ? (
                        <PlateView
                          prompt={message.media.prompt}
                          seed={message.media.seed}
                          live={message.media.kind === "motion"}
                        />
                      ) : (
                        <RichText text={message.content} />
                      )}
                      {message.sources?.length ? (
                        <ul className="mt-3 space-y-2">
                          {message.sources.map((source) => (
                            <li key={source.url} className="rounded-md border border-line px-3 py-2">
                              <a href={source.url} target="_blank" rel="noreferrer" className="text-sm text-gold">
                                {source.title}
                              </a>
                              <p className="mt-1 line-clamp-3 text-sm text-muted">{source.extract}</p>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-1">
                        <IconButton label={copied === message.id ? "Copied" : "Copy"} onClick={() => copyText(message.id, message.content)}>
                          <Copy className="size-4" />
                        </IconButton>
                        <IconButton
                          label={speaking === message.id ? "Speaking" : "Speak"}
                          onClick={() => speak(message.id, message.content)}
                        >
                          <Volume2 className="size-4" />
                        </IconButton>
                        <IconButton label="Keep" onClick={() => keep(message.content)}>
                          <Pin className="size-4" />
                        </IconButton>
                        {message.media?.kind === "plate" || message.media?.kind === "motion" ? (
                          <IconButton
                            label="Save plate"
                            onClick={() => downloadPlate(message.media && "prompt" in message.media ? message.media.prompt : message.content, message.media && "seed" in message.media ? message.media.seed : 1)}
                          >
                            <Download className="size-4" />
                          </IconButton>
                        ) : null}
                      </div>
                    </article>
                  )}
                </li>
              ))}
              {busy ? <li className="text-sm text-gold">{busy}…</li> : null}
            </ol>
          )}
        </div>

        <div className="border-t border-line px-3 py-3 md:px-6">
          <div className="mx-auto max-w-2xl">
            {active.messages.length === 0 ? (
              <div className="mb-3 flex gap-2 overflow-x-auto">
                {suggestions.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void submit(prompt)}
                    className="shrink-0 rounded-full border border-line px-3 py-2 text-left text-sm text-muted"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mb-2 flex gap-1 overflow-x-auto sm:hidden">
              {(["brief", "balanced", "deep"] as StyleName[]).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setStyle(name)}
                  aria-pressed={style === name}
                  className={`h-8 rounded-full px-3 text-sm capitalize ${style === name ? "bg-raised text-fg" : "text-muted"}`}
                >
                  {name}
                </button>
              ))}
            </div>
            <form
              className="rounded-2xl border border-line bg-surface p-2"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <label className="sr-only" htmlFor="composer">
                Message Pooja
              </label>
              <textarea
                id="composer"
                value={input}
                rows={2}
                placeholder={mode === "family" ? "Who is Ezaan?" : `Message Pooja · ${modeMeta.label}`}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                className="max-h-40 w-full resize-none bg-transparent px-3 py-2 text-fg outline-none placeholder:text-muted"
              />
              <div className="flex items-center gap-2 px-1 pb-1">
                <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
                  {MODES.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={mode === item.id}
                        onClick={() => setMode(item.id)}
                        className={`flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm ${
                          mode === item.id ? "bg-gold text-ink" : "text-muted"
                        }`}
                      >
                        <Icon className="size-3.5" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="submit"
                  disabled={!input.trim() || !!busy}
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-gold text-ink disabled:opacity-40"
                  aria-label="Send"
                >
                  <ArrowUp className="size-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
      {book ? <FamilyBook onClose={() => setBook(false)} onAsk={askPerson} /> : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-9 items-center gap-1 rounded-full px-2 text-sm text-muted"
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
