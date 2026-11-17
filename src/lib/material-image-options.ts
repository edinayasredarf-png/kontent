import { LOGO_POSITIONS, STYLES, type LogoPos } from "./images";

export function materialImageOptions(form: FormData) {
  const aspect = form.get("aspect");
  const logo = String(form.get("logoPos") ?? "");
  const style = String(form.get("style") ?? "");
  return {
    aspect: aspect === "square" || aspect === "portrait" || aspect === "landscape" ? aspect : undefined,
    logoPos: logo === "none" || LOGO_POSITIONS.some(pos => pos === logo) ? logo as LogoPos : undefined,
    style: Object.hasOwn(STYLES, style) ? style : undefined,
    model: String(form.get("model") ?? "").slice(0, 160),
  } as const;
}
