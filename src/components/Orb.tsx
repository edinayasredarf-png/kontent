/**
 * Анимированный «стеклянный» шар ассистента: несколько полупрозрачных пятен, которые дышат и перетекают друг в друга,
 * градиентное ядро с тёмной волной и мягкое свечение. Только CSS (см. .ai-orb в globals.css): без скриптов и картинок.
 */
export function Orb({ size = 132, className = "" }: { size?: number; className?: string }) {
  return (
    <div className={`ai-orb ${className}`} style={{ width: size, height: size }} aria-hidden>
      <span className="ai-orb-halo" />
      <span className="ai-orb-blob ai-orb-b1" />
      <span className="ai-orb-blob ai-orb-b2" />
      <span className="ai-orb-blob ai-orb-b3" />
      <span className="ai-orb-core"><span className="ai-orb-wave" /><span className="ai-orb-shine" /></span>
    </div>
  );
}
