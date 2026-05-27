import { useAccount, useApi } from '@gear-js/react-hooks';
import { web3Accounts, web3Enable } from '@polkadot/extension-dapp';
import { Wallet, UserPlus } from 'lucide-react';
import styles from './Header.module.css';
import { usePortfolio } from '../../hooks/usePortfolio';

export function Header() {
  const { account, login, logout } = useAccount();
  const { isApiReady } = useApi();
  const { portfolio, join, loading } = usePortfolio();

  const handleConnect = async () => {
    const extensions = await web3Enable('thebookdex');
    if (extensions.length === 0) {
      alert('No extension installed');
      return;
    }
    const allAccounts = await web3Accounts();
    if (allAccounts.length > 0) {
      const acc = allAccounts[0];
      login({
        ...acc,
        decodedAddress: acc.address as `0x${string}`,
        signer: extensions[0].signer,
      });
    }
  };

  const formatUsd = (val: bigint) => {
    return (Number(val) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });
  };

  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        <span className={styles.accent}>the</span>bookdex
      </div>
      <div className={styles.actions}>
        <div className={styles.status}>
          <div className={`${styles.dot} ${isApiReady ? styles.online : styles.offline}`} />
          {isApiReady ? 'Vara Mainnet' : 'Connecting...'}
        </div>

        {account && (
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
                {loading ? 'Joining...' : 'Join DEX'}
              </button>
            )}
            <span className={styles.address}>{account.decodedAddress.slice(0, 6)}...{account.decodedAddress.slice(-4)}</span>
            <button onClick={logout} className={styles.connectButton}>Disconnect</button>
          </div>
        ) : (
          <button onClick={handleConnect} className={styles.connectButton}>
            <Wallet size={18} />
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
}
