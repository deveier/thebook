import { useAccount, useApi } from '@gear-js/react-hooks';
import { web3Accounts, web3Enable } from '@polkadot/extension-dapp';
import type { InjectedAccountWithMeta } from '@polkadot/extension-inject/types';
import { Wallet, UserPlus, Menu } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import styles from './Header.module.css';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useToast } from '../ui/Toast';
import { useViewport } from '../../hooks/useViewport';
import { AccountSelector } from '../ui/AccountSelector';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { account, login, logout } = useAccount();
  const { isApiReady } = useApi();
  const { portfolio, join, loading } = usePortfolio();
  const { success, error } = useToast();
  const { isMobile } = useViewport();
  const prevPortfolio = useRef(portfolio);
  const [showAccountSelector, setShowAccountSelector] = useState(false);

  useEffect(() => {
    if (!prevPortfolio.current && portfolio) {
      success('Joined the DEX successfully!');
    }
    prevPortfolio.current = portfolio;
  }, [portfolio]);

  const handleConnect = async () => {
    const exts = await web3Enable('thebookdex');
    if (exts.length === 0) {
      error('No wallet extension detected. Install Polkadot.js or SubWallet.');
      return;
    }
    const allAccounts = await web3Accounts();
    if (allAccounts.length === 0) {
      error('No accounts found in your wallet extension.');
      return;
    }
    if (allAccounts.length === 1) {
      const acc = allAccounts[0];
      login({
        ...acc,
        decodedAddress: acc.address as `0x${string}`,
        signer: exts[0].signer,
      });
      return;
    }
    setShowAccountSelector(true);
  };

  const handleAccountSelect = (acc: InjectedAccountWithMeta) => {
    web3Enable('thebookdex').then(exts => {
      login({
        ...acc,
        decodedAddress: acc.address as `0x${string}`,
        signer: exts[0].signer,
      });
    });
    setShowAccountSelector(false);
  };

  const formatUsd = (val: bigint | number | string) => {
    return (Number(val) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });
  };

  return (
    <>
      <header className={styles.header}>
        {isMobile && (
          <button onClick={onMenuClick} className={styles.menuBtn} aria-label="Open menu">
            <Menu size={22} />
          </button>
        )}
        <div className={styles.logo}>
          <span className={styles.accent}>the</span>bookdex
        </div>
        <div className={styles.actions}>
          {!isMobile && (
            <div className={styles.status}>
              <div className={`${styles.dot} ${isApiReady ? styles.online : styles.offline}`} />
              {isApiReady ? 'Vara Mainnet' : 'Connecting...'}
            </div>
          )}

          {account && !isMobile && (
            <div className={styles.balanceInfo}>
              <span className={styles.balanceLabel}>Balance:</span>
              <span className={styles.balanceValue}>
                {portfolio ? `$${formatUsd(portfolio.usd)}` : '---'}
              </span>
            </div>
          )}

          {account ? (
            <div className={styles.accountInfo}>
              {!portfolio && (
                 <button onClick={join} className={styles.joinButton} disabled={loading}>
                  <UserPlus size={16} />
                  {loading ? 'Joining...' : isMobile ? 'Join' : 'Join DEX'}
                </button>
              )}
              {!isMobile && (
                <span className={styles.address}>{account.decodedAddress.slice(0, 6)}...{account.decodedAddress.slice(-4)}</span>
              )}
              {isMobile && (
                <span className={styles.address}>{account.decodedAddress.slice(0, 4)}...{account.decodedAddress.slice(-2)}</span>
              )}
              <button onClick={logout} className={styles.connectButton}>Disconnect</button>
            </div>
          ) : (
            <button onClick={handleConnect} className={styles.connectButton}>
              <Wallet size={18} />
              {isMobile ? 'Connect' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </header>

      {showAccountSelector && (
        <AccountSelector onSelect={handleAccountSelect} onClose={() => setShowAccountSelector(false)} />
      )}
    </>
  );
}
