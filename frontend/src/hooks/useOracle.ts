import { useEffect, useState, useCallback, useRef } from 'react';
import { useSails } from './useSails';
import { web3FromSource } from '@polkadot/extension-dapp';

export function useOracle(symbol: string) {
  const { program, account, isReady } = useSails();
  const [priceData, setPriceData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const lastFetchRef = useRef(0);

  const fetchPrice = useCallback(async (force = false) => {
    if (!program || !account) return;
    const now = Date.now();
    if (!force && now - lastFetchRef.current < 30000) return;
    lastFetchRef.current = now;

    setLoading(true);
    try {
      const { signer } = await web3FromSource(account.meta.source);
      const transaction = program.orderbook.getLivePrice(symbol);
      await transaction.withAccount(account.address, { signer }).withValue(0n).calculateGas();
      const { response } = await transaction.signAndSend();
      const result = await response();
      if (result && typeof result === 'object' && 'ok' in result) {
        setPriceData(result.ok);
      }
    } catch (e) {
      console.error(`Failed to fetch oracle price for ${symbol}:`, e);
    } finally {
      setLoading(false);
    }
  }, [program, account, symbol]);

  useEffect(() => {
    if (isReady && account) {
      fetchPrice();
      const interval = setInterval(() => fetchPrice(), 60000);
      return () => clearInterval(interval);
    }
  }, [isReady, account, fetchPrice]);

  return {
    priceData,
    loading,
    refresh: () => fetchPrice(true),
  };
}
