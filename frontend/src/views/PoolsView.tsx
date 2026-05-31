import { Card } from '../components/ui/Card';
import styles from './PoolsView.module.css';
import { useState, useEffect, useRef } from 'react';
import { useSails } from '../hooks/useSails';
import { useToast } from '../components/ui/Toast';
import { parseContractError } from '../lib/errors';
import { useViewport } from '../hooks/useViewport';
import { useTxStatus, TxStatusOverlay } from '../components/ui/TxStatus';
import { EmptyState } from '../components/ui/EmptyState';
import { useMarketData } from '../providers/MarketDataProvider';

type ModalMode = 'add' | 'remove';

interface ManagedPool {
  pool: Pool;
  myLp: number;
}

export function PoolsView() {
  const { program, account, isReady } = useSails();
  const { pools, loading: marketLoading, refreshAll } = useMarketData();
  const [myLp, setMyLp] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newA, setNewA] = useState<Asset>('BTC');
  const [newB, setNewB] = useState<Asset>('ETH');
  const { success, error } = useToast();
  const { isMobile } = useViewport();
  const { txState, executeTx, resetTx } = useTxStatus();
  const mountedRef = useRef(true);

  /* Manage modal state */
  const [managed, setManaged] = useState<ManagedPool | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>('add');
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [lpAmount, setLpAmount] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!program || !account || !isReady) return;
    Promise.allSettled(pools.map(p =>
      program.amm.getLpPosition(p.id, account.decodedAddress).call()
        .then(pos => pos ? { ...pos, pool: p } as any : null)
    )).then(results => {
      if (mountedRef.current) {
        setMyLp(results
          .filter(r => r.status === 'fulfilled')
          .map(r => (r as PromiseFulfilledResult<any>).value)
          .filter(Boolean));
      }
    });
  }, [program, account, isReady, pools]);

  const handleCreatePool = async () => {
    if (!program || !account) return;
    if (newA === newB) { error('Cannot create a pool with the same asset.'); return; }
    const err = await executeTx(
      () => program!.amm.createPool(newA, newB),
      account,
      () => { success('Pool created!'); setShowCreate(false); refreshAll(); }
    );
    if (err) error(parseContractError(err));
  };

  const openManage = (pool: Pool) => {
    const lpPos = myLp.find((p: any) => Number(p.pool_id) === Number(pool.id));
    setManaged({ pool, myLp: lpPos ? Number(lpPos.amount) : 0 });
    setModalMode('add');
    setAmountA('');
    setAmountB('');
    setLpAmount('');
  };

  const closeModal = () => { setManaged(null); resetTx(); };

  const handleAddLiquidity = async () => {
    if (!program || !account || !managed) return;
    const a = parseFloat(amountA);
    const b = parseFloat(amountB);
    if (isNaN(a) || a <= 0 || isNaN(b) || b <= 0) { error('Enter valid amounts'); return; }
    const poolId = managed.pool.id;
    const bigA = BigInt(Math.round(a * 10**8));
    const bigB = BigInt(Math.round(b * 10**8));
    const err = await executeTx(
      () => program!.amm.addLiquidity(poolId, bigA, bigB),
      account,
      () => { success('Liquidity added!'); closeModal(); refreshAll(); }
    );
    if (err) error(parseContractError(err));
  };

  const handleRemoveLiquidity = async () => {
    if (!program || !account || !managed) return;
    const lp = parseFloat(lpAmount);
    if (isNaN(lp) || lp <= 0) { error('Enter a valid LP amount'); return; }
    const poolId = managed.pool.id;
    const bigLp = BigInt(Math.round(lp * 10**8));
    const err = await executeTx(
      () => program!.amm.removeLiquidity(poolId, bigLp),
      account,
      () => { success('Liquidity removed!'); closeModal(); refreshAll(); }
    );
    if (err) error(parseContractError(err));
  };

  const fmt = (val: bigint | number | string) =>
    (Number(val) / 10**8).toLocaleString(undefined, { maximumFractionDigits: 6 });

  const isBusy = txState.visible && txState.stage !== 'failed' && txState.stage !== 'confirmed';

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
              <select value={newA} onChange={e => setNewA(e.target.value as Asset)} aria-label="First asset">
                {['BTC', 'ETH', 'VARA'].map(a => <option key={a}>{a}</option>)}
              </select>
              <span style={{ color: 'var(--text-secondary)' }}>/</span>
              <select value={newB} onChange={e => setNewB(e.target.value as Asset)} aria-label="Second asset">
                {['BTC', 'ETH', 'VARA'].map(a => <option key={a}>{a}</option>)}
              </select>
              <button onClick={handleCreatePool} disabled={isBusy}>
                {isBusy ? 'Creating...' : 'Create'}
              </button>
            </div>
          </Card>
        )}

        <Card title="Available Pools">
          {pools.length === 0 && (
            <EmptyState
              title={marketLoading ? 'Loading...' : 'No Pools Yet'}
              description={marketLoading ? 'Fetching pool data...' : 'Be the first to create a liquidity pool.'}
              action={account && !showCreate ? { label: '+ Create Pool', onClick: () => setShowCreate(true) } : undefined}
            />
          )}
          {pools.length > 0 && (
            <table className={styles.table}>
              {!isMobile && (
                <thead>
                  <tr>
                    <th scope="col">Pool Pair</th>
                    <th scope="col">Reserve A</th>
                    <th scope="col">Reserve B</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
              )}
              <tbody>
                {pools.map(pool => (
                  <tr key={pool.id.toString()}>
                    <td className={styles.pair} data-label="Pool Pair">{pool.asset_a} / {pool.asset_b}</td>
                    <td data-label={`Reserve ${pool.asset_a}`}>{fmt(pool.reserve_a)}</td>
                    <td data-label={`Reserve ${pool.asset_b}`}>{fmt(pool.reserve_b)}</td>
                    <td data-label="Actions">
                      <button className={styles.manageBtn} onClick={() => openManage(pool)}>
                        Manage
                      </button>
                    </td>
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
          {myLp.map((pos: any) => {
            const pool = pools.find(p => Number(p.id) === Number(pos.pool_id));
            return (
              <div key={pos.pool_id.toString()} className={styles.lpRow}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>
                      {pool ? `${pool.asset_a} / ${pool.asset_b}` : `Pool #${pos.pool_id.toString()}`}
                    </span>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
                      LP tokens: {fmt(pos.amount)}
                    </div>
                  </div>
                  {pool && (
                    <button className={styles.manageBtn} onClick={() => openManage(pool)}>
                      Manage
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {/* ── Manage Modal ── */}
      {managed && (
        <div className={styles.modalOverlay} onClick={closeModal} role="dialog" aria-modal="true"
          aria-label={`Manage ${managed.pool.asset_a}/${managed.pool.asset_b} pool`}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3>{managed.pool.asset_a} / {managed.pool.asset_b}</h3>

            <div className={styles.poolInfoBox}>
              <span>Reserve {managed.pool.asset_a}: {fmt(managed.pool.reserve_a)}</span>
              <span>Reserve {managed.pool.asset_b}: {fmt(managed.pool.reserve_b)}</span>
              {managed.myLp > 0 && (
                <span className={styles.lpBadge}>My LP: {fmt(managed.myLp)}</span>
              )}
            </div>

            <div className={styles.modalTabs}>
              <button
                className={`${styles.modalTab} ${modalMode === 'add' ? styles.modalTabActive : ''}`}
                onClick={() => setModalMode('add')}
              >
                Add Liquidity
              </button>
              <button
                className={`${styles.modalTab} ${modalMode === 'remove' ? styles.modalTabActive : ''}`}
                onClick={() => setModalMode('remove')}
                disabled={managed.myLp === 0}
              >
                Remove
              </button>
            </div>

            {modalMode === 'add' && (
              <>
                <div className={styles.formGroup}>
                  <label>Amount {managed.pool.asset_a}</label>
                  <input
                    type="number"
                    value={amountA}
                    onChange={e => setAmountA(e.target.value)}
                    placeholder="0.00000000"
                    min="0"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Amount {managed.pool.asset_b}</label>
                  <input
                    type="number"
                    value={amountB}
                    onChange={e => setAmountB(e.target.value)}
                    placeholder="0.00000000"
                    min="0"
                  />
                </div>
                <div className={styles.modalActions}>
                  <button className={styles.btnSecondary} onClick={closeModal}>Cancel</button>
                  <button className={styles.btnPrimary} onClick={handleAddLiquidity} disabled={isBusy || !account}>
                    {isBusy ? 'Processing...' : 'Add Liquidity'}
                  </button>
                </div>
              </>
            )}

            {modalMode === 'remove' && (
              <>
                <div className={styles.formGroup}>
                  <label>LP Amount to Remove (max: {fmt(managed.myLp)})</label>
                  <input
                    type="number"
                    value={lpAmount}
                    onChange={e => setLpAmount(e.target.value)}
                    placeholder="0.00000000"
                    min="0"
                    max={(managed.myLp / 10**8).toString()}
                  />
                </div>
                <button
                  className={styles.btnSecondary}
                  style={{ fontSize: 12, padding: '4px 8px', marginTop: -8 }}
                  onClick={() => setLpAmount((managed.myLp / 10**8).toString())}
                >
                  Max
                </button>
                <div className={styles.modalActions}>
                  <button className={styles.btnSecondary} onClick={closeModal}>Cancel</button>
                  <button className={styles.btnPrimary} onClick={handleRemoveLiquidity} disabled={isBusy || !account || managed.myLp === 0}>
                    {isBusy ? 'Processing...' : 'Remove Liquidity'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <TxStatusOverlay state={txState} onClose={resetTx} />
    </>
  );
}
