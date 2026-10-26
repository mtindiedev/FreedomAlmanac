const SUPABASE_URL = "https://vwxfdgkzyndbfatajsmp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_cdrmCpjtDYFym0SpbZj_dQ_yMi8nRpF";


const committeeList = document.getElementById("committee-list");
const filterButtons = document.querySelectorAll(".committee-filter");

let allCommittees = [];
let activeChamber = "all";


async function loadCommittees() {
  committeeList.innerHTML = "<p>Loading congressional committees...</p>";

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/congress-committees`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Could not load committees: ${response.status}`);
    }

    const data = await response.json();

    allCommittees = Array.isArray(data.committees)
      ? data.committees
      : [];

    renderCommittees();
  } catch (error) {
    console.error(error);

    committeeList.innerHTML = `
      <p class="error-message">
        Committee information could not be loaded right now.
      </p>
    `;
  }
}

function renderCommittees() {
  const visibleCommittees = allCommittees.filter((committee) => {
    return activeChamber === "all" || committee.chamber === activeChamber;
  });

  if (!visibleCommittees.length) {
    committeeList.innerHTML = "<p>No committees found.</p>";
    return;
  }

  committeeList.innerHTML = visibleCommittees
    .map((committee) => {
      const name = escapeHtml(committee.name || "Unnamed committee");
      const chamber = escapeHtml(committee.chamber);

      return `
        <article class="committee-card">
          <p class="committee-chamber">${chamber}</p>
          <h2>${name}</h2>
        </article>
      `;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeChamber = button.dataset.chamber;

    filterButtons.forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    renderCommittees();
  });
});

loadCommittees();

function setupEventListeners() {
  const addressForm = document.getElementById("address-form");

  addressForm?.addEventListener("submit", handleAddressSubmit);
   
   const billsButton = document.getElementById("nav-bills");
   
   const committeesButton = document.getElementById("nav-committees");
   
   const votesButton = document.getElementById("nav-votes");

committeesButton?.addEventListener("click", () => {
  window.location.href = "committees.html";
});

  billsButton?.addEventListener("click", () => {
    window.location.href = "bills.html";
  });
  
  votesButton?.addEventListener("click", () => {
  window.location.href = "votes.html";
});

  const navigation = {
    "nav-home": "home",
    "nav-delegates": "onboarding",
    "nav-contact": "contact",
    "nav-profile": "profile",
	"nav-votes": "votes",

    "nav-home-sidebar": "home",
    "nav-delegates-sidebar": "onboarding",
    "nav-contact-sidebar": "contact",
    "nav-profile-sidebar": "profile",
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

document.getElementById("nav-home")?.addEventListener("click", () => {
  window.location.href = "index.html";
});

document.getElementById("nav-delegates")?.addEventListener("click", () => {
  window.location.href = "index.html#delegates";
});

document.getElementById("nav-contact")?.addEventListener("click", () => {
  window.location.href = "index.html#contact";
});

document.getElementById("nav-profile")?.addEventListener("click", () => {
  window.location.href = "index.html#profile";
});

document.getElementById("nav-bills")?.addEventListener("click", () => {
  window.location.href = "bills.html";
});

document.getElementById("nav-votes")?.addEventListener("click", () => {
  window.location.href = "votes.html";
});