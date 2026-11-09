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
  ["https://example.test/docs/index.html", "https://example.test/api/v1/"],
  [
    "https://example.test/project/docs/guides.html",
    "https://example.test/project/api/v1/",
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
      "https://example.test/project/api/v1/",
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
  const base = "https://example.test/project/api/v1/";
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
  const base = "https://example.test/project/api/v1/";
  const run = exampleContext({
    [`${base}countries.json`]: { data: [{ name: "Country" }] },
    [`${base}states/country/us.json`]: { data: [{ name: "State" }] },
    [`${base}cities/state/us-ca.json`]: { data: [{ name: "City" }] },
  });
  await vm.runInContext(example("guides.html", "picker-code"), run.context);
  assert.deepEqual(run.requests, [
    `${base}countries.json`,
    `${base}states/country/us.json`,
    `${base}cities/state/us-ca.json`,
  ]);
  assert.equal(run.logged[0].cities[0].name, "City");
});

test("the city search example folds accents and reuses the country shard", async () => {
  const url =
    "https://example.test/project/api/v1/search/cities/country/br.json";
  const run = exampleContext({
    [url]: {
      data: [
        { name: "São Paulo", name_normalized: "sao paulo" },
        { name: "Rio", name_normalized: "rio" },
      ],
    },
  });
  await vm.runInContext(example("guides.html", "search-code"), run.context);
  assert.equal(run.logged[0][0].name, "São Paulo");
  const second = await vm.runInContext(
    'searchBrazilianCities("Rio")',
    run.context,
  );
  assert.equal(second[0].name, "Rio");
  assert.deepEqual(run.requests, [url]);
});

test("the city search example can retry a failed shard request", async () => {
  let attempts = 0;
  const context = vm.createContext({
    URL,
    fetch: async () => {
      attempts += 1;
      return attempts === 1
        ? { ok: false, status: 503 }
        : {
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
  assert.equal(attempts, 2);
});

test("the city lookup example follows the index filename and handles ID gaps", async () => {
  const base = "https://example.test/project/api/v1/";
  const run = exampleContext({
    [`${base}cities/batches.json`]: {
      data: [
        {
          start_id: 57990,
          end_id: 58000,
          filename: "cities/batch/example.json",
        },
      ],
    },
    [`${base}cities/batch/example.json`]: {
      data: { 57995: { name: "Bhopal" } },
    },
  });
  await vm.runInContext(example("guides.html", "lookup-code"), run.context);
  assert.equal(run.logged[0].name, "Bhopal");
  assert.equal(await vm.runInContext("getCity(57996)", run.context), null);
  assert.ok(run.requests.includes(`${base}cities/batch/example.json`));
});
