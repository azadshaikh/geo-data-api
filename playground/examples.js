(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", api.initDemo);
    else api.initDemo();
  }
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  function apiBaseUrl(pageUrl) {
    return new URL("../api/v2/", pageUrl).href;
  }

  function normalizeName(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
  }

  function createGeoClient(baseUrl, fetcher) {
    const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    const cache = new Map();

    function endpoint(relative) {
      if (
        typeof relative !== "string" ||
        !/^(?:[a-z0-9-]+\/)*[a-z0-9-]+\.json$/i.test(relative)
      ) {
        throw new Error("Invalid API path in index");
      }
      const url = new URL(relative, base);
      if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname))
        throw new Error("Invalid API path in index");
      return url.href;
    }

    async function read(relative, allowMissing = false) {
      const url = endpoint(relative);
      if (!cache.has(url)) {
        const request = Promise.resolve()
          .then(() => fetcher(url))
          .then(async (response) => {
            if (response.status === 404 && allowMissing) return null;
            if (!response.ok)
              throw new Error(`Request failed (${response.status})`);
            return response.json();
          });
        cache.set(url, request);
        request.catch(() => cache.delete(url));
      }
      return cache.get(url);
    }

    async function countries() {
      const payload = await read("countries.json");
      if (!Array.isArray(payload?.data))
        throw new Error("Country list is unavailable");
      return payload.data;
    }

    async function searchCities(countryCode, query, limit = 8) {
      if (!/^[a-z]{2}$/i.test(countryCode || ""))
        throw new Error("Choose a country first");
      const term = normalizeName(query);
      if (term.length < 2) throw new Error("Enter at least two characters");
      const code = countryCode.toLowerCase();
      const relative = `countries/${code}/cities/index.json`;
      const index = await read(relative);
      if (!Array.isArray(index?.data))
        throw new Error("City index is unavailable");
      const pagePrefix = `countries/${code}/cities/`;
      const pages = await Promise.all(
        index.data.map(async (entry) => {
          const filename = entry?.filename;
          if (
            typeof filename !== "string" ||
            !filename.startsWith(pagePrefix) ||
            !/^[1-9][0-9]*\.json$/.test(filename.slice(pagePrefix.length))
          ) {
            throw new Error("Invalid city page in index");
          }
          const page = await read(filename);
          if (!Array.isArray(page?.data))
            throw new Error("City search data is unavailable");
          return page.data;
        }),
      );
      const matches = pages
        .flat()
        .filter((city) =>
          normalizeName(city.name_normalized || city.name).includes(term),
        );
      return {
        matches: matches.slice(0, limit),
        total: matches.length,
        endpoint: endpoint(relative),
      };
    }

    async function lookupCity(value) {
      const text = String(value ?? "").trim();
      const id = Number(text);
      if (!/^\d+$/.test(text) || !Number.isSafeInteger(id))
        throw new Error("Enter a valid city ID");
      const relative = `cities/${id}.json`;
      const payload = await read(relative, true);
      if (payload !== null && payload?.data?.id !== id)
        throw new Error("City data is unavailable");
      return {
        city: payload?.data || null,
        endpoint: endpoint(relative),
      };
    }

    return { countries, searchCities, lookupCity };
  }

  function initDemo() {
    const byId = (id) => document.getElementById(id);
    const client = createGeoClient(
      apiBaseUrl(window.location.href),
      window.fetch.bind(window),
    );
    const tabs = [...document.querySelectorAll("[data-example-tab]")];
    const panels = [...document.querySelectorAll("[data-example-panel]")];
    const searchCountry = byId("search-country");
    const searchInput = byId("search-query");
    const searchButton = byId("search-button");
    const searchRetry = byId("search-retry");
    let searchReady;
    let searchRequest = 0;
    let lookupRequest = 0;
    let lookupStarted = false;

    function setText(id, text) {
      byId(id).textContent = text;
    }

    async function runSearch() {
      const request = ++searchRequest;
      searchButton.disabled = true;
      setText("search-status", "Searching this country…");
      byId("search-results").replaceChildren();
      try {
        const result = await client.searchCities(
          searchCountry.value,
          searchInput.value,
        );
        if (request !== searchRequest) return;
        const shown = result.matches.length;
        setText(
          "search-status",
          result.total
            ? `${result.total.toLocaleString()} ${result.total === 1 ? "match" : "matches"}${result.total > shown ? ` · showing ${shown}` : ""}`
            : "No cities found. Try another name or country.",
        );
        setText("search-endpoint", new URL(result.endpoint).pathname);
        const indexPath = `countries/${searchCountry.value.toLowerCase()}/cities/index.json`;
        setText(
          "search-code",
          [
            "const base = new URL('../api/v2/', location.href);",
            "async function getJson(path) {",
            "  const res = await fetch(new URL(path, base));",
            "  if (!res.ok) throw new Error(`Request failed (${res.status})`);",
            "  return (await res.json()).data;",
            "}",
            `const index = await getJson('${indexPath}');`,
            "const pages = await Promise.all(index.map(page => getJson(page.filename)));",
            `const query = ${JSON.stringify(searchInput.value.trim())}`,
            "  .toLowerCase().normalize('NFD')",
            "  .replace(/\\p{M}/gu, '');",
            "const matches = pages.flat().filter(city =>",
            "  city.name_normalized.includes(query)",
            ");",
          ].join("\n"),
        );
        for (const city of result.matches) {
          const item = document.createElement("li");
          item.className =
            "flex items-center justify-between gap-4 border-b border-slate-100 py-3 last:border-0";
          const details = document.createElement("div");
          const name = document.createElement("p");
          name.className = "font-semibold text-slate-800";
          name.textContent = city.name;
          const location = document.createElement("p");
          location.className = "mt-0.5 text-sm text-slate-500";
          location.textContent = [city.state_name, city.country_name]
            .filter(Boolean)
            .join(", ");
          const id = document.createElement("span");
          id.className =
            "shrink-0 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-500";
          id.textContent = `#${city.id}`;
          details.append(name, location);
          item.append(details, id);
          byId("search-results").append(item);
        }
      } catch (error) {
        if (request === searchRequest)
          setText(
            "search-status",
            error.message || "Could not load city search data.",
          );
      } finally {
        if (request === searchRequest) searchButton.disabled = false;
      }
    }

    async function prepareSearch() {
      if (!searchReady) {
        searchRetry.hidden = true;
        setText("search-status", "Loading countries…");
        searchReady = client
          .countries()
          .then((countries) => {
            searchCountry.replaceChildren();
            for (const country of countries.filter((item) =>
              /^[a-z]{2}$/i.test(item.iso2 || ""),
            )) {
              const option = document.createElement("option");
              option.value = country.iso2.toLowerCase();
              option.textContent = country.name;
              option.dataset.flag = country.iso2.toLowerCase();
              searchCountry.append(option);
            }
            if (!searchCountry.options.length)
              throw new Error("No countries are available");
            const hasBrazil = [...searchCountry.options].some(
              (option) => option.value === "br",
            );
            searchCountry.value = hasBrazil
              ? "br"
              : searchCountry.options[0].value;
            searchCountry.disabled = false;
            window.FlagSelect?.refresh(searchCountry);
            searchButton.disabled = false;
            return runSearch();
          })
          .catch((error) => {
            searchReady = null;
            searchRetry.hidden = false;
            setText(
              "search-status",
              error.message || "Could not load the country list.",
            );
          });
      }
      await searchReady;
    }

    async function runLookup() {
      const request = ++lookupRequest;
      const button = byId("lookup-button");
      button.disabled = true;
      setText("lookup-status", "Finding the city…");
      byId("lookup-result").replaceChildren();
      try {
        const result = await client.lookupCity(byId("lookup-id").value);
        if (request !== lookupRequest) return;
        setText("lookup-endpoint", new URL(result.endpoint).pathname);
        if (!result.city) {
          setText(
            "lookup-status",
            "No city found for that ID. Try another one.",
          );
          return;
        }
        setText("lookup-status", "City found");
        const city = result.city;
        for (const [label, value] of [
          ["City", city.name],
          ["State / Province", city.state_name],
          ["Country", city.country_name],
          ["City ID", city.id],
          [
            "Coordinates",
            city.latitude != null && city.longitude != null
              ? `${city.latitude}, ${city.longitude}`
              : null,
          ],
        ]) {
          if (value === undefined || value === null || value === "") continue;
          const row = document.createElement("div");
          row.className =
            "flex items-start justify-between gap-4 border-b border-slate-100 py-3 text-sm last:border-0";
          const key = document.createElement("dt");
          key.className = "text-slate-500";
          key.textContent = label;
          const detail = document.createElement("dd");
          detail.className = "text-right font-semibold text-slate-800";
          detail.textContent = String(value);
          row.append(key, detail);
          byId("lookup-result").append(row);
        }
      } catch (error) {
        if (request === lookupRequest)
          setText(
            "lookup-status",
            error.message || "Could not look up this city.",
          );
      } finally {
        if (request === lookupRequest) button.disabled = false;
      }
    }

    function activate(tab) {
      const name = tab.dataset.exampleTab;
      for (const item of tabs) {
        const active = item === tab;
        item.setAttribute("aria-selected", String(active));
        item.tabIndex = active ? 0 : -1;
      }
      for (const panel of panels)
        panel.hidden = panel.dataset.examplePanel !== name;
      if (name === "search") prepareSearch();
      if (name === "lookup" && !lookupStarted) {
        lookupStarted = true;
        runLookup();
      }
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activate(tab));
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                tabs.length;
        tabs[next].focus();
        activate(tabs[next]);
      });
    });
    const invalidateSearch = () => {
      searchRequest++;
      searchButton.disabled = false;
      byId("search-results").replaceChildren();
      setText("search-status", "Search to see matching cities.");
    };
    searchCountry.addEventListener("change", invalidateSearch);
    searchInput.addEventListener("input", invalidateSearch);
    searchRetry.addEventListener("click", prepareSearch);
    byId("lookup-id").addEventListener("input", () => {
      lookupRequest++;
      byId("lookup-button").disabled = false;
      byId("lookup-result").replaceChildren();
      setText("lookup-status", "Enter an ID and select Find city.");
    });
    byId("search-form").addEventListener("submit", (event) => {
      event.preventDefault();
      runSearch();
    });
    byId("lookup-form").addEventListener("submit", (event) => {
      event.preventDefault();
      runLookup();
    });
    document.querySelectorAll("[data-copy]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(
            byId(button.dataset.copy).textContent,
          );
          button.textContent = "Copied";
        } catch {
          button.textContent = "Copy unavailable";
        }
      });
    });
  }

  return { apiBaseUrl, normalizeName, createGeoClient, initDemo };
});
