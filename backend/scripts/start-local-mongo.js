import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import mongoose from 'mongoose';

// Dedicated loopback-only development instance; never reconfigure the system service.
const directory = fileURLToPath(new URL('../.local/mongodb/', import.meta.url));
await mkdir(directory, { recursive: true });
const child = spawn(process.env.MONGOD_BINARY || 'mongod', [
  '--dbpath', directory, '--port', '27018', '--bind_ip', '127.0.0.1',
  '--replSet', 'elearnLocal', '--logpath', `${directory}/mongod.log`, '--logappend',
], { detached: true, stdio: 'ignore', windowsHide: true });
child.on('error', () => {
  process.stderr.write('Cannot start mongod. Set MONGOD_BINARY to its installed executable.\n');
  process.exitCode = 1;
});
child.unref();

const client = new mongoose.mongo.MongoClient(
  'mongodb://127.0.0.1:27018/?directConnection=true',
  { serverSelectionTimeoutMS: 2000 },
);
try {
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      await client.connect();
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await delay(500);
    }
  }
  const admin = client.db('admin');
  const hello = await admin.command({ hello: 1 });
  if (hello.setName && hello.setName !== 'elearnLocal') {
    throw new Error('Unexpected replica set on port 27018');
  }
  if (!hello.setName) {
    await admin.command({ replSetInitiate: {
      _id: 'elearnLocal', members: [{ _id: 0, host: '127.0.0.1:27018' }],
    } });
  }
  while (!(await admin.command({ hello: 1 })).isWritablePrimary) {
    if (Date.now() >= deadline) throw new Error('Replica set election timed out');
    await delay(500);
  }
  process.stdout.write('Local replica set ready at 127.0.0.1:27018 (elearnLocal).\n');
} catch {
  process.stderr.write('Local replica set setup failed. Check .local/mongodb/mongod.log and port 27018.\n');
  process.exitCode = 1;
} finally {
  await client.close();
}
