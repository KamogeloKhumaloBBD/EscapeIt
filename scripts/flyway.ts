import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const supportedCommands = new Set(["info", "migrate", "validate"]);
const command = process.argv[2] ?? "info";
const usesRailway = process.argv.includes("--railway");
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

function railwayFlyway() {
  const connectionString = process.env.DATABASE_PUBLIC_URL;

  if (connectionString === undefined) {
    throw new Error(
      "DATABASE_PUBLIC_URL is required. Run this command through `railway run --service Postgres`.",
    );
  }

  const databaseUrl = new URL(connectionString);

  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error("DATABASE_PUBLIC_URL must use a PostgreSQL scheme.");
  }

  const jdbcUrl = new URL(
    `postgresql://${databaseUrl.hostname}:${databaseUrl.port || "5432"}${databaseUrl.pathname}`,
  );
  jdbcUrl.searchParams.set("sslmode", "require");

  return spawn(
    "docker",
    [
      "run",
      "--rm",
      "-e",
      "FLYWAY_LOCATIONS",
      "-e",
      "FLYWAY_PASSWORD",
      "-e",
      "FLYWAY_URL",
      "-e",
      "FLYWAY_USER",
      "-v",
      `${migrationsDirectory}:/flyway/migrations:ro`,
      "redgate/flyway:12.6.0",
      command,
    ],
    {
      env: {
        ...process.env,
        FLYWAY_LOCATIONS: "filesystem:/flyway/migrations",
        FLYWAY_PASSWORD: decodeURIComponent(databaseUrl.password),
        FLYWAY_URL: `jdbc:${jdbcUrl.toString()}`,
        FLYWAY_USER: decodeURIComponent(databaseUrl.username),
      },
      stdio: "inherit",
    },
  );
}

const flyway = usesRailway
  ? railwayFlyway()
  : spawn("docker", ["compose", "run", "--rm", "flyway", command], {
      stdio: "inherit",
    });

flyway.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
