import { app } from './app.js';
import { env } from './config/env.js';
import { connectDatabase } from './config/database.js';

const startServer = async () => {
  const connection = await connectDatabase();

  if (connection) {
    console.log('MongoDB connected ✅');
  } else {
    console.warn('MONGODB_URI is not set; starting backend without a database connection.');
  }

  app.listen(env.port, () => {
    console.log(`Dyslexia backend listening on port ${env.port}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});