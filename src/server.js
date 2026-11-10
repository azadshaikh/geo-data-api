const cluster = require("node:cluster");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");

const outputDir = path.resolve("./dist");
const port = process.env.PORT || 3000;
const host = process.env.HOST || "127.0.0.1";
const SHUTDOWN_TIMEOUT_MS = 10_000;
const WORKER_RESTART_DELAY_MS = 1_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

function isOutside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

function isLegacyApiPath(value) {
  return /^\/?api\/v1(?:\/|$)/i.test(value.replace(/\\/g, "/"));
}

function setApiCacheHeaders(res) {
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function isCurrentApiPath(value) {
  return /^\/?api\/v2(?:\/|$)/i.test(value.replace(/\\/g, "/"));
}

function configuredWorkers() {
  const value = process.env.WEB_CONCURRENCY;
  if (value === undefined || value === "" || value === "1") return 1;
  if (value === "auto") return Math.max(1, os.availableParallelism());
  const workers = Number(value);
  if (!Number.isSafeInteger(workers) || workers < 1 || workers > 128) {
    throw new Error(
      'WEB_CONCURRENCY must be a positive integer up to 128, "auto", or unset',
    );
  }
  return workers;
}

async function serveRequest(root, req, res) {
  for (const [name, value] of Object.entries(corsHeaders))
    res.setHeader(name, value);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD, OPTIONS" });
    res.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(req.url.split("?", 1)[0]).replace(/\\/g, "/");
  } catch {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }

  if (
    !pathname.startsWith("/") ||
    pathname.includes("\0") ||
    pathname.split("/").includes("..")
  ) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // Keep an old local build recoverable without exposing it as part of v2.
  if (isLegacyApiPath(path.posix.normalize(pathname))) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  if (isCurrentApiPath(path.posix.normalize(pathname))) setApiCacheHeaders(res);

  try {
    const requested = path.resolve(
      root,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    if (isOutside(root, requested)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    // Resolve symlinks before reading so they cannot escape the output directory.
    const file = await fs.promises.realpath(requested);
    if (isOutside(root, file)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    if (isLegacyApiPath(path.relative(root, file))) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    if (isCurrentApiPath(path.relative(root, file))) setApiCacheHeaders(res);
    const stats = await fs.promises.stat(file);
    if (!stats.isFile()) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const contentType =
      mimeTypes[path.extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stats.size,
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    // Stream the file so concurrent requests do not buffer whole pages in memory.
    await pipeline(fs.createReadStream(file), res);
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const notFound = ["ENOENT", "ENOTDIR", "EISDIR", "ELOOP"].includes(
      error.code,
    );
    res.writeHead(notFound ? 404 : 500);
    res.end(notFound ? "Not Found" : "Internal Server Error");
  }
}

async function createServer() {
  const root = await fs.promises.realpath(outputDir).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    throw new Error(
      `Serving directory not found: ${outputDir}. Run \`npm run build\` first.`,
    );
  });
  const server = http.createServer((req, res) => {
    serveRequest(root, req, res).catch((error) => {
      console.error("❌ Request failed:", error.message);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return server;
}

function printBanner(workers) {
  console.log("");
  console.log("🚀 Geo-Data API Server");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📡 Server running at: http://localhost:${port}`);
  console.log(`📁 Serving files from: ./dist folder`);
  if (workers > 1) console.log(`🧵 Workers: ${workers} (multi-core)`);
  console.log("");
  console.log("📖 Available URLs:");
  console.log(`   🏠 Homepage:      http://localhost:${port}`);
  console.log(
    `   🎮 Playground:    http://localhost:${port}/playground/index.html`,
  );
  console.log(
    `   🌍 Countries:     http://localhost:${port}/api/v2/countries.json`,
  );
  console.log(
    `   🏛️  States:        http://localhost:${port}/api/v2/states/all.json`,
  );
  console.log(
    `   🏙️  Cities (US):   http://localhost:${port}/api/v2/countries/us/cities/index.json`,
  );
  console.log(
    `   🏙️  Cities (CA):   http://localhost:${port}/api/v2/countries/us/states/ca/cities.json`,
  );
  console.log(
    `   🔍 Search:        http://localhost:${port}/api/v2/search/countries.json`,
  );
  console.log("");
  console.log("💡 Tips:");
  console.log("   • Use Ctrl+C to stop the server");
  console.log("   • All API endpoints support CORS");
  console.log("   • Try the interactive playground for API testing");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
}

function installSingleProcessShutdown(server) {
  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log("\n");
    console.log(`👋 Shutting down server (${signal})...`);
    server.close(() => {
      console.log("✅ Server stopped successfully");
      process.exit(0);
    });
    server.closeIdleConnections();
    const timer = setTimeout(() => {
      server.closeAllConnections();
      process.exit(0);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
}

function installWorkerShutdown(server) {
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    const timer = setTimeout(() => {
      server.closeAllConnections();
      process.exit(0);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("message", (message) => {
    if (message?.type === "shutdown") stop();
  });
  // If the primary disappears, do not leave orphaned workers behind.
  process.on("disconnect", stop);
}

function startPrimary(workerCount) {
  let announced = false;
  let shuttingDown = false;
  let exitTimer;

  const workersDone = () => Object.keys(cluster.workers).length === 0;

  const finish = () => {
    clearTimeout(exitTimer);
    console.log("✅ Server stopped successfully");
    process.exit(0);
  };

  const announce = () => {
    if (announced) return;
    announced = true;
    printBanner(workerCount);
  };

  const spawnWorker = () => {
    const worker = cluster.fork();
    worker.on("message", (message) => {
      if (message?.type === "ready") announce();
    });
    worker.on("exit", (code, signal) => {
      if (shuttingDown) {
        if (workersDone()) finish();
        return;
      }
      console.error(
        `❌ Worker ${worker.process.pid} exited (${signal ?? code}); restarting`,
      );
      setTimeout(spawnWorker, WORKER_RESTART_DELAY_MS);
    });
  };

  for (let index = 0; index < workerCount; index++) spawnWorker();

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n");
    console.log(`👋 Shutting down server (${signal})...`);
    if (workersDone()) {
      finish();
      return;
    }
    for (const worker of Object.values(cluster.workers)) {
      if (worker.isConnected()) worker.send({ type: "shutdown" });
    }
    exitTimer = setTimeout(() => {
      for (const worker of Object.values(cluster.workers))
        worker.process.kill("SIGKILL");
      finish();
    }, SHUTDOWN_TIMEOUT_MS);
    exitTimer.unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function startSingleProcess() {
  const server = await createServer();
  installSingleProcessShutdown(server);
  printBanner(1);
}

async function startWorker() {
  const server = await createServer();
  installWorkerShutdown(server);
  if (process.send) process.send({ type: "ready" });
}

async function main() {
  const workerCount = configuredWorkers();
  // Cluster only when the file is executed directly; requiring it (for example
  // from a test harness) always starts one in-process server.
  if (cluster.isPrimary && require.main === module && workerCount > 1) {
    startPrimary(workerCount);
    return;
  }
  if (cluster.isWorker) {
    await startWorker();
    return;
  }
  await startSingleProcess();
}

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err.message);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
