import { z } from 'zod';

import { payoutStatuses } from '../../models/Payout.js';
import { financialIdSchema, financialKeySchema } from '../finance/finance.schemas.js';

const month = z.string().regex(/^[2-9]\d{3}-(0[1-9]|1[0-2])$/).refine(value => value !== '9999-12');
const isoCutoff = z.iso.datetime().refine(value => !/\.\d{4,}Z$/.test(value), 'Cutoff supports milliseconds');
const cutoffAt = isoCutoff.transform(value => new Date(value));
const cairoCalendar = new Intl.DateTimeFormat('en', {
  timeZone: 'Africa/Cairo', year: 'numeric', month: 'numeric', calendar: 'gregory', numberingSystem: 'latn',
});

// Find the first UTC instant in the local month, including a skipped/repeated midnight.
function cairoMonthStart(year, monthIndex) {
  const utc = Date.UTC(year, monthIndex, 1);
  const target = year * 12 + monthIndex;
  let low = utc - 86_400_000;
  let high = utc + 86_400_000;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const parts = cairoCalendar.formatToParts(mid);
    const localYear = Number(parts.find(part => part.type === 'year').value);
    const localMonth = Number(parts.find(part => part.type === 'month').value);
    if (localYear * 12 + localMonth - 1 >= target) high = mid;
    else low = mid + 1;
  }
  return new Date(low);
}

export const payoutPeriodSchema = z.object({ month, cutoffAt }).strict().transform(value => {
  const [year, monthNumber] = value.month.split('-').map(Number);
  const periodStart = cairoMonthStart(year, monthNumber - 1);
  const periodEnd = cairoMonthStart(year, monthNumber);
  return { periodStart, periodEnd, cutoffAt: value.cutoffAt };
}).refine(value => value.cutoffAt >= value.periodStart && value.cutoffAt <= value.periodEnd,
  { path: ['cutoffAt'], message: 'Cutoff must be within the selected Cairo month or at its end boundary' });

export const createPayoutSchema = z.object({ instructorId: financialIdSchema, month, cutoffAt: isoCutoff }).strict();
export const payoutKeySchema = financialKeySchema;
export const payoutIdSchema = z.object({ payoutId: financialIdSchema }).strict();
export const instructorIdSchema = z.object({ instructorId: financialIdSchema }).strict();
export const emptyQuerySchema = z.object({}).strict();
export const payoutListSchema = z.object({
  instructorId: financialIdSchema.optional(),
  status: z.enum(payoutStatuses).optional(),
  cursor: z.string().max(1024).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/).optional(),
  limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().int().max(100)).optional().default(20),
}).strict();
