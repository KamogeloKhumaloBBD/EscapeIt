import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

const startupTimeoutMs = 10_000;
const shutdownTimeoutMs = 5_000;

async function availablePort() {
  const server = createServer();
  server.unref();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
  if (address === null || typeof address === "string") {
    throw new Error("Could not allocate a smoke-test port.");
  }
  return address.port;
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const forcedExit = setTimeout(() => child.kill("SIGKILL"), shutdownTimeoutMs);
  forcedExit.unref();
  await once(child, "exit");
  clearTimeout(forcedExit);
}

async function smoke(name, entry, expectedMessage, environment) {
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";

  const started = new Promise((resolve, reject) => {
    const capture = (chunk) => {
      output += chunk.toString();
      if (output.includes(expectedMessage)) resolve();
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.once("exit", (code, signal) => {
      reject(
        new Error(
          `${name} exited before listening (code=${String(code)}, signal=${String(signal)}).\n${output}`,
        ),
      );
    });
  });

  const startupTimeout = setTimeout(() => {
    child.kill("SIGKILL");
  }, startupTimeoutMs);
  startupTimeout.unref();

  try {
    await started;
    console.log(`${name} bundle started successfully.`);
  } finally {
    clearTimeout(startupTimeout);
    await stop(child);
  }
}

const databaseEnvironment = {
  CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  DATABASE_SSL_MODE: "disable",
  DATABASE_URL: "postgres://smoke:smoke@127.0.0.1:1/context_layer",
  NODE_ENV: "production",
};

const apiPort = await availablePort();
await smoke("API", "apps/api/dist/server.js", "Context Layer API listening", {
  ...databaseEnvironment,
  AUTH_EMAIL_FROM: "smoke@example.com",
  BETTER_AUTH_SECRET: "smoke-test-secret-that-is-at-least-32-characters",
  BETTER_AUTH_URL: `http://127.0.0.1:${apiPort}`,
  PORT: String(apiPort),
  PUBLIC_APP_URL: "http://127.0.0.1:3000",
  RESEND_API_KEY: "smoke-test",
});

const mcpPort = await availablePort();
await smoke("MCP", "apps/mcp/dist/server.js", "Context Layer MCP listening", {
  ...databaseEnvironment,
  PORT: String(mcpPort),
  PUBLIC_APP_URL: "http://127.0.0.1:3000",
});
