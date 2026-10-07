import { Wand2, Image as Img, Video, Mic, Music, UserSquare, FileText } from "lucide-react";
import { PageHead } from "@/components/ui";

const TOOLS = [
  { i: FileText, t: "Текст", d: "Пост, статья, сценарий по свободному запросу", on: true },
  { i: Img, t: "Изображение", d: "Генерация и референсы" },
  { i: Video, t: "Видео", d: "Ролики из фото и текста" },
  { i: Mic, t: "Озвучка", d: "Голос для роликов" },
  { i: Music, t: "Музыка", d: "Фоновые треки" },
  { i: UserSquare, t: "ИИ-аватар", d: "Говорящий ведущий" },
];

export default function Studio() {
  return (
    <>
      <PageHead title="Студия" sub="Разовая работа без завода. Подключается по мере готовности провайдеров." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map(({ i: I, t, d, on }) => (
          <div key={t} className={`card p-5 ${on ? "" : "opacity-60"}`}>
            <div className="mb-3 grid size-10 place-items-center rounded-xl bg-tile text-accent"><I size={20} /></div>
            <b>{t}</b><p className="mt-1 text-sm text-ink2">{d}</p>
            <span className="chip mt-3">{on ? "Скоро в этом разделе" : "В планах"}</span>
          </div>
        ))}
      </div>
      <p className="mt-6 flex items-center gap-2 text-xs text-ink3"><Wand2 size={14} />Пока вся генерация текста доступна внутри заводов.</p>
    </>
  );
}
