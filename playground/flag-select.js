// Progressively upgrade <select data-combobox> into a searchable listbox.
// The native select stays in the DOM as the value source, so existing form
// code, validation and change handlers keep working.
(function () {
  "use strict";

  const instances = new WeakMap();
  let generatedIds = 0;

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function rank(option, query) {
    if (!query) return 0;
    const label = option.normalizedLabel;
    if (label === query || option.normalizedTerms.includes(query)) return 1;
    if (label.startsWith(query)) return 2;
    if (option.normalizedTerms.some((term) => term.startsWith(query))) return 3;
    const words = label.split(" ");
    if (
      words.some((word) => word.startsWith(query)) ||
      query
        .split(" ")
        .every((part) => words.some((word) => word.startsWith(part)))
    )
      return 4;
    if (
      label.includes(query) ||
      option.normalizedTerms.some((term) => term.includes(query))
    )
      return 5;
    return Infinity;
  }

  function enhance(select) {
    const existing = instances.get(select);
    if (existing) return existing;

    const doc = select.ownerDocument;
    const id = select.id || `flag-select-${++generatedIds}`;
    select.id = id;
    const inputId = `${id}-combobox`;
    const listId = `${id}-listbox`;
    const placeholder = select.dataset.placeholder || "Search…";
    const flagBase = select.dataset.flagBase || "assets/flags/4x3/";
    const wasRequired = select.required;

    select.required = false;

    const wrapper = doc.createElement("div");
    wrapper.className = "flag-select";
    for (const name of [...select.classList]) {
      if (name !== "field") wrapper.classList.add(name);
    }
    if (select.dataset.comboboxPopup === "wide") wrapper.dataset.popup = "wide";
    select.classList.add("flag-select__native");

    const flag = doc.createElement("span");
    flag.className = "flag-select__flag fi";
    flag.setAttribute("aria-hidden", "true");

    const input = doc.createElement("input");
    input.type = "text";
    input.id = inputId;
    input.className = "field flag-select__input";
    input.placeholder = placeholder;
    input.required = wasRequired;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", listId);

    const toggle = doc.createElement("button");
    toggle.type = "button";
    toggle.className = "flag-select__toggle";
    toggle.tabIndex = -1;
    toggle.setAttribute("aria-label", "Show options");
    toggle.innerHTML =
      '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 8 5 5 5-5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const popup = doc.createElement("div");
    popup.className = "flag-select__popup";
    popup.hidden = true;

    const list = doc.createElement("ul");
    list.className = "flag-select__listbox";
    list.id = listId;
    list.setAttribute("role", "listbox");
    popup.append(list);

    wrapper.append(flag, input, toggle, popup);
    select.parentNode.insertBefore(wrapper, select);

    for (const label of doc.querySelectorAll("label[for]")) {
      if (label.htmlFor === id) {
        label.htmlFor = inputId;
        list.setAttribute(
          "aria-label",
          (label.textContent || "").trim() || placeholder,
        );
        break;
      }
    }
    if (!list.hasAttribute("aria-label"))
      list.setAttribute("aria-label", placeholder);

    let options = [];
    let filtered = [];
    let activeIndex = -1;
    let isOpen = false;
    let isRefreshing = false;

    function readOptions() {
      options = [];
      for (const element of select.options) {
        const label = (element.textContent || "").trim();
        if (element.disabled || element.value === "" || !label) continue;
        const flagCode = (
          element.dataset.flag ||
          (/^[a-z]{2}$/i.test(element.value) ? element.value : "")
        ).toLowerCase();
        const code = (element.dataset.code || "").trim();
        const normalizedLabel = normalize(label);
        options.push({
          element,
          label,
          display: (element.dataset.display || label).trim(),
          code,
          flagCode,
          normalizedLabel,
          normalizedTerms: [
            normalizedLabel,
            normalize(code),
            normalize(flagCode),
          ].filter(Boolean),
        });
      }
    }

    function selected() {
      const element = select.options[select.selectedIndex];
      if (!element || element.value === "") return null;
      return options.find((option) => option.element === element) || null;
    }

    function setFlag(code) {
      flag.className = code
        ? `flag-select__flag fi fi-${code}`
        : "flag-select__flag fi";
    }

    function flagUrl(code) {
      return new URL(`${flagBase}${code}.svg`, doc.baseURI).href;
    }

    function syncDisplay() {
      const current = selected();
      input.value = current ? current.display : "";
      input.placeholder = current ? "" : placeholder;
      setFlag(current ? current.flagCode : "");
    }

    function syncDisabled() {
      const disabled = select.disabled;
      input.disabled = disabled;
      toggle.disabled = disabled;
      wrapper.classList.toggle("is-disabled", disabled);
      if (disabled) closeList();
    }

    function setActive(index) {
      activeIndex = index;
      const children = [...list.children];
      children.forEach((child, childIndex) => {
        const active = childIndex === index;
        child.classList.toggle("is-active", active);
        child.setAttribute("aria-selected", String(active));
      });
      const active = children[index];
      if (active) {
        input.setAttribute("aria-activedescendant", active.id);
        active.scrollIntoView({ block: "nearest" });
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    }

    function render(queryText) {
      const query = normalize(queryText);
      filtered = options
        .map((option) => ({ option, score: rank(option, query) }))
        .filter((entry) => entry.score !== Infinity)
        .sort(
          (a, b) =>
            a.score - b.score || a.option.label.localeCompare(b.option.label),
        )
        .map((entry) => entry.option);

      list.replaceChildren();
      filtered.forEach((option, index) => {
        const row = doc.createElement("li");
        row.className = "flag-select__option";
        row.id = `${id}-option-${index}`;
        row.dataset.index = String(index);
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", "false");

        const rowFlag = doc.createElement(option.flagCode ? "img" : "span");
        rowFlag.setAttribute("aria-hidden", "true");
        if (option.flagCode) {
          rowFlag.className = "flag-select__option-flag";
          rowFlag.loading = "lazy";
          rowFlag.decoding = "async";
          rowFlag.alt = "";
          rowFlag.src = flagUrl(option.flagCode);
        } else {
          rowFlag.className = "flag-select__option-flag fi";
        }

        const label = doc.createElement("span");
        label.className = "flag-select__option-label";
        label.textContent = option.label;

        row.append(rowFlag, label);
        if (option.code) {
          const code = doc.createElement("span");
          code.className = "flag-select__option-code";
          code.textContent = option.code;
          row.append(code);
        }
        list.append(row);
      });

      if (!filtered.length) {
        const empty = doc.createElement("li");
        empty.className = "flag-select__empty";
        empty.setAttribute("role", "presentation");
        empty.textContent = query
          ? `No matches for “${input.value.trim()}”`
          : "No options available";
        list.append(empty);
      }

      if (filtered.length && query) setFlag(filtered[0].flagCode);
      if (!query) setFlag(selected()?.flagCode || "");
      setActive(filtered.length ? 0 : -1);
    }

    function openList(preserveQuery) {
      if (isOpen || select.disabled) return;
      const current = selected();
      input.placeholder = current ? current.display : placeholder;
      if (!preserveQuery) input.value = "";
      isOpen = true;
      popup.hidden = false;
      wrapper.classList.add("is-open");
      input.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Hide options");
      render(preserveQuery ? input.value : "");
    }

    function closeList() {
      if (!isOpen) return;
      isOpen = false;
      popup.hidden = true;
      wrapper.classList.remove("is-open");
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      toggle.setAttribute("aria-label", "Show options");
      activeIndex = -1;
      syncDisplay();
    }

    function commit(option) {
      select.selectedIndex = option.element.index;
      closeList();
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function refresh() {
      if (isRefreshing) return;
      isRefreshing = true;
      const query = isOpen ? input.value : "";
      readOptions();
      input.required = wasRequired || select.required;
      syncDisabled();
      if (isOpen) render(query);
      else syncDisplay();
      isRefreshing = false;
    }

    input.addEventListener("focus", () => openList());

    input.addEventListener("input", () => {
      const query = input.value;
      if (!isOpen) openList(true);
      render(query);
    });

    input.addEventListener("click", () => {
      if (!isOpen) openList();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (isOpen) {
          event.preventDefault();
          closeList();
        }
        return;
      }
      if (event.key === "Tab") {
        closeList();
        return;
      }
      if (!isOpen && ["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        openList();
        if (filtered.length) setActive(0);
        return;
      }
      if (!isOpen) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!filtered.length) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = (activeIndex + step + filtered.length) % filtered.length;
        setActive(next);
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        if (!filtered.length) return;
        setActive(event.key === "Home" ? 0 : filtered.length - 1);
        return;
      }
      if (event.key === "PageDown" || event.key === "PageUp") {
        event.preventDefault();
        if (!filtered.length) return;
        const step = event.key === "PageDown" ? 10 : -10;
        setActive(
          Math.min(Math.max(activeIndex + step, 0), filtered.length - 1),
        );
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const option = filtered[activeIndex];
        if (option) commit(option);
        else closeList();
      }
    });

    input.addEventListener("blur", () => closeList());

    toggle.addEventListener("mousedown", (event) => event.preventDefault());
    toggle.addEventListener("click", () => {
      if (isOpen) closeList();
      else {
        input.focus();
        openList();
      }
    });

    list.addEventListener("mousedown", (event) => event.preventDefault());
    list.addEventListener("click", (event) => {
      const row = event.target.closest("[data-index]");
      if (!row) return;
      const option = filtered[Number(row.dataset.index)];
      if (option) commit(option);
    });

    list.addEventListener("mousemove", (event) => {
      const row = event.target.closest("[data-index]");
      if (!row) return;
      const index = Number(row.dataset.index);
      if (index !== activeIndex && filtered[index]) setActive(index);
    });

    select.addEventListener("change", () => {
      if (!isOpen) syncDisplay();
    });

    const observer = new MutationObserver(() => refresh());
    observer.observe(select, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "required"],
    });

    if (select.form) {
      select.form.addEventListener("reset", () => {
        setTimeout(refresh, 0);
      });
    }

    doc.addEventListener("pointerdown", (event) => {
      if (isOpen && !wrapper.contains(event.target)) closeList();
    });

    const instance = { refresh, open: openList, close: closeList };
    instances.set(select, instance);
    refresh();
    return instance;
  }

  function refresh(select) {
    const instance = instances.get(select);
    if (instance) instance.refresh();
  }

  function enhanceAll(root) {
    (root || document)
      .querySelectorAll("select[data-combobox]")
      .forEach(enhance);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => enhanceAll());
  } else {
    enhanceAll();
  }

  window.FlagSelect = { enhance, enhanceAll, refresh };
})();
