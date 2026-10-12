import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const parseOrigins = (value) => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

export const env = {
  port: Number(process.env.PORT || 4001),
  nodeEnv,
  mongodbUri: process.env.MONGODB_URI || '',
  mongodbDbName: process.env.MONGODB_DB_NAME || '',
  requireMongodb: process.env.REQUIRE_MONGODB === 'true',
  dnsServers: (process.env.DNS_SERVERS || '')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean),
  clientOrigins: parseOrigins(process.env.CLIENT_ORIGIN),
  // Vercel injects this for the Express-to-Flask service binding. Keep the
  // localhost fallback for local development only, so a production binding
  // mistake is reported instead of silently targeting a non-existent server.
  mlServiceUrl: process.env.ML_SERVICE_URL
    || (isProduction ? '' : `http://127.0.0.1:${process.env.ML_PORT || 4002}`),
};

export { isProduction };
