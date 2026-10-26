import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWallet } from '../contexts/WalletContext';
import { supabase } from '../lib/supabase';
import { addressExplorerUrl } from '../lib/chain-config';
import Navbar from '../components/Navbar';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import Rosette from '../components/Rosette';

export default function AccountPage() {
  const { user, profile, signOut, updateProfile } = useAuth();
  const { address, isConnected, walletAvailable, connect, connecting } = useWallet();
  const navigate = useNavigate();
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    full_name: profile?.full_name || '',
    email: profile?.email || '',
  });
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'warning'; title: string; message: string } | null>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [counts, setCounts] = useState<{ total: number; onChain: number } | null>(null);

  useEffect(() => {
    if (profile) {
      setProfileData({ full_name: profile.full_name || '', email: profile.email || '' });
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('artwork_metadata')
      .select('id, chain_status')
      .eq('user_id', user.id)
      .then(({ data }: { data: { chain_status: string | null }[] | null }) => {
        const rows = data || [];
        setCounts({ total: rows.length, onChain: rows.filter((r) => r.chain_status === 'confirmed').length });
      });
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleUpdateProfile = async () => {
    try {
      const { error } = await updateProfile(profileData);
      if (error) throw error;
      setToast({ type: 'success', title: 'Profile saved', message: 'Your works are now credited to this name.' });
      setEditingProfile(false);
    } catch (error: any) {
      setToast({ type: 'error', title: 'Couldn’t save your profile', message: error.message });
    }
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  const name = profile?.full_name || user.email?.split('@')[0] || 'Your account';

  return (
    <div className="min-h-screen">
      <Navbar />

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <ConfirmDialog
        isOpen={showLogoutDialog}
        title="Sign out?"
        message="You’ll need your email and password to get back in."
        confirmText="Sign out"
        cancelText="Stay signed in"
        onConfirm={handleSignOut}
        onCancel={() => setShowLogoutDialog(false)}
      />

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6">
        <div className="flex items-center gap-5">
          <div className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center">
            <Rosette detail="seal" size={80} className="absolute inset-0 text-ink/30" />
            <span className="relative font-display text-4xl">{name.charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[40px] leading-tight sm:text-[48px]">{name}</h1>
            {counts && (
              <p className="text-ink-soft">
                {counts.total === 0
                  ? 'No works registered yet'
                  : `${counts.total} ${counts.total === 1 ? 'work' : 'works'}, ${counts.onChain} on chain`}
              </p>
            )}
          </div>
        </div>

        <section className="mt-12 border-t border-ink/15 pt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl">Profile</h2>
            {!editingProfile && (
              <button onClick={() => setEditingProfile(true)} className="btn-link">
                Edit
              </button>
            )}
          </div>

          {editingProfile ? (
            <div className="mt-6 space-y-6">
              <div>
                <label htmlFor="full_name" className="field-label">Name as credited on your works</label>
                <input
                  id="full_name"
                  type="text"
                  value={profileData.full_name}
                  onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="email" className="field-label">Email</label>
                <input
                  id="email"
                  type="email"
                  value={profileData.email}
                  onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                  className="field"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={handleUpdateProfile} className="btn-primary">Save profile</button>
                <button onClick={() => setEditingProfile(false)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          ) : (
            <dl className="mt-6 space-y-4 text-[15px]">
              <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
                <dt className="text-ink-soft">Name</dt>
                <dd>{profile?.full_name || <span className="text-ink-faint">Not set</span>}</dd>
              </div>
              <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
                <dt className="text-ink-soft">Email</dt>
                <dd className="truncate">{user.email}</dd>
              </div>
              {profile?.created_at && (
                <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
                  <dt className="text-ink-soft">Member since</dt>
                  <dd>
                    {new Date(profile.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </section>

        <section className="mt-12 border-t border-ink/15 pt-8">
          <h2 className="text-2xl">Wallet</h2>
          {isConnected && address ? (
            <p className="mt-4 text-[15px] text-ink-soft">
              New registrations are signed by{' '}
              <a
                href={addressExplorerUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[13px] text-ink underline decoration-ink/20 underline-offset-4"
              >
                {address}
              </a>
              , so the chain names you as owner.
            </p>
          ) : (
            <>
              <p className="mt-4 max-w-prose text-[15px] text-ink-soft">
                Without a wallet, our relayer records your works and the chain lists the relayer’s address as owner.
                Connect MetaMask on Sepolia to be named as the owner yourself.
              </p>
              {walletAvailable ? (
                <button onClick={connect} disabled={connecting} className="btn-secondary mt-5">
                  {connecting ? 'Connecting…' : 'Connect wallet'}
                </button>
              ) : (
                <p className="mt-4 text-sm text-ink-faint">No browser wallet detected.</p>
              )}
            </>
          )}
        </section>

        <section className="mt-12 flex flex-wrap items-center gap-4 border-t border-ink/15 pt-8">
          <Link to="/manage-artworks" className="btn-primary">
            Manage my works
          </Link>
          <button onClick={() => setShowLogoutDialog(true)} className="btn-secondary">
            Sign out
          </button>
        </section>
      </main>
    </div>
  );
}
