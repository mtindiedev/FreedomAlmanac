import { setupAccountAuth, authClient } from "./auth.js";
import { syncWatchlist, removeAccountWatchlistItem } from "./watchlist-sync.js";
let accountUser = null;
let accountDataReady = false;
let accountWatchlist = [];
let accountNotificationPreferences = null;
let accountLoadVersion = 0;
let subscriptionAccess = false;
let subscriptionLoading = true;
let checkoutBusy = false;
const PROFILE_SETTINGS_KEY = "wa_profile_settings";
const WATCHLIST_STORAGE_KEY = "wa_watchlist";

const defaultSettings = {
  bills: true,
  committees: true,
  votes: true,
  delegation: true,
  browserNotifications: false,
  emailNotifications: false,
};

const settings = loadSettings();

function loadSettings() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(PROFILE_SETTINGS_KEY)
    );

    return {
      ...defaultSettings,
      ...(saved || {}),
    };
  } catch (error) {
    console.warn("Could not load profile settings:", error);

    return { ...defaultSettings };
  }
}

function saveSettings() {
  localStorage.setItem(
    PROFILE_SETTINGS_KEY,
    JSON.stringify(settings)
  );
}

function setupNavigationListeners() {
  const destinations = {
    "nav-home": "index.html",
    "nav-delegates": "index.html#delegates",
    "nav-contact": "index.html#contact",
    "nav-bills": "bills.html",
    "nav-committees": "committees.html",
	"nav-votes": "votes.html"

  };

  Object.entries(destinations).forEach(([buttonId, destination]) => {
    const button = document.getElementById(buttonId);

    button?.addEventListener("click", () => {
      window.location.href = destination;
    });
  });
}

function setupChangeAddressListener() {
  const changeAddressButton = document.getElementById(
    "change-address-btn"
  );

  changeAddressButton?.addEventListener("click", () => {
    window.location.href = "index.html#delegates";
  });
}

function setupPreferenceListeners() {
  const preferenceInputs = {
    "setting-bills": "bills",
    "setting-committees": "committees",
    "setting-votes": "votes",
    "setting-delegation": "delegation",
    "setting-email-notifications": "emailNotifications",
  };

  Object.entries(preferenceInputs).forEach(([inputId, settingKey]) => {
    const input = document.getElementById(inputId);

    input?.addEventListener("change", () => {
      settings[settingKey] = input.checked;

      saveSettings();

      if (settingKey === "emailNotifications") {
        setNotificationStatus(
          "Email delivery is not active yet. Your preference has been saved."
        );
      }
    });
  });
}

function setupBrowserNotificationListener() {
  const browserNotificationInput = document.getElementById(
    "setting-browser-notifications"
  );

  browserNotificationInput?.addEventListener("change", async () => {
    if (!browserNotificationInput.checked) {
      settings.browserNotifications = false;

      saveSettings();

      setNotificationStatus("Browser notifications are turned off.");

      return;
    }

    if (!("Notification" in window)) {
      browserNotificationInput.checked = false;
      settings.browserNotifications = false;

      saveSettings();

      setNotificationStatus(
        "This browser does not support browser notifications."
      );

      return;
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      browserNotificationInput.checked = false;
      settings.browserNotifications = false;

      saveSettings();

      setNotificationStatus(
        "Browser notification permission was not granted."
      );

      return;
    }

    settings.browserNotifications = true;

    saveSettings();

    setNotificationStatus(
      "Browser notifications are enabled on this device."
    );
  });
}

function setNotificationStatus(message) {
  const status = document.getElementById("notification-status");

  if (status) {
    status.textContent = message;
  }
}

function setupClearDataListener() {
  const clearButton = document.getElementById(
    "clear-profile-data-btn"
  );

  clearButton?.addEventListener("click", () => {
    const confirmed = window.confirm(
      "Clear your saved delegation and profile settings from this browser?"
    );

    if (!confirmed) {
      return;
    }

    localStorage.removeItem("wa_zip");
    localStorage.removeItem("wa_state");
    localStorage.removeItem("wa_district");
    localStorage.removeItem("wa_members");
    localStorage.removeItem(PROFILE_SETTINGS_KEY);

    settings = { ...defaultSettings };

    syncSettingsToInputs();

    const locationSummary = document.getElementById(
      "profile-location-summary"
    );

    if (locationSummary) {
      locationSummary.textContent = "No address has been saved yet.";
    }

    const sidebarDelegation = document.getElementById(
      "sidebar-delegation-container"
    );

    if (sidebarDelegation) {
      sidebarDelegation.innerHTML = `
        <p class="muted">No address set.</p>
      `;
    }

    const profileDelegation = document.getElementById(
      "profile-delegation-list"
    );

    if (profileDelegation) {
      profileDelegation.innerHTML = `
        <p class="small-note">
          Set your address to see your senators and representative.
        </p>
      `;
    }

    const privacyStatus = document.getElementById("privacy-status");

    if (privacyStatus) {
      privacyStatus.textContent =
        "Your saved Freedom Almanac data has been cleared.";
    }
  });
}

function syncSettingsToInputs() {
  const inputs = {
    bills: document.getElementById("setting-bills"),
    committees: document.getElementById("setting-committees"),
    votes: document.getElementById("setting-votes"),
    delegation: document.getElementById("setting-delegation"),
    browserNotifications: document.getElementById(
      "setting-browser-notifications"
    ),
    emailNotifications: document.getElementById(
      "setting-email-notifications"
    ),
  };

  Object.entries(inputs).forEach(([settingKey, input]) => {
    if (input) {
      input.checked = settings[settingKey] === true;
    }
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function memberImageHtml(member) {
  const id = String(member.bioguide_id || "").trim();

  if (!id) {
    return `
      <div class="member-thumb member-thumb-placeholder"
           aria-label="No portrait available">
        ?
      </div>
    `;
  }

  const lowerId = id.toLowerCase();
  const upperId = id.toUpperCase();
  const firstLetter = upperId.charAt(0);

  const congressUrl =
    `https://www.congress.gov/img/member/${lowerId}_200.jpg`;

  const bioguideUrl =
    `https://bioguide.congress.gov/bioguide/photo/${firstLetter}/${upperId}.jpg`;

  return `
    <img
      src="${escapeAttribute(congressUrl)}"
      alt="${escapeHtml(member.full_name)}"
      class="member-thumb"
      loading="lazy"
      data-fallback="${escapeAttribute(bioguideUrl)}"
      onerror="
        if (this.dataset.fallback && this.src !== this.dataset.fallback) {
          this.src = this.dataset.fallback;
        } else {
          this.style.display = 'none';
          this.nextElementSibling.style.display = 'grid';
        }
      "
    />
    <div
      class="member-thumb member-thumb-placeholder"
      style="display: none"
      aria-label="No portrait available">
      ?
    </div>
  `;
}

function getSavedMembers() {
  try {
    const saved = JSON.parse(localStorage.getItem("wa_members"));

    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    console.warn("Could not load saved delegation:", error);

    return [];
  }
}

function getOrderedMembers(members) {
  const houseMember = members.find(
    (member) => member.chamber === "house"
  );

  const senators = members.filter(
    (member) => member.chamber === "senate"
  );

  return houseMember
    ? [houseMember, ...senators]
    : senators;
}

function renderLocationSummary() {
  const summary = document.getElementById("profile-location-summary");

  if (!summary) return;

  const zip = localStorage.getItem("wa_zip") || "";
  const state = localStorage.getItem("wa_state") || "";
  const district = localStorage.getItem("wa_district") || "";

  const parts = [
    zip ? `ZIP ${zip}` : "",
    state,
    district ? `Congressional District ${district}` : "",
  ].filter(Boolean);

  summary.textContent = parts.length
    ? parts.join(" · ")
    : "No address has been saved yet.";
}

function renderMemberList(containerId) {
  const container = document.getElementById(containerId);

  if (!container) return;

  const members = getOrderedMembers(getSavedMembers());

  if (!members.length) {
    container.innerHTML = `
      <p class="small-note">
        Set your address to see your senators and representative.
      </p>
    `;
    return;
  }

  container.innerHTML = members
    .map((member) => {
      const isHouse = member.chamber === "house";

      const chamberLabel = isHouse
        ? "U.S. House of Representatives"
        : "U.S. Senate";

      const districtInfo = isHouse
        ? ` · ${escapeHtml(member.state)}-${escapeHtml(member.district)}`
        : ` · ${escapeHtml(member.state)}`;

      return `
        <article class="card profile-member-card">
          <div class="member-row">
            ${memberImageHtml(member)}

            <div class="member-info">
              <h4>
                ${escapeHtml(member.full_name)}
                [${escapeHtml(member.party)}]
              </h4>

              <p>
                <strong>${chamberLabel}${districtInfo}</strong>
              </p>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSidebarDelegation() {
  renderMemberList("sidebar-delegation-container");
}

function renderProfileDelegation() {
  renderMemberList("profile-delegation-list");
}

function setupNavigation() {
  const destinations = {
    "nav-home": "index.html",
    "nav-delegates": "index.html#delegates",
    "nav-contact": "index.html#contact",
    "nav-profile": "profile.html",
    "nav-bills": "bills.html",
    "nav-committees": "committees.html",
	"nav-votes": "votes.html",

 
  };

  Object.entries(destinations).forEach(([id, destination]) => {
    document.getElementById(id)?.addEventListener("click", () => {
      window.location.href = destination;
    });
  });
}

function setupTabs() {
  const tabs = document.querySelectorAll(".profile-tab");
  const panels = document.querySelectorAll(".profile-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const selectedPanel = tab.dataset.panel;

      tabs.forEach((item) => {
        item.classList.toggle("active", item === tab);
      });

      panels.forEach((panel) => {
        panel.classList.add("hidden");
      });

      document
        .getElementById(`profile-panel-${selectedPanel}`)
        ?.classList.remove("hidden");
    });
  });
}

function syncSettings() {
  const settingInputs = {
    bills: document.getElementById("setting-bills"),
    committees: document.getElementById("setting-committees"),
    votes: document.getElementById("setting-votes"),
    delegation: document.getElementById("setting-delegation"),
    browserNotifications: document.getElementById(
      "setting-browser-notifications"
    ),
    emailNotifications: document.getElementById(
      "setting-email-notifications"
    ),
  };

  Object.entries(settingInputs).forEach(([key, input]) => {
    if (input) {
      input.checked = settings[key] === true;
    }
  });
}

function getLocalWatchlist() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(WATCHLIST_STORAGE_KEY)
    );

    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    console.warn("Could not load local watchlist:", error);
    return [];
  }
}

function getWatchlist() {
  return accountUser
    ? accountWatchlist
    : getLocalWatchlist();
}

function saveLocalWatchlist(watchlist) {
  localStorage.setItem(
    WATCHLIST_STORAGE_KEY,
    JSON.stringify(watchlist)
  );
}

function getWatchlistItemId(item) {
  return `${item.type}:${item.id}`;
}

function formatWatchlistCount(count) {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

function renderWatchlist() {
  const container = document.getElementById("watchlist-container");
  const countElement = document.getElementById("watchlist-count");

  if (!container) {
    return;
  }

  const watchlist = getWatchlist();

  if (countElement) {
    countElement.textContent = formatWatchlistCount(watchlist.length);
  }

  if (!watchlist.length) {
    container.innerHTML = `
      <article class="card">
        <p class="small-note">Your watchlist is empty.</p>
        <p class="small-note">
          Add a bill from the Bills page or a committee from the Committees page.
        </p>
      </article>
    `;

    return;
  }

  container.innerHTML = watchlist
    .map((item) => {
      const itemId = getWatchlistItemId(item);

      const typeLabel =
        item.type === "committee"
          ? "Committee"
          : "Bill";

      const billNumber = item.number
        ? `<span class="bill-number">${escapeHtml(item.number)}</span>`
        : "";

      const title = escapeHtml(item.title || "Untitled item");

      const summary = item.summary
        ? `<p class="watchlist-summary">${escapeHtml(item.summary)}</p>`
        : `
          <p class="watchlist-summary small-note">
            No summary is available for this item yet.
          </p>
        `;

      return `
        <article class="card watchlist-item">
          <div class="watchlist-item-header">
            <div>
              <span class="watchlist-type">${typeLabel}</span>
              <h3>${billNumber} ${title}</h3>
            </div>

            <button
              class="remove-watchlist-button"
              type="button"
              data-watchlist-id="${escapeAttribute(itemId)}"
            >
              Remove
            </button>
          </div>

                    ${summary}

          ${
            item.status
              ? `<p class="small-note">
                  Saved status: ${escapeHtml(item.status)}
                </p>`
              : ""
          }

          ${
            item.bill_updated_at
              ? `<p class="small-note">
                  Saved bill record updated:
                  ${escapeHtml(item.bill_updated_at)}
                </p>`
              : ""
          }
        </article>
      `;
    })
    .join("");
}

function setupWatchlistListeners() {
  const container = document.getElementById("watchlist-container");

  container?.addEventListener("click", async (event) => {
    const button = event.target.closest(
      ".remove-watchlist-button"
    );

    if (!button) return;

    const itemId = button.dataset.watchlistId;

    if (!accountUser) {
      const updated = getLocalWatchlist().filter((item) => {
        return getWatchlistItemId(item) !== itemId;
      });

      saveLocalWatchlist(updated);
      renderWatchlist();
      return;
    }

    if (!accountDataReady) {
      setAccountSyncStatus("Wait for your account data to finish loading.");
      return;
    }

    const userId = accountUser.id;

    const item = accountWatchlist.find((saved) => {
      return getWatchlistItemId(saved) === itemId;
    });

    if (!item) return;

    button.disabled = true;

    try {
      const savedRows = await removeAccountWatchlistItem(userId, item);

      if (accountUser?.id !== userId) return;

      accountWatchlist = databaseWatchlistToBrowser(savedRows);

      renderWatchlist();
      setAccountSyncStatus("Item removed from your account watchlist.");
    } catch (error) {
      console.error("Could not remove watchlist item:", error);

      setAccountSyncStatus(
        `Could not remove item: ${error.message}`
      );

      button.disabled = false;
    }
  });
}

function setupSettingsListeners() {
  const normalSettings = {
    "setting-bills": "bills",
    "setting-committees": "committees",
    "setting-votes": "votes",
    "setting-delegation": "delegation",
    "setting-email-notifications": "emailNotifications",
  };

  Object.entries(normalSettings).forEach(([inputId, settingKey]) => {
    document
      .getElementById(inputId)
      ?.addEventListener("change", (event) => {
        settings[settingKey] = event.target.checked;
        saveSettings();

        if (settingKey === "emailNotifications") {
          setNotificationStatus(
            "Email delivery is not active yet. This preference has been saved."
          );
        }
      });
  });

  document
    .getElementById("setting-browser-notifications")
    ?.addEventListener("change", async (event) => {
      if (!event.target.checked) {
        settings.browserNotifications = false;
        saveSettings();

        setNotificationStatus("Browser notifications are turned off.");
        return;
      }

      if (!("Notification" in window)) {
        event.target.checked = false;
        settings.browserNotifications = false;
        saveSettings();

        setNotificationStatus(
          "This browser does not support notifications."
        );

        return;
      }

      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        event.target.checked = false;
        settings.browserNotifications = false;
        saveSettings();

        setNotificationStatus(
          "Browser notification permission was not granted."
        );

        return;
      }

      settings.browserNotifications = true;
      saveSettings();

      setNotificationStatus(
        "Browser notifications are enabled on this device."
      );
    });
}

function setupChangeAddressButton() {
  document
    .getElementById("change-address-btn")
    ?.addEventListener("click", () => {
      window.location.href = "index.html#delegates";
    });
}

function setupClearDataButton() {
  document
    .getElementById("clear-profile-data-btn")
    ?.addEventListener("click", () => {
      const confirmed = window.confirm(
        "Clear your saved delegation and profile settings from this browser?"
      );

      if (!confirmed) return;

      localStorage.removeItem("wa_zip");
      localStorage.removeItem("wa_state");
      localStorage.removeItem("wa_district");
      localStorage.removeItem("wa_members");
      localStorage.removeItem(PROFILE_SETTINGS_KEY);
	  localStorage.removeItem(WATCHLIST_STORAGE_KEY);
	  localStorage.removeItem(NOTIFICATION_PREFERENCES_KEY);

      Object.assign(settings, defaultSettings);

      renderLocationSummary();
      renderSidebarDelegation();
      renderProfileDelegation();
      syncSettings();
	  
	  renderWatchlist();
	  renderNotificationPreferences();
setNotificationStatus("");

      const privacyStatus = document.getElementById("privacy-status");

      if (privacyStatus) {
        privacyStatus.textContent =
          "Your saved Freedom Almanac data has been cleared.";
      }
    });
}

const NOTIFICATION_PREFERENCES_KEY = "wa_notification_preferences";

function getDefaultNotificationPreferences() {
  let timeZone = "America/New_York";

  try {
    timeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      timeZone;
  } catch (error) {
    console.warn("Could not detect time zone:", error);
  }

  return {
	  emailEnabled: false,
    delivery: "email",
    email: "",
    phone: "",
    frequency: "daily",
    weekday: "1",
    days: ["1", "2", "3", "4", "5"],
    time: "08:00",
    timeZone,
    includeBriefing: false,
    includeSchedule: false,
  };
}

function loadLocalNotificationPreferences() {
  const defaults = getDefaultNotificationPreferences();

  try {
    const saved = JSON.parse(
      localStorage.getItem(NOTIFICATION_PREFERENCES_KEY)
    );

    if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
      return defaults;
    }

    return {
		emailEnabled: saved.emailEnabled === true,
      delivery: saved.delivery === "sms" ? "sms" : "email",
      email: typeof saved.email === "string" ? saved.email : "",
      phone: typeof saved.phone === "string" ? saved.phone : "",

      frequency: ["daily", "weekly", "custom"].includes(saved.frequency)
        ? saved.frequency
        : defaults.frequency,

      weekday: /^[0-6]$/.test(String(saved.weekday))
        ? String(saved.weekday)
        : defaults.weekday,

      days: Array.isArray(saved.days)
        ? [...new Set(saved.days.map(String))]
            .filter((day) => /^[0-6]$/.test(day))
        : defaults.days,

      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(saved.time || "")
        ? saved.time
        : defaults.time,

      timeZone:
        typeof saved.timeZone === "string"
          ? saved.timeZone
          : defaults.timeZone,

      includeBriefing: saved.includeBriefing === true,
      includeSchedule: saved.includeSchedule === true,
    };
  } catch (error) {
    console.warn("Could not load notification preferences:", error);
    return defaults;
  }
}

function loadNotificationPreferences() {
  if (accountUser) {
    return accountNotificationPreferences ||
      getDefaultNotificationPreferences();
  }

  return loadLocalNotificationPreferences();
}

function populateNotificationTimeZones(selectedZone) {
  const select = document.getElementById("notification-timezone");

  if (!select) return;

  const defaultZone = getDefaultNotificationPreferences().timeZone;

  const zones = [
    defaultZone,
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Phoenix",
    "America/Los_Angeles",
    "America/Anchorage",
    "Pacific/Honolulu",
    "UTC",
    selectedZone,
  ];

  const validZones = [...new Set(zones)].filter((zone) => {
    if (typeof zone !== "string" || !zone) return false;

    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  });

  select.replaceChildren();

  validZones.forEach((zone) => {
    const option = document.createElement("option");

    option.value = zone;
    option.textContent = zone.replaceAll("_", " ");

    select.appendChild(option);
  });

  select.value = validZones.includes(selectedZone)
    ? selectedZone
    : defaultZone;
}

function updateNotificationFields() {
  const form = document.getElementById(
    "notification-preferences-form"
  );

  if (!form) return;

  const delivery =
    form.querySelector('input[name="delivery"]:checked')?.value ||
    "email";

  const frequency = document.getElementById(
    "notification-frequency"
  ).value;

  const isEmail = delivery === "email";
  const isWeekly = frequency === "weekly";
  const isCustom = frequency === "custom";

  document
    .getElementById("notification-email-fields")
    .classList.toggle("hidden", !isEmail);

  document
    .getElementById("notification-phone-fields")
    .classList.toggle("hidden", isEmail);

  const emailInput = document.getElementById("notification-email");
  const phoneInput = document.getElementById("notification-phone");

  emailInput.disabled = !isEmail;
  emailInput.required = isEmail;

  phoneInput.disabled = isEmail;
  phoneInput.required = !isEmail;
  phoneInput.setCustomValidity("");

  document
    .getElementById("notification-weekly-fields")
    .classList.toggle("hidden", !isWeekly);

  document.getElementById("notification-weekday").disabled =
    !isWeekly;

  const customFields = document.getElementById(
    "notification-custom-fields"
  );

  customFields.classList.toggle("hidden", !isCustom);
  customFields.disabled = !isCustom;
}

function renderNotificationPreferences() {
  const form = document.getElementById(
    "notification-preferences-form"
  );

   if (!form) return;

  if (!document.getElementById("notification-email-enabled")) {
    form.insertAdjacentHTML(
      "afterbegin",
      `
        <div class="notification-email-enable-field">
          <label>
            <input
              type="checkbox"
              id="notification-email-enabled"
            />
            Enable scheduled email digests
          </label>

          <p class="small-note">
            Delivery uses your verified sign-in email.
            To stop scheduled emails, uncheck this box and save.
          </p>
        </div>
      `
    );
  }

  const preferences = loadNotificationPreferences();

  document.getElementById("notification-email-enabled").checked =
    preferences.emailEnabled === true;

    form.querySelectorAll('input[name="delivery"]').forEach((input) => {
    input.checked = input.value === "email";

    if (input.value === "sms") {
      input.disabled = true;
    }
  });

    const emailInput = document.getElementById("notification-email");

  emailInput.value = accountUser?.email || preferences.email;
  emailInput.readOnly = Boolean(accountUser);

  document.getElementById("notification-phone").value =
    preferences.phone;

  document.getElementById("notification-frequency").value =
    preferences.frequency;

  document.getElementById("notification-weekday").value =
    preferences.weekday;

  form.querySelectorAll('input[name="days"]').forEach((input) => {
    input.checked = preferences.days.includes(input.value);
  });

  document.getElementById("notification-time").value =
    preferences.time;

  populateNotificationTimeZones(preferences.timeZone);

  document.getElementById("notification-include-briefing").checked =
    preferences.includeBriefing;

  document.getElementById("notification-include-schedule").checked =
    preferences.includeSchedule;

  updateNotificationFields();
  renderSubscriptionControls();
}


function setupScheduledNotificationListeners() {
  const form = document.getElementById(
    "notification-preferences-form"
  );

  if (!form) return;

  form.addEventListener("change", (event) => {
    if (
      event.target.name === "delivery" ||
      event.target.name === "frequency"
    ) {
      updateNotificationFields();
    }

    setNotificationStatus(
      "You have unsaved changes. Save your notification preferences below."
    );
  });

  form.addEventListener("input", (event) => {
    if (event.target.id === "notification-phone") {
      event.target.setCustomValidity("");
    }

    setNotificationStatus(
      "You have unsaved changes. Save your notification preferences below."
    );
  });

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const delivery =
      form.querySelector('input[name="delivery"]:checked')?.value ||
      "email";

    const frequency = document.getElementById(
      "notification-frequency"
    ).value;

    const days = Array.from(
      form.querySelectorAll('input[name="days"]:checked')
    ).map((input) => input.value);

    if (frequency === "custom" && !days.length) {
      setNotificationStatus(
        "Select at least one delivery day."
      );

      form.querySelector('input[name="days"]')?.focus();
      return;
    }

    const phoneInput = document.getElementById("notification-phone");

    const phone = phoneInput.value
      .trim()
      .replace(/[\s().-]/g, "");

    if (delivery === "sms" && !/^\+[1-9]\d{7,14}$/.test(phone)) {
      phoneInput.setCustomValidity(
        "Enter a mobile number with its country code, such as +14065551234."
      );

      phoneInput.reportValidity();
      return;
    }

    phoneInput.setCustomValidity("");

    if (!form.reportValidity()) return;

        const preferences = {
      emailEnabled: document.getElementById(
        "notification-email-enabled"
      ).checked,

      delivery,

      email: document
        .getElementById("notification-email")
        .value.trim(),

      phone,

      frequency,

      weekday: document.getElementById(
        "notification-weekday"
      ).value,

      days,

      time: document.getElementById("notification-time").value,

      timeZone: document.getElementById(
        "notification-timezone"
      ).value,

      includeBriefing: document.getElementById(
        "notification-include-briefing"
      ).checked,

      includeSchedule: document.getElementById(
        "notification-include-schedule"
      ).checked,
    };

    const saveButton = form.querySelector('button[type="submit"]');

saveButton.disabled = true;

try {
  const message = await saveNotificationPreferences(preferences);
  setNotificationStatus(message);
} catch (error) {
  console.error("Could not save notification preferences:", error);

  setNotificationStatus(
    `Could not save your preferences: ${error.message}`
  );
} finally {
  saveButton.disabled = false;
}
  });
}

function setAccountSyncStatus(message) {
  const element = document.getElementById("account-sync-status");

  if (element) {
    element.textContent = message;
  }
}

function databasePreferencesToForm(row) {
  if (!row) return null;

  return {
    emailEnabled: row.email_enabled === true,
    delivery: row.delivery,
    email: row.email || "",
    phone: row.phone || "",
    frequency: row.frequency,
    weekday: String(row.weekday),
    days: Array.isArray(row.days) ? row.days.map(String) : [],
    time: String(row.delivery_time || "08:00").slice(0, 5),
    timeZone: row.time_zone,
    includeBriefing: row.include_briefing === true,
    includeSchedule: row.include_schedule === true,
  };
}

function formPreferencesToDatabase(preferences, userId) {
  return {
    user_id: userId,
    email_enabled: preferences.emailEnabled === true,
    delivery: preferences.delivery,
    email: preferences.email.trim(),
    phone: preferences.phone.trim(),
    frequency: preferences.frequency,
    weekday: Number(preferences.weekday),
    days: [...new Set(preferences.days.map(Number))],
    delivery_time: preferences.time,
    time_zone: preferences.timeZone,
    include_briefing: preferences.includeBriefing === true,
    include_schedule: preferences.includeSchedule === true,
  };
}

function watchlistItemToDatabase(item, userId) {
  if (!["bill", "committee"].includes(item.type)) {
    throw new Error("A local watchlist item has an unsupported type.");
  }

  const itemKey = String(item.id ?? "").trim();

  if (!itemKey || itemKey.length > 2000) {
    throw new Error("A local watchlist item has an invalid ID.");
  }

  const row = {
    user_id: userId,
    item_type: item.type,
    item_key: itemKey,
    number: String(item.number || ""),
    title: String(item.title || ""),
    summary: String(item.summary || ""),
    source_url: String(item.url || ""),
    congress_number: null,
    bill_type: null,
    bill_number: null,
  };

  // Resolve canonical bill identity only from an official bill URL.
  if (item.type === "bill" && item.url) {
    try {
      const url = new URL(item.url);

      const isCongress =
        url.hostname === "www.congress.gov" ||
        url.hostname === "congress.gov";

      const match = url.pathname.match(
        /^\/bill\/(\d+)(?:st|nd|rd|th)-congress\/([a-z-]+)\/(\d+)\/?$/i
      );

      const typeMap = {
        hr: "hr",
        s: "s",
        hres: "hres",
        sres: "sres",
        hjres: "hjres",
        sjres: "sjres",
        hconres: "hconres",
        sconres: "sconres",
        "house-bill": "hr",
        "senate-bill": "s",
        "house-resolution": "hres",
        "senate-resolution": "sres",
        "house-joint-resolution": "hjres",
        "senate-joint-resolution": "sjres",
        "house-concurrent-resolution": "hconres",
        "senate-concurrent-resolution": "sconres",
      };

      const billType = match
        ? typeMap[match[2].toLowerCase()]
        : null;

      if (isCongress && match && billType) {
        row.congress_number = Number(match[1]);
        row.bill_type = billType;
        row.bill_number = Number(match[3]);
      }
    } catch {
      // Keep display data; do not guess a bill identity.
    }
  }

  return row;
}

function databaseWatchlistToBrowser(rows) {
  return rows.map((row) => ({
    type: row.item_type,
    id: row.item_key,
    number: row.number || "",
    title: row.title || "",
    summary: row.summary || "",
    url: row.source_url || "",
    congress_number: row.congress_number,
    bill_type: row.bill_type,
    bill_number: row.bill_number,
    status: row.status || "",
    bill_updated_at: row.bill_updated_at || null,
  }));
}

async function refreshAccountData(user) {
  const version = ++accountLoadVersion;

  accountUser = user || null;
  accountDataReady = false;
  accountWatchlist = [];
    accountNotificationPreferences = null;

  subscriptionAccess = false;
  subscriptionLoading = Boolean(user);

  renderWatchlist();
  renderNotificationPreferences();

  setBillingStatus(
    user
      ? "Waiting for account data…"
      : "Sign in to check your subscription."
  );

  if (!user) {
    setAccountSyncStatus(
      "Signed out. Showing this browser’s local watchlist and preferences."
    );
    return;
  }

  setAccountSyncStatus("Loading your account watchlist and preferences…");

  try {
    const [watchlistResult, preferencesResult] = await Promise.all([
      syncWatchlist(user.id).then(data => ({ data, error: null })),

      authClient
        .from("user_notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (version !== accountLoadVersion) return;

    if (watchlistResult.error) throw watchlistResult.error;
    if (preferencesResult.error) throw preferencesResult.error;

    accountWatchlist = databaseWatchlistToBrowser(
      watchlistResult.data || []
    );

    accountNotificationPreferences = databasePreferencesToForm(
      preferencesResult.data
    );

    accountDataReady = true;

    renderWatchlist();
    renderNotificationPreferences();
  
    setAccountSyncStatus(
      "Watchlist synced with your account. Notification preferences loaded."
    );
	    await refreshSubscriptionAccess();
  } catch (error) {
    if (version !== accountLoadVersion) return;

    console.error("Could not load account profile:", error);

    setAccountSyncStatus(
      `Could not load account data: ${error.message}. Refresh to retry.`
    );
  }
}

async function saveNotificationPreferences(preferences) {
  if (!accountUser) {
    localStorage.setItem(
      NOTIFICATION_PREFERENCES_KEY,
      JSON.stringify(preferences)
    );
	  if (preferences.emailEnabled) {
    if (!accountUser) {
      throw new Error(
        "Sign in and subscribe before enabling scheduled email digests."
      );
    }

    if (subscriptionLoading || !subscriptionAccess) {
      throw new Error(
                "Digest access has not been confirmed. " +
        "Subscribe or reload this page to check your access again."
      );
    }
  }

        return (
      "Preferences saved in this browser only. " +
      "Sign in and subscribe to enable scheduled email delivery."
    );
  }

  if (!accountDataReady) {
    throw new Error(
      "Account data is not ready. Wait for it to load or refresh."
    );
  }

  const userId = accountUser.id;

  // Refresh account details before saving the authorized destination.
  const {
    data: userData,
    error: userError,
  } = await authClient.auth.getUser();

  if (userError) throw userError;

  const user = userData.user;

  if (!user || user.id !== userId) {
    throw new Error("Your account changed. Refresh and try again.");
  }

  if (accountUser?.id !== userId) {
    throw new Error("Your account changed. Refresh and try again.");
  }

  if (preferences.emailEnabled) {
    if (
      user.is_anonymous ||
      !user.email ||
      !user.email_confirmed_at
    ) {
      throw new Error(
        "Verify your sign-in email before enabling scheduled delivery."
      );
    }

    if (preferences.delivery !== "email") {
      throw new Error(
        "Select Email. Scheduled SMS delivery is not available yet."
      );
    }
  }

  const authorizedPreferences = {
    ...preferences,

    email:
      preferences.delivery === "email"
        ? user.email || ""
        : preferences.email,
  };

  const { data, error } = await authClient
    .from("user_notification_preferences")
    .upsert(
      formPreferencesToDatabase(authorizedPreferences, userId),
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) throw error;

  if (accountUser?.id !== userId) {
    return "Preferences saved to the previous account.";
  }

  accountUser = user;

  accountNotificationPreferences =
    databasePreferencesToForm(data);

  renderNotificationPreferences();

  if (!data.email_enabled) {
    return "Preferences saved. Scheduled email delivery is turned off.";
  }

  if (!data.next_delivery_at) {
    return (
      "Preferences saved, but no next delivery time was returned. " +
      "Check that the scheduler database setup was installed."
    );
  }

  const nextDelivery = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: data.time_zone,
  }).format(new Date(data.next_delivery_at));

  return (
    `Scheduled email enabled. Next delivery: ${nextDelivery} ` +
    `(${data.time_zone}) to ${data.email}.`
  );
}

async function setupAccountStorage() {

  authClient.auth.onAuthStateChange((event, session) => {
    if (
      event !== "INITIAL_SESSION" &&
      event !== "SIGNED_IN" &&
      event !== "SIGNED_OUT"
    ) {
      return;
    }

    const nextUser = session?.user || null;

    // Avoid refreshing the form for a repeated sign-in event.
    if (
      nextUser?.id === accountUser?.id &&
      accountDataReady
    ) {
      return;
    }

    // Perform database calls outside the auth callback.
    setTimeout(() => {
      refreshAccountData(nextUser);
    }, 0);
  });

  const { data, error } = await authClient.auth.getSession();

  if (error) throw error;

  await refreshAccountData(data.session?.user || null);
}

function setBillingStatus(message) {
  const element = document.getElementById(
    "notification-billing-status"
  );

  if (element) {
    element.textContent = message;
  }
}

function renderSubscriptionControls() {
  const checkbox = document.getElementById(
    "notification-email-enabled"
  );

  const subscribeButton = document.getElementById(
    "notification-subscribe-button"
  );

 

  const planSelect = document.getElementById(
    "notification-subscription-plan"
  );

  const help = document.getElementById(
    "notification-subscription-help"
  );

  const signedIn = Boolean(accountUser);

  const canEnable =
    signedIn &&
    accountDataReady &&
    !subscriptionLoading &&
    subscriptionAccess;

  if (checkbox) {
    checkbox.disabled = !canEnable;

    checkbox.setAttribute(
      "aria-describedby",
      "notification-subscription-help"
    );

    if (!canEnable) {
      checkbox.checked = false;
    }
  }

  if (planSelect) {
    planSelect.disabled =
      checkoutBusy ||
      subscriptionLoading ||
      subscriptionAccess;
  }


  if (subscribeButton) {
    subscribeButton.disabled =
      !signedIn ||
      !accountDataReady ||
      subscriptionLoading ||
      subscriptionAccess ||
      checkoutBusy;

    if (checkoutBusy) {
      subscribeButton.textContent = "Opening checkout…";
    } else if (!signedIn) {
      subscribeButton.textContent = "Sign in to subscribe";
    } else if (subscriptionLoading) {
      subscribeButton.textContent = "Checking subscription…";
    } else if (subscriptionAccess) {
      subscribeButton.textContent = "Digest access active";
    } else {
      subscribeButton.textContent =
        planSelect?.value === "monthly"
          ? "Subscribe — $1/month"
          : "Subscribe — $10/year";
    }
  }

  if (help) {
    if (!signedIn) {
      help.textContent =
        "Sign in from the Overview tab, then subscribe to enable " +
        "scheduled email digests. You can save local preferences without paying.";
    } else if (!accountDataReady) {
      help.textContent = "Waiting for your account preferences to load.";
    } else if (subscriptionLoading) {
      help.textContent = "Checking your paid subscription access…";
    } else if (subscriptionAccess) {
      help.textContent =
                "Digest access confirmed. Check Enable scheduled email digests " +
        "and save your preferences to start delivery.";
    } else {
      help.textContent =
        "A paid subscription is required to enable scheduled email digests. " +
        "Saving preferences does not authorize a charge.";
    }
  }
}

async function refreshSubscriptionAccess() {
  const userId = accountUser?.id;
  const version = accountLoadVersion;

  subscriptionAccess = false;
  subscriptionLoading = Boolean(userId);

  renderSubscriptionControls();

  if (!userId) {
    setBillingStatus("Sign in to check your subscription.");
    return;
  }

  setBillingStatus("Checking subscription…");

  try {
    const returnedFromCheckout =
      new URL(window.location.href)
        .searchParams.get("subscription") === "success";

    // After checkout, allow time for Stripe's webhook to arrive.
    const attempts = returnedFromCheckout ? 10 : 1;

    for (let attempt = 0; attempt < attempts; attempt++) {
      if (
        accountUser?.id !== userId ||
        accountLoadVersion !== version
      ) {
        return;
      }

      const { data, error } = await authClient.rpc(
        "fa_my_digest_access"
      );

      if (error) throw error;

      if (
        accountUser?.id !== userId ||
        accountLoadVersion !== version
      ) {
        return;
      }

      subscriptionAccess = data === true;

      if (subscriptionAccess || attempt === attempts - 1) {
        break;
      }

      setBillingStatus(
        "Waiting for Stripe payment confirmation…"
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (
      accountUser?.id !== userId ||
      accountLoadVersion !== version
    ) {
      return;
    }

    if (subscriptionAccess) {
      setBillingStatus(
                "Digest access confirmed. Scheduled email digests are available."
      );

      const currentUrl = new URL(window.location.href);

      currentUrl.searchParams.delete("subscription");
      currentUrl.searchParams.delete("session_id");

      window.history.replaceState(
        null,
        "",
        currentUrl.pathname +
          currentUrl.search +
          currentUrl.hash
      );
    } else if (returnedFromCheckout) {
      setBillingStatus(
              "Payment confirmation has not reached your account yet. " +
        "Do not pay again. Reload this page shortly to check again."
      );
    } else {
      setBillingStatus(
        "No current paid access. Subscribe for $1/month or $10/year."
      );
    }
  } catch (error) {
    if (
      accountUser?.id !== userId ||
      accountLoadVersion !== version
    ) {
      return;
    }

    console.error("Subscription lookup failed:", error);

    subscriptionAccess = false;

    setBillingStatus(
      `Could not check your subscription: ${error.message}`
    );
  } finally {
    if (
      accountUser?.id === userId &&
      accountLoadVersion === version
    ) {
      subscriptionLoading = false;
      renderSubscriptionControls();
    }
  }
}

function setupSubscriptionListeners() {
  const planSelect = document.getElementById(
    "notification-subscription-plan"
  );

  const subscribeButton = document.getElementById(
    "notification-subscribe-button"
  );


  planSelect?.addEventListener(
    "change",
    renderSubscriptionControls
  );

  subscribeButton?.addEventListener("click", async () => {
    if (
      checkoutBusy ||
      subscriptionLoading ||
      subscriptionAccess
    ) {
      return;
    }

    if (!accountUser || !accountDataReady) {
      setBillingStatus(
        "Sign in and wait for your account to load before subscribing."
      );
      return;
    }

    const userId = accountUser.id;
    const plan = planSelect?.value || "annual";

    checkoutBusy = true;
    renderSubscriptionControls();
    setBillingStatus("Opening secure Stripe checkout…");

    try {
      const { data, error } = await authClient.functions.invoke(
        "create-subscription-checkout",
        {
          body: { plan },
        }
      );

      if (error) {
        let message = error.message;

        if (typeof error.context?.json === "function") {
          try {
            const details = await error.context.json();
            message = details.error || message;
          } catch {
            // Keep the original error if there is no JSON response.
          }
        }

        throw new Error(message);
      }

      if (accountUser?.id !== userId) {
        throw new Error(
          "Your account changed. Refresh before subscribing."
        );
      }

      if (!data?.url) {
        throw new Error(
          data?.error || "Checkout did not return a payment URL."
        );
      }

      const checkoutUrl = new URL(data.url);

      if (
        checkoutUrl.protocol !== "https:" ||
        checkoutUrl.hostname !== "checkout.stripe.com"
      ) {
        throw new Error("Unexpected checkout address.");
      }

      window.location.assign(checkoutUrl.href);
    } catch (error) {
      console.error("Checkout failed:", error);

      if (accountUser?.id === userId) {
        setBillingStatus(
          `Could not open checkout: ${error.message}`
        );
      }
    } finally {
      checkoutBusy = false;
      renderSubscriptionControls();
    }
  });
}

function init() {
  setupNavigation();
  setupTabs();

  renderLocationSummary();
  renderSidebarDelegation();
  renderProfileDelegation();

  syncSettings();

  setupChangeAddressButton();
  setupClearDataButton();

  setupWatchlistListeners();
  renderWatchlist();

  renderNotificationPreferences();
  setupScheduledNotificationListeners();
setupSubscriptionListeners();
  renderSubscriptionControls();
  
  
  // Initialize account storage independently of sign-in UI.
  setupAccountStorage().catch((error) => {
    console.error(
      "Account storage initialization failed:",
      error
    );

    setAccountSyncStatus(
      `Could not initialize account storage: ${error.message}`
    );
  });

  // Initialize the sign-in and sign-out controls.
  setupAccountAuth().catch((error) => {
    console.error(
      "Account initialization failed:",
      error
    );

    const status = document.getElementById("account-status");

    if (status) {
      status.textContent =
        "Could not initialize sign-in. Refresh and try again.";
    }
  });
}

init();