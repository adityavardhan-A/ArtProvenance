import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import WalletButton from './WalletButton';
import Rosette from './Rosette';

export default function Navbar() {
  const { user, profile } = useAuth();

  if (!user) return null;

  const name = profile?.full_name || user.email?.split('@')[0] || 'Account';

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm transition-colors ${isActive ? 'text-ink' : 'text-ink-soft hover:text-ink'}`;

  return (
    <header className="border-b border-ink/15 bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/70 sticky top-0 z-30">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link to="/dashboard" className="flex items-center gap-2.5 text-ink">
          <Rosette detail="mark" size={30} />
          <span className="font-display text-[22px] font-medium tracking-tight">ArtProvenance</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-6 md:flex">
          <NavLink to="/dashboard" className={linkClass}>
            Collection
          </NavLink>
          <NavLink to="/manage-artworks" className={linkClass}>
            My works
          </NavLink>
          <NavLink to="/explorer" className={linkClass}>
            Explorer
          </NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <WalletButton />
          <Link
            to="/account"
            className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink"
            title="Account"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink font-display text-[15px] text-paper-mat">
              {name.charAt(0).toUpperCase()}
            </span>
            <span className="hidden sm:inline">{name}</span>
          </Link>
        </div>
      </div>
      <nav className="flex gap-6 overflow-x-auto border-t border-ink/10 px-4 py-2.5 sm:px-6 md:hidden" aria-label="Sections">
        <NavLink to="/dashboard" className={linkClass}>Collection</NavLink>
        <NavLink to="/manage-artworks" className={linkClass}>My works</NavLink>
        <NavLink to="/explorer" className={linkClass}>Explorer</NavLink>
      </nav>
    </header>
  );
}
