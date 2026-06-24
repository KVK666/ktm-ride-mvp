const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;
const sslRequired =
  process.env.DATABASE_SSL === "true" ||
  (connectionString || "").includes("sslmode=require");

const pool = new Pool({
  connectionString,
  ssl: sslRequired ? { rejectUnauthorized: false } : undefined,
  max: Math.max(1, Number(process.env.DB_POOL_MAX) || 5),
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  keepAlive: true
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect()
};
