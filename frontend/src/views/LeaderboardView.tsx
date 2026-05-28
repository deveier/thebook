import { useState, useEffect } from 'react';
import { useSails } from '../hooks/useSails';

export function LeaderboardView() {
  const { program, isReady } = useSails();
  const [leaders, setLeaders] = useState<LeaderEntry[]>([]);

  useEffect(() => {
    if (!program || !isReady) return;
    program.orderbook.getLeaderboard(10).call().then(result => {
      if (result && Array.isArray(result)) setLeaders(result);
    }).catch(console.error);
  }, [program, isReady]);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Leaderboard</h1>
      {leaders.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No traders yet. Be the first!</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase' }}>#</th>
            <th style={{ textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase' }}>Trader</th>
            <th style={{ textAlign: 'right', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase' }}>USD PnL</th>
            <th style={{ textAlign: 'right', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase' }}>Net Worth</th>
          </tr>
        </thead>
        <tbody>
          {leaders.map((l, i) => (
            <tr key={l.id.toString()}>
              <td style={{ padding: 16, borderBottom: '1px solid var(--border-color)', fontWeight: 600 }}>{i + 1}</td>
              <td style={{ padding: 16, borderBottom: '1px solid var(--border-color)', fontFamily: 'monospace' }}>{l.id.slice(0, 6)}...{l.id.slice(-4)}</td>
              <td style={{ padding: 16, borderBottom: '1px solid var(--border-color)', textAlign: 'right', color: 'var(--buy-green)' }}>${Number(l.usd) / 100}</td>
              <td style={{ padding: 16, borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>${Number(l.net_worth) / 100}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
