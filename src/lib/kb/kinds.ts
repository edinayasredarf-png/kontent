export const KB_KINDS = {
  article: "Наши статьи и посты (стиль)",
  company: "О компании, продукты, услуги",
  competitors: "Конкуренты и сравнение",
  cases: "Кейсы, отзывы, результаты",
  faq: "Вопросы клиентов и возражения",
  other: "Другое",
} as const;
export type KbKind = keyof typeof KB_KINDS;
