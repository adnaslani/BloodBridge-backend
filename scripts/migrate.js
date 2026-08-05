const fs = require("fs/promises");
const path = require("path");
const pool = require("../src/config/database");

async function migrate() {
  const migrationDirectory = path.join(__dirname, "..", "db", "migrations");
  const files = (await fs.readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    await pool.query(await fs.readFile(path.join(migrationDirectory, file), "utf8"));
    console.log(`Applied ${file}`);
  }
  await pool.end();
}

migrate().catch(async (error) => {
  console.error("Migration failed:", error.message);
  await pool.end();
  process.exitCode = 1;
});
