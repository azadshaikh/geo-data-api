const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const demo = fs.readFileSync(path.join(__dirname, "../demo/demo.html"), "utf8");

test("the demo offers multiple examples and uses Tailwind v3's CDN", () => {
  assert.match(demo, /https:\/\/cdn\.tailwindcss\.com/);
  assert.match(demo, /Location picker/i);
  assert.match(demo, /City search/i);
  assert.match(demo, /City lookup/i);
  assert.doesNotMatch(demo, /bootstrap@/i);
});

test("demo API paths resolve relative to the deployed project", () => {
  const { apiBaseUrl } = require("../demo/examples");
  assert.equal(
    apiBaseUrl("https://example.test/project/demo/demo.html"),
    "https://example.test/project/api/v2/",
  );
});

test("country-scoped search follows every page, folds accents, and caches requests", async () => {
  const { createGeoClient } = require("../demo/examples");
  const base = "https://example.test/project/api/v2/";
  const fixtures = {
    [`${base}countries/br/cities/index.json`]: {
      data: [
        { filename: "countries/br/cities/1.json", count: 1 },
        { filename: "countries/br/cities/2.json", count: 1 },
      ],
    },
    [`${base}countries/br/cities/1.json`]: {
      data: [{ id: 1, name: "São Paulo", name_normalized: "sao paulo" }],
    },
    [`${base}countries/br/cities/2.json`]: {
      data: [
        { id: 2, name: "Rio de Janeiro", name_normalized: "rio de janeiro" },
      ],
    },
  };
  const requests = [];
  const client = createGeoClient(base, async (url) => {
    requests.push(url);
    assert.ok(Object.hasOwn(fixtures, url), `unexpected request ${url}`);
    return { ok: true, status: 200, json: async () => fixtures[url] };
  });
  assert.equal(
    (await client.searchCities("BR", "sao paulo")).matches[0].name,
    "São Paulo",
  );
  assert.equal(
    (await client.searchCities("br", "rio")).matches[0].name,
    "Rio de Janeiro",
  );
  assert.deepEqual(requests, [
    `${base}countries/br/cities/index.json`,
    `${base}countries/br/cities/1.json`,
    `${base}countries/br/cities/2.json`,
  ]);
});

test("an empty country index returns no cities and a missing index reports 404", async () => {
  const { createGeoClient } = require("../demo/examples");
  const empty = createGeoClient("https://example.test/api/v2/", async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [] }),
  }));
  assert.equal((await empty.searchCities("EX", "town")).total, 0);
  const missing = createGeoClient("https://example.test/api/v2/", async () => ({
    ok: false,
    status: 404,
  }));
  await assert.rejects(missing.searchCities("EX", "town"), /404/);
});

test("city search handles an empty page and reports a missing page", async () => {
  const { createGeoClient } = require("../demo/examples");
  const client = createGeoClient(
    "https://example.test/api/v2/",
    async (url) => {
      if (url.endsWith("/index.json"))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ filename: "countries/ex/cities/1.json", count: 0 }],
          }),
        };
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    },
  );
  assert.deepEqual((await client.searchCities("EX", "town")).matches, []);
  const missing = createGeoClient(
    "https://example.test/api/v2/",
    async (url) =>
      url.endsWith("/index.json")
        ? {
            ok: true,
            status: 200,
            json: async () => ({
              data: [{ filename: "countries/ex/cities/1.json", count: 1 }],
            }),
          }
        : { ok: false, status: 404 },
  );
  await assert.rejects(missing.searchCities("EX", "town"), /404/);
});

test("a failed request can be retried", async () => {
  const { createGeoClient } = require("../demo/examples");
  let attempts = 0;
  const client = createGeoClient("https://example.test/api/v2/", async () => {
    attempts++;
    return attempts === 1
      ? { ok: false, status: 503 }
      : { ok: true, status: 200, json: async () => ({ data: [] }) };
  });
  await assert.rejects(client.countries(), /503/);
  assert.deepEqual(await client.countries(), []);
  assert.equal(attempts, 2);
});

test("the search example exposes a retry after the country list fails", async (t) => {
  const previous = { document: global.document, window: global.window };
  t.after(() => {
    global.document = previous.document;
    global.window = previous.window;
  });
  const element = (dataset = {}) => ({
    dataset,
    listeners: {},
    children: [],
    textContent: "",
    value: "",
    hidden: false,
    disabled: false,
    addEventListener(name, listener) {
      this.listeners[name] = listener;
    },
    setAttribute() {},
    focus() {},
    replaceChildren() {
      this.children = [];
    },
    append(...items) {
      this.children.push(...items);
    },
    get options() {
      return this.children;
    },
  });
  const ids = [
    "search-country",
    "search-query",
    "search-button",
    "search-status",
    "search-results",
    "search-endpoint",
    "search-code",
    "search-form",
    "search-retry",
    "lookup-id",
    "lookup-button",
    "lookup-status",
    "lookup-result",
    "lookup-endpoint",
    "lookup-form",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, element()]));
  elements["search-query"].value = "Sao Paulo";
  elements["search-retry"].hidden = true;
  const tabs = ["address", "search", "lookup"].map((name) =>
    element({ exampleTab: name }),
  );
  const panels = ["address", "search", "lookup"].map((name) =>
    element({ examplePanel: name }),
  );
  let countryRequests = 0;
  global.document = {
    getElementById: (id) => elements[id],
    createElement: () => element(),
    querySelectorAll: (selector) =>
      selector === "[data-example-tab]"
        ? tabs
        : selector === "[data-example-panel]"
          ? panels
          : [],
  };
  global.window = {
    location: { href: "https://example.test/project/demo/demo.html" },
    fetch: async (url) => {
      if (url.endsWith("/countries.json")) {
        countryRequests++;
        return countryRequests === 1
          ? { ok: false, status: 503 }
          : {
              ok: true,
              status: 200,
              json: async () => ({ data: [{ name: "Brazil", iso2: "BR" }] }),
            };
      }
      if (url.endsWith("/cities/index.json"))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ filename: "countries/br/cities/1.json", count: 1 }],
          }),
        };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 1, name: "São Paulo", name_normalized: "sao paulo" }],
        }),
      };
    },
  };
  require("../demo/examples").initDemo();
  tabs[1].listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements["search-retry"].hidden, false);
  elements["search-retry"].listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(countryRequests, 2);
  assert.equal(elements["search-retry"].hidden, true);
  assert.match(elements["search-status"].textContent, /1 match/);
});

test("city lookup fetches one detail file and handles missing IDs", async () => {
  const { createGeoClient } = require("../demo/examples");
  const requests = [];
  const client = createGeoClient(
    "https://example.test/project/api/v2/",
    async (url) => {
      requests.push(url);
      return url.endsWith("/cities/12.json")
        ? {
            ok: true,
            status: 200,
            json: async () => ({ data: { id: 12, name: "Example City" } }),
          }
        : { ok: false, status: 404 };
    },
  );
  assert.equal((await client.lookupCity("12")).city.name, "Example City");
  assert.equal((await client.lookupCity("13")).city, null);
  assert.deepEqual(requests, [
    "https://example.test/project/api/v2/cities/12.json",
    "https://example.test/project/api/v2/cities/13.json",
  ]);
  await assert.rejects(client.lookupCity("not-an-id"), /valid.*id/i);
});

test("city lookup rejects path-like IDs before making a request", async () => {
  const { createGeoClient } = require("../demo/examples");
  const client = createGeoClient(
    "https://example.test/project/api/v2/",
    async () => {
      throw new Error("Unexpected request");
    },
  );
  await assert.rejects(client.lookupCity("../../private"), /valid.*id/i);
});

test("the displayed lookup example fetches the direct city file", async () => {
  const snippet = demo
    .match(/<code id="lookup-code">([\s\S]*?)<\/code>/)[1]
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const example = new AsyncFunction(
    "fetch",
    "location",
    "URL",
    `${snippet}\nreturn getCity(12);`,
  );
  const requested = [];
  const result = await example(
    async (url) => {
      requested.push(url.href);
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 12, name: "Example" } }),
      };
    },
    { href: "https://example.test/project/demo/demo.html" },
    URL,
  );
  assert.equal(result.name, "Example");
  assert.deepEqual(requested, [
    "https://example.test/project/api/v2/cities/12.json",
  ]);
});

test("the demo build copies the page and its scripts", (t) => {
  const project = path.resolve(__dirname, "..");
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "geo-demo-build-"));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  fs.cpSync(path.join(project, "src"), path.join(output, "src"), {
    recursive: true,
  });
  fs.cpSync(path.join(project, "demo"), path.join(output, "demo"), {
    recursive: true,
  });
  for (const name of ["index.html", "404.html", "_headers"])
    fs.copyFileSync(path.join(project, name), path.join(output, name));
  const result = spawnSync(process.execPath, ["src/demo-copier.js"], {
    cwd: output,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    fs.readFileSync(path.join(output, "dist/index.html")),
    fs.readFileSync(path.join(project, "index.html")),
  );
  for (const name of ["demo.html", "contact.js", "examples.js"]) {
    assert.deepEqual(
      fs.readFileSync(path.join(output, "dist/demo", name)),
      fs.readFileSync(path.join(project, "demo", name)),
    );
  }
});
