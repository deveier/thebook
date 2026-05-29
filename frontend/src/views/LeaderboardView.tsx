import { Card } from '../components/ui/Card';
import { useViewport } from '../hooks/useViewport';
import { EmptyState } from '../components/ui/EmptyState';
import { useMarketData } from '../providers/MarketDataProvider';
import { Trophy, Medal, Award } from 'lucide-react';

export function LeaderboardView() {
  const { leaders, loading: marketLoading } = useMarketData();
  const { isMobile } = useViewport();

  const rankIcon = (i: number) => {
    if (i === 0) return <Trophy size={18} color="var(--primary)" />;
    if (i === 1) return <Medal size={18} color="var(--text-secondary)" />;
    if (i === 2) return <Award size={18} color="var(--sell-red)" />;
    return null;
  };

  if (leaders.length === 0) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 16 }}>Leaderboard</h1>
        <Card title="Top Traders">
          <EmptyState
            title={marketLoading ? 'Loading...' : 'No Traders Yet'}
            description={marketLoading ? 'Fetching leaderboard...' : 'Start trading to top the leaderboard!'}
          />
        </Card>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 16 }}>Leaderboard</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {leaders.map((l, i) => (
            <Card key={l.id.toString()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 4 }}>
                <div style={{ width: 32, display: 'flex', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>
                  {rankIcon(i) || <span style={{ color: 'var(--text-secondary)' }}>{i + 1}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500 }}>{l.id.slice(0, 6)}...{l.id.slice(-4)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: 'var(--buy-green)', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14 }}>
                    ${Number(l.usd) / 100}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Net: ${Number(l.net_worth) / 100}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 24 }}>Leaderboard</h1>
      <Card title="Top Traders">
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
                <td style={{ padding: 16, borderBottom: '1px solid var(--border-color)', fontWeight: 600, width: 40 }}>
                  {rankIcon(i) || <span style={{ color: 'var(--text-secondary)' }}>{i + 1}</span>}
                </td>
                <td style={{ padding: 16, borderBottom: '1px solid var(--border-color)', fontFamily: 'var(--font-mono)', fontSize: 14 }}>{l.id.slice(0, 6)}...{l.id.slice(-4)}</td>
                <td style={{ padding: 16, borderBottom: '1px solid var(--border-color)', textAlign: 'right', color: 'var(--buy-green)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${Number(l.usd) / 100}</td>
                <td style={{ padding: 16, borderBottom: '1px solid var(--border-color)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${Number(l.net_worth) / 100}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
