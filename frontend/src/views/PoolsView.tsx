import { Card } from '../components/ui/Card';
import styles from './PoolsView.module.css';
import { useState, useEffect, useRef } from 'react';
import { useSails } from '../hooks/useSails';
import { useToast } from '../components/ui/Toast';
import { parseContractError } from '../lib/errors';
import { useViewport } from '../hooks/useViewport';
import { useTxStatus, TxStatusOverlay } from '../components/ui/TxStatus';
import { EmptyState } from '../components/ui/EmptyState';

export function PoolsView() {
  const { program, account, isReady } = useSails();
  const [pools, setPools] = useState<Pool[]>([]);
  const [myLp, setMyLp] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newA, setNewA] = useState<Asset>('BTC');
  const [newB, setNewB] = useState<Asset>('ETH');
  const { success, error } = useToast();
  const { isMobile } = useViewport();
  const { txState, executeTx, resetTx } = useTxStatus();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!program || !isReady) return;
    program.amm.listPools().call().then(r => { if (r && mountedRef.current) setPools(r as Pool[]); }).catch(console.error);
  }, [program, isReady]);

  useEffect(() => {
    if (!program || !account || !isReady) return;
    Promise.all(pools.map(p =>
      program.amm.getLpPosition(p.id, account.decodedAddress).call()
        .then(pos => pos ? { ...pos, pool: p } as any : null)
    )).then(results => { if (mountedRef.current) setMyLp(results.filter(Boolean)); });
  }, [program, account, isReady, pools]);

  const handleCreatePool = async () => {
    if (!program || !account) return;
    const ok = await executeTx(
      () => program!.amm.createPool(newA, newB),
      account,
      async () => {
        success('Pool created!');
        setShowCreate(false);
        const r = await program!.amm.listPools().call();
        if (r && mountedRef.current) setPools(r as Pool[]);
      }
    );
    if (!ok) {
      error(parseContractError(txState.errorMsg));
    }
  };

  const formatAmount = (val: bigint | number | string) => {
    return (Number(val) / 10**8).toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  return (
    <>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>Liquidity Pools</h1>
          <button className={styles.createBtn} onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? 'Cancel' : '+ Create Pool'}
          </button>
        </div>

        {showCreate && (
          <Card title="Create Pool">
            <div className={styles.createForm}>
              <select value={newA} onChange={e => setNewA(e.target.value as Asset)}>
                {['BTC', 'ETH', 'VARA'].map(a => <option key={a}>{a}</option>)}
              </select>
              <span style={{ color: 'var(--text-secondary)' }}>/</span>
              <select value={newB} onChange={e => setNewB(e.target.value as Asset)}>
                {['BTC', 'ETH', 'VARA'].map(a => <option key={a}>{a}</option>)}
              </select>
              <button onClick={handleCreatePool} disabled={txState.visible && txState.stage !== 'failed' && txState.stage !== 'confirmed'}>
                {txState.stage === 'broadcasting' || txState.stage === 'confirming' ? 'Creating...' : 'Create'}
              </button>
            </div>
          </Card>
        )}

        <Card title="Available Pools">
          {pools.length === 0 && (
            <EmptyState
              icon={null}
              title="No Pools Yet"
              description="Be the first to create a liquidity pool and earn fees from swaps."
              action={account ? { label: '+ Create Pool', onClick: () => setShowCreate(true) } : undefined}
            />
          )}
          {!isMobile && pools.length > 0 && (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Pool Pair</th>
                  <th>Reserve A</th>
                  <th>Reserve B</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pools.map(pool => (
                  <tr key={pool.id.toString()}>
                    <td className={styles.pair}>{pool.asset_a} / {pool.asset_b}</td>
                    <td>{formatAmount(pool.reserve_a)}</td>
                    <td>{formatAmount(pool.reserve_b)}</td>
                    <td><button className={styles.actionBtn}>Manage</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {isMobile && pools.length > 0 && (
            <table className={styles.table}>
              <tbody>
                {pools.map(pool => (
                  <tr key={pool.id.toString()}>
                    <td data-label="Pool Pair" className={styles.pair}>{pool.asset_a} / {pool.asset_b}</td>
                    <td data-label={`Reserve ${pool.asset_a}`}>{formatAmount(pool.reserve_a)}</td>
                    <td data-label={`Reserve ${pool.asset_b}`}>{formatAmount(pool.reserve_b)}</td>
                    <td data-label="Actions"><button className={styles.actionBtn}>Manage</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="My Liquidity">
          {myLp.length === 0 && (
            <EmptyState
              title="No Active Positions"
              description="Add liquidity to a pool to start earning fees."
            />
          )}
          {myLp.map((pos: any) => (
            <div key={pos.pool_id.toString()} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ fontWeight: 600 }}>Pool #{pos.pool_id.toString()}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>LP Amount: {formatAmount(pos.amount)}</div>
            </div>
          ))}
        </Card>
      </div>

      <TxStatusOverlay state={txState} onClose={resetTx} />
    </>
  );
}
