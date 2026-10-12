/** База знаний бренда: профиль (что мы за компания) и стиль письма. Всё приходит от нейросети или из формы — каждое поле проверяется и ограничивается. */
export interface Profile {
  about: string; mission: string;
  products: { name: string; desc: string }[];
  audience: { segment: string; needs: string }[];
  usp: string[]; advantages: string[];
  competitors: { name: string; weakness: string; edge: string }[];
  proof: string[];
  objections: { q: string; a: string }[];
  faq: { q: string; a: string }[];
  terms: { term: string; meaning: string }[];
  avoid: string[];
}
export interface StyleGuide {
  voice: string; person: string; sentence: string; formatting: string;
  structure: string[]; openings: string[]; closings: string[]; like: string[]; dislike: string[]; rules: string[]; samples: string[];
}

const s = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const arr = (v: unknown, max: number) => (Array.isArray(v) ? v : []).slice(0, max);
const strs = (v: unknown, max: number, n = 300) => [...new Set(arr(v, max * 2).map((x) => s(x, n)).filter(Boolean))].slice(0, max);
const pairs = <A extends string, B extends string>(v: unknown, a: A, b: B, max: number, na = 120, nb = 400) =>
  arr(v, max * 2).map((x) => ({ [a]: s((x as Record<string, unknown>)?.[a], na), [b]: s((x as Record<string, unknown>)?.[b], nb) }) as Record<A | B, string>).filter((x) => x[a]).slice(0, max);

export function cleanProfile(raw: unknown): Profile {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const comp = arr(o.competitors, 20).map((x) => { const c = x as Record<string, unknown>; return { name: s(c?.name, 80), weakness: s(c?.weakness, 300), edge: s(c?.edge ?? c?.ourEdge, 300) }; }).filter((c) => c.name).slice(0, 10);
  return {
    about: s(o.about, 1500), mission: s(o.mission, 500),
    products: pairs(o.products, "name", "desc", 20), audience: pairs(o.audience, "segment", "needs", 10),
    usp: strs(o.usp, 10), advantages: strs(o.advantages, 15), competitors: comp, proof: strs(o.proof, 25, 400),
    objections: pairs(o.objections, "q", "a", 12, 200, 500), faq: pairs(o.faq, "q", "a", 20, 200, 500), terms: pairs(o.terms, "term", "meaning", 25, 80, 200), avoid: strs(o.avoid, 15),
  };
}
export function cleanStyle(raw: unknown): StyleGuide {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    voice: s(o.voice, 1200), person: s(o.person, 300), sentence: s(o.sentence, 400), formatting: s(o.formatting, 500),
    structure: strs(o.structure, 10), openings: strs(o.openings, 8, 200), closings: strs(o.closings, 8, 200), like: strs(o.like, 20, 60), dislike: strs(o.dislike, 20, 60), rules: strs(o.rules, 15), samples: strs(o.samples, 4, 500),
  };
}
export const emptyProfile = (): Profile => cleanProfile({});
export const emptyStyle = (): StyleGuide => cleanStyle({});
export const profileIsEmpty = (p: Profile) => !p.about && !p.products.length && !p.usp.length && !p.advantages.length && !p.proof.length;
export const styleIsEmpty = (s2: StyleGuide) => !s2.voice && !s2.rules.length && !s2.structure.length;
