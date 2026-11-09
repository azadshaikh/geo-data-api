const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  listFiles,
  preserveExtras,
  publishStage,
} = require("../src/utils/build-output");
const {
  canonicalPath,
  assertSafeLocations,
} = require("../src/utils/path-safety");

test("lists a directory with more than 150,000 city files", async () => {
  const originalReaddir = fs.readdir;
  const root = path.resolve("large-output-fixture");
  const file = (name) => ({
    name,
    isSymbolicLink: () => false,
    isDirectory: () => false,
    isFile: () => true,
  });
  fs.readdir = async (directory) =>
    directory === root
      ? [
          {
            name: "cities",
            isSymbolicLink: () => false,
            isDirectory: () => true,
          },
        ]
      : Array.from({ length: 151165 }, (_, id) => file(`${id}.json`));
  try {
    const files = await listFiles(root);
    assert.equal(files.length, 151165);
    assert.ok(files.includes("cities/0.json"));
    assert.ok(files.includes("cities/151164.json"));
  } finally {
    fs.readdir = originalReaddir;
  }
});

test("a newly generated path cannot overwrite a previously preserved file", async (t) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "geo-preserved-conflict-"),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const output = path.join(root, "old");
  const stage = path.join(root, "stage");
  const name = "cities/country/ex/index.json";
  for (const directory of [output, stage])
    await fs.mkdir(path.join(directory, "cities/country/ex"), {
      recursive: true,
    });
  await fs.writeFile(path.join(output, name), "my custom file");
  await fs.writeFile(path.join(stage, name), "generated content");
  await fs.writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify({ files: [{ path: name, generated: false }] }),
  );
  await assert.rejects(
    preserveExtras(output, stage, [name]),
    /preserved|user|conflict/i,
  );
  assert.equal(
    await fs.readFile(path.join(output, name), "utf8"),
    "my custom file",
  );
});

test("a case-variant of a previously managed filename is not discarded", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "geo-preserved-case-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const output = path.join(root, "old");
  const stage = path.join(root, "stage");
  await fs.mkdir(output);
  await fs.mkdir(stage);
  await fs.writeFile(path.join(output, "My-Note.txt"), "user data");
  await fs.writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify({ files: [{ path: "my-note.txt", generated: true }] }),
  );
  await assert.rejects(
    preserveExtras(output, stage, []),
    /collision|conflict/i,
  );
  assert.equal(
    await fs.readFile(path.join(output, "My-Note.txt"), "utf8"),
    "user data",
  );
});

test("a legacy output can be kept as a recoverable sibling backup", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "geo-legacy-backup-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const output = path.join(root, "v1");
  const stage = path.join(root, ".v1-stage-test");
  await fs.mkdir(output);
  await fs.mkdir(stage);
  await fs.writeFile(path.join(output, "important.txt"), "old data");
  await fs.writeFile(path.join(stage, "important.txt"), "new data");
  await publishStage(stage, output, { retainBackup: true });
  const backup = (await fs.readdir(root)).find((name) =>
    name.startsWith(".v1-backup-"),
  );
  assert.ok(backup);
  assert.equal(
    await fs.readFile(path.join(root, backup, "important.txt"), "utf8"),
    "old data",
  );
  assert.equal(
    await fs.readFile(path.join(output, "important.txt"), "utf8"),
    "new data",
  );
});

test("resolves an existing symlink ancestor before checking output overlap", async () => {
  const root = path.resolve("test-virtual-root");
  const alias = path.resolve("test-virtual-alias");
  const missing = () =>
    Object.assign(new Error("not found"), { code: "ENOENT" });
  const fakeRealpath = async (target) => {
    if (target === alias) return root;
    throw missing();
  };
  assert.equal(
    await canonicalPath(path.join(alias, "db", "new"), fakeRealpath),
    path.join(root, "db", "new"),
  );
  await assert.rejects(
    assertSafeLocations(
      path.join(root, "db"),
      path.join(alias, "db", "new"),
      path.join(root, "work"),
      async (target) => {
        if (target.startsWith(alias)) return target.replace(alias, root);
        return target;
      },
    ),
    /overlap/i,
  );
});
