const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function openDocs(page, clipboard) {
  const script = fs.readFileSync(
    path.join(__dirname, "../docs/docs.js"),
    "utf8",
  );
  const base = { textContent: "" };
  const code = { textContent: "const example = true;" };
  const button = {
    dataset: { copyTarget: "example" },
    addEventListener(name, listener) {
      if (name === "click") this.click = listener;
    },
    focus() {},
  };
  vm.runInNewContext(script, {
    window: { location: { href: page } },
    URL,
    navigator: { clipboard },
    document: {
      querySelectorAll(selector) {
        if (selector === "[data-api-base]") return [base];
        if (selector === "[data-copy-target]") return [button];
        return [];
      },
      getElementById() {
        return code;
      },
      createElement() {
        return { style: {}, setAttribute() {}, select() {}, remove() {} };
      },
      body: { appendChild() {} },
      execCommand() {
        return false;
      },
    },
  });
  return { base, code, button };
}

for (const [page, expected] of [
  ["https://example.test/docs/index.html", "https://example.test/api/v2/"],
  [
    "https://example.test/project/docs/guides.html",
    "https://example.test/project/api/v2/",
  ],
]) {
  test(`documentation examples use the deployment API base at ${page}`, () => {
    assert.equal(openDocs(page).base.textContent, expected);
  });
}

test("documentation copy buttons copy the displayed example", async () => {
  const copied = [];
  const docs = openDocs("https://example.test/docs/index.html", {
    writeText: async (text) => copied.push(text),
  });
  await docs.button.click();
  assert.deepEqual(copied, [docs.code.textContent]);
  assert.equal(docs.button.textContent, "Copied");
});

test("documentation offers manual copying when clipboard access fails", async () => {
  const docs = openDocs("http://example.test/docs/index.html");
  await docs.button.click();
  assert.equal(docs.button.textContent, "Select code to copy");
});

function example(file, id) {
  const html = fs.readFileSync(path.join(__dirname, "../docs", file), "utf8");
  const match = html.match(new RegExp(`<code id="${id}">([\\s\\S]*?)</code>`));
  assert.ok(match, `example ${id} exists`);
  return match[1]
    .replace(
      /<span data-api-base>[\s\S]*?<\/span>/g,
      "https://example.test/project/api/v2/",
    )
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function exampleContext(fixtures) {
  const requests = [];
  const logged = [];
  const context = vm.createContext({
    URL,
    fetch: async (url) => {
      const href = String(url);
      requests.push(href);
      assert.ok(Object.hasOwn(fixtures, href), `unexpected request ${href}`);
      if (fixtures[href] === null) return { ok: false, status: 404 };
      return { ok: true, json: async () => fixtures[href] };
    },
    console: {
      log: (value) => logged.push(value),
      error: (error) => {
        throw error;
      },
    },
  });
  return { context, requests, logged };
}

test("the getting started example fetches countries from the deployed API", async () => {
  const base = "https://example.test/project/api/v2/";
  const run = exampleContext({
    [`${base}countries.json`]: { data: [{ name: "Example" }] },
  });
  await vm.runInContext(
    example("index.html", "first-request-code"),
    run.context,
  );
  assert.deepEqual(run.requests, [`${base}countries.json`]);
  assert.equal(run.logged[0][0].name, "Example");
});

test("the picker example requests the country, state, and city lists", async () => {
  const base = "https://example.test/project/api/v2/";
  const run = exampleContext({
    [`${base}countries.json`]: { data: [{ name: "Country" }] },
    [`${base}countries/us/states.json`]: {
      data: [{ name: "State", path_key: "id-2312" }],
    },
    [`${base}countries/us/states/id-2312/cities.json`]: {
      data: [{ name: "City" }],
    },
  });
  await vm.runInContext(example("guides.html", "picker-code"), run.context);
  assert.deepEqual(run.requests, [
    `${base}countries.json`,
    `${base}countries/us/states.json`,
    `${base}countries/us/states/id-2312/cities.json`,
  ]);
  assert.equal(run.logged[0].cities[0].name, "City");
});

test("the city search example loads every page and reuses them", async () => {
  const base = "https://example.test/project/api/v2/";
  const run = exampleContext({
    [`${base}countries/br/cities/index.json`]: {
      data: [
        { filename: "countries/br/cities/1.json", count: 1 },
        { filename: "countries/br/cities/2.json", count: 1 },
      ],
    },
    [`${base}countries/br/cities/1.json`]: {
      data: [{ name: "São Paulo", name_normalized: "sao paulo" }],
    },
    [`${base}countries/br/cities/2.json`]: {
      data: [{ name: "Rio", name_normalized: "rio" }],
    },
  });
  await vm.runInContext(example("guides.html", "search-code"), run.context);
  assert.equal(run.logged[0][0].name, "São Paulo");
  const second = await vm.runInContext(
    'searchBrazilianCities("Rio")',
    run.context,
  );
  assert.equal(second[0].name, "Rio");
  assert.deepEqual(run.requests, [
    `${base}countries/br/cities/index.json`,
    `${base}countries/br/cities/1.json`,
    `${base}countries/br/cities/2.json`,
  ]);
});

test("the city search example retries a failed country index", async () => {
  let attempts = 0;
  const context = vm.createContext({
    URL,
    fetch: async (url) => {
      attempts += 1;
      if (attempts === 1) return { ok: false, status: 503 };
      if (String(url).endsWith("index.json"))
        return {
          ok: true,
          json: async () => ({
            data: [{ filename: "countries/br/cities/1.json", count: 1 }],
          }),
        };
      return {
        ok: true,
        json: async () => ({ data: [{ name_normalized: "sao paulo" }] }),
      };
    },
    console,
  });
  const source = example("guides.html", "search-code").replace(
    'searchBrazilianCities("Sao Paulo").then(console.log).catch(console.error);',
    "",
  );
  vm.runInContext(source, context);
  await assert.rejects(
    vm.runInContext('searchBrazilianCities("sao")', context),
    /503/,
  );
  assert.equal(
    (await vm.runInContext('searchBrazilianCities("sao")', context)).length,
    1,
  );
  assert.equal(attempts, 3);
});

test("the city lookup example fetches a direct file and handles missing IDs", async () => {
  const base = "https://example.test/project/api/v2/";
  const run = exampleContext({
    [`${base}cities/57995.json`]: { data: { id: 57995, name: "Bhopal" } },
    [`${base}cities/57996.json`]: null,
  });
  await vm.runInContext(example("guides.html", "lookup-code"), run.context);
  assert.equal(run.logged[0].name, "Bhopal");
  assert.equal(await vm.runInContext("getCity(57996)", run.context), null);
  assert.deepEqual(run.requests, [
    `${base}cities/57995.json`,
    `${base}cities/57996.json`,
  ]);
});
