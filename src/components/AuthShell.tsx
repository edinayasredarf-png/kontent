import { LegalLinks } from "./LegalLinks";
import { Logo } from "./Logo";

/** Единая оболочка страниц входа, регистрации и восстановления пароля: серый фон, белая скруглённая карточка по центру, логотип сверху. */
export function AuthShell({ children, logoHref = "/login" }: { children: React.ReactNode; logoHref?: string }) {
  return (
    <main className="auth flex min-h-screen flex-col bg-tile px-4 sm:px-5">
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center py-8">
        <div className="rounded-[28px] bg-surface px-6 py-8 shadow-float sm:px-10 sm:py-10">
          <div className="mb-8 flex justify-center"><Logo href={logoHref} h={40} /></div>
          {children}
        </div>
      </div>
      <footer className="pb-5 pt-2"><LegalLinks className="justify-center" /></footer>
    </main>
  );
}
