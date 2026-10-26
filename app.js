const SUPABASE_URL = "https://vwxfdgkzyndbfatajsmp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_cdrmCpjtDYFym0SpbZj_dQ_yMi8nRpF";
const UPCOMING_SCHEDULE_API_URL =
  "https://vwxfdgkzyndbfatajsmp.supabase.co/functions/v1/get-upcoming-schedule";

const FUNCTION_BASE = `${SUPABASE_URL}/functions/v1`;

const state = {
  zip: null,
  members: [],
  briefing: null,
  currentScreen: "onboarding",
  requiresAddress: false,
  selectedState: null,
  selectedDistrict: null,
};

const screens = {
  onboarding: document.getElementById("onboarding-screen"),
  home: document.getElementById("home-screen"),
  contact: document.getElementById("contact-screen"),
  profile: document.getElementById("profile-screen"),
};

const navBtns = {
  home: document.getElementById("nav-home"),
  contact: document.getElementById("nav-contact"),
  profile: document.getElementById("nav-profile"),
  bills: document.getElementById("nav-bills"),
  votes: document.getElementById("nav-votes"),
  committees: document.getElementById("nav-committees"),
};




function functionHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}


function setupEventListeners() {
  const addressForm = document.getElementById("address-form");

  addressForm?.addEventListener("submit", handleAddressSubmit);
   
   const billsButton = document.getElementById("nav-bills");
   
   const committeesButton = document.getElementById("nav-committees");

   const profileButton = document.getElementById("nav-profile");
   
   const votesButton = document.getElementById("nav-votes");
   
committeesButton?.addEventListener("click", () => {
  window.location.href = "committees.html";
});

  billsButton?.addEventListener("click", () => {
    window.location.href = "bills.html";
  });

profileButton?.addEventListener("click", () => {
  window.location.href = "profile.html";
});

votesButton?.addEventListener("click", () => {
  window.location.href = "votes.html";
});



  const navigation = {
    "nav-home": "home",
    "nav-delegates": "onboarding",
    "nav-contact": "contact",
    

  };

  Object.entries(navigation).forEach(([id, screen]) => {
    const button = document.getElementById(id);

    button?.addEventListener("click", () => {
      navigateTo(screen);

      if (screen === "onboarding") {
        document.getElementById("street-input")?.focus();
      }
    });
  });

  document
    .getElementById("change-zip-btn")
    ?.addEventListener("click", handleChangeZip);
}

async function callEdgeFunction(functionName, options = {}) {
  const url = `${FUNCTION_BASE}/${functionName}`;

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  console.log("Calling Edge Function:", url, {
    method: options.method || "GET",
    headers,
    hasBody: !!options.body,
  });

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || "The server returned invalid JSON." };
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
}

function renderSidebarDelegation() {
  const container = document.getElementById("sidebar-delegation-container");

  if (!container) {
    return;
  }

  if (!state.members || !state.members.length) {
    container.innerHTML = `<p class="muted">No address set.</p>`;
    return;
  }

  const houseMember = state.members.find(m => m.chamber === "house");
  const senators = state.members.filter(m => m.chamber === "senate");

  const orderedMembers = houseMember
    ? [houseMember, ...senators]
    : senators;

  container.innerHTML = orderedMembers
    .map(member => {
      const isHouse = member.chamber === "house";
      const chamberLabel = isHouse
        ? "U.S. House of Representatives"
        : "U.S. Senate";

      const districtInfo = isHouse
        ? ` — ${member.state}-${member.district}`
        : ` — ${member.state}`;

     const imgHtml = memberImageHtml(member);


      return `
        <article class="card sidebar-card">
          <div class="member-row">
            ${imgHtml}
            <div class="member-info">
              <h4>${escapeHtml(member.full_name)} [${escapeHtml(member.party)}]</h4>
              <p><strong>${chamberLabel}${districtInfo}</strong></p>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}


async function handleAddressSubmit(event) {
  event.preventDefault();

  const street = document.getElementById("street-input").value.trim();
  const city = document.getElementById("address-city-input").value.trim();
  const stateCode = document
    .getElementById("address-state-input")
    .value
    .trim()
    .toUpperCase();
  const zip = document.getElementById("address-zip-input").value.trim();

  if (!street || !city || !/^[A-Z]{2}$/.test(stateCode)) {
    alert("Enter a street address, city, and two-letter state code.");
    return;
  }

  if (!/^\d{5}$/.test(zip)) {
    alert("Enter a valid five-digit ZIP code.");
    return;
  }

  const form = document.getElementById("address-form");
  const button = form.querySelector("button[type='submit']");

  button.disabled = true;
  button.textContent = "Finding representative...";

  try {
    const result = await callEdgeFunction("resolve-address", {
      method: "POST",
      body: {
        street,
        city,
        state: stateCode,
        zip,
      },
    });

    state.zip = zip;
    state.members = result.members || [];
	state.requiresAddress = false;
    state.selectedState = result.state || stateCode;
    state.selectedDistrict = result.district || null;
	localStorage.setItem(
  "wa_members",
  JSON.stringify(state.members)
);
	
if (result.warnings && result.warnings.length) {
  console.warn("Address resolved with warnings:", result.warnings);
}

    localStorage.setItem("wa_zip", zip);
    localStorage.setItem("wa_state", state.selectedState || "");
    localStorage.setItem("wa_district", state.selectedDistrict || "");

    hideAddressConfirmation();

    navigateTo("home");
    renderSidebarDelegation();
    renderContact();
  } catch (error) {
    console.error("Address lookup error:", error);
    alert(`Could not confirm that address. ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Find my representatives";
  }
}

async function loadUserData() {
  setLoading(true);

  try {
    // No ZIP lookup anymore.
    // Just initialize state and show the address form.

    state.members = [];
    state.zip = null;
    state.selectedState = null;
    state.selectedDistrict = null;
    state.briefing = {};
    state.loaded = true;

    renderOnboarding();
  } catch (err) {
    console.error("Error loading user data:", err);
    showError("Could not initialize the app. Please refresh the page.");
  } finally {
    setLoading(false);
  }
}

function normalizeBriefing(response) {
  const briefing = response?.briefing || response || {};
const rawRecentActivity = Array.isArray(briefing.recent_activity)
  ? briefing.recent_activity
  : Array.isArray(briefing.recentActivity)
    ? briefing.recentActivity
    : [];
  const rawStories = Array.isArray(briefing.top_stories)
    ? briefing.top_stories
    : Array.isArray(briefing.topStories)
      ? briefing.topStories
      : [];

  const rawComingUp = Array.isArray(briefing.coming_up)
    ? briefing.coming_up
    : Array.isArray(briefing.comingUp)
      ? briefing.comingUp
      : [];

  return {
    date:
      briefing.title ||
      briefing.date ||
      briefing.briefing_date ||
      new Date().toLocaleDateString(),

	    recentActivity: rawRecentActivity.map((item) => ({
      date: item.date || item.activity_date || "",
      chamber: String(item.chamber || "").toLowerCase(),
      actionType: item.actionType || item.action_type || "",
      headline: item.headline || item.title || "Recent congressional action",
      whatHappened:
        item.whatHappened ||
        item.what_happened ||
        item.description ||
        "",
      whatItMeans:
        item.whatItMeans ||
        item.what_it_means ||
        item.impact ||
        "",
      sourceUrl:
        item.sourceUrl ||
        item.source_url ||
        item.url ||
        "",
    })),

    topStories: rawStories.map((story) => ({
      headline: story.headline || story.title || "Untitled story",
      subhead: story.subhead || story.summary || "",
      chamber: String(story.chamber || "").toLowerCase(),
      topics: Array.isArray(story.topics) ? story.topics : [],

      whatHappened:
        story.whatHappened ||
        story.what_happened ||
        story.description ||
        "",

      whoBenefits: Array.isArray(story.whoBenefits)
        ? story.whoBenefits
        : Array.isArray(story.who_benefits)
          ? story.who_benefits
          : [],

      whatItMeans: Array.isArray(story.whatItMeans)
        ? story.whatItMeans
        : Array.isArray(story.what_it_means)
          ? story.what_it_means
          : [],

      vote: story.vote || {},

      money: story.money || "",

      sourceUrl:
        story.sourceUrl ||
        story.source_url ||
        story.url ||
        "",
    })),

    comingUp: rawComingUp.map((item) => ({
      title: item.title || "Upcoming event",
      time: item.time || item.date || "",
      why: item.why || item.description || "",
    })),
  };
}

function showLoadingState() {
  const dateElement = document.getElementById("briefing-date");
  const recentActivityElement =
    document.getElementById("recent-activity");
  const storiesElement = document.getElementById("top-stories");
  const comingUpElement = document.getElementById("coming-up");

  if (dateElement) {
    dateElement.textContent = "Loading today’s briefing...";
  }

  if (recentActivityElement) {
    recentActivityElement.innerHTML = `
      <article class="card">
        <p>Loading recent congressional activity...</p>
      </article>
    `;
  }

  if (storiesElement) {
    storiesElement.innerHTML = `
      <article class="card">
        <p>Loading current congressional discussions...</p>
      </article>
    `;
  }

  if (comingUpElement) {
    comingUpElement.innerHTML = "";
  }
}

function showAddressConfirmation(zip = "") {
  const panel = document.getElementById("address-confirmation");

  if (!panel) return;

  panel.classList.remove("hidden");

  const zipInput = document.getElementById("address-zip-input");

  if (zipInput && zip) {
    zipInput.value = zip;
  }

  document.getElementById("address-state-input").focus();
}

function hideAddressConfirmation() {
  const panel = document.getElementById("address-confirmation");

  if (panel) {
    panel.classList.add("hidden");
  }
}

function showErrorState(message) {
  document.getElementById("briefing-date").textContent =
    "Unable to load Almanac";

  document.getElementById("top-stories").innerHTML = `
    <article class="card error-card">
      <h4>We could not load your location</h4>
      <p>${escapeHtml(message)}</p>

      <div class="contact-actions">
        <button id="retry-btn" class="primary-button">
          Try again
        </button>

        <button id="change-location-btn" class="primary-button">
          Change location
        </button>
      </div>
    </article>
  `;

  document
    .getElementById("retry-btn")
    .addEventListener("click", loadUserData);

  document
    .getElementById("change-location-btn")
    .addEventListener("click", handleChangeZip);
}

function navigateTo(screen) {
  state.currentScreen = screen;

  // Header nav
  document.querySelectorAll(".header-nav .nav-btn").forEach(btn => {
    btn.classList.remove("active");
  });
  const headerBtn = document.getElementById(`nav-${screen}`);
  if (headerBtn) headerBtn.classList.add("active");

  // Sidebar nav
  document.querySelectorAll(".sidebar-nav .nav-btn").forEach(btn => {
    btn.classList.remove("active");
  });
  const sidebarBtn = document.getElementById(`nav-${screen}-sidebar`);
  if (sidebarBtn) sidebarBtn.classList.add("active");

  renderScreen(screen);
}

function renderScreen(screenName) {
  Object.values(screens).forEach((screen) => {
    screen.classList.add("hidden");
  });

  if (screenName === "onboarding") {
    screens.onboarding.classList.remove("hidden");
    return;
  }

  if (screenName === "home") {
    screens.home.classList.remove("hidden");

    if (state.briefing) {
      renderHome();
    }

    return;
  }

  if (screenName === "contact") {
    screens.contact.classList.remove("hidden");
    renderContact();
    return;
  }

  if (screenName === "profile") {
    screens.profile.classList.remove("hidden");
    renderProfile();
  }
}

function updateNavActive(screenName) {
  Object.values(navBtns).forEach((button) => {
    button.classList.remove("active");
  });

  if (screenName === "home") {
    navBtns.home.classList.add("active");
  }

  if (screenName === "contact") {
    navBtns.contact.classList.add("active");
  }

  if (screenName === "profile") {
    navBtns.profile.classList.add("active");
  }
}

async function loadUpcomingSchedule() {
  const container = document.getElementById("upcoming-schedule");

  if (!container) return;

  try {
    const response = await fetch(UPCOMING_SCHEDULE_API_URL, {
  headers: {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  },
});

    if (!response.ok) {
      throw new Error(`Schedule request failed: ${response.status}`);
    }

    const data = await response.json();
    const meetings = Array.isArray(data.meetings) ? data.meetings : [];

    if (!meetings.length) {
      container.innerHTML = `
        <article class="card">
          <h4>No upcoming meetings found</h4>
          <p class="small-note">
            No House or Senate committee meetings are currently listed for
            the next seven days.
          </p>
        </article>
      `;
      return;
    }

    container.innerHTML = meetings
      .map((meeting) => {
        const date = new Date(meeting.date);

        const dateLabel = new Intl.DateTimeFormat("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(date);

        const chamber = meeting.chamber === "house"
          ? "House"
          : meeting.chamber === "senate"
            ? "Senate"
            : "Joint";

        const chamberClass = meeting.chamber === "house"
          ? "house"
          : meeting.chamber === "senate"
            ? "senate"
            : "";

        const details = [
          meeting.location,
          dateLabel,
        ]
          .filter(Boolean)
          .join(" · ");

        const link = meeting.url
          ? `
            <p class="source-link">
              <a
                href="${escapeHtml(meeting.url)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                View official meeting page →
              </a>
            </p>
          `
          : "";

        return `
          <article class="card">
            <div class="meta">
              <span class="badge ${chamberClass}">
                ${chamber}
              </span>
              <span>${escapeHtml(dateLabel)}</span>
            </div>

            <h4>${escapeHtml(meeting.title)}</h4>

            ${
              meeting.location
                ? `<p class="small-note">${escapeHtml(meeting.location)}</p>`
                : ""
            }

            ${link}
          </article>
        `;
      })
      .join("");
  } catch (error) {
    console.error("Could not load upcoming schedule:", error);

    container.innerHTML = `
      <article class="card error-card">
        <h4>Could not load the upcoming schedule</h4>
        <p class="small-note">Refresh the page and try again.</p>
      </article>
    `;
  }
}

const WATCHLIST_STORAGE_KEY = "wa_watchlist";

function getWatchlist() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(WATCHLIST_STORAGE_KEY)
    );

    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    console.warn("Could not load watchlist:", error);
    return [];
  }
}

function saveWatchlist(watchlist) {
  localStorage.setItem(
    WATCHLIST_STORAGE_KEY,
    JSON.stringify(watchlist)
  );
}

function getWatchlistItemId(item) {
  return `${item.type}:${item.id}`;
}

function getBriefingWatchlistItem(item) {
  const fallbackId = [
    item.chamber,
    item.date,
    item.headline,
  ]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return {
    type: "bill",
    id: item.sourceUrl || fallbackId,
    number: "",
    title: item.headline || "Congressional activity",
    summary:
      item.whatItMeans ||
      item.whatHappened ||
      "No plain-language summary is available for this item yet.",
    url: item.sourceUrl || "",
  };
}

function isOnWatchlist(item) {
  const itemId = getWatchlistItemId(item);

  return getWatchlist().some((savedItem) => {
    return getWatchlistItemId(savedItem) === itemId;
  });
}

function addToWatchlist(item) {
  const watchlist = getWatchlist();
  const itemId = getWatchlistItemId(item);

  const alreadySaved = watchlist.some((savedItem) => {
    return getWatchlistItemId(savedItem) === itemId;
  });

  if (alreadySaved) {
    return false;
  }

  watchlist.push(item);
  saveWatchlist(watchlist);

  return true;
}

function renderHome() {
  const briefing = state.briefing;

  if (!briefing) {
    return;
  }

  const dateElement = document.getElementById("briefing-date");

  if (dateElement) {
    dateElement.textContent = `Briefing for ${briefing.date}`;
  }

  renderRecentActivity(briefing.recentActivity || []);


  // Coming Up will be added later when the schedule section is ready.
}

function renderRecentActivity(items) {
  const container = document.getElementById("recent-activity");

  if (!container) {
    return;
  }

  const list = (Array.isArray(items) ? [...items] : [])
  .sort((a, b) => {
    const aDate = Date.parse(a.date || "") || 0;
    const bDate = Date.parse(b.date || "") || 0;

    return bDate - aDate;
  })
  .slice(0, 10);

  if (!list.length) {
    container.innerHTML = `
      <article class="card">
        <h4>No recent activity available</h4>
        <p>
          The latest House and Senate activity has not been published yet.
        </p>
      </article>
    `;
    return;
  }

  const houseItems = list.filter(
    (item) => item.chamber === "house"
  );

  const senateItems = list.filter(
    (item) => item.chamber === "senate"
  );

  function renderChamber(title, chamberItems) {
    if (!chamberItems.length) {
      return "";
    }

    return `
      <article class="card chamber-recap">
        <h4>${escapeHtml(title)}</h4>

        ${chamberItems
          .map((item) => {
            const dateHtml = item.date
              ? `<p class="activity-date">${escapeHtml(item.date)}</p>`
              : "";

            const meaningHtml = item.whatItMeans
              ? `
                <p>
                  <strong>What it means:</strong>
                  ${escapeHtml(item.whatItMeans)}
                </p>
              `
              : "";

            const sourceHtml = item.sourceUrl
              ? `
                <p>
                  <a
                    href="${escapeAttribute(item.sourceUrl)}"
                    target="_blank"
                    rel="noopener noreferrer">
                    View source
                  </a>
                </p>
              `
              : "";
			  
			  const watchlistItem = getBriefingWatchlistItem(item);
const alreadyWatching = isOnWatchlist(watchlistItem);

const watchlistButtonHtml = `
  <button
    class="add-watchlist-button"
    type="button"
    data-watchlist-id="${escapeAttribute(watchlistItem.id)}"
    ${alreadyWatching ? "disabled" : ""}
  >
    ${
      alreadyWatching
        ? "On Watchlist"
        : "Add to Watchlist"
    }
  </button>
`;

            return `
              <div class="activity-item">
                ${dateHtml}
                <h5>${escapeHtml(item.headline)}</h5>
                <p>${escapeHtml(item.whatHappened)}</p>
                ${meaningHtml}
                ${sourceHtml}
				${watchlistButtonHtml}
              </div>
            `;
          })
          .join("")}
      </article>
    `;
  }

  container.innerHTML =
    renderChamber("House of Representatives", houseItems) +
    renderChamber("Senate", senateItems);
}

document
  .getElementById("recent-activity")
  ?.addEventListener("click", (event) => {
    const button = event.target.closest(".add-watchlist-button");

    if (!button) {
      return;
    }

    const watchlistId = button.dataset.watchlistId;

    const activityItems =
      state.briefing?.recentActivity || [];

    const briefingItem = activityItems.find((item) => {
      const itemToCompare = getBriefingWatchlistItem(item);

      return itemToCompare.id === watchlistId;
    });

    if (!briefingItem) {
      console.warn(
        "Could not find the briefing item to add to the watchlist."
      );

      button.textContent = "Could Not Add";
      return;
    }

    const watchlistItem = getBriefingWatchlistItem(briefingItem);
    const added = addToWatchlist(watchlistItem);

    if (added) {
      button.textContent = "Added to Watchlist";
      button.disabled = true;
      return;
    }

    button.textContent = "On Watchlist";
    button.disabled = true;
  });


function renderComingUp(items) {
  const container = document.getElementById("coming-up");

  const list = Array.isArray(items) ? items : [];

  if (!list.length) {
    container.innerHTML = `
      <article class="card">
        <p>No upcoming events are currently published.</p>
      </article>
    `;
    return;
  }

  container.innerHTML = "";

  list.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";

    card.innerHTML = `
      <h4>${escapeHtml(item.title || "Upcoming event")}</h4>
      <p class="subhead">${escapeHtml(item.time || "")}</p>
      <p>${escapeHtml(item.why || item.description || "")}</p>
    `;

    container.appendChild(card);
  });
}


function memberImageHtml(member) {
  const id = String(member.bioguide_id || "").trim();

  if (!id) {
    return `
      <div class="member-thumb member-thumb-placeholder"
           aria-label="No portrait available">?</div>
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
      style="display:none"
      aria-label="No portrait available">
      ?
    </div>
  `;
}



function renderContact() {
  const container = document.getElementById("contact-list");

  if (!state.members || !state.members.length) {
    container.innerHTML = `
      <article class="card">
        <p>No members found. Add your address to see your delegation.</p>
      </article>
    `;
    return;
  }

  const houseMember = state.members.find(m => m.chamber === "house");
  const senators = state.members.filter(m => m.chamber === "senate");

  const orderedMembers = houseMember
    ? [houseMember, ...senators]
    : senators;

  container.innerHTML = orderedMembers
    .map(member => {
      const isHouse = member.chamber === "house";
      const chamberLabel = isHouse
        ? "U.S. House of Representatives"
        : "U.S. Senate";

      const districtInfo = isHouse
        ? ` — ${member.state}-${member.district}`
        : ` — ${member.state}`;

      // Use flat fields from the edge function response
      const contactLines = [];

      if (member.phone) {
        contactLines.push(`Phone: ${escapeHtml(member.phone)}`);
      }
      if (member.website) {
        contactLines.push(
          `<a href="${escapeAttribute(member.website)}" target="_blank" rel="noopener">Website</a>`
        );
      }
      if (member.email) {
        contactLines.push(`Email: ${escapeHtml(member.email)}`);
      }
      if (member.contact_form) {
        contactLines.push(
          `<a href="${escapeAttribute(member.contact_form)}" target="_blank" rel="noopener">Contact form</a>`
        );
      }

      const contactHtml = contactLines.length
        ? contactLines.map(l => `<p>${l}</p>`).join("")
        : "<p>No contact details available.</p>";

      const imgHtml = memberImageHtml(member);
  

      return `
        <article class="card">
          <div class="member-row">
            ${imgHtml}
            <div class="member-info">
              <h4>${escapeHtml(member.full_name)} [${escapeHtml(member.party)}]</h4>
              <p><strong>${chamberLabel}${districtInfo}</strong></p>
              ${contactHtml}
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderProfile() {
  document.getElementById("profile-zip").textContent =
    state.zip || "Not set";
}

function handleChangeZip() {
  localStorage.removeItem("wa_zip");
  localStorage.removeItem("wa_state");
  localStorage.removeItem("wa_district");
  localStorage.removeItem("wa_members");

  state.zip = null;
  state.members = [];
  state.selectedState = null;
  state.selectedDistrict = null;
  state.briefing = null;

  renderSidebarDelegation();

  navigateTo("onboarding");

  document.getElementById("street-input")?.focus();
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

function setLoading(isLoading) {
  const onboardingForm = document.getElementById("address-form");
  if (!onboardingForm) return;

  const button = onboardingForm.querySelector("button[type='submit']");
  if (!button) return;

  if (isLoading) {
    button.disabled = true;
    button.textContent = "Loading...";
  } else {
    button.disabled = false;
    button.textContent = "Find my representatives";
  }
}

function renderOnboarding() {
  // Ensure we are visually on the onboarding screen
  navigateTo("onboarding");

  // Optional: pre-fill state/ZIP from localStorage if you want
  const savedState = localStorage.getItem("wa_state");
  const savedZip = localStorage.getItem("wa_zip");

  const stateInput = document.getElementById("address-state-input");
  const zipInput = document.getElementById("address-zip-input");

  if (stateInput && savedState) {
    stateInput.value = savedState.toUpperCase();
  }

  if (zipInput && savedZip) {
    zipInput.value = savedZip;
  }
}

async function loadBriefing() {
  try {
    const result = await callEdgeFunction("get-briefing", {
      method: "GET",
    });

    console.log("Raw get-briefing response:", result);

state.briefing = normalizeBriefing(result);

console.log("Normalized briefing:", state.briefing);

    // If the Home screen is currently visible, redraw it immediately.
    if (state.currentScreen === "home") {
      renderHome();
    }
  } catch (error) {
    console.error("Briefing lookup error:", error);

   state.briefing = {
  date: "Briefing unavailable",
  recentActivity: [],
  topStories: [],
  comingUp: [],
};

    if (state.currentScreen === "home") {
      renderHome();
    }
  }
}

function loadSavedDelegation() {
  const savedZip = localStorage.getItem("wa_zip");
  const savedState = localStorage.getItem("wa_state");
  const savedDistrict = localStorage.getItem("wa_district");

  let savedMembers = [];

  try {
    const rawMembers = localStorage.getItem("wa_members");

    savedMembers = rawMembers ? JSON.parse(rawMembers) : [];
  } catch (error) {
    console.warn("Could not load saved delegation:", error);
    savedMembers = [];
  }

  state.zip = savedZip || null;
  state.selectedState = savedState || null;
  state.selectedDistrict = savedDistrict || null;
  state.members = Array.isArray(savedMembers) ? savedMembers : [];
}

async function init() {
  setupEventListeners();

  loadSavedDelegation();

  state.currentScreen = "home";
  renderScreen("home");

  renderSidebarDelegation();

  if (state.members.length) {
    renderContact();
  }

  showLoadingState();

  await loadBriefing();
}

init();

function openScreenFromHash() {
  const hash = window.location.hash;

  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.add("hidden");
  });

  if (hash === "#delegates") {
    document.getElementById("onboarding-screen")?.classList.remove("hidden");
    return;
  }

  if (hash === "#contact") {
    document.getElementById("contact-screen")?.classList.remove("hidden");
    return;
  }

  if (hash === "#profile") {
    document.getElementById("profile-screen")?.classList.remove("hidden");
    return;
  }

  document.getElementById("home-screen")?.classList.remove("hidden");
}

window.addEventListener("hashchange", openScreenFromHash);

openScreenFromHash();

loadUpcomingSchedule();