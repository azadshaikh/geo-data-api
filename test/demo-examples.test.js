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
    "https://example.test/project/api/v1/",
  );
});

test("country-scoped city search folds diacritics and reuses its shard", async () => {
  const { createGeoClient } = require("../demo/examples");
  const requests = [];
  const client = createGeoClient(
    "https://example.test/project/api/v1/",
    async (url) => {
      requests.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 1,
              name: "São Paulo",
              name_normalized: "sao paulo",
              state_name: "São Paulo",
            },
            {
              id: 2,
              name: "Rio de Janeiro",
              name_normalized: "rio de janeiro",
              state_name: "Rio de Janeiro",
            },
          ],
        }),
      };
    },
  );
  const first = await client.searchCities("BR", "sao paulo");
  assert.equal(first.matches[0].name, "São Paulo");
  assert.equal(first.total, 1);
  await client.searchCities("br", "rio");
  assert.deepEqual(requests, [
    "https://example.test/project/api/v1/search/cities/country/br.json",
  ]);
});

test("a country without a search shard returns an empty result", async () => {
  const { createGeoClient } = require("../demo/examples");
  const client = createGeoClient("https://example.test/api/v1/", async () => ({
    ok: false,
    status: 404,
  }));
  const result = await client.searchCities("EX", "town");
  assert.equal(result.total, 0);
  assert.deepEqual(result.matches, []);
});

test("a failed request can be retried", async () => {
  const { createGeoClient } = require("../demo/examples");
  let attempts = 0;
  const client = createGeoClient("https://example.test/api/v1/", async () => {
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

test("city lookup follows the batch index and handles gaps", async () => {
  const { createGeoClient } = require("../demo/examples");
  const requests = [];
  const responses = {
    "cities/batches.json": {
      data: [
        { start_id: 10, end_id: 20, filename: "cities/batch/batch-10-20.json" },
      ],
    },
    "cities/batch/batch-10-20.json": {
      data: { 12: { id: 12, name: "Example City" } },
    },
  };
  const client = createGeoClient(
    "https://example.test/project/api/v1/",
    async (url) => {
      requests.push(url);
      const key = url.split("/api/v1/")[1];
      return { ok: true, status: 200, json: async () => responses[key] };
    },
  );
  assert.equal((await client.lookupCity("12")).city.name, "Example City");
  assert.equal((await client.lookupCity("13")).city, null);
  assert.deepEqual(requests, [
    "https://example.test/project/api/v1/cities/batches.json",
    "https://example.test/project/api/v1/cities/batch/batch-10-20.json",
  ]);
  await assert.rejects(client.lookupCity("not-an-id"), /valid.*id/i);
});

test("city lookup refuses a batch filename that escapes the API root", async () => {
  const { createGeoClient } = require("../demo/examples");
  const client = createGeoClient(
    "https://example.test/project/api/v1/",
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ start_id: 1, end_id: 2, filename: "../../private.json" }],
      }),
    }),
  );
  await assert.rejects(client.lookupCity("1"), /invalid.*path/i);
});

test("the displayed lookup example runs using the batch index path", async () => {
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
      const data = url.pathname.endsWith("/cities/batches.json")
        ? [
            {
              start_id: 10,
              end_id: 20,
              filename: "cities/batch/batch-10-20.json",
            },
          ]
        : { 12: { id: 12, name: "Example" } };
      return { json: async () => ({ data }) };
    },
    { href: "https://example.test/project/demo/demo.html" },
    URL,
  );
  assert.equal(result.name, "Example");
  assert.deepEqual(requested, [
    "https://example.test/project/api/v1/cities/batches.json",
    "https://example.test/project/api/v1/cities/batch/batch-10-20.json",
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
  for (const name of ["index.html", "_headers"])
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
