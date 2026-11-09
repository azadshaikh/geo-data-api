const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const pages = [
  ["index.html", "home"],
  ["demo/demo.html", "playground"],
  ["docs/index.html", "docs"],
  ["docs/endpoints.html", "docs"],
  ["docs/guides.html", "docs"],
];
const destinations = {
  home: "https://example.test/project/",
  playground: "https://example.test/project/demo/demo.html",
  docs: "https://example.test/project/docs/index.html",
  github: "https://github.com/azadshaikh/geo-data-api",
};

for (const [file, active] of pages) {
  test(`${file} exposes the same navigation on desktop and mobile under a subpath`, () => {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    const header = html.match(/<header\b[\s\S]*?<\/header>/i)?.[0];
    assert.ok(header, "main header exists");
    assert.match(header, /<details\b/i, "mobile menu works without JavaScript");
    assert.match(header, /<summary\b/i, "mobile menu has a visible control");
    for (const [name, destination] of Object.entries(destinations)) {
      const tags = [...header.matchAll(/<a\b[^>]*>/gi)]
        .map((match) => match[0])
        .filter((tag) => tag.includes(`data-nav="${name}"`));
      assert.equal(tags.length, 2, `${name} is available in both menus`);
      for (const tag of tags) {
        const href = tag.match(/href="([^"]+)"/)?.[1];
        assert.equal(
          new URL(href, `https://example.test/project/${file}`).href,
          destination,
        );
        assert.equal(/aria-current="page"/.test(tag), name === active);
      }
    }
  });
}

test("the website build includes the documentation pages and their assets", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "geo-site-build-"));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  for (const directory of ["src", "demo", "docs"]) {
    fs.cpSync(path.join(root, directory), path.join(output, directory), {
      recursive: true,
    });
  }
  for (const name of ["index.html", "_headers"]) {
    fs.copyFileSync(path.join(root, name), path.join(output, name));
  }
  const result = spawnSync(process.execPath, ["src/demo-copier.js"], {
    cwd: output,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  for (const name of [
    "index.html",
    "endpoints.html",
    "guides.html",
    "docs.js",
    "docs.css",
  ]) {
    assert.deepEqual(
      fs.readFileSync(path.join(output, "dist/docs", name)),
      fs.readFileSync(path.join(root, "docs", name)),
    );
  }
});

test("internal page and section links remain valid under a deployment subpath", () => {
  for (const [file] of pages) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)) {
      const url = new URL(match[1], `https://example.test/project/${file}`);
      if (
        url.origin !== "https://example.test" ||
        url.pathname.startsWith("/project/api/")
      )
        continue;
      assert.ok(
        url.pathname.startsWith("/project/"),
        `${file}: ${match[1]} escapes the deployment`,
      );
      let relative = url.pathname.slice("/project/".length);
      if (!relative || relative.endsWith("/")) relative += "index.html";
      const target = path.join(root, relative);
      assert.ok(fs.existsSync(target), `${file}: missing ${match[1]}`);
      if (url.hash) {
        const targetHtml = fs.readFileSync(target, "utf8");
        assert.ok(
          targetHtml.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),
          `${file}: missing ${match[1]} section`,
        );
      }
    }
  }
});
