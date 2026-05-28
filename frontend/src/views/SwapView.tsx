import { Card } from '../components/ui/Card';
import { ArrowDown } from 'lucide-react';
import styles from './SwapView.module.css';
import { useState, useEffect, useCallback } from 'react';
import { useSails } from '../hooks/useSails';
import { web3FromSource } from '@polkadot/extension-dapp';
import { useToast } from '../components/ui/Toast';
import { parseContractError } from '../lib/errors';

export function SwapView() {
  const { program, account, isReady } = useSails();
  const [pools, setPools] = useState<Pool[]>([]);
  const [fromAsset, setFromAsset] = useState('VARA');
  const [toAsset, setToAsset] = useState('ETH');
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const { success, error } = useToast();
  const [txLoading, setTxLoading] = useState(false);

  useEffect(() => {
    if (!program || !isReady) return;
    program.amm.listPools().call().then(result => {
      if (result) setPools(result as Pool[]);
    }).catch(console.error);
  }, [program, isReady]);

  const activePool = pools.find(p =>
    (p.asset_a === fromAsset && p.asset_b === toAsset) ||
    (p.asset_a === toAsset && p.asset_b === fromAsset)
  );

  const calculateOut = useCallback((inAmount: string) => {
    if (!activePool || !inAmount) { setAmountOut(''); return; }
    const parsed = parseFloat(inAmount);
    if (isNaN(parsed) || parsed <= 0) { setAmountOut(''); return; }
    const amount = BigInt(Math.round(parsed * 10**8));

    const fee = 997n;
    const feeDenom = 1000n;
    const reserveIn = BigInt((fromAsset === activePool.asset_a ? activePool.reserve_a : activePool.reserve_b).toString());
    const reserveOut = BigInt((fromAsset === activePool.asset_a ? activePool.reserve_b : activePool.reserve_a).toString());
    const amountInWithFee = amount * fee;
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * feeDenom + amountInWithFee;
    const out = numerator / denominator;
    setAmountOut((Number(out) / 10**8).toFixed(6));
  }, [activePool, fromAsset]);

  const handleSwap = async () => {
    if (!program || !account || !activePool || !amountIn) return;
    const parsedIn = parseFloat(amountIn);
    const parsedOut = parseFloat(amountOut);
    if (isNaN(parsedIn) || parsedIn <= 0) return;
    const minOutValue = isNaN(parsedOut) || parsedOut <= 0 ? 0n : BigInt(Math.round(parsedOut * 10**8 * 0.995));
    setTxLoading(true);
    try {
      const { signer } = await web3FromSource(account.meta.source);
      const inAmount = BigInt(Math.round(parsedIn * 10**8));
      const minOut = minOutValue;
      const tx = program.amm.swap(activePool.id, fromAsset as Asset, inAmount, minOut);
      await tx.withAccount(account.address, { signer }).calculateGas();
      const { response } = await tx.signAndSend();
      await response();
      success('Swap executed!');
      setAmountIn('');
      setAmountOut('');
    } catch (e) {
      console.error('Swap failed:', e);
      error(parseContractError(e));
    } finally {
      setTxLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <Card title="Swap Tokens" className={styles.swapCard}>
        <div className={styles.inputGroup}>
          <div className={styles.inputHeader}>
            <span>From</span>
          </div>
          <div className={styles.inputRow}>
            <input type="number" placeholder="0.00" className={styles.amountInput}
              value={amountIn} onChange={e => { setAmountIn(e.target.value); calculateOut(e.target.value); }} />
            <select value={fromAsset} onChange={e => { setFromAsset(e.target.value); setAmountOut(''); }}
              className={styles.assetSelect}>
              {['VARA', 'BTC', 'ETH'].map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
        </div>

        <div className={styles.divider}>
          <div className={styles.arrowIcon}><ArrowDown size={20} /></div>
        </div>

        <div className={styles.inputGroup}>
          <div className={styles.inputHeader}>
            <span>To (Estimated)</span>
          </div>
          <div className={styles.inputRow}>
            <input type="number" placeholder="0.00" className={styles.amountInput} readOnly value={amountOut} />
            <select value={toAsset} onChange={e => setToAsset(e.target.value)}
              className={styles.assetSelect}>
              {['ETH', 'VARA', 'BTC'].map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {activePool && (
          <div className={styles.priceInfo}>
            <div className={styles.infoRow}>
              <span>Pool Reserves</span>
              <span>{activePool.asset_a}: {Number(activePool.reserve_a) / 10**8} / {activePool.asset_b}: {Number(activePool.reserve_b) / 10**8}</span>
            </div>
            <div className={styles.infoRow}>
              <span>Slippage Tolerance</span>
              <span>0.5%</span>
            </div>
          </div>
        )}
        {!activePool && pools.length > 0 && (
          <div className={styles.priceInfo}>
            <div className={styles.infoRow}>
              <span>No pool found for {fromAsset}/{toAsset}</span>
            </div>
          </div>
        )}

        <button className={styles.swapBtn} onClick={handleSwap}
          disabled={txLoading || !account || !activePool}>
          {txLoading ? 'Swapping...' : 'Swap'}
        </button>
        {!account && <div style={{ textAlign: 'center', marginTop: 8, color: 'var(--text-secondary)' }}>Connect wallet to swap</div>}
      </Card>

      <div className={styles.details}>
        <Card title="Available Pools">
          {pools.length === 0 && <div className={styles.infoRow} style={{ padding: 16 }}>No pools found</div>}
          {pools.map(p => (
            <div key={p.id.toString()} className={styles.infoRow} style={{ padding: '8px 16px' }}>
              <span>{p.asset_a} / {p.asset_b}</span>
              <span>TVL: ${(Number(p.reserve_a) + Number(p.reserve_b)) / 10**8}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
