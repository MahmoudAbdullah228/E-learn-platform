export function splitCourseRevenue(amountMinor, commissionBps = 2000) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0
      || !Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10_000) {
    throw new TypeError('Valid integer amount and commission are required');
  }
  const platformAmountMinor = Number(BigInt(amountMinor) * BigInt(commissionBps) / 10_000n);
  return { commissionBps, platformAmountMinor,
    instructorAmountMinor: amountMinor - platformAmountMinor };
}
