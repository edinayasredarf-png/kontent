import type { Profile, StyleGuide } from "./types";
import { cleanProfile, cleanStyle } from "./types";

const lines = (t: string) => t.split("\n").map((x) => x.trim()).filter(Boolean);
const SEP = " | ";
const pair = (l: string): [string, string] => { const i = l.indexOf("|"); return i < 0 ? [l.trim(), ""] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; };
export const toLines = (a: string[]) => a.join("\n");
export const pairsToLines = (a: [string, string][]) => a.map(([x, y]) => (y ? x + SEP + y : x)).join("\n");

export function profileToForm(p: Profile) {
  return {
    about: p.about, mission: p.mission, usp: toLines(p.usp), advantages: toLines(p.advantages), proof: toLines(p.proof), avoid: toLines(p.avoid),
    products: pairsToLines(p.products.map((x) => [x.name, x.desc])), audience: pairsToLines(p.audience.map((x) => [x.segment, x.needs])),
    competitors: p.competitors.map((c) => [c.name, c.weakness, c.edge].join(SEP)).join("\n"),
    objections: pairsToLines(p.objections.map((x) => [x.q, x.a])), faq: pairsToLines(p.faq.map((x) => [x.q, x.a])), terms: pairsToLines(p.terms.map((x) => [x.term, x.meaning])),
  };
}
export function profileFromForm(g: (k: string) => string): Profile {
  const pr = (k: string) => lines(g(k)).map(pair);
  return cleanProfile({
    about: g("about"), mission: g("mission"), usp: lines(g("usp")), advantages: lines(g("advantages")), proof: lines(g("proof")), avoid: lines(g("avoid")),
    products: pr("products").map(([name, desc]) => ({ name, desc })), audience: pr("audience").map(([segment, needs]) => ({ segment, needs })),
    competitors: lines(g("competitors")).map((l) => { const [name, weakness, edge] = l.split("|").map((x) => x.trim()); return { name, weakness: edge === undefined ? "" : weakness, edge: edge ?? weakness ?? "" }; }),
    objections: pr("objections").map(([q, a]) => ({ q, a })), faq: pr("faq").map(([q, a]) => ({ q, a })), terms: pr("terms").map(([term, meaning]) => ({ term, meaning })),
  });
}
export function styleToForm(s: StyleGuide) {
  return { voice: s.voice, person: s.person, sentence: s.sentence, formatting: s.formatting, structure: toLines(s.structure), openings: toLines(s.openings), closings: toLines(s.closings), like: s.like.join(", "), dislike: s.dislike.join(", "), rules: toLines(s.rules), samples: s.samples.join("\n\n") };
}
export function styleFromForm(g: (k: string) => string): StyleGuide {
  const csv = (k: string) => g(k).split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  return cleanStyle({
    voice: g("voice"), person: g("person"), sentence: g("sentence"), formatting: g("formatting"), structure: lines(g("structure")), openings: lines(g("openings")), closings: lines(g("closings")),
    like: csv("like"), dislike: csv("dislike"), rules: lines(g("rules")), samples: g("samples").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean),
  });
}
