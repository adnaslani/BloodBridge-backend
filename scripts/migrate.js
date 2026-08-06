const fs = require("fs/promises");
const path = require("path");
const pool = require("../src/config/database");

async function migrate() {
  const migrationDirectory = path.join(__dirname, "..", "db", "migrations");
  const files = (await fs.readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  for (const file of files) {
    const alreadyApplied = await pool.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [file]);
    if (alreadyApplied.rowCount > 0) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(await fs.readFile(path.join(migrationDirectory, file), "utf8"));
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    console.log(`Applied ${file}`);
  }
  await pool.end();
}

migrate().catch(async (error) => {
  console.error("Migration failed:", error.message);
  await pool.end();
  process.exitCode = 1;
});