import React, { FC, useMemo } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import {
  WalletModalProvider,
} from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { clusterApiUrl } from '@solana/web3.js';
import Dashboard from './components/Dashboard';
import { Analytics } from '@vercel/analytics/react';

import '@solana/wallet-adapter-react-ui/styles.css';

const SolanaConnectionProvider = ConnectionProvider as React.ComponentType<any>;

const App: FC = () => {
  const endpoint = useMemo(() => clusterApiUrl('devnet'), []);
  const configuredWallets = useMemo(
    () => [new PhantomWalletAdapter()],
    []
  );
  const connectionConfig = useMemo(() => ({ commitment: 'confirmed' as const }), []);

  return (
    <>
      <SolanaConnectionProvider endpoint={endpoint} config={connectionConfig}>
        <WalletProvider wallets={configuredWallets} autoConnect>
          <WalletModalProvider>
            <Dashboard />
          </WalletModalProvider>
        </WalletProvider>
      </SolanaConnectionProvider>

      <Analytics />
    </>
  );
};

export default App;
