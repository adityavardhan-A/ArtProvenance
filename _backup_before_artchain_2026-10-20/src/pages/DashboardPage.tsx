import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import UploadTab from '../components/UploadTab';
import GalleryTab from '../components/GalleryTab';
import VerifyArtworkTab from '../components/VerifyArtworkTab';
import ChainStatusLine from '../components/ChainStatusLine';

type Tab = 'gallery' | 'upload' | 'verify';

const TABS: { key: Tab; label: string; title: string; lede: string }[] = [
  {
    key: 'gallery',
    label: 'Collection',
    title: 'The collection',
    lede: 'Every registered work, with its fingerprint and ledger record.',
  },
  {
    key: 'upload',
    label: 'Register a work',
    title: 'Register a work',
    lede: 'We check it isn’t a copy, fingerprint it, and record that fingerprint on Ethereum’s Sepolia network.',
  },
  {
    key: 'verify',
    label: 'Verify a work',
    title: 'Verify a work',
    lede: 'Bring any image. We’ll tell you whether it’s a registered original, a likely copy, or unknown.',
  },
];

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('gallery');
  const { user } = useAuth();

  if (!user) return null;

  const current = TABS.find((t) => t.key === activeTab)!;

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-6 lg:px-8">
        <header className="max-w-3xl">
          <h1 className="text-[44px] leading-[1.02] sm:text-[56px]">{current.title}</h1>
          <p className="mt-3 max-w-[60ch] text-[17px] text-ink-soft">{current.lede}</p>
          <div className="mt-4">
            <ChainStatusLine />
          </div>
        </header>

        <nav className="mt-10 flex gap-7 overflow-x-auto border-b border-ink/15" role="tablist" aria-label="Sections">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`-mb-px whitespace-nowrap border-b-2 pb-3 text-[15px] transition-colors ${
                activeTab === tab.key
                  ? 'border-ink text-ink'
                  : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <section className="pt-10" role="tabpanel">
          {activeTab === 'gallery' && <GalleryTab onRegister={() => setActiveTab('upload')} />}
          {activeTab === 'upload' && <UploadTab />}
          {activeTab === 'verify' && <VerifyArtworkTab />}
        </section>
      </main>
    </div>
  );
}
