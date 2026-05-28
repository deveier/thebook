import { Card } from '../components/ui/Card';
import styles from './PoolsView.module.css';
import { useState, useEffect, useRef } from 'react';
import { useSails } from '../hooks/useSails';
import { web3FromSource } from '@polkadot/extension-dapp';
import { useToast } from '../components/ui/Toast';
import { parseContractError } from '../lib/errors';

export function PoolsView() {
  const { program, account, isReady } = useSails();
  const [pools, setPools] = useState<Pool[]>([]);
  const [myLp, setMyLp] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newA, setNewA] = useState<Asset>('BTC');
  const [newB, setNewB] = useState<Asset>('ETH');
  const { success, error } = useToast();
  const [txLoading, setTxLoading] = useState(false);
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
          <div style={{ display: 'flex', gap: 12, padding: 16, alignItems: 'center' }}>
            <select value={newA} onChange={e => setNewA(e.target.value as Asset)}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-main)' }}>
              {['BTC', 'ETH', 'VARA'].map(a => <option key={a}>{a}</option>)}
            </select>
            <span>/</span>
            <select value={newB} onChange={e => setNewB(e.target.value as Asset)}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-main)' }}>
              {['BTC', 'ETH', 'VARA'].map(a => <option key={a}>{a}</option>)}
            </select>
            <button onClick={handleCreatePool} disabled={txLoading}
              style={{ padding: '8px 20px', background: 'var(--primary)', color: '#000', borderRadius: 8, fontWeight: 600 }}>
              {txLoading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </Card>
      )}

      <Card title="Available Pools">
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
            {pools.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>No pools yet. Create one!</td></tr>
            )}
            {pools.map(pool => (
              <tr key={pool.id.toString()}>
                <td className={styles.pair}>{pool.asset_a} / {pool.asset_b}</td>
                <td>{Number(pool.reserve_a) / 10**8}</td>
                <td>{Number(pool.reserve_b) / 10**8}</td>
                <td><button className={styles.actionBtn}>Manage</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className={styles.stats}>
        <Card title="My Liquidity">
          {myLp.length === 0 && <div className={styles.placeholder}>No active positions found.</div>}
          {myLp.map((pos: any) => (
            <div key={pos.pool_id.toString()} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ fontWeight: 600 }}>Pool #{pos.pool_id.toString()}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>LP Amount: {Number(pos.amount) / 10**8}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
