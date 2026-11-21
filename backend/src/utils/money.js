export function splitCourseRevenue(amountMinor, commissionBps = 2000) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0
      || !Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10_000) {
    throw new TypeError('Valid integer amount and commission are required');
  }
  const platformAmountMinor = Number(BigInt(amountMinor) * BigInt(commissionBps) / 10_000n);
  return { commissionBps, platformAmountMinor,
    instructorAmountMinor: amountMinor - platformAmountMinor };
}

// Validate every input, but check range only after the exact sum. Intermediate sums can
// exceed Number's safe range and later cancel out without losing a minor unit.
export function sumMinorUnits(amounts) {
  if (!Array.isArray(amounts)) throw new TypeError('An array of integer amounts is required');
  let total = 0n;
  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount)) throw new TypeError('Amounts must be safe integers');
    total += BigInt(amount);
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Financial total exceeds safe integer limits');
  }
  return Number(total);
}
