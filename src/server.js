const http = require("http");
const fs = require("fs");
const path = require("path");

const outputDir = path.resolve("./dist");
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

const server = http.createServer(async (req, res) => {
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

  try {
    const root = await fs.promises.realpath(outputDir);
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
    const content = await fs.promises.readFile(file);
    const contentType =
      mimeTypes[path.extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch (error) {
    const notFound = ["ENOENT", "ENOTDIR", "EISDIR", "ELOOP"].includes(
      error.code,
    );
    res.writeHead(notFound ? 404 : 500);
    res.end(notFound ? "Not Found" : "Internal Server Error");
  }
});

const port = process.env.PORT || 3000;
const host = process.env.HOST || "127.0.0.1";

server.listen(port, host, () => {
  console.log("");
  console.log("🚀 Geo-Data API Server");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📡 Server running at: http://localhost:${port}`);
  console.log(`📁 Serving files from: ./dist folder`);
  console.log("");
  console.log("📖 Available URLs:");
  console.log(`   🏠 Homepage:      http://localhost:${port}`);
  console.log(`   🎮 Demo:          http://localhost:${port}/demo/demo.html`);
  console.log(
    `   🌍 Countries:     http://localhost:${port}/api/v1/countries.json`,
  );
  console.log(
    `   🏛️  States:        http://localhost:${port}/api/v1/states/all.json`,
  );
  console.log(
    `   🏙️  Cities (US):   http://localhost:${port}/api/v1/cities/country/us.json`,
  );
  console.log(
    `   🏙️  Cities (CA):   http://localhost:${port}/api/v1/cities/state/us-ca.json`,
  );
  console.log(
    `   🔍 Search:        http://localhost:${port}/api/v1/search/countries.json`,
  );
  console.log("");
  console.log("💡 Tips:");
  console.log("   • Use Ctrl+C to stop the server");
  console.log("   • All API endpoints support CORS");
  console.log("   • Try the interactive demo for API testing");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n");
  console.log("👋 Shutting down server...");
  console.log("✅ Server stopped successfully");
  process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err.message);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});
