import { SetaLogo, ThemeToggle } from '@seta/shared-ui';

export function TopBar() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-hairline bg-canvas px-md">
      <a href="/" className="inline-flex items-center" aria-label="Seta home">
        <SetaLogo height={28} />
      </a>
      <ThemeToggle />
    </header>
  );
}
