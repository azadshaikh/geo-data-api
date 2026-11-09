const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const config = require("../src/config");
const FileUtils = require("../src/utils/file-utils");

async function withOutput(t) {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "geo-write-"));
  const previous = config.OUTPUT_DIR;
  config.OUTPUT_DIR = output;
  t.after(async () => {
    if (FileUtils.endOutputTracking) FileUtils.endOutputTracking();
    config.OUTPUT_DIR = previous;
    await fs.rm(output, { recursive: true, force: true });
  });
  return output;
}

test("unchanged JSON is not rewritten", async (t) => {
  const output = await withOutput(t);
  await FileUtils.writeJSON("data.json", { data: [1] });
  const file = path.join(output, "data.json");
  const fixedTime = new Date("2020-01-01T00:00:00.000Z");
  await fs.utimes(file, fixedTime, fixedTime);
  await FileUtils.writeJSON("data.json", { data: [1] });
  assert.equal((await fs.stat(file)).mtimeMs, fixedTime.getTime());
});

test("serialization failure leaves the existing JSON intact", async (t) => {
  const output = await withOutput(t);
  await FileUtils.writeJSON("data.json", { data: [1] });
  await assert.rejects(
    FileUtils.writeJSON("data.json", { data: 1n }),
    TypeError,
  );
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(output, "data.json"), "utf8")),
    { data: [1] },
  );
});

test("output tracking rejects case-insensitive filename collisions", async (t) => {
  await withOutput(t);
  FileUtils.beginOutputTracking();
  await FileUtils.writeJSON("group/Example.json", { data: [1] });
  await assert.rejects(
    FileUtils.writeJSON("group/example.json", { data: [2] }),
    { code: "OUTPUT_PATH_COLLISION" },
  );
  assert.throws(() => FileUtils.assertNoOutputCollisions(), {
    code: "OUTPUT_PATH_COLLISION",
  });
});

test("generated paths cannot escape the output directory", async (t) => {
  const output = await withOutput(t);
  const name = `${path.basename(output)}-escape.json`;
  t.after(() => fs.rm(path.join(path.dirname(output), name), { force: true }));
  await assert.rejects(FileUtils.writeJSON(`../${name}`, { data: [] }), {
    code: "OUTPUT_PATH_OUTSIDE_ROOT",
  });
});
