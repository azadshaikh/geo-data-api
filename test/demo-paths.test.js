const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const demoHtml = fs.readFileSync(
  path.join(root, "playground/index.html"),
  "utf8",
);
const homepageHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const demoScript = fs.readFileSync(
  path.join(root, "playground/contact.js"),
  "utf8",
);
const quickStart = homepageHtml.match(
  /<pre[^>]*>\s*<code(?:\s[^>]*)?>([\s\S]*?)<\/code>\s*<\/pre>/,
)[1];

function element() {
  let value = "";
  let html = "";
  const el = {
    children: [],
    dataset: {},
    style: {},
    listeners: {},
    classList: {
      add() {},
      remove() {},
      contains() {
        return false;
      },
    },
    get value() {
      return value;
    },
    set value(next) {
      value = String(next);
    },
    get innerHTML() {
      return html;
    },
    set innerHTML(next) {
      html = next;
      this.children = [];
      value = "";
    },
    get selectedOptions() {
      return this.children.filter((child) => child.value === value);
    },
    appendChild(child) {
      this.children.push(child);
    },
    addEventListener(name, listener) {
      this.listeners[name] = listener;
    },
    querySelectorAll() {
      return [];
    },
    checkValidity() {
      return true;
    },
    scrollIntoView() {},
  };
  return el;
}

function runDemo(
  location,
  state = { id: 2, name: "Example State", iso3166_2: "EX-ES", path_key: "es" },
  options = {},
) {
  const ids = [
    "country-code-select",
    "country-select",
    "state-select",
    "city-select",
    "result",
    "contact-info",
    "api-endpoint",
    "contact-form",
    "submit-btn",
    "full-name",
    "email",
    "phone-number",
    "street-address",
    "postal-code",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, element()]));
  const listeners = {};
  const requests = [];
  const fixtures = {
    "/countries.json": options.countries || [
      { id: 1, name: "Example", iso2: "EX", phonecode: "999" },
    ],
    "/countries/ex/states.json": [state],
    [`/countries/ex/states/${state.path_key}/cities.json`]: [
      { id: 3, name: "Example City" },
    ],
  };
  const document = {
    baseURI: location,
    getElementById(id) {
      return elements[id];
    },
    createElement() {
      return element();
    },
    querySelector() {
      return elements["contact-form"];
    },
    addEventListener(name, listener) {
      listeners[name] = listener;
    },
  };
  const fetch = async (input) => {
    const url = new URL(input, location);
    requests.push(url.href);
    if (options.fetch) return options.fetch(url, fixtures);
    const key = Object.keys(fixtures).find((suffix) =>
      url.pathname.endsWith(suffix),
    );
    if (!key) throw new Error(`Unexpected request: ${url.href}`);
    return { status: 200, json: async () => ({ data: fixtures[key] }) };
  };
  vm.runInNewContext(demoScript, {
    document,
    window: { location: new URL(location) },
    URL,
    fetch,
    console: {
      log() {},
      warn() {},
      error(error) {
        if (options.allowErrors) return;
        throw error;
      },
    },
  });
  return { elements, listeners, requests };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("the address form handles keyboard submission without navigation", async () => {
  assert.match(
    demoHtml,
    /id="submit-btn"[^>]*type="submit"[^>]*form="contact-form"/,
  );
  const demo = runDemo("https://example.test/playground/index.html");
  demo.listeners.DOMContentLoaded();
  await settle();
  demo.elements["full-name"].value = "Alex";
  demo.elements["email"].value = "alex@example.test";
  demo.elements["street-address"].value = "42 Example Street";
  let prevented = false;
  demo.elements["contact-form"].listeners.submit({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.match(demo.elements["contact-info"].innerHTML, /Alex/);
});

test("invalid address fields receive native validation feedback", async () => {
  const demo = runDemo("https://example.test/playground/index.html");
  demo.listeners.DOMContentLoaded();
  await settle();
  const form = demo.elements["contact-form"];
  let reported = false;
  form.checkValidity = () => false;
  form.reportValidity = () => {
    reported = true;
    return false;
  };
  form.listeners.submit({ preventDefault() {} });
  assert.equal(reported, true);
});

test("the phone selector uses country codes from the dataset", async () => {
  const demo = runDemo("https://example.test/playground/index.html");
  demo.listeners.DOMContentLoaded();
  await settle();
  assert.equal(demo.elements["country-code-select"].children[0].value, "+999");
  assert.match(
    demo.elements["country-code-select"].children[0].textContent,
    /Example/,
  );
});

test("a slow country request cannot replace the latest state selection", async () => {
  let finishFirst;
  const first = new Promise((resolve) => {
    finishFirst = resolve;
  });
  const demo = runDemo(
    "https://example.test/playground/index.html",
    undefined,
    {
      countries: [
        { id: 1, name: "First", iso2: "EX" },
        { id: 4, name: "Second", iso2: "EY" },
      ],
      fetch(url, fixtures) {
        if (url.pathname.endsWith("/countries.json"))
          return {
            status: 200,
            json: async () => ({ data: fixtures["/countries.json"] }),
          };
        if (url.pathname.endsWith("/countries/ex/states.json")) return first;
        return {
          status: 200,
          json: async () => ({ data: [{ id: 8, name: "Second State" }] }),
        };
      },
    },
  );
  demo.listeners.DOMContentLoaded();
  await settle();
  const country = demo.elements["country-select"];
  country.value = "1";
  country.listeners.change({ target: country });
  country.value = "4";
  country.listeners.change({ target: country });
  await settle();
  finishFirst({
    status: 200,
    json: async () => ({ data: [{ id: 2, name: "Old State" }] }),
  });
  await settle();
  assert.equal(
    demo.elements["state-select"].children[0].textContent,
    "Second State",
  );
});

test("a failed country request leaves the required selector empty", async () => {
  const demo = runDemo(
    "https://example.test/playground/index.html",
    undefined,
    {
      allowErrors: true,
      fetch: async () => ({ status: 503 }),
    },
  );
  demo.listeners.DOMContentLoaded();
  await settle();
  assert.match(demo.elements["country-select"].innerHTML, /value=""/);
  assert.match(demo.elements["country-select"].innerHTML, /load countries/i);
});

test("contact preview escapes user input and geographic names", async () => {
  const demo = runDemo("https://example.test/playground/index.html");
  const { elements, listeners } = demo;
  listeners.DOMContentLoaded();
  await settle();
  elements["country-select"].value = "1";
  elements["country-select"].listeners.change({
    target: elements["country-select"],
  });
  await settle();
  elements["state-select"].value = "2";
  elements["state-select"].listeners.change({
    target: elements["state-select"],
  });
  await settle();
  elements["city-select"].value = "3";
  elements["city-select"].selectedOptions[0].dataset.city = JSON.stringify({
    name: "<img src=x onerror=alert(1)>",
  });
  elements["full-name"].value = "<svg onload=alert(1)>";
  elements["email"].value = 'evil" onclick="alert(1)@example.test';
  elements["street-address"].value = "1 Main Street";
  elements["contact-form"].listeners.submit({ preventDefault() {} });
  const html = elements["contact-info"].innerHTML;
  assert.doesNotMatch(html, /<svg|<img|" onclick="/);
  assert.match(html, /&lt;svg/);
  assert.match(html, /&lt;img/);
});

for (const [name, page, expected] of [
  [
    "web root",
    "https://example.test/playground/index.html",
    "https://example.test/api/v2/countries.json",
  ],
  [
    "subpath",
    "https://example.test/project/playground/index.html",
    "https://example.test/project/api/v2/countries.json",
  ],
]) {
  test(`demo loads countries relative to its deployment at ${name}`, async () => {
    const demo = runDemo(page);
    demo.listeners.DOMContentLoaded();
    await settle();
    assert.equal(demo.requests[0], expected);
    assert.equal(
      demo.elements["country-select"].children[0].textContent,
      "🇪🇽 Example",
    );
  });
}

for (const [name, page, state, expected] of [
  [
    "ISO code at the web root",
    "https://example.test/playground/index.html",
    { id: 2, name: "Example State", iso3166_2: "EX-ES", path_key: "es" },
    "https://example.test/api/v2/countries/ex/states/es/cities.json",
  ],
  [
    "ISO code under a subpath",
    "https://example.test/project/playground/index.html",
    { id: 2, name: "Example State", iso3166_2: "EX-ES", path_key: "es" },
    "https://example.test/project/api/v2/countries/ex/states/es/cities.json",
  ],
  [
    "numeric fallback",
    "https://example.test/playground/index.html",
    { id: 2, name: "Example State", path_key: "id-2" },
    "https://example.test/api/v2/countries/ex/states/id-2/cities.json",
  ],
]) {
  test(`selected city reports the state list actually fetched using ${name}`, async () => {
    const demo = runDemo(page, state);
    const { elements, listeners, requests } = demo;
    listeners.DOMContentLoaded();
    await settle();
    elements["country-select"].value = "1";
    elements["country-select"].listeners.change({
      target: elements["country-select"],
    });
    await settle();
    elements["state-select"].value = "2";
    elements["state-select"].listeners.change({
      target: elements["state-select"],
    });
    await settle();
    elements["city-select"].value = "3";
    elements["full-name"].value = "Person";
    elements["email"].value = "person@example.test";
    elements["street-address"].value = "1 Main Street";
    elements["contact-form"].listeners.submit({ preventDefault() {} });

    assert.equal(requests.at(-1), expected);
    assert.equal(
      elements["api-endpoint"].textContent,
      `API Endpoint: ${expected}`,
    );
    assert.match(elements["contact-info"].innerHTML, /Example City/);

    elements["city-select"].value = "";
    elements["contact-form"].listeners.submit({ preventDefault() {} });
    assert.equal(elements["api-endpoint"].textContent, "");
  });
}

for (const [name, html, page, expected] of [
  [
    "homepage at the web root",
    homepageHtml,
    "https://example.test/index.html",
    "https://example.test/",
  ],
  [
    "homepage under a subpath",
    homepageHtml,
    "https://example.test/project/index.html",
    "https://example.test/project/",
  ],
  [
    "demo at the web root",
    demoHtml,
    "https://example.test/playground/index.html",
    "https://example.test/",
  ],
  [
    "demo under a subpath",
    demoHtml,
    "https://example.test/project/playground/index.html",
    "https://example.test/project/",
  ],
]) {
  test(`brand link returns to the ${name} deployment`, () => {
    const href = html.match(/<a class="navbar-brand" href="([^"]+)"/)[1];
    assert.equal(new URL(href, page).href, expected);
  });
}

for (const [name, page, expected] of [
  [
    "web root",
    "https://example.test/index.html",
    "https://example.test/api/v2/",
  ],
  [
    "subpath",
    "https://example.test/project/index.html",
    "https://example.test/project/api/v2/",
  ],
]) {
  test(`homepage quick start resolves API examples at ${name}`, async () => {
    const requests = [];
    vm.runInNewContext(quickStart, {
      fetch(input) {
        requests.push(new URL(input, page).href);
        return Promise.resolve({ json: async () => ({}) });
      },
      console: { log() {} },
    });
    await settle();
    assert.deepEqual(requests, [
      `${expected}countries.json`,
      `${expected}countries/us.json`,
    ]);
  });
}
