import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { migrateSprint2Content } from '../src/services/sprint2ContentMigration.service.js';

const apply = process.argv.includes('--apply');

try {
  await connectDatabase();
  const result = await migrateSprint2Content({ apply });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!apply && result.totalCandidates > 0) {
    process.stdout.write('Dry-run only. Re-run with --apply after reviewing these counts.\n');
  }
} catch {
  process.stderr.write('Sprint 2 content migration failed. Review safe application logs.\n');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
