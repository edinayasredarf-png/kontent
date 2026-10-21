/** Аватарка пользователя: фото (если есть) или круг с первой буквой имени. Размер задаёт вызывающий классом (size-8, size-10…). */
export function Avatar({ id, v, name, email, className = "size-8", text = "text-sm" }: { id: string; v: number | null | undefined; name: string; email: string; className?: string; text?: string }) {
  const ini = (name.trim()[0] ?? email[0] ?? "?").toUpperCase();
  if (v) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/avatar/${id}?v=${v}`} alt="" className={`${className} shrink-0 rounded-full object-cover`} />;
  }
  return <span className={`grid ${className} shrink-0 place-items-center rounded-full bg-accent ${text} font-semibold text-white`}>{ini}</span>;
}
