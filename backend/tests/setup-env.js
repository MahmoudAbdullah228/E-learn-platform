process.env.NODE_ENV = 'test';
process.env.MONGO_URI ||= 'mongodb://127.0.0.1:27017/e_learning_platform';
process.env.MONGO_TEST_URI ||= 'mongodb://127.0.0.1:27017/e_learning_platform_test';
process.env.CORS_ORIGINS ||= 'http://localhost:5173';
process.env.BCRYPT_ROUNDS ||= '10';
process.env.LOG_LEVEL ||= 'fatal';
