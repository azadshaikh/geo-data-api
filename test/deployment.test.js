const assert = require("node:assert/strict");
const { test } = require("node:test");
const { commandsFor } = require("../scripts/s3-sync");

test("S3 sync uses explicit content encodings without deleting remote objects", () => {
  const commands = commandsFor("dist/api/v2", "s3://example-bucket/api/v2");
  assert.equal(commands.length, 3);
  assert.ok(
    commands.every(
      (args) => args.includes("--cache-control") && !args.includes("--delete"),
    ),
  );
  assert.equal(
    commands[1][commands[1].indexOf("--content-encoding") + 1],
    "gzip",
  );
  assert.equal(
    commands[2][commands[2].indexOf("--content-encoding") + 1],
    "br",
  );
  assert.throws(
    () => commandsFor("dist/api/v2", "https://example.com"),
    /s3:\/\//,
  );
});
