import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  server: {
    port: parseInt(optional('PORT', '3000'), 10),
    env: optional('NODE_ENV', 'development'),
  },
  db: {
    host: optional('DB_HOST', 'localhost'),
    port: parseInt(optional('DB_PORT', '5432'), 10),
    name: optional('DB_NAME', 'nationx'),
    user: optional('DB_USER', 'postgres'),
    password: optional('DB_PASSWORD', 'password'),
  },
  jwt: {
    secret: optional('JWT_SECRET', 'change-me-in-production'),
    expiresIn: optional('JWT_EXPIRES_IN', '7d'),
  },
  game: {
    tickIntervalMs: parseInt(optional('TICK_INTERVAL_MS', '60000'), 10),
    startingMoney: parseInt(optional('STARTING_MONEY', '10000'), 10),
    startingPopulation: parseInt(optional('STARTING_POPULATION', '1000000'), 10),
    maxKnowledgeLevel: parseInt(optional('MAX_KNOWLEDGE_LEVEL', '100'), 10),
  },
} as const;
