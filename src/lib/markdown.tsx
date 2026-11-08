import type { ReactNode } from "react";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded-sm bg-raised px-1 py-0.5 text-sm text-gold">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const linked = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (linked) {
        nodes.push(
          <a key={key} href={linked[2]} target="_blank" rel="noreferrer" className="text-gold underline decoration-gold/40 underline-offset-2">
            {linked[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = start + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function RichText({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/```/);
  return (
    <div className="space-y-3 text-pretty leading-relaxed">
      {blocks.map((block, blockIndex) => {
        if (blockIndex % 2 === 1) {
          const newline = block.indexOf("\n");
          const code = newline === -1 ? block : block.slice(newline + 1);
          return (
            <pre key={blockIndex} className="overflow-x-auto rounded-md bg-bg px-3 py-3 text-sm text-fg">
              <code>{code.replace(/\n$/, "")}</code>
            </pre>
          );
        }
        const lines = block.split("\n");
        const out: ReactNode[] = [];
        let list: string[] = [];
        const flush = (key: string) => {
          if (!list.length) return;
          out.push(
            <ul key={key} className="list-disc space-y-1 pl-5">
              {list.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item, `${key}-${itemIndex}`)}</li>
              ))}
            </ul>,
          );
          list = [];
        };
        lines.forEach((line, lineIndex) => {
          const bullet = line.match(/^\s*[-*]\s+(.*)$/);
          if (bullet) {
            list.push(bullet[1] ?? "");
            return;
          }
          flush(`b-${blockIndex}-${lineIndex}`);
          if (!line.trim()) return;
          const heading = line.match(/^(#{1,3})\s+(.*)$/);
          if (heading) {
            out.push(
              <p key={`h-${lineIndex}`} className="font-display text-xl text-fg">
                {renderInline(heading[2] ?? "", `h-${blockIndex}-${lineIndex}`)}
              </p>,
            );
            return;
          }
          out.push(
            <p key={`p-${lineIndex}`}>{renderInline(line, `p-${blockIndex}-${lineIndex}`)}</p>,
          );
        });
        flush(`b-${blockIndex}-end`);
        return <div key={blockIndex} className="space-y-3">{out}</div>;
      })}
    </div>
  );
}
