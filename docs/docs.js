const docsApiBase = new URL("../api/v2/", window.location.href).href;

document.querySelectorAll("[data-api-base]").forEach((element) => {
  element.textContent = docsApiBase;
});

document.querySelectorAll("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", async () => {
    const code = document.getElementById(button.dataset.copyTarget).textContent;
    let copied = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        copied = true;
      }
    } catch {
      // The Clipboard API can be unavailable on non-secure local networks.
    }

    if (!copied) {
      const field = document.createElement("textarea");
      field.value = code;
      field.setAttribute("readonly", "");
      field.setAttribute("aria-hidden", "true");
      field.style.position = "fixed";
      field.style.left = "-9999px";
      document.body.appendChild(field);
      try {
        field.select();
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      } finally {
        field.remove();
        button.focus();
      }
    }

    button.textContent = copied ? "Copied" : "Select code to copy";
  });
});
