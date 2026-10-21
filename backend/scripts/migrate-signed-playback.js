import { z } from 'zod';

import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { assertTransactionSupport } from '../src/config/transactions.js';
import { VideoPlaybackLease } from '../src/models/VideoPlaybackLease.js';
import { createVideoService } from '../src/modules/video/video.service.js';
import { muxVideoProvider } from '../src/services/muxVideo.service.js';
import { migrateSignedPlayback } from '../src/services/signedPlaybackMigration.service.js';

const args = process.argv.slice(2);
const optionsSchema = z.object({ apply: z.boolean(),
  after: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50) });

try {
  if (args.some(value => value !== '--apply' && !/^--(after|limit)=/.test(value))) {
    throw new Error('Unsupported migration option');
  }
  const options = optionsSchema.parse({ apply: args.includes('--apply'),
    after: args.find(value => value.startsWith('--after='))?.slice(8),
    limit: args.find(value => value.startsWith('--limit='))?.slice(8) });
  await connectDatabase();
  await assertTransactionSupport();
  await VideoPlaybackLease.init();
  const result = await migrateSignedPlayback({ ...options, provider: muxVideoProvider,
    videoService: createVideoService({ videoProvider: muxVideoProvider }) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!options.apply) process.stdout.write('Dry run: --apply removes public playback IDs. Review impact first.\n');
  if (result.failed > 0) process.exitCode = 1;
} catch {
  process.stderr.write('Signed playback migration failed. Check configuration and retry the same page.\n');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
