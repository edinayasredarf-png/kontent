/** Готовые шаблоны ниш: профиль бренда и настройки завода одним выбором. Всё можно изменить после применения. */
export interface Niche {
  name: string;
  brand: { description: string; audience: string; tone: "professional" | "friendly" | "humor" | "serious" | "inspiring"; forbidden: string };
  factory: { name: string; niche: string; product: string; formats: string[] };
  settings: { postTypes: string[]; length: "short" | "long"; emoji: "none" | "moderate" | "many"; hashtags: "none" | "few" | "many"; cta: string; slides: number };
}

export const NICHES: Record<string, Niche> = {
  coffee: {
    name: "Кофейня и кафе",
    brand: { description: "Кофейня у дома: свежеобжаренный кофе, авторские напитки, десерты и уютное место для встреч и работы.", audience: "Жители района 20–45 лет, фрилансеры, студенты, те, кто ценит вкусный кофе по дороге на работу.", tone: "friendly", forbidden: "скидки без условий, сравнения с конкурентами" },
    factory: { name: "Блог кофейни", niche: "Кофейня, общественное питание", product: "Кофе, авторские напитки, выпечка и десерты, атмосфера места", formats: ["post", "carousel"] },
    settings: { postTypes: ["friendly", "sales", "info"], length: "short", emoji: "many", hashtags: "few", cta: "Заходите сегодня, мы рядом", slides: 6 },
  },
  beauty: {
    name: "Салон красоты и барбершоп",
    brand: { description: "Салон красоты: стрижки, окрашивание, маникюр, уходовые процедуры. Опытные мастера и бережное отношение к клиентам.", audience: "Жители города 18–50 лет, которые следят за внешностью и ценят сервис.", tone: "friendly", forbidden: "обещания медицинского эффекта, до/после без согласия клиента" },
    factory: { name: "Соцсети салона", niche: "Индустрия красоты", product: "Услуги салона: стрижки, окрашивание, маникюр, уход", formats: ["post", "carousel"] },
    settings: { postTypes: ["expert", "sales", "friendly"], length: "short", emoji: "many", hashtags: "few", cta: "Запишитесь онлайн на удобное время", slides: 6 },
  },
  lawyer: {
    name: "Юрист и юридическая фирма",
    brand: { description: "Юридическая компания: помощь бизнесу и частным клиентам, договоры, споры, сопровождение сделок.", audience: "Владельцы малого бизнеса и частные лица, которым нужна правовая защита.", tone: "professional", forbidden: "гарантии выигрыша дела, обещания конкретного результата, персональные данные клиентов" },
    factory: { name: "Экспертный блог", niche: "Юридические услуги", product: "Юридические консультации и сопровождение бизнеса и граждан", formats: ["post", "carousel", "article"] },
    settings: { postTypes: ["expert", "info"], length: "long", emoji: "none", hashtags: "few", cta: "Запишитесь на консультацию", slides: 7 },
  },
  realty: {
    name: "Застройщик и недвижимость",
    brand: { description: "Компания в сфере недвижимости: новостройки, подбор квартир, ипотека, сопровождение сделки.", audience: "Семьи и инвесторы 25–55 лет, выбирающие жильё или вложения в недвижимость.", tone: "professional", forbidden: "гарантии роста цен, непроверенные сроки сдачи" },
    factory: { name: "Соцсети проекта", niche: "Недвижимость", product: "Квартиры в новостройках, ипотека, ход строительства", formats: ["post", "carousel"] },
    settings: { postTypes: ["news", "expert", "sales"], length: "short", emoji: "moderate", hashtags: "few", cta: "Оставьте заявку на подбор квартиры", slides: 6 },
  },
  fitness: {
    name: "Фитнес-клуб и тренер",
    brand: { description: "Фитнес-клуб и персональные тренировки: силовые, групповые программы, питание, поддержка результата.", audience: "Люди 18–45 лет, которые хотят улучшить форму и здоровье, новички и те, кто вернулся к спорту.", tone: "inspiring", forbidden: "обещания быстрой потери веса, медицинские советы, стыд за внешность" },
    factory: { name: "Блог клуба", niche: "Фитнес и здоровье", product: "Абонементы, персональные тренировки, групповые программы", formats: ["post", "carousel"] },
    settings: { postTypes: ["expert", "friendly", "humor"], length: "short", emoji: "many", hashtags: "many", cta: "Запишитесь на пробную тренировку", slides: 7 },
  },
  shop: {
    name: "Интернет-магазин",
    brand: { description: "Интернет-магазин с широким выбором товаров, быстрой доставкой и понятными условиями возврата.", audience: "Покупатели 20–55 лет, которые ценят удобство, цену и скорость доставки.", tone: "friendly", forbidden: "ложные скидки и дефицит, сравнения с конкретными конкурентами" },
    factory: { name: "Соцсети магазина", niche: "Электронная коммерция", product: "Товары магазина, новинки, подборки, акции", formats: ["post", "carousel", "seo"] },
    settings: { postTypes: ["sales", "info", "news"], length: "short", emoji: "moderate", hashtags: "few", cta: "Перейти в каталог", slides: 6 },
  },
  school: {
    name: "Онлайн-школа и курсы",
    brand: { description: "Образовательный проект: онлайн-курсы и обучение с наставниками, практика и сертификаты.", audience: "Взрослые 22–45 лет, которые хотят освоить новую профессию или навык.", tone: "inspiring", forbidden: "гарантии трудоустройства и дохода" },
    factory: { name: "Блог школы", niche: "Образование", product: "Онлайн-курсы, наставничество, бесплатные уроки", formats: ["post", "carousel", "article"] },
    settings: { postTypes: ["expert", "info", "sales"], length: "long", emoji: "moderate", hashtags: "few", cta: "Запишитесь на бесплатный вводный урок", slides: 8 },
  },
  auto: {
    name: "Автосервис и автосалон",
    brand: { description: "Автосервис: диагностика, ремонт, обслуживание, шиномонтаж, прозрачные цены и гарантия на работы.", audience: "Автовладельцы 25–60 лет, ценящие честный сервис и сроки.", tone: "professional", forbidden: "обещания «починим всё», критика конкретных марок, нечестные скидки" },
    factory: { name: "Соцсети автосервиса", niche: "Автосервис", product: "Ремонт и обслуживание автомобилей, шиномонтаж", formats: ["post", "carousel"] },
    settings: { postTypes: ["expert", "sales", "info"], length: "short", emoji: "moderate", hashtags: "few", cta: "Запишитесь на диагностику", slides: 6 },
  },
  clinic: {
    name: "Клиника и медцентр",
    brand: { description: "Частный медицинский центр: приём специалистов, диагностика, профилактика. Лицензия, современное оборудование, забота о пациентах.", audience: "Взрослые и родители 25–60 лет, ищущие надёжную клинику рядом.", tone: "serious", forbidden: "постановка диагнозов, обещание излечения, лечение по тексту поста, отзывы пациентов с данными" },
    factory: { name: "Блог клиники", niche: "Медицина", product: "Приём врачей, диагностика, профилактические программы", formats: ["post", "carousel", "article"] },
    settings: { postTypes: ["expert", "info"], length: "long", emoji: "none", hashtags: "none", cta: "Запишитесь на приём", slides: 6 },
  },
  b2b: {
    name: "B2B-услуги и IT",
    brand: { description: "Компания, которая оказывает услуги бизнесу: IT-решения, автоматизация, консалтинг. Фокус на измеримом результате клиента.", audience: "Руководители и владельцы бизнеса, ИТ-директора, маркетологи.", tone: "professional", forbidden: "громкие обещания без цифр, названия клиентов без их согласия" },
    factory: { name: "Блог компании", niche: "B2B, IT и консалтинг", product: "Услуги и решения для бизнеса, кейсы клиентов", formats: ["post", "carousel", "article", "seo"] },
    settings: { postTypes: ["expert", "news", "info"], length: "long", emoji: "none", hashtags: "few", cta: "Обсудить задачу с экспертом", slides: 7 },
  },
  expert: {
    name: "Эксперт и личный бренд",
    brand: { description: "Личный бренд эксперта: консультации, обучение, авторские методики. Делюсь опытом, кейсами и выводами.", audience: "Подписчики и потенциальные клиенты, интересующиеся темой эксперта.", tone: "friendly", forbidden: "чужие кейсы как свои, обещания гарантированного результата" },
    factory: { name: "Личный блог", niche: "Экспертный блог", product: "Консультации, обучение, авторские продукты эксперта", formats: ["post", "carousel"] },
    settings: { postTypes: ["expert", "friendly", "humor"], length: "long", emoji: "moderate", hashtags: "few", cta: "Напишите мне, обсудим вашу задачу", slides: 7 },
  },
};

export const NICHE_LIST = Object.entries(NICHES).map(([key, n]) => ({ key, name: n.name }));
