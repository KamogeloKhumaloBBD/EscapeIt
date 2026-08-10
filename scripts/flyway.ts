import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const supportedCommands = new Set(["info", "migrate", "validate"]);
const command = process.argv[2] ?? "info";
const migrationsDirectory = path.join(
  process.cwd(),
  "packages",
  "db",
  "migrations",
);

if (!supportedCommands.has(command)) {
  throw new Error(`Unsupported Flyway command: ${command}`);
}

async function hasSqlMigrations(directory: string): Promise<boolean> {
  if (!existsSync(directory)) {
    return false;
  }

  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory() && (await hasSqlMigrations(entryPath))) {
      return true;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".sql")) {
      return true;
    }
  }

  return false;
}

if (!(await hasSqlMigrations(migrationsDirectory))) {
  console.warn(
    `No Flyway migrations exist in ${path.relative(process.cwd(), migrationsDirectory)}; database ${command} skipped.`,
  );
  process.exit(0);
}

const flyway = spawn("docker", ["compose", "run", "--rm", "flyway", command], {
  shell: process.platform === "win32",
  stdio: "inherit",
});

flyway.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
