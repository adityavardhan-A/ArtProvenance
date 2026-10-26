/**
 * The signed-in artist's ArtChain wallet.
 *
 * A wallet is created automatically the first time someone signs in on this
 * browser. Their display name is then published on chain as an IDENTITY
 * transaction, so every node can show who registered what.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { createWallet, exportKeystore, importKeystore, loadWallet, signTransaction, type Wallet } from '../lib/wallet';
import { getAccount, submitTx, waitForConfirmation, type ChainTx, type TxLookup, type TxType } from '../lib/artchain';

interface WalletContextValue {
  wallet: Wallet | null;
  address: string | null;
  /** Name currently bound to this address on chain, if any. */
  chainName: string | null;
  ready: boolean;
  /** Sign and broadcast a transaction; resolves once it is in the mempool. */
  send: (type: TxType, payload: Record<string, any>) => Promise<ChainTx>;
  /** Sign, broadcast and wait until mined. */
  sendAndConfirm: (type: TxType, payload: Record<string, any>, onUpdate?: (t: TxLookup) => void) => Promise<TxLookup>;
  publishName: (name: string) => Promise<void>;
  refreshAccount: () => Promise<void>;
  exportBackup: (passphrase: string) => Promise<string>;
  importBackup: (json: string, passphrase: string) => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [chainName, setChainName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const publishing = useRef(false);

  // Load (or create) this user's wallet.
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setChainName(null);
    if (!user) {
      setWallet(null);
      return;
    }
    (async () => {
      // Wallet keys need the browser's WebCrypto, which browsers only allow
      // on https:// or http://localhost. Opening the site by its network
      // address (http://192.168…) would otherwise fail silently.
      if (!window.isSecureContext || !globalThis.crypto?.subtle) {
        setWalletError(
          `This browser blocks wallet encryption on ${window.location.origin}. Open the site at http://localhost:${window.location.port || '5174'} instead.`
        );
        return;
      }
      try {
        const w = loadWallet(user.id) ?? (await createWallet(user.id));
        if (!cancelled) {
          setWallet(w);
          setWalletError(null);
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) setWalletError(`Could not create your wallet: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const refreshAccount = useCallback(async () => {
    if (!wallet) return;
    try {
      const acct = await getAccount(wallet.address);
      setChainName(acct.name);
    } catch {
      /* node offline; the status line already says so */
    }
  }, [wallet]);

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  const send = useCallback(
    async (type: TxType, payload: Record<string, any>) => {
      if (!wallet) throw new Error('Wallet is not ready yet.');
      const tx = await signTransaction(wallet, type, payload);
      await submitTx(tx);
      return tx;
    },
    [wallet]
  );

  const sendAndConfirm = useCallback(
    async (type: TxType, payload: Record<string, any>, onUpdate?: (t: TxLookup) => void) => {
      const tx = await send(type, payload);
      return waitForConfirmation(tx.id, onUpdate);
    },
    [send]
  );

  const publishName = useCallback(
    async (name: string) => {
      await sendAndConfirm('IDENTITY', { name: name.trim().slice(0, 60) });
      await refreshAccount();
    },
    [sendAndConfirm, refreshAccount]
  );

  // Put the profile name on chain once, and again whenever it changes.
  useEffect(() => {
    const name = profile?.full_name?.trim();
    if (!wallet || !name || publishing.current) return;
    (async () => {
      try {
        const acct = await getAccount(wallet.address);
        if (acct.name === name || acct.pending.some((p) => p.tx.type === 'IDENTITY')) return;
        publishing.current = true;
        await send('IDENTITY', { name: name.slice(0, 60) });
        setTimeout(refreshAccount, 4000);
      } catch {
        /* node offline: try next session */
      } finally {
        publishing.current = false;
      }
    })();
  }, [wallet, profile?.full_name, send, refreshAccount]);

  const exportBackup = useCallback(
    async (passphrase: string) => {
      if (!wallet) throw new Error('No wallet to export.');
      return exportKeystore(wallet, passphrase);
    },
    [wallet]
  );

  const importBackup = useCallback(
    async (json: string, passphrase: string) => {
      if (!user) throw new Error('Sign in first.');
      const w = await importKeystore(user.id, json, passphrase);
      setWallet(w);
    },
    [user]
  );

  return (
    <WalletContext.Provider
      value={{
        wallet,
        address: wallet?.address ?? null,
        chainName,
        ready,
        send,
        sendAndConfirm,
        publishName,
        refreshAccount,
        exportBackup,
        importBackup,
      }}
    >
      {walletError && (
        <div role="alert" className="sticky top-0 z-40 bg-seal px-4 py-2.5 text-center text-sm text-paper-mat">
          {walletError}
        </div>
      )}
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider');
  return ctx;
}
