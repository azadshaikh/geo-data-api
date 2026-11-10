const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const serverScript = path.resolve(__dirname, "../src/server.js");
let root;
let port;
let server;
let output = "";

function request(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: pathname, method: "GET" },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function availablePort() {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const chosen = reservation.address().port;
  await new Promise((resolve, reject) =>
    reservation.close((err) => (err ? reject(err) : resolve())),
  );
  return chosen;
}

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "geo-data-cluster-"));
  await fs.mkdir(path.join(root, "dist"), { recursive: true });
  await fs.writeFile(path.join(root, "dist", "index.html"), "<h1>Geo API</h1>");
  port = await availablePort();
  server = spawn(process.execPath, [serverScript], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      WEB_CONCURRENCY: "2",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Cluster server did not start: ${output}`)),
      15000,
    );
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes("Server running")) {
        clearTimeout(timer);
        resolve();
      }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
    server.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Cluster server exited with ${code}: ${output}`));
    });
  });
});

after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await exited;
  }
  if (root) await fs.rm(root, { recursive: true, force: true });
});

test("reports the configured worker count in the startup banner", () => {
  assert.match(output, /Workers: 2 \(multi-core\)/);
});

test("serves concurrent requests through the worker pool", async () => {
  const responses = await Promise.all(
    Array.from({ length: 24 }, () => request("/index.html")),
  );
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(response.body.toString(), "<h1>Geo API</h1>");
    assert.equal(response.headers["access-control-allow-origin"], "*");
  }
});

test("rejects an invalid WEB_CONCURRENCY value", () => {
  const result = spawnSync(process.execPath, [serverScript], {
    cwd: root,
    env: { ...process.env, WEB_CONCURRENCY: "many" },
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /WEB_CONCURRENCY/);
});
