/** Анимированные значки для строк прайса: показывают, что именно создаётся (текст печатается, слайды листаются, картинка проявляется и так далее). */
export type PriceKind = "post" | "carousel" | "image" | "seo" | "idea" | "edit";

export function PriceIcon({ kind }: { kind: PriceKind }) {
  return (
    <span className="pa-tile" aria-hidden>
      {kind === "post" && (<>
        <i className="pa-line" style={{ top: 12, ["--w" as string]: "28px", animationDelay: "0s" }} />
        <i className="pa-line" style={{ top: 21, ["--w" as string]: "22px", animationDelay: ".25s", background: "#a5b4fc" }} />
        <i className="pa-line" style={{ top: 30, ["--w" as string]: "16px", animationDelay: ".5s", background: "#bef264" }} />
      </>)}
      {kind === "carousel" && (<>
        <i className="pa-sl" style={{ background: "#a5b4fc", ["--dx" as string]: "-9px", ["--rot" as string]: "-8deg" }} />
        <i className="pa-sl" style={{ background: "#bef264", animationDelay: ".15s" }} />
        <i className="pa-sl" style={{ background: "#0070F0", ["--dx" as string]: "9px", ["--rot" as string]: "8deg", animationDelay: ".3s" }} />
      </>)}
      {kind === "image" && (<>
        <span className="absolute inset-2.5 overflow-hidden rounded-lg" style={{ background: "linear-gradient(135deg,#0070F0,#a5b4fc 55%,#bef264)" }}>
          <i className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-white/90" />
          <i className="absolute -bottom-2 left-1 size-6 rotate-45 rounded-md bg-white/50" />
          <i className="pa-shimmer" />
        </span>
      </>)}
      {kind === "seo" && (
        <svg width="34" height="34" viewBox="0 0 36 36" fill="none">
          <circle cx="18" cy="18" r="14" stroke="#dfe3f7" strokeWidth="4" />
          <circle className="pa-ring" cx="18" cy="18" r="14" stroke="#1f9d57" strokeWidth="4" strokeLinecap="round" pathLength="100" strokeDasharray="100" transform="rotate(-90 18 18)" />
          <path d="m12.5 18.5 4 4 7-8" stroke="#1f9d57" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {kind === "idea" && (
        <svg width="34" height="34" viewBox="0 0 36 36" fill="none">
          <circle className="pa-glow" cx="18" cy="15" r="11" fill="#fde68a" />
          <path d="M13.5 15a4.5 4.5 0 1 1 7.6 3.2c-.8.8-1.1 1.4-1.1 2.3h-4c0-.9-.3-1.5-1.1-2.3A4.5 4.5 0 0 1 13.5 15Z" fill="#fff" stroke="#0070F0" strokeWidth="1.8" />
          <path d="M15.5 24h5M16.5 27h3" stroke="#0070F0" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
      {kind === "edit" && (
        <svg width="34" height="34" viewBox="0 0 36 36" fill="none">
          <path d="M9 27h18" stroke="#bef264" strokeWidth="3" strokeLinecap="round" />
          <g className="pa-pencil"><path d="m11 24 1.2-4.6L23.6 8a2.3 2.3 0 0 1 3.3 3.3L15.6 22.8 11 24Z" fill="#fff" stroke="#0070F0" strokeWidth="1.8" strokeLinejoin="round" /></g>
        </svg>
      )}
    </span>
  );
}
