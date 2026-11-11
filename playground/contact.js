// Form validation function
function validateForm() {
  const form = document.getElementById("contact-form");
  const isValid = form.checkValidity();

  if (!isValid) {
    form.classList.add("was-validated");
    form.reportValidity();
  } else {
    form.classList.add("was-validated");
  }

  return isValid;
}

const API_BASE_URL = new URL("../api/v2", window.location.href).href;

let countries = [];
let currentStates = [];
let currentCities = [];
let stateRequest = 0;
let cityRequest = 0;

const countryCodeSelect = document.getElementById("country-code-select");
const countrySelect = document.getElementById("country-select");
const stateSelect = document.getElementById("state-select");
const citySelect = document.getElementById("city-select");
const result = document.getElementById("result");
const contactInfo = document.getElementById("contact-info");
const apiEndpoint = document.getElementById("api-endpoint");

// Load countries
async function loadCountries() {
  try {
    const response = await fetch(`${API_BASE_URL}/countries.json`);
    if (response.status >= 400)
      throw new Error(`Request failed (${response.status})`);
    const data = await response.json();
    countries = data.data || data;
    if (!Array.isArray(countries))
      throw new Error("Country list is unavailable");

    // Populate address country dropdown
    countrySelect.innerHTML = '<option value="">-- Select Country --</option>';
    countries.forEach((country) => {
      const option = document.createElement("option");
      option.value = country.id;
      option.textContent = country.name;
      option.dataset.flag = String(country.iso2 || "").toLowerCase();
      option.dataset.country = JSON.stringify(country);
      countrySelect.appendChild(option);
    });

    // Populate phone country code dropdown
    countryCodeSelect.innerHTML = '<option value="">Code</option>';

    // Create a sorted array of countries with phone codes
    const countriesWithPhoneCodes = countries
      .filter(
        (country) => country.phonecode && String(country.phonecode).trim(),
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    countriesWithPhoneCodes.forEach((country) => {
      const option = document.createElement("option");
      const phoneCode = `+${String(country.phonecode).trim().replace(/^\+/, "")}`;

      option.value = phoneCode;
      option.textContent = country.name;
      option.dataset.display = phoneCode;
      option.dataset.code = phoneCode;
      option.dataset.flag = String(country.iso2 || "").toLowerCase();
      option.dataset.countryName = country.name;
      countryCodeSelect.appendChild(option);
    });

    window.FlagSelect?.refresh(countrySelect);
    window.FlagSelect?.refresh(countryCodeSelect);
  } catch (error) {
    console.error("Error loading countries:", error);
    countrySelect.innerHTML =
      '<option value="">Could not load countries — refresh to retry</option>';
    countryCodeSelect.innerHTML = '<option value="">Code unavailable</option>';
  }
}

// Load states for selected country
async function loadStates(countryId) {
  const request = ++stateRequest;
  try {
    const selectedCountry = countries.find((c) => c.id == countryId);
    const isoCode = selectedCountry.iso2.toLowerCase();
    const response = await fetch(
      `${API_BASE_URL}/countries/${isoCode}/states.json`,
    );
    if (request !== stateRequest) return;
    if (response.status >= 400)
      throw new Error(`Request failed (${response.status})`);

    const data = await response.json();
    if (request !== stateRequest) return;
    currentStates = data.data || data || [];
    if (!Array.isArray(currentStates))
      throw new Error("State list is unavailable");

    if (!currentStates || currentStates.length === 0) {
      stateSelect.innerHTML = '<option value="">No states found</option>';
      stateSelect.disabled = true;
      currentCities = [];
      citySelect.innerHTML = "<option>Choose state first</option>";
      citySelect.disabled = true;
      return;
    }

    stateSelect.innerHTML = '<option value="">-- Select State --</option>';
    currentStates.forEach((state) => {
      const option = document.createElement("option");
      option.value = state.id;
      option.textContent = state.name;
      option.dataset.state = JSON.stringify(state);
      stateSelect.appendChild(option);
    });
    stateSelect.disabled = false;
  } catch (error) {
    if (request !== stateRequest) return;
    console.error("Error loading states:", error);
    stateSelect.innerHTML = "<option>Error loading states</option>";
    stateSelect.disabled = true;
    currentStates = [];
    currentCities = [];
    citySelect.innerHTML = "<option>Choose state first</option>";
    citySelect.disabled = true;
  }
}

// Load cities for selected state
async function loadCities(stateId) {
  const request = ++cityRequest;
  try {
    const selectedState = currentStates.find((s) => s.id == stateId);
    const selectedCountry = countries.find((c) => c.id == countrySelect.value);
    const countryCode = selectedCountry?.iso2?.toLowerCase();
    const stateKey = selectedState?.path_key;
    if (
      !/^[a-z]{2}$/.test(countryCode || "") ||
      !/^[a-z0-9-]+$/.test(stateKey || "")
    ) {
      throw new Error("State path is unavailable");
    }
    const cityEndpoint = `${API_BASE_URL}/countries/${countryCode}/states/${stateKey}/cities.json`;
    const response = await fetch(cityEndpoint);
    if (request !== cityRequest) return;
    if (response.status >= 400)
      throw new Error(`Request failed (${response.status})`);

    const data = await response.json();
    if (request !== cityRequest) return;
    currentCities = data.data || data || [];
    if (!Array.isArray(currentCities))
      throw new Error("City list is unavailable");

    if (!currentCities || currentCities.length === 0) {
      citySelect.innerHTML = '<option value="">No cities found</option>';
      citySelect.disabled = true;
      return;
    }

    citySelect.innerHTML = '<option value="">-- Select City --</option>';
    currentCities.forEach((city) => {
      const option = document.createElement("option");
      option.value = city.id;
      option.textContent = city.name;
      option.dataset.city = JSON.stringify(city);
      option.dataset.endpoint = cityEndpoint;
      citySelect.appendChild(option);
    });
    citySelect.disabled = false;
  } catch (error) {
    if (request !== cityRequest) return;
    console.error("Error loading cities:", error);
    citySelect.innerHTML = "<option>Error loading cities</option>";
    citySelect.disabled = true;
    currentCities = [];
  }
}

function escapeHTML(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

// Display contact information
function displayContactInfo() {
  const fullName = document.getElementById("full-name").value.trim();
  const email = document.getElementById("email").value.trim();
  const countryCode = countryCodeSelect.value;
  const phoneNumber = document.getElementById("phone-number").value.trim();
  const streetAddress = document.getElementById("street-address").value.trim();
  const postalCode = document.getElementById("postal-code").value.trim();

  // Check if required fields are filled
  const isValid = validateForm();
  if (!isValid) {
    return; // Stop execution if validation fails
  }

  const selectedCountry = countrySelect.selectedOptions[0];
  const selectedState = stateSelect.selectedOptions[0];
  const selectedCity = citySelect.selectedOptions[0];

  // Build contact information display
  let html = "";

  if (fullName) {
    html += `<div class="grid grid-cols-[90px_1fr] gap-3">
      <div class="font-semibold text-[#5b7663]">Name</div>
      <div>${escapeHTML(fullName)}</div>
    </div>`;
  }

  if (email) {
    html += `<div class="grid grid-cols-[90px_1fr] gap-3">
      <div class="font-semibold text-[#5b7663]">Email</div>
      <div><a class="underline underline-offset-2" href="mailto:${encodeURIComponent(email)}">${escapeHTML(email)}</a></div>
    </div>`;
  }

  if (countryCode && phoneNumber) {
    const selectedCodeOption = countryCodeSelect.selectedOptions[0];
    const countryName = selectedCodeOption
      ? selectedCodeOption.dataset.countryName
      : "";
    html += `<div class="grid grid-cols-[90px_1fr] gap-3">
      <div class="font-semibold text-[#5b7663]">Phone</div>
      <div>${escapeHTML(countryCode)} ${escapeHTML(phoneNumber)} ${countryName ? `(${escapeHTML(countryName)})` : ""}</div>
    </div>`;
  }

  // Address information
  if (
    streetAddress ||
    (selectedCountry && selectedCountry.value) ||
    postalCode
  ) {
    html += `<div class="grid grid-cols-[90px_1fr] gap-3">
      <div class="font-semibold text-[#5b7663]">Address</div>
      <div>`;

    if (streetAddress) html += `${escapeHTML(streetAddress)}<br>`;

    let addressLine = [];
    if (selectedCity && selectedCity.value && selectedCity.dataset.city) {
      try {
        const city = JSON.parse(selectedCity.dataset.city);
        addressLine.push(city.name);
      } catch (e) {
        console.warn("Error parsing city data:", e);
      }
    }
    if (selectedState && selectedState.value && selectedState.dataset.state) {
      try {
        const state = JSON.parse(selectedState.dataset.state);
        addressLine.push(state.name);
      } catch (e) {
        console.warn("Error parsing state data:", e);
      }
    }
    if (postalCode) addressLine.push(postalCode);

    if (addressLine.length > 0) {
      html += `${addressLine.map(escapeHTML).join(", ")}<br>`;
    }

    if (
      selectedCountry &&
      selectedCountry.value &&
      selectedCountry.dataset.country
    ) {
      try {
        const country = JSON.parse(selectedCountry.dataset.country);
        html += `${escapeHTML(country.name)}`;
      } catch (e) {
        console.warn("Error parsing country data:", e);
      }
    }

    html += `</div></div>`;
  }

  if (html) {
    contactInfo.innerHTML = html;

    // Show API endpoint used for city data if available
    if (selectedCity && selectedCity.value && selectedCity.dataset.endpoint) {
      apiEndpoint.textContent = `API Endpoint: ${selectedCity.dataset.endpoint}`;
    } else {
      apiEndpoint.textContent = "";
    }

    result.style.display = "block";
    result.scrollIntoView({ behavior: "smooth" });
  } else {
    result.style.display = "none";
  }
}

// Event listeners
document.getElementById("contact-form").addEventListener("submit", (event) => {
  event.preventDefault();
  displayContactInfo();
});

countrySelect.addEventListener("change", (e) => {
  stateRequest++;
  cityRequest++;
  currentStates = [];
  currentCities = [];
  stateSelect.disabled = true;
  if (e.target.value) {
    loadStates(e.target.value);
    stateSelect.innerHTML = "<option>Loading states...</option>";
    citySelect.innerHTML = "<option>Choose state first</option>";
    citySelect.disabled = true;
  } else {
    stateSelect.innerHTML = "<option>Choose country first</option>";
    stateSelect.disabled = true;
    citySelect.innerHTML = "<option>Choose state first</option>";
    citySelect.disabled = true;
  }
});

stateSelect.addEventListener("change", (e) => {
  cityRequest++;
  currentCities = [];
  citySelect.disabled = true;
  if (e.target.value) {
    loadCities(e.target.value);
    citySelect.innerHTML = "<option>Loading cities...</option>";
  } else {
    citySelect.innerHTML = "<option>Choose state first</option>";
    citySelect.disabled = true;
  }
});

// Load countries on page load
document.addEventListener("DOMContentLoaded", function () {
  loadCountries();

  // Add real-time validation feedback
  const form = document.getElementById("contact-form");
  const inputs = form.querySelectorAll("input[required], select[required]");

  inputs.forEach((input) => {
    input.addEventListener("input", function () {
      if (this.checkValidity()) {
        this.classList.remove("is-invalid");
        this.classList.add("is-valid");
      } else {
        this.classList.remove("is-valid");
        if (form.classList.contains("was-validated")) {
          this.classList.add("is-invalid");
        }
      }
    });

    input.addEventListener("change", function () {
      if (this.checkValidity()) {
        this.classList.remove("is-invalid");
        this.classList.add("is-valid");
      } else {
        this.classList.remove("is-valid");
        if (form.classList.contains("was-validated")) {
          this.classList.add("is-invalid");
        }
      }
    });
  });
});
