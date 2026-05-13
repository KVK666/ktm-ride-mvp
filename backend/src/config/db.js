const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;
const sslRequired =
  process.env.DATABASE_SSL === "true" ||
  (connectionString || "").includes("sslmode=require");

const pool = new Pool({
  connectionString,
  ssl: sslRequired ? { rejectUnauthorized: false } : undefined
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect()
};
