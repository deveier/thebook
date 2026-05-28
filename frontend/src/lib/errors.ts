export function parseContractError(e: unknown): string {
  if (e == null) return 'Unknown error';
  const msg = String(e);
  if (msg.includes('InsufficientUsd')) return 'Not enough USD balance';
  if (msg.includes('InsufficientAsset')) return 'Not enough balance of that asset';
  if (msg.includes('JoinFirst')) return 'Join the DEX first (click Join in header)';
  if (msg.includes('NotAuthorized')) return 'Not authorized';
  if (msg.includes('OrderNotFound')) return 'Order not found';
  if (msg.includes('OrderAlreadyDone')) return 'Order already filled or cancelled';
  if (msg.includes('NoLiquidity')) return 'Not enough liquidity';
  if (msg.includes('NoBuyers')) return 'No buyers available';
  if (msg.includes('PoolExists')) return 'Pool already exists';
  if (msg.includes('PoolNotFound')) return 'Pool not found';
  if (msg.includes('SameAssetPool')) return 'Cannot create pool with same asset';
  if (msg.includes('InsufficientLiquidity')) return 'Insufficient liquidity for swap';
  if (msg.includes('SlippageExceeded')) return 'Slippage tolerance exceeded';
  if (msg.includes('ZeroAmount')) return 'Amount must be greater than zero';
  if (msg.includes('AgentCallFailed')) return 'Oracle service unavailable, try again later';
  if (msg.includes('BadParams')) return 'Invalid parameters';
  if (msg.includes('InsufficientOracleCredit')) return 'Oracle budget depleted';
  if (msg.includes('pool') || msg.includes('Pool')) return 'Operation failed';
  return msg.length > 80 ? 'Transaction failed' : msg;
}
