import { Card } from '../components/ui/Card';
import styles from './PoolsView.module.css';
import { useState, useEffect, useRef } from 'react';
import { useSails } from '../hooks/useSails';
import { web3FromSource } from '@polkadot/extension-dapp';
import { useToast } from '../components/ui/Toast';
import { parseContractError } from '../lib/errors';
import { useViewport } from '../hooks/useViewport';

export function PoolsView() {
  const { program, account, isReady } = useSails();
  const [pools, setPools] = useState<Pool[]>([]);
  const [myLp, setMyLp] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newA, setNewA] = useState<Asset>('BTC');
  const [newB, setNewB] = useState<Asset>('ETH');
  const { success, error } = useToast();
  const [txLoading, setTxLoading] = useState(false);
  const { isMobile } = useViewport();
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
    setTxLoading(true);
    try {
      const { signer } = await web3FromSource(account.meta.source);
      const tx = program.amm.createPool(newA, newB);
      await tx.withAccount(account.address, { signer }).calculateGas();
      const { response } = await tx.signAndSend();
      await response();
      success('Pool created!');
      setShowCreate(false);
      program.amm.listPools().call().then(r => { if (r && mountedRef.current) setPools(r as Pool[]); });
    } catch (e) {
      console.error('Create pool failed:', e);
      error(parseContractError(e));
    } finally {
      setTxLoading(false);
    }
  };

  const formatAmount = (val: bigint | number | string) => {
    return (Number(val) / 10**8).toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  return (
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
            <button onClick={handleCreatePool} disabled={txLoading}>
              {txLoading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </Card>
      )}

      <Card title="Available Pools">
        {pools.length === 0 && <div className={styles.placeholder}>No pools yet. Create one!</div>}
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
        {myLp.length === 0 && <div className={styles.placeholder}>No active positions found.</div>}
        {myLp.map((pos: any) => (
          <div key={pos.pool_id.toString()} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 600 }}>Pool #{pos.pool_id.toString()}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>LP Amount: {formatAmount(pos.amount)}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}
