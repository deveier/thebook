export function toBigInt(v: any): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(v);
  if (typeof v === 'string') return BigInt(v);
  if (v?.toString) return BigInt(v.toString());
  return 0n;
}

export function toPair(v: any): [bigint, bigint] {
  if (Array.isArray(v)) return [toBigInt(v[0]), toBigInt(v[1])];
  if (v && typeof v === 'object') return [toBigInt((v as any)[0] || (v as any).price), toBigInt((v as any)[1] || (v as any).qty)];
  return [0n, 0n];
}

export function toTradesArray(result: any): any[] {
  if (!result) return [];
  if (Array.isArray(result)) return result.map((t: any) => ({
    id: t?.[0]?.toString() || '0',
    price: toBigInt(t?.[1]),
    qty: toBigInt(t?.[2]),
    buyer: t?.[3]?.toString?.() || '',
    seller: t?.[4]?.toString?.() || '',
    time: new Date().toLocaleTimeString(),
  }));
  return [];
}
