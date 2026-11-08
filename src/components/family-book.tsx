import { X } from "lucide-react";
import { GIVEN_FACTS, INFERRED_FACTS, PEOPLE, type PersonId } from "@/lib/family";

export function FamilyBook({
  onClose,
  onAsk,
}: {
  onClose: () => void;
  onAsk: (person: PersonId) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-bg/70" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="family-book-title"
        className="flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-5">
          <div>
            <p className="text-sm tracking-wide text-gold">Family book</p>
            <h2 id="family-book-title" className="mt-1 font-display text-3xl text-balance">
              Devraj's house
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close family book"
            className="grid size-11 place-items-center rounded-full border border-line text-fg"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="flex-1 space-y-8 overflow-y-auto px-5 py-6">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <PersonCard id="ezaan" onAsk={onAsk} />
              <PersonCard id="krishnaa" onAsk={onAsk} />
            </div>
            <div className="mx-auto h-6 w-px bg-gold/60" aria-hidden="true" />
            <PersonCard id="devraj" onAsk={onAsk} wide />
            <div className="mx-auto h-6 w-px bg-gold/60" aria-hidden="true" />
            <div className="grid grid-cols-2 gap-3">
              <PersonCard id="shivang" onAsk={onAsk} />
              <PersonCard id="atmaj" onAsk={onAsk} />
            </div>
            <p className="text-sm text-muted">Shivang and Atmaj sit as uncles. The book does not say which parent they belong to.</p>
          </div>
          <section>
            <h3 className="text-sm tracking-wide text-gold">Given</h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed">
              {GIVEN_FACTS.map((fact) => (
                <li key={fact} className="border-l border-gold/50 pl-3">
                  {fact}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-sm tracking-wide text-gold">Inferred</h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
              {INFERRED_FACTS.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </section>
        </div>
      </aside>
    </div>
  );
}

function PersonCard({
  id,
  onAsk,
  wide = false,
}: {
  id: PersonId;
  onAsk: (person: PersonId) => void;
  wide?: boolean;
}) {
  const person = PEOPLE.find((item) => item.id === id);
  if (!person) return null;
  return (
    <button
      type="button"
      onClick={() => onAsk(id)}
      className={`rounded-lg border border-line bg-raised px-4 py-3 text-left ${wide ? "w-full" : ""}`}
    >
      <span className="block font-display text-xl">{person.name}</span>
      <span className="mt-1 block text-sm text-muted">{person.role}</span>
    </button>
  );
}
