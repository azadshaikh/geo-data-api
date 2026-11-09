const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .filter((content) => content.trim());
const homeScript = scripts.join("\n");
const settle = () => new Promise((resolve) => setImmediate(resolve));

function runHome(page, response, options = {}) {
  const ids = [
    "countries-total",
    "states-total",
    "cities-total",
    "dataset-status",
    "quick-start-code",
    "copy-quick-start",
  ];
  const elements = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        textContent: "—",
        listeners: {},
        addEventListener(name, fn) {
          this.listeners[name] = fn;
        },
        focus() {},
      },
    ]),
  );
  elements["quick-start-code"].textContent = "fetch('./api/v2/countries.json')";
  const requests = [];
  const copied = [];
  let fallbackField;
  vm.runInNewContext(homeScript, {
    document: {
      getElementById: (id) => elements[id],
      createElement: () => ({
        style: {},
        setAttribute() {},
        select() {},
        remove() {},
      }),
      body: {
        appendChild(field) {
          fallbackField = field;
        },
      },
      execCommand(command) {
        if (command !== "copy" || options.fallbackFails) return false;
        copied.push(fallbackField.value);
        return true;
      },
    },
    window: { location: { href: page } },
    URL,
    fetch: async (url) => {
      requests.push(new URL(url, page).href);
      return response;
    },
    navigator: options.noClipboard
      ? {}
      : {
          clipboard: {
            async writeText(value) {
              copied.push(value);
            },
          },
        },
    console,
  });
  return { elements, requests, copied };
}

test("the homepage uses Tailwind and links to the playground", () => {
  assert.match(html, /https:\/\/cdn\.tailwindcss\.com/);
  assert.doesNotMatch(html, /bootstrap@/i);
  assert.ok(
    /playground\/index\.html/.test(html),
    "homepage links to the playground URL",
  );
  assert.match(html, /quick start/i);
});

test("the copy button falls back when the Clipboard API is unavailable", async () => {
  const home = runHome(
    "http://192.168.1.4:3000/index.html",
    { ok: false, status: 404 },
    { noClipboard: true },
  );
  await home.elements["copy-quick-start"].listeners.click();
  assert.deepEqual(home.copied, [
    home.elements["quick-start-code"].textContent,
  ]);
  assert.equal(home.elements["copy-quick-start"].textContent, "Copied");
});

test("the copy button gives a manual-copy message if both methods fail", async () => {
  const home = runHome(
    "http://192.168.1.4:3000/index.html",
    { ok: false, status: 404 },
    { noClipboard: true, fallbackFails: true },
  );
  await home.elements["copy-quick-start"].listeners.click();
  assert.equal(
    home.elements["copy-quick-start"].textContent,
    "Select code to copy",
  );
  assert.equal(home.copied.length, 0);
});

for (const [page, expected] of [
  [
    "https://example.test/index.html",
    "https://example.test/api/v2/api-info.json",
  ],
  [
    "https://example.test/project/index.html",
    "https://example.test/project/api/v2/api-info.json",
  ],
]) {
  test(`homepage loads real dataset counts relative to ${page}`, async () => {
    const home = runHome(page, {
      ok: true,
      json: async () => ({
        statistics: {
          total_countries: 250,
          total_states: 5099,
          total_cities: 151165,
        },
      }),
    });
    await settle();
    assert.deepEqual(home.requests, [expected]);
    assert.equal(home.elements["countries-total"].textContent, "250");
    assert.equal(home.elements["states-total"].textContent, "5,099");
    assert.equal(home.elements["cities-total"].textContent, "151,165");
  });
}

test("homepage handles unavailable or malformed dataset statistics", async () => {
  for (const response of [
    { ok: false, status: 404 },
    { ok: true, json: async () => ({ statistics: { total_countries: 250 } }) },
  ]) {
    const home = runHome("https://example.test/index.html", response);
    await settle();
    assert.equal(home.elements["countries-total"].textContent, "—");
    assert.match(home.elements["dataset-status"].textContent, /unavailable/i);
  }
});

test("the quick-start copy button copies the displayed code", async () => {
  const home = runHome("https://example.test/index.html", {
    ok: false,
    status: 404,
  });
  await home.elements["copy-quick-start"].listeners.click();
  assert.deepEqual(home.copied, [
    home.elements["quick-start-code"].textContent,
  ]);
  assert.equal(home.elements["copy-quick-start"].textContent, "Copied");
});

test("copied quick start continues to target the API when used on another site", async () => {
  const home = runHome("https://geo.example/project/index.html", {
    ok: false,
    status: 404,
  });
  await home.elements["copy-quick-start"].listeners.click();
  const requests = [];
  vm.runInNewContext(home.copied[0], {
    fetch(input) {
      requests.push(new URL(input, "https://another-app.example/").href);
      return Promise.resolve({ json: async () => ({}) });
    },
    console: { log() {} },
  });
  await settle();
  assert.deepEqual(requests, [
    "https://geo.example/project/api/v2/countries.json",
    "https://geo.example/project/api/v2/countries/us.json",
  ]);
});
