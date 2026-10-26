import type { ReactNode } from 'react';
import Rosette from './Rosette';

/**
 * Sign-in and sign-up share one composition: an intaglio-blue plate on the
 * left where a guilloche rosette engraves itself once on load, the form on
 * paper to the right.
 */
export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative flex flex-col overflow-hidden bg-ink px-6 py-8 text-paper sm:px-12 lg:py-12">
        <div className="relative z-10 flex items-center gap-2.5">
          <Rosette detail="mark" size={28} color="#EEF0EA" />
          <span className="font-display text-[22px]">ArtProvenance</span>
        </div>

        <div className="pointer-events-none absolute -right-[38%] -top-[6%] h-[96vmin] w-[96vmin] sm:-right-[24%] lg:-right-[30%] lg:-top-[14%] lg:h-[104vmin] lg:w-[104vmin]">
          <Rosette detail="hero" size="100%" color="#8FA9BE" animate />
        </div>
        {/* Scrim so the headline always reads cleanly over the engraving. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-ink via-ink/90 to-transparent" />

        <div className="relative z-10 mt-28 max-w-md sm:mt-[38vh] lg:mt-auto">
          <p className="font-display text-[28px] leading-[1.1] sm:text-[42px]">
            Fingerprint your work. Seal it on ArtChain. Let anyone check it’s the original.
          </p>
          <p className="mt-5 hidden max-w-sm text-[15px] leading-relaxed text-paper/65 sm:block">
            Every work is hashed, signed with your own key, screened for copies by every node, and mined into a
            proof-of-work chain that nobody can quietly rewrite.
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 py-14 sm:px-12">
        <div className="w-full max-w-sm">
          <h1 className="text-[40px]">{title}</h1>
          <p className="mt-2 text-ink-soft">{subtitle}</p>
          <div className="mt-10">{children}</div>
        </div>
      </main>
    </div>
  );
}
