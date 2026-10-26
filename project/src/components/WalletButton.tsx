import { Link } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { shortAddress } from '../lib/artchain';

/** The artist's ArtChain address; opens their page in the explorer. */
export default function WalletButton() {
  const { address } = useWallet();
  if (!address) return null;

  return (
    <Link
      to={`/explorer/address/${address}`}
      title="Your ArtChain wallet address"
      className="hidden items-center gap-2 rounded-[3px] border border-note/40 bg-note-light px-3 py-1.5 text-note hover:border-note sm:inline-flex"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-note" aria-hidden />
      <span className="font-mono text-[12.5px]">{shortAddress(address)}</span>
    </Link>
  );
}
