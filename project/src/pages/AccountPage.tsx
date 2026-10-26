import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWallet } from '../contexts/WalletContext';
import { getAccount, type Account } from '../lib/artchain';
import Navbar from '../components/Navbar';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import Rosette from '../components/Rosette';

export default function AccountPage() {
  const { user, profile, signOut, updateProfile } = useAuth();
  const { wallet, address, chainName, exportBackup, importBackup, publishName } = useWallet();
  const navigate = useNavigate();
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({ full_name: profile?.full_name || '', email: profile?.email || '' });
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'warning'; title: string; message: string } | null>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) setProfileData({ full_name: profile.full_name || '', email: profile.email || '' });
  }, [profile]);

  useEffect(() => {
    if (address) getAccount(address).then(setAccount).catch(() => setAccount(null));
  }, [address, chainName]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleUpdateProfile = async () => {
    try {
      const { error } = await updateProfile(profileData);
      if (error) throw error;
      setEditingProfile(false);
      setToast({ type: 'success', title: 'Profile saved', message: 'Publishing your new name on ArtChain…' });
      if (profileData.full_name.trim()) await publishName(profileData.full_name);
      setToast({ type: 'success', title: 'Name sealed on chain', message: 'Every node now credits your works to this name.' });
    } catch (error: any) {
      setToast({ type: 'error', title: 'Couldn’t save your profile', message: error.message });
    }
  };

  const download = async () => {
    if (passphrase.length < 8) {
      setToast({ type: 'warning', title: 'Choose a longer passphrase', message: 'Use at least 8 characters to encrypt the backup.' });
      return;
    }
    setBusy(true);
    try {
      const json = await exportBackup(passphrase);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `artchain-wallet-${address?.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setToast({ type: 'success', title: 'Backup downloaded', message: 'Keep the file and the passphrase somewhere safe. Neither can be recovered for you.' });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (file: File) => {
    if (!passphrase) {
      setToast({ type: 'warning', title: 'Enter the backup’s passphrase first', message: 'It is needed to decrypt the key.' });
      return;
    }
    setBusy(true);
    try {
      await importBackup(await file.text(), passphrase);
      setToast({ type: 'success', title: 'Wallet restored', message: 'This browser now signs as the restored address.' });
    } catch (e) {
      setToast({ type: 'error', title: 'Couldn’t restore the wallet', message: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setBusy(false);
      if (importRef.current) importRef.current.value = '';
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
        message="Your wallet stays in this browser. Download a backup first if you might use another device."
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
            {account && (
              <p className="text-ink-soft">
                {account.created.length} work{account.created.length === 1 ? '' : 's'} created, {account.owned.length} owned,{' '}
                {account.transactions.length} transaction{account.transactions.length === 1 ? '' : 's'} on chain
              </p>
            )}
          </div>
        </div>

        <section className="mt-12 border-t border-ink/15 pt-8">
          <h2 className="text-2xl">ArtChain wallet</h2>
          <p className="mt-3 max-w-prose text-[15px] text-ink-soft">
            Your private key was generated in this browser and never leaves it. It signs every registration and transfer;
            nodes only see your public key and signatures.
          </p>
          <dl className="mt-6 space-y-4 text-[15px]">
            <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
              <dt className="text-ink-soft">Address</dt>
              <dd>
                <Link to={`/explorer/address/${address}`} className="machine text-ink underline decoration-ink/20 underline-offset-4">
                  {address}
                </Link>
              </dd>
            </div>
            <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
              <dt className="text-ink-soft">Name on chain</dt>
              <dd>{chainName || <span className="text-ochre">Not published yet</span>}</dd>
            </div>
            <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
              <dt className="text-ink-soft">Public key</dt>
              <dd className="machine">{wallet?.publicKey}</dd>
            </div>
            <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
              <dt className="text-ink-soft">Signature scheme</dt>
              <dd>ECDSA over P-256 with SHA-256</dd>
            </div>
          </dl>

          <div className="mt-8 rounded-md border border-ink/15 bg-paper-mat p-5">
            <h3 className="text-lg">Back up or restore</h3>
            <p className="mt-1 text-[14px] text-ink-soft">
              The backup is your key encrypted with a passphrase (PBKDF2 + AES-256-GCM). Lose both and the works can’t be
              transferred again.
            </p>
            <label htmlFor="pass" className="field-label mt-5">Passphrase</label>
            <input id="pass" type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} className="field" autoComplete="new-password" />
            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={download} disabled={busy || !wallet} className="btn-primary">Download encrypted backup</button>
              <label className="btn-secondary cursor-pointer">
                Restore from backup
                <input ref={importRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
              </label>
            </div>
          </div>
        </section>

        <section className="mt-12 border-t border-ink/15 pt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl">Profile</h2>
            {!editingProfile && (
              <button onClick={() => setEditingProfile(true)} className="btn-link">Edit</button>
            )}
          </div>
          {editingProfile ? (
            <div className="mt-6 space-y-6">
              <div>
                <label htmlFor="full_name" className="field-label">Name as credited on your works (published on chain)</label>
                <input id="full_name" type="text" value={profileData.full_name} onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })} className="field" />
              </div>
              <div>
                <label htmlFor="email" className="field-label">Email (private, used to sign in)</label>
                <input id="email" type="email" value={profileData.email} onChange={(e) => setProfileData({ ...profileData, email: e.target.value })} className="field" />
              </div>
              <div className="flex gap-3">
                <button onClick={handleUpdateProfile} className="btn-primary">Save and publish</button>
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
            </dl>
          )}
        </section>

        <section className="mt-12 flex flex-wrap items-center gap-4 border-t border-ink/15 pt-8">
          <Link to="/manage-artworks" className="btn-primary">My works</Link>
          <button onClick={() => setShowLogoutDialog(true)} className="btn-secondary">Sign out</button>
        </section>
      </main>
    </div>
  );
}
