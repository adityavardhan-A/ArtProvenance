import { useRef, useState, type ReactNode } from 'react';
import { ImagePlus, X } from 'lucide-react';

/**
 * An empty frame waiting for an image. Supports click, keyboard and real
 * drag-and-drop (the old version promised drag-and-drop but didn't do it).
 */
export default function DropZone({
  id,
  preview,
  onFile,
  onClear,
  prompt,
  scanning = false,
  overlay,
}: {
  id: string;
  preview: string | null;
  onFile: (file: File) => void;
  onClear: () => void;
  prompt: string;
  /** Sweep a band of raking light across the image while work is running. */
  scanning?: boolean;
  overlay?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  const input = (
    <input
      ref={inputRef}
      id={id}
      type="file"
      accept="image/*,.png,.jpg,.jpeg,.jfif,.webp,.gif,.bmp,.svg,.avif,.heic,.heif"
      className="sr-only"
      onChange={(e) => pick(e.target.files)}
    />
  );

  if (preview) {
    return (
      <div>
        <div className="framed relative">
          <div className="relative overflow-hidden bg-paper-deep">
            <img src={preview} alt="Selected artwork" className="mx-auto max-h-[460px] w-full object-contain" />
            {scanning && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
                <div className="absolute inset-y-0 w-1/3 animate-rake bg-gradient-to-r from-transparent via-white/45 to-transparent mix-blend-screen" />
              </div>
            )}
            {overlay}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-5">
          <label htmlFor={id} className="btn-link cursor-pointer">
            Choose a different image
            {input}
          </label>
          <button type="button" onClick={onClear} className="btn-link text-ink-soft">
            <X className="h-3.5 w-3.5" aria-hidden />
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files);
      }}
      className={`group flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-3 border border-dashed px-6 text-center transition-colors focus-within:border-ink ${
        dragging ? 'border-note bg-note-light' : 'border-ink/35 bg-paper-mat hover:border-ink/70'
      }`}
    >
      <ImagePlus className="h-8 w-8 text-ink-faint group-hover:text-ink-soft" strokeWidth={1.25} aria-hidden />
      <span className="font-display text-xl">{prompt}</span>
      <span className="text-[13px] text-ink-soft">Drop a PNG, JPG or WebP here, or click to browse</span>
      {input}
    </label>
  );
}
