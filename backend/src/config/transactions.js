import mongoose from 'mongoose';

export async function assertTransactionSupport(connection = mongoose.connection) {
  const hello = await connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    const error = new Error('MongoDB replica set or mongos is required');
    error.code = 'MONGODB_REPLICA_SET_REQUIRED';
    throw error;
  }
}
