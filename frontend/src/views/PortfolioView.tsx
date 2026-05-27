import { Card } from '../components/ui/Card';
import { usePortfolio } from '../hooks/usePortfolio';
import { useSails } from '../hooks/useSails';
import styles from './PortfolioView.module.css';
import { useState, useEffect } from 'react';

export function PortfolioView() {
  const { portfolio, loading } = usePortfolio();
  const { program, isReady } = useSails();
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!program || !isReady) return;
    program.orderbook.getMyOrders().call().then(result => {
      if (result && Array.isArray(result)) setOrders(result);
    }).catch(console.error);
  }, [program, isReady]);

  const formatAmount = (val: bigint | number | string, decimals: number = 2) => {
     const n = typeof val === 'bigint' ? Number(val) : Number(val);
     if (isNaN(n)) return '0.00';
     const divisor = 10 ** decimals;
     return (n / divisor).toLocaleString(undefined, { minimumFractionDigits: 2 });
  };

  if (!portfolio) {
    return (
      <div className={styles.emptyState}>
        <Card title="My Portfolio">
          <div className={styles.placeholder}>
            {loading ? 'Loading portfolio...' : 'Please join the DEX to see your balances.'}
          </div>
        </Card>
      </div>
    );
  }

  const assets = [
    { name: 'VARA', amount: portfolio.vara, decimals: 8 },
    { name: 'BTC', amount: portfolio.btc, decimals: 8 },
    { name: 'ETH', amount: portfolio.eth, decimals: 6 },
    { name: 'USD', amount: portfolio.usd, decimals: 2 },
  ];

  return (
    <div className={styles.container}>
      <h1>My Portfolio</h1>

      <div className={styles.grid}>
        <Card title="Asset Balances">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.name}>
                  <td className={styles.assetName}>{asset.name}</td>
                  <td>{formatAmount(asset.amount, asset.decimals)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Total Net Worth">
            <div className={styles.netWorth}>
                <span className={styles.netWorthValue}>
                    ${formatAmount(portfolio.usd, 2)}
                </span>
                <span className={styles.netWorthLabel}>USD Balance</span>
            </div>
        </Card>
      </div>

      <div className={styles.ordersSection}>
        <Card title="Open Orders">
          {orders.length === 0 && <div className={styles.placeholder}>No active limit orders.</div>}
          {orders.map((o, i) => (
            <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{o[1] as string} {o[2] as string} @ {Number(o[3]) / 100}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Qty: {Number(o[4]) / 10**8} / Filled: {Number(o[5]) / 10**8}</span>
              <span style={{ color: 'var(--buy-green)' }}>{o[6] as string}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
