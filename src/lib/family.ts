export type PersonId = "ezaan" | "krishnaa" | "devraj" | "shivang" | "atmaj";

export type Person = {
  id: PersonId;
  name: string;
  role: string;
};

export const PEOPLE: Person[] = [
  { id: "ezaan", name: "Ezaan", role: "Father of Devraj" },
  { id: "krishnaa", name: "Krishnaa", role: "Mother of Devraj" },
  { id: "devraj", name: "Devraj", role: "Son of Ezaan and Krishnaa" },
  { id: "shivang", name: "Shivang", role: "Uncle of Devraj" },
  { id: "atmaj", name: "Atmaj", role: "Uncle of Devraj" },
];

/** Facts the owner stated, plus the relations Pooja is allowed to infer. */
export const GIVEN_FACTS = [
  "Devraj is a son of Ezaan and Krishnaa.",
  "Shivang is an uncle of Devraj.",
  "Atmaj is an uncle of Devraj.",
];

export const INFERRED_FACTS = [
  "Ezaan is a father of Devraj.",
  "Krishnaa is a mother of Devraj.",
  "Devraj is a nephew of Shivang.",
  "Devraj is a nephew of Atmaj.",
];

export const FAMILY_BRIEF = [...GIVEN_FACTS, ...INFERRED_FACTS].join(" ");

const ALIAS: Record<string, PersonId> = {
  ezaan: "ezaan",
  ezzan: "ezaan",
  ezan: "ezaan",
  ezaaan: "ezaan",
  krishnaa: "krishnaa",
  krishna: "krishnaa",
  krishnaah: "krishnaa",
  devraj: "devraj",
  devraaj: "devraj",
  shivang: "shivang",
  shivangh: "shivang",
  atmaj: "atmaj",
  aatmaj: "atmaj",
};

const CUE =
  /\b(who|whos|whose|whom|father|fathers|dad|papa|mother|mothers|mom|mama|mummy|son|sons|child|children|kid|kids|uncle|uncles|nephew|nephews|parent|parents|family|families|related|relation|relationship|relative|relatives|wife|husband|spouse|brother|sister|aunt|daughter|grandfather|grandmother|grandma|grandpa|cousin)\b/;

const CREATIVE =
  /\b(draw|paint|sketch|illustrat\w*|portrait|picture|photo|image|render|video|film|clip|animate|animation)\b/;

export function personName(id: PersonId): string {
  return PEOPLE.find((p) => p.id === id)?.name ?? id;
}

export function normalizeQuestion(input: string): string {
  return input
    .toLowerCase()
    .replace(/[’']s\b/g, " ")
    .replace(/[’']/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mentionedPeople(input: string): PersonId[] {
  const text = normalizeQuestion(input);
  const aliases = Object.keys(ALIAS).sort((a, b) => b.length - a.length);
  const found: { id: PersonId; index: number }[] = [];
  let masked = text;
  for (const alias of aliases) {
    const re = new RegExp(`\\b${alias}\\b`, "g");
    masked = masked.replace(re, (match, offset: number) => {
      found.push({ id: ALIAS[alias]!, index: offset });
      return " ".repeat(match.length);
    });
  }
  found.sort((a, b) => a.index - b.index);
  const ids: PersonId[] = [];
  for (const hit of found) {
    if (!ids.includes(hit.id)) ids.push(hit.id);
  }
  return ids;
}

function identity(id: PersonId): string {
  switch (id) {
    case "ezaan":
      return "Ezaan is a father of Devraj.";
    case "krishnaa":
      return "Krishnaa is a mother of Devraj.";
    case "devraj":
      return "Devraj is a son of Ezaan and Krishnaa.";
    case "shivang":
      return "Shivang is an uncle of Devraj.";
    case "atmaj":
      return "Atmaj is an uncle of Devraj.";
  }
}

function relate(a: PersonId, b: PersonId): string {
  if (a === b) return `${personName(a)} is the same person.`;
  const key = `${a}:${b}`;
  const known: Record<string, string> = {
    "ezaan:devraj": "Ezaan is a father of Devraj.",
    "devraj:ezaan": "Devraj is a son of Ezaan.",
    "krishnaa:devraj": "Krishnaa is a mother of Devraj.",
    "devraj:krishnaa": "Devraj is a son of Krishnaa.",
    "ezaan:krishnaa":
      "Ezaan and Krishnaa are the parents of Devraj. Ezaan is the father and Krishnaa is the mother.",
    "krishnaa:ezaan":
      "Krishnaa and Ezaan are the parents of Devraj. Krishnaa is the mother and Ezaan is the father.",
    "shivang:devraj": "Shivang is an uncle of Devraj.",
    "atmaj:devraj": "Atmaj is an uncle of Devraj.",
    "devraj:shivang": "Devraj is a nephew of Shivang.",
    "devraj:atmaj": "Devraj is a nephew of Atmaj.",
    "shivang:atmaj":
      "Shivang and Atmaj are both uncles of Devraj. The book does not say whether they are brothers.",
    "atmaj:shivang":
      "Atmaj and Shivang are both uncles of Devraj. The book does not say whether they are brothers.",
    "ezaan:shivang":
      "Shivang is an uncle of Devraj, and Ezaan is Devraj's father. The book does not say if Shivang is Ezaan's brother.",
    "shivang:ezaan":
      "Shivang is an uncle of Ezaan's son, Devraj. The book does not say if Shivang is Ezaan's brother.",
    "ezaan:atmaj":
      "Atmaj is an uncle of Devraj, and Ezaan is Devraj's father. The book does not say if Atmaj is Ezaan's brother.",
    "atmaj:ezaan":
      "Atmaj is an uncle of Ezaan's son, Devraj. The book does not say if Atmaj is Ezaan's brother.",
    "krishnaa:shivang":
      "Shivang is an uncle of Devraj, and Krishnaa is Devraj's mother. The book does not say if Shivang is Krishnaa's brother.",
    "shivang:krishnaa":
      "Shivang is an uncle of Krishnaa's son, Devraj. The book does not say if Shivang is Krishnaa's brother.",
    "krishnaa:atmaj":
      "Atmaj is an uncle of Devraj, and Krishnaa is Devraj's mother. The book does not say if Atmaj is Krishnaa's brother.",
    "atmaj:krishnaa":
      "Atmaj is an uncle of Krishnaa's son, Devraj. The book does not say if Atmaj is Krishnaa's brother.",
  };
  return known[key] ?? `${personName(a)} and ${personName(b)} are both in Devraj's family book.`;
}

function book(): string {
  return [
    "Ezaan is a father of Devraj.",
    "Krishnaa is a mother of Devraj.",
    "Devraj is a son of Ezaan and Krishnaa.",
    "Shivang and Atmaj are uncles of Devraj.",
    "Devraj is a nephew of Shivang and of Atmaj.",
  ].join(" ");
}

function yesNo(text: string, people: PersonId[]): string | null {
  const role = text.match(
    /\b(?:is|was)\s+\w+\s+(?:the\s+)?(father|dad|papa|mother|mom|mama|son|child|uncle|nephew|parent)\b/,
  );
  if (!role || people.length < 2) {
    const self = text.match(
      /\b(?:is|was)\s+(\w+)\s+(?:the\s+)?(father|dad|papa|mother|mom|mama|son|uncle|nephew)\b/,
    );
    if (!self) return null;
    const who = ALIAS[self[1] ?? ""];
    const rel = self[2];
    if (!who || !rel) return null;
    return judge(who, "devraj", rel);
  }
  const relWord = role[1];
  if (!relWord) return null;
  return judge(people[0]!, people[1]!, relWord);
}

function judge(who: PersonId, of: PersonId, rel: string): string {
  const father = rel === "father" || rel === "dad" || rel === "papa";
  const mother = rel === "mother" || rel === "mom" || rel === "mama";
  const son = rel === "son" || rel === "child";
  const uncle = rel === "uncle";
  const nephew = rel === "nephew";
  const parent = rel === "parent";

  const truth =
    (father && who === "ezaan" && of === "devraj") ||
    (mother && who === "krishnaa" && of === "devraj") ||
    (parent && (who === "ezaan" || who === "krishnaa") && of === "devraj") ||
    (son && who === "devraj" && (of === "ezaan" || of === "krishnaa")) ||
    (uncle && (who === "shivang" || who === "atmaj") && of === "devraj") ||
    (nephew && who === "devraj" && (of === "shivang" || of === "atmaj"));

  if (truth) return `Yes. ${relate(who, of)}`;
  return `No. ${identity(who)} ${of === who ? "" : relate(who, of)}`.replace(/\s+/g, " ").trim();
}

function roleAnswer(text: string, people: PersonId[]): string | null {
  const father = /\b(father|dad|papa)\b/.test(text);
  const mother = /\b(mother|mom|mama|mummy)\b/.test(text);
  const parents = /\bparents\b/.test(text);
  const son = /\b(son|sons|child|children|kid|kids)\b/.test(text);
  const uncle = /\b(uncle|uncles)\b/.test(text);
  const nephew = /\b(nephew|nephews)\b/.test(text);
  const unknown = /\b(wife|husband|spouse|brother|sister|aunt|daughter|grandfather|grandmother|grandma|grandpa|cousin)\b/.test(text);

  const subject = people[0];

  if (parents) {
    if (!subject || subject === "devraj") {
      return "Ezaan and Krishnaa are the parents of Devraj. Ezaan is the father and Krishnaa is the mother.";
    }
    return `The book does not list parents for ${personName(subject)}. ${identity(subject)}`;
  }

  if (father && !mother) {
    if (!subject || subject === "devraj") return "Ezaan is a father of Devraj.";
    return `The book does not name a father of ${personName(subject)}. ${identity(subject)}`;
  }

  if (mother && !father) {
    if (!subject || subject === "devraj") return "Krishnaa is a mother of Devraj.";
    return `The book does not name a mother of ${personName(subject)}. ${identity(subject)}`;
  }

  if (son) {
    const parent = people.find((id) => id === "ezaan" || id === "krishnaa");
    if (parent === "krishnaa") return "Devraj is a son of Krishnaa. Ezaan is his father.";
    if (parent === "ezaan") return "Devraj is a son of Ezaan and Krishnaa.";
    if (subject && subject !== "devraj") {
      return `The book does not list a son of ${personName(subject)}. Devraj is a son of Ezaan and Krishnaa.`;
    }
    return "Devraj is a son of Ezaan and Krishnaa.";
  }

  if (uncle) {
    if (!subject || subject === "devraj") return "Shivang and Atmaj are uncles of Devraj.";
    return `The book only names uncles of Devraj: Shivang and Atmaj. ${identity(subject)}`;
  }

  if (nephew) {
    if (subject === "shivang" || subject === "atmaj") {
      return `Devraj is a nephew of ${personName(subject)}.`;
    }
    if (!subject || subject === "devraj") return "Devraj is a nephew of Shivang and of Atmaj.";
    return `The book does not name a nephew of ${personName(subject)}. Devraj is a nephew of Shivang and Atmaj.`;
  }

  if (unknown && subject) {
    return `The family book does not say that. ${identity(subject)}`;
  }

  return null;
}

/**
 * Answer from the family book. Returns null when the message is not about
 * these people, so general questions can go to the model or Wikipedia.
 */
export function tryFamilyAnswer(input: string): string | null {
  const text = normalizeQuestion(input);
  if (!text) return null;
  if (CREATIVE.test(text) && !/\b(who|whos|whose|father|mother|uncle|nephew|parent|family)\b/.test(text)) {
    return null;
  }

  const people = mentionedPeople(text);
  const nameOnly =
    people.length > 0 &&
    text.split(" ").every((word) => word in ALIAS || word === "and" || word === "or");
  const familyWord = /\b(family|families|family tree|relatives)\b/.test(text);

  if (!CUE.test(text) && !nameOnly && !familyWord) return null;

  if (familyWord && people.length === 0) return book();

  if (people.length === 0) {
    return "The family book only knows Ezaan, Krishnaa, Devraj, Shivang, and Atmaj.";
  }

  if (/\b(relation|relationship|related)\b/.test(text) && people.length >= 2) {
    return relate(people[0]!, people[1]!);
  }

  const judged = yesNo(text, people);
  if (judged && /\b(is|was)\b/.test(text)) return judged;

  const roled = roleAnswer(text, people);
  if (roled) return roled;

  if (people.length >= 2 && /\b(and|between|with)\b/.test(text)) {
    return relate(people[0]!, people[1]!);
  }

  if (people.length === 1) return identity(people[0]!);

  return people.map((id) => identity(id)).join(" ");
}
