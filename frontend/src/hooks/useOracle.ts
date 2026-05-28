import { useState, useCallback } from 'react';
import { useSails } from './useSails';
import { web3FromSource } from '@polkadot/extension-dapp';

export function useOracle(symbol: string) {
  const { program, account } = useSails();
  const [priceData, setPriceData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPrice = useCallback(async () => {
    if (!program || !account) return;
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

  return {
    priceData,
    loading,
    refresh: fetchPrice,
  };
}
