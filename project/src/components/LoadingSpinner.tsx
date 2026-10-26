import Rosette from './Rosette';

export default function LoadingSpinner({ fullScreen = true }: { fullScreen?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center ${fullScreen ? 'min-h-screen' : 'py-20'}`}
      role="status"
      aria-label="Loading"
    >
      <Rosette detail="mark" size={44} className="animate-spin text-ink/70 [animation-duration:3s]" />
    </div>
  );
}
