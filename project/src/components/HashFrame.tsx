import type { ReactNode } from 'react';

/**
 * Frames an artwork with microprinting of its own SHA-256 hash — the same
 * fingerprint that is stored on chain — the way banknotes hide microtext in
 * their borders. Zoom in and the frame is the proof.
 */
export default function HashFrame({
  hash,
  children,
  tone = 'ink',
  className = '',
}: {
  hash?: string | null;
  children: ReactNode;
  tone?: 'ink' | 'note' | 'seal';
  className?: string;
}) {
  const text = hash ? `SHA-256 ${hash} ` : 'NOT YET FINGERPRINTED ';
  const run = text.repeat(6);
  const colour =
    tone === 'note' ? 'text-note' : tone === 'seal' ? 'text-seal' : 'text-ink';

  const strip =
    'absolute overflow-hidden whitespace-nowrap font-mono text-[6.5px] leading-[14px] tracking-[0.06em] select-none';

  return (
    <div className={`relative bg-paper-mat p-[14px] ${className}`}>
      <div className={`pointer-events-none absolute inset-0 ${colour} opacity-80`} aria-hidden>
        <div className={`${strip} left-0 right-0 top-0 h-[14px]`}>{run}</div>
        <div className={`${strip} bottom-0 left-0 right-0 h-[14px] rotate-180`}>{run}</div>
        <div
          className={`${strip} bottom-[14px] left-0 top-[14px] w-[14px]`}
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          {run}
        </div>
        <div
          className={`${strip} bottom-[14px] right-0 top-[14px] w-[14px]`}
          style={{ writingMode: 'vertical-rl' }}
        >
          {run}
        </div>
        <div className="absolute inset-[14px] ring-1 ring-current" />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
