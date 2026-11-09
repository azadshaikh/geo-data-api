const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomBytes } = require("node:crypto");

async function listFiles(root, prefix = "") {
  let entries;
  try {
    entries = await fs.readdir(path.join(root, prefix), { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" && !prefix) return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symbolic link in API output: ${relative}`);
    if (entry.isDirectory()) files.push(...await listFiles(root, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

function safePath(root, relative) {
  if (typeof relative !== "string" || !relative || relative.includes("\\") || relative.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`Invalid output path: ${relative}`);
  const target = path.resolve(root, ...relative.split("/"));
  const checked = path.relative(root, target);
  if (!checked || checked === ".." || checked.startsWith(`..${path.sep}`) || path.isAbsolute(checked)) {
    throw new Error(`Output path escapes API directory: ${relative}`);
  }
  return target;
}

async function preserveExtras(output, stage, generatedPaths) {
  const existing = await listFiles(output);
  let previous = null;
  try {
    previous = JSON.parse(await fs.readFile(path.join(output, "manifest.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error(`Cannot read existing API manifest: ${error.message}`);
  }
  const managed = new Map();
  if (previous) {
    if (!Array.isArray(previous.files)) throw new Error("Existing API manifest has no file list");
    const listed = new Set();
    for (const file of previous.files) {
      safePath(output, file.path);
      const key = file.path.normalize("NFC").toLowerCase();
      if (listed.has(key)) throw new Error(`Existing manifest filename collision: ${file.path}`);
      listed.add(key);
      if (file.generated !== false) {
        managed.set(key, file.path);
      }
    }
  }
  const generated = new Map(generatedPaths.map((item) => [item.normalize("NFC").toLowerCase(), item]));
  const preserved = new Set();
  for (const relative of existing) {
    const key = relative.normalize("NFC").toLowerCase();
    if (key === "manifest.json") {
      if (relative !== "manifest.json") throw new Error(`Output filename collision: manifest.json and ${relative}`);
      continue;
    }
    if (managed.has(key)) {
      if (managed.get(key) !== relative) throw new Error(`Output filename collision: ${managed.get(key)} and ${relative}`);
      continue;
    }
    if (generated.has(key)) {
      if (previous) throw new Error(`Generated output conflicts with preserved file: ${relative}`);
      if (generated.get(key) !== relative) throw new Error(`Output filename collision: ${generated.get(key)} and ${relative}`);
      continue;
    }
    const destination = safePath(stage, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(safePath(output, relative), destination);
    preserved.add(relative);
  }
  return preserved;
}

async function describeFiles(root, preserved = new Set()) {
  const result = [];
  for (const relative of await listFiles(root)) {
    if (relative === "manifest.json") continue;
    const bytes = await fs.readFile(safePath(root, relative));
    result.push({
      path: relative,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      generated: !preserved.has(relative),
    });
  }
  return result;
}

async function sameTrees(left, right) {
  const leftFiles = await listFiles(left);
  const rightFiles = await listFiles(right);
  if (leftFiles.length !== rightFiles.length || leftFiles.some((f, i) => f !== rightFiles[i])) return false;
  for (const relative of leftFiles) {
    if (!(await fs.readFile(safePath(left, relative))).equals(await fs.readFile(safePath(right, relative)))) return false;
  }
  return true;
}

async function publishStage(stage, output, { retainBackup = false } = {}) {
  const parent = path.dirname(output);
  const base = path.basename(output);
  if (path.dirname(stage) !== parent || !path.basename(stage).startsWith(`.${base}-stage-`)) throw new Error("Unexpected staging directory");
  let exists = false;
  try {
    const stat = await fs.lstat(output);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("API output must be a real directory");
    exists = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (exists && await sameTrees(stage, output)) {
    await fs.rm(stage, { recursive: true, force: true });
    return false;
  }
  const backup = path.join(parent, `.${base}-backup-${randomBytes(6).toString("hex")}`);
  if (path.dirname(backup) !== parent || !path.basename(backup).startsWith(`.${base}-backup-`)) throw new Error("Unexpected backup directory");
  if (exists) await fs.rename(output, backup);
  try {
    await fs.rename(stage, output);
  } catch (error) {
    if (exists) await fs.rename(backup, output);
    throw error;
  }
  if (exists && retainBackup) {
    console.log(`✓ Retained pre-manifest output backup: ${backup}`);
  } else if (exists) {
    try { await fs.rm(backup, { recursive: true, force: true }); }
    catch (error) { console.warn(`The new output was published, but its backup could not be removed: ${backup} (${error.message})`); }
  }
  return true;
}

module.exports = { listFiles, safePath, preserveExtras, describeFiles, publishStage };
