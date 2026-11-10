const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
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
let symlinkAvailable = false;
let legacySymlinkAvailable = false;
let currentSymlinkAvailable = false;
let boundAddress;

function request(url, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: url, method },
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
  root = await fs.mkdtemp(path.join(os.tmpdir(), "geo-data-server-"));
  await fs.mkdir(path.join(root, "dist", "api"), { recursive: true });
  await fs.writeFile(path.join(root, "dist", "index.html"), "<h1>Geo API</h1>");
  await fs.writeFile(
    path.join(root, "dist", "api", "sample.json"),
    '{"data":[1]}',
  );
  await fs.mkdir(path.join(root, "dist", "api", "v1"), { recursive: true });
  await fs.writeFile(
    path.join(root, "dist", "api", "v1", "old.json"),
    '{"old":true}',
  );
  await fs.mkdir(path.join(root, "dist", "api", "v2"), { recursive: true });
  await fs.writeFile(
    path.join(root, "dist", "api", "v2", "sample.json"),
    '{"data":[]}',
  );
  await fs.writeFile(
    path.join(root, "dist", "image.png"),
    Buffer.from([0, 255, 127, 10]),
  );
  await fs.writeFile(path.join(root, "private.txt"), "private content");
  try {
    await fs.symlink(root, path.join(root, "dist", "outside-link"), "junction");
    symlinkAvailable = true;
  } catch (error) {
    if (!["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) throw error;
  }
  try {
    await fs.symlink(
      path.join(root, "dist", "api", "v2"),
      path.join(root, "dist", "current-alias"),
      "junction",
    );
    currentSymlinkAvailable = true;
  } catch (error) {
    if (!["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) throw error;
  }
  try {
    await fs.symlink(
      path.join(root, "dist", "api", "v1"),
      path.join(root, "dist", "legacy-alias"),
      "junction",
    );
    legacySymlinkAvailable = true;
  } catch (error) {
    if (!["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) throw error;
  }

  port = await availablePort();
  const environment = { ...process.env, PORT: String(port) };
  delete environment.HOST;
  delete environment.WEB_CONCURRENCY;
  const observeAddress = `
    const http = require("node:http");
    const listen = http.Server.prototype.listen;
    http.Server.prototype.listen = function (...args) {
      this.once("listening", () => console.log("BOUND_ADDRESS=" + this.address().address));
      return listen.apply(this, args);
    };
    require(process.argv[1]);
  `;
  server = spawn(process.execPath, ["-e", observeAddress, serverScript], {
    cwd: root,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error(`Server did not start: ${output}`)),
      5000,
    );
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes("Server running")) {
        boundAddress = output.match(/BOUND_ADDRESS=([^\r\n]+)/)?.[1];
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
      reject(new Error(`Server exited with ${code}: ${output}`));
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

test("binds to the local interface by default", () => {
  assert.equal(boundAddress, "127.0.0.1");
});

test("serves generated JSON with a query string", async () => {
  const response = await request("/api/sample.json?version=1");
  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(response.body), { data: [1] });
  assert.equal(response.headers["access-control-allow-origin"], "*");
});

test("serves the homepage and binary files without changing their content", async () => {
  const homepage = await request("/");
  assert.equal(homepage.status, 200);
  assert.equal(homepage.body.toString(), "<h1>Geo API</h1>");
  const image = await request("/image.png");
  assert.equal(image.headers["content-type"], "image/png");
  assert.deepEqual(image.body, Buffer.from([0, 255, 127, 10]));
});

test("answers HEAD requests without a response body", async () => {
  const response = await request("/api/sample.json", "HEAD");
  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "application/json");
  assert.equal(
    response.headers["content-length"],
    String(Buffer.byteLength('{"data":[1]}')),
  );
  assert.equal(response.body.length, 0);
});

test("does not expose a preserved old API output", async () => {
  const response = await request("/api/v1/old.json");
  assert.equal(response.status, 404);
  assert.doesNotMatch(response.body.toString(), /old/);
});

test("does not expose old API output through alternate paths", async (t) => {
  for (const pathname of [
    "/./api/v1/old.json",
    "//api/v1/old.json",
    "/%2e/api/v1/old.json",
  ]) {
    const response = await request(pathname);
    assert.equal(response.status, 404, pathname);
  }
  if (legacySymlinkAvailable) {
    const response = await request("/legacy-alias/old.json");
    assert.equal(response.status, 404);
  } else {
    t.diagnostic("Symlink alias check unavailable on this machine");
  }
});

test("requires revalidation for mutable v2 API URLs", async () => {
  const paths = [
    "/api/v2/sample.json",
    "/./api/v2/sample.json",
    "//api/v2/sample.json",
  ];
  if (currentSymlinkAvailable) paths.push("/current-alias/sample.json");
  for (const pathname of paths) {
    const response = await request(pathname);
    assert.equal(response.status, 200);
    assert.match(response.headers["cache-control"], /max-age=0/);
    assert.match(response.headers["cache-control"], /must-revalidate/);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
  }
});

test("rejects traversal outside the generated output", async () => {
  const response = await request("/../private.txt");
  assert.ok(
    [403, 404].includes(response.status),
    `unexpected status ${response.status}`,
  );
  assert.doesNotMatch(response.body.toString(), /private content/);
});

test("rejects encoded traversal outside the generated output", async () => {
  const response = await request("/%2e%2e%2fprivate.txt");
  assert.ok(
    [403, 404].includes(response.status),
    `unexpected status ${response.status}`,
  );
  assert.doesNotMatch(response.body.toString(), /private content/);
});

test("rejects malformed URL encoding", async () => {
  const response = await request("/%zz");
  assert.equal(response.status, 400);
});

test("does not follow a symlink outside the generated output", async (t) => {
  if (!symlinkAvailable)
    return t.skip("creating symlinks is not permitted on this machine");
  const response = await request("/outside-link/private.txt");
  assert.ok(
    [403, 404].includes(response.status),
    `unexpected status ${response.status}`,
  );
  assert.doesNotMatch(response.body.toString(), /private content/);
});

test("rejects methods other than GET, HEAD, and OPTIONS", async () => {
  const response = await request("/api/sample.json", "POST");
  assert.equal(response.status, 405);
});

test("answers CORS preflight requests without sending a file", async () => {
  const response = await request("/api/sample.json", "OPTIONS");
  assert.equal(response.status, 204);
  assert.equal(response.headers["access-control-allow-origin"], "*");
  assert.equal(response.body.length, 0);
});
