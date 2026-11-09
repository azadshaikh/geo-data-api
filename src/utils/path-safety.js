const fs = require("node:fs/promises");
const path = require("node:path");

// Resolve existing ancestors too: the requested output may not exist yet.
async function canonicalPath(target, realpath = fs.realpath) {
  let current = path.resolve(target);
  const suffix = [];
  while (true) {
    try { return path.join(await realpath(current), ...suffix); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      suffix.unshift(path.basename(current));
      current = parent;
    }
  }
}

async function assertSafeLocations(inputDir, outputDir, cwd = process.cwd(), resolve = canonicalPath) {
  const [input, output, workingDirectory] = await Promise.all([resolve(inputDir), resolve(outputDir), resolve(cwd)]);
  const inside = (child, parent) => {
    const relative = path.relative(parent, child);
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };
  if (inside(input, output) || inside(output, input) || inside(workingDirectory, output)) {
    throw new Error("Output directory must not contain the working directory or overlap the input directory");
  }
}

module.exports = { canonicalPath, assertSafeLocations };
