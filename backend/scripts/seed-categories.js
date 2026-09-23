import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { logger } from '../src/config/logger.js';
import { seedCategories } from '../src/services/seed.service.js';

try {
  await connectDatabase();
  const categories = await seedCategories();
  logger.info({ count: categories.length }, 'Categories ensured');
} finally {
  await disconnectDatabase();
}
