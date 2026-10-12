import { app } from './app.js';
import { env } from './config/env.js';
import { connectDatabase } from './config/database.js';

const startServer = async () => {
  await connectDatabase();

  app.listen(env.port, () => {
    console.log(`Dyscalculia backend listening on port ${env.port}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
