import { Card } from '../components/ui/Card';
import { ArrowDown } from 'lucide-react';
import styles from './SwapView.module.css';
import { useState, useCallback } from 'react';
import { useSails } from '../hooks/useSails';
import { useToast } from '../components/ui/Toast';
import { parseContractError } from '../lib/errors';
import { useTxStatus, TxStatusOverlay } from '../components/ui/TxStatus';
import { EmptyState } from '../components/ui/EmptyState';
import { useMarketData } from '../providers/MarketDataProvider';

export function SwapView() {
  const { program, account } = useSails();
  const { pools, loading: marketLoading, pricesStale } = useMarketData();
  const [fromAsset, setFromAsset] = useState('VARA');
  const [toAsset, setToAsset] = useState('ETH');
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [slippage, setSlippage] = useState(0.5);
  const { success, error } = useToast();
  const { txState, executeTx, resetTx } = useTxStatus();

  const availAssets = [...new Set(pools.flatMap(p => [p.asset_a, p.asset_b]))];

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
    if (pricesStale) {
      error('Oracle price is stale. Refresh prices from the ticker or TradeView first.');
      return;
    }
    const parsedIn = parseFloat(amountIn);
    const parsedOut = parseFloat(amountOut);
    if (isNaN(parsedIn) || parsedIn <= 0) return;
    const slippageMultiplier = (100 - slippage) / 100;
    const minOutValue = isNaN(parsedOut) || parsedOut <= 0 ? 0n : BigInt(Math.round(parsedOut * 10**8 * slippageMultiplier));
    const inAmount = BigInt(Math.round(parsedIn * 10**8));
    const minOut = minOutValue;

    const err = await executeTx(
      () => program!.amm.swap(activePool.id, fromAsset as Asset, inAmount, minOut),
      account,
      () => {
        setAmountIn('');
        setAmountOut('');
        success('Swap executed!');
      }
    );

    if (err) {
      error(parseContractError(err));
    }
  };

  return (
    <>
      <div className={styles.container}>
        <Card title="Swap Tokens" className={styles.swapCard}>
          <div className={styles.inputGroup}>
            <div className={styles.inputHeader}>
              <span>From</span>
            </div>
            <div className={styles.inputRow}>
              <input type="number" placeholder="0.00" className={styles.amountInput}
                value={amountIn} onChange={e => { setAmountIn(e.target.value); calculateOut(e.target.value); }}
                aria-label="Amount to swap from" />
              <select value={fromAsset} onChange={e => { setFromAsset(e.target.value); setAmountOut(''); }}
                className={styles.assetSelect} aria-label="From asset">
                {availAssets.map(a => <option key={a}>{a}</option>)}
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
              <input type="number" placeholder="0.00" className={styles.amountInput} readOnly value={amountOut}
                aria-label="Estimated amount to receive" />
              <select value={toAsset} onChange={e => setToAsset(e.target.value)}
                className={styles.assetSelect} aria-label="To asset">
                {availAssets.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.slippageRow}>
            <span>Slippage Tolerance</span>
            <div className={styles.slippageOptions}>
              {[0.1, 0.5, 1.0].map(s => (
                <button key={s}
                  className={`${styles.slippageBtn} ${slippage === s ? styles.slippageActive : ''}`}
                  onClick={() => setSlippage(s)}>
                  {s}%
                </button>
              ))}
              <input type="number" value={slippage} onChange={e => setSlippage(parseFloat(e.target.value) || 0.5)}
                className={styles.slippageInput} min={0.01} max={50} step={0.1}
                aria-label="Custom slippage percentage" />
            </div>
          </div>

          {activePool && (
            <div className={styles.priceInfo}>
              <div className={styles.infoRow}>
                <span>Pool Reserves</span>
                <span>{activePool.asset_a}: {Number(activePool.reserve_a) / 10**8} / {activePool.asset_b}: {Number(activePool.reserve_b) / 10**8}</span>
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
            disabled={txState.visible && txState.stage !== 'failed' && txState.stage !== 'confirmed' || !account || !activePool}>
            {txState.stage === 'broadcasting' || txState.stage === 'confirming' ? 'Swapping...' : 'Swap'}
          </button>
          {!account && <div style={{ textAlign: 'center', marginTop: 8, color: 'var(--text-secondary)' }}>Connect wallet to swap</div>}
        </Card>

        <div className={styles.details}>
          <Card title="Available Pools">
            {pools.length === 0 && (
              <EmptyState
                title={marketLoading ? 'Loading...' : 'No Pools Found'}
                description={marketLoading ? 'Fetching pool data...' : 'Visit the Pools page to create the first liquidity pool.'}
              />
            )}
            {pools.map(p => (
              <div key={p.id.toString()} className={styles.infoRow} style={{ padding: '8px 16px' }}>
                <span>{p.asset_a} / {p.asset_b}</span>
                <span>TVL: ${(Number(p.reserve_a) + Number(p.reserve_b)) / 10**8}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <TxStatusOverlay state={txState} onClose={resetTx} />
    </>
  );
}
