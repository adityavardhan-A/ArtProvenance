/**
 * Optional wallet connection.
 *
 * The app works fine with no wallet at all — the backend relayer signs in that
 * case. Connecting one lets the artist sign their own registrations so the
 * on-chain owner is genuinely their address.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  connectWallet as connectInjectedWallet,
  hasInjectedWallet,
} from '../lib/blockchain';
import { SEPOLIA_CHAIN_ID_HEX } from '../lib/chain-config';

interface WalletContextValue {
  address: string | null;
  chainId: string | null;
  isConnected: boolean;
  isCorrectNetwork: boolean;
  walletAvailable: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

const STORAGE_KEY = 'wallet:autoconnect';

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const walletAvailable = hasInjectedWallet();

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const account = await connectInjectedWallet();
      setAddress(account);

      const injected = (window as any).ethereum;
      setChainId(await injected.request({ method: 'eth_chainId' }));

      try {
        window.sessionStorage.setItem(STORAGE_KEY, '1');
      } catch {
        // sessionStorage can be unavailable in private modes; not fatal.
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to connect wallet.');
      setAddress(null);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    // EIP-1193 has no programmatic disconnect; we just forget the account.
    setAddress(null);
    setError(null);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // Reconnect silently if the user already approved this session.
  useEffect(() => {
    const injected = (window as any).ethereum;
    if (!injected) return;

    let cancelled = false;

    (async () => {
      let shouldReconnect = false;
      try {
        shouldReconnect = window.sessionStorage.getItem(STORAGE_KEY) === '1';
      } catch {
        shouldReconnect = false;
      }
      if (!shouldReconnect) return;

      try {
        const accounts: string[] = await injected.request({ method: 'eth_accounts' });
        if (cancelled || !accounts?.length) return;
        setAddress(accounts[0]);
        setChainId(await injected.request({ method: 'eth_chainId' }));
      } catch {
        // Silent failure is fine — the user can click Connect.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Track account and network changes from the wallet itself.
  useEffect(() => {
    const injected = (window as any).ethereum;
    if (!injected?.on) return;

    const handleAccountsChanged = (accounts: string[]) => {
      setAddress(accounts?.length ? accounts[0] : null);
    };
    const handleChainChanged = (nextChainId: string) => setChainId(nextChainId);

    injected.on('accountsChanged', handleAccountsChanged);
    injected.on('chainChanged', handleChainChanged);

    return () => {
      injected.removeListener?.('accountsChanged', handleAccountsChanged);
      injected.removeListener?.('chainChanged', handleChainChanged);
    };
  }, []);

  const value: WalletContextValue = {
    address,
    chainId,
    isConnected: Boolean(address),
    isCorrectNetwork: chainId?.toLowerCase() === SEPOLIA_CHAIN_ID_HEX,
    walletAvailable,
    connecting,
    error,
    connect,
    disconnect,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}

/** 0x1234…abcd */
export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
