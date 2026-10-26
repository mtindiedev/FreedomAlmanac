const watchlistSyncModule = import("./watchlist-sync.js");
const SUPABASE_URL = "https://vwxfdgkzyndbfatajsmp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_cdrmCpjtDYFym0SpbZj_dQ_yMi8nRpF";

const BILLS_API_URL =
  "https://vwxfdgkzyndbfatajsmp.supabase.co/functions/v1/get-bills";

let allBills = [];
let activeChamber = "all";

const WATCHLIST_STORAGE_KEY = "wa_watchlist";

function getWatchlist() {
  try {
    const savedWatchlist = JSON.parse(
      localStorage.getItem(WATCHLIST_STORAGE_KEY)
    );

    return Array.isArray(savedWatchlist) ? savedWatchlist : [];
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

function getBillWatchlistItem(bill) {
  const billType = String(bill.bill_type || "").toLowerCase();
  const billNumber = String(bill.bill_number || "").trim();

  return {
    type: "bill",
    id: `119-${billType}-${billNumber}`,
    number: formatBillNumber(bill),
    title: bill.title || "Untitled measure",
    summary:
      getBillAnalysisText(bill) ||
      bill.plain_english_summary ||
      bill.summary ||
      bill.plain_language_summary ||
      bill.description ||
      "A plain-language summary is not available for this bill yet.",
    url: getCongressBillUrl(bill),
  };
}

function getBillPathFromUrl(url = "") {
  const match = String(url).match(
    /\/bill\/(\d+)th-congress\/([a-z-]+)\/(\d+)/i
  );

  if (!match) {
    return "";
  }

  const [, congress, billType, billNumber] = match;

  const normalizedType = {
    "house-bill": "hr",
    "senate-bill": "s",
    hr: "hr",
    s: "s",
  }[String(billType).toLowerCase()];

  if (!normalizedType) {
    return "";
  }

  return `${congress}-${normalizedType}-${billNumber}`;
}

function isOnWatchlist(item) {
  const itemId = getWatchlistItemId(item);

  return getWatchlist().some((savedItem) => {
    if (getWatchlistItemId(savedItem) === itemId) {
      return true;
    }

    /*
      Today page saves the bill using its Congress.gov source URL.
      Convert that URL into the Bills-page canonical ID:
      119-hr-10467 or 119-s-4395.
    */
    const savedBillIdFromUrl = getBillPathFromUrl(savedItem.url);

    if (savedBillIdFromUrl === item.id) {
      return true;
    }

    return false;
  });
}

async function addToWatchlist(item) {
  const { addAccountWatchlistItem } = await watchlistSyncModule;
  await addAccountWatchlistItem(item);
  return true;
}

function getCongressBillUrl(bill) {
  const congress = 119;
  const number = bill.bill_number;
  const type = String(bill.bill_type || "").toLowerCase();

  const billTypeNames = {
    hr: "house-bill",
    s: "senate-bill",
    hjres: "house-joint-resolution",
    sjres: "senate-joint-resolution",
    hconres: "house-concurrent-resolution",
    sconres: "senate-concurrent-resolution",
    hres: "house-resolution",
    sres: "senate-resolution",
  };

  const typeName = billTypeNames[type];

  if (!number || !typeName) {
    return "#";
  }

  return `https://www.congress.gov/bill/${congress}th-congress/${typeName}/${number}`;
}



function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function formatBillNumber(bill) {
  const type = String(bill.bill_type || "").toUpperCase();
  const number = String(bill.bill_number || "");

  if (type === "HR") {
    return `H.R. ${number}`;
  }

  if (type === "S") {
    return `S. ${number}`;
  }

  return `${type} ${number}`.trim();
}

function getBillAnalysisText(bill) {
  let analysis = bill.analysis;

  if (!analysis) {
    return "";
  }

  if (typeof analysis === "string") {
    const trimmed = analysis.trim();

    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        analysis = JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    } else {
      return trimmed;
    }
  }

  if (typeof analysis !== "object" || Array.isArray(analysis)) {
    return "";
  }

  return String(
    analysis.plain_english ||
    analysis.plain_english_summary ||
    analysis.plainEnglishSummary ||
    analysis.summary ||
    analysis.explanation ||
    ""
  ).trim();
}

function filteredBills() {
  const searchInput = document.getElementById("bill-search");
  const searchText = String(searchInput?.value || "")
    .trim()
    .toLowerCase();

  return allBills.filter((bill) => {
    const matchesChamber =
      activeChamber === "all" || bill.chamber === activeChamber;

    const searchable = [
      bill.bill_type,
      bill.bill_number,
      bill.title,
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !searchText || searchable.includes(searchText);

    return matchesChamber && matchesSearch;
  });
}

function renderBills() {
  const container = document.getElementById("bill-list");
  const count = document.getElementById("bill-count");
  const bills = filteredBills();

  if (count) {
  count.textContent =
    `${bills.length} bill${bills.length === 1 ? "" : "s"} shown`;
}

  if (!bills.length) {
    container.innerHTML = `
      <article class="card">
        <h3>No matching bills found</h3>
        <p>Try a different bill number, title, or chamber filter.</p>
      </article>
    `;
    return;
  }

  container.innerHTML = bills
    .map((bill) => {
      const isHouse = bill.chamber === "house";

      const chamberName = isHouse ? "House" : "Senate";
      const chamberClass = isHouse ? "house" : "senate";
	  
	  const analysisText = getBillAnalysisText(bill);

const analysisHtml = analysisText
  ? `
    <p class="bill-summary">
      ${escapeHtml(analysisText)}
    </p>
  `
  : "";

      return `
        <article class="card bill-card">
          <div class="meta">
            <span class="badge ${chamberClass}">
              ${chamberName}
            </span>

            <span class="bill-number">
              ${escapeHtml(formatBillNumber(bill))}
            </span>
          </div>

          <h3>${escapeHtml(bill.title || "Untitled measure")}</h3>
		  
		  ${analysisHtml}

         <p class="source-link">
  <a
    href="${escapeAttribute(getCongressBillUrl(bill))}"
    target="_blank"
    rel="noopener noreferrer"
  >
    View full bill on Congress.gov →
  </a>
</p>

<button
  class="add-watchlist-button"
  type="button"
  data-bill-type="${escapeAttribute(
    String(bill.bill_type || "").toLowerCase()
  )}"
  data-bill-number="${escapeAttribute(
    String(bill.bill_number || "")
  )}"
  ${isOnWatchlist(getBillWatchlistItem(bill)) ? "disabled" : ""}
>
  ${
    isOnWatchlist(getBillWatchlistItem(bill))
      ? "On Watchlist"
      : "Add to Watchlist"
  }
</button>
        </article>
      `;
    })
    .join("");
}

function setChamber(button) {
  document.querySelectorAll(".filter-button").forEach((item) => {
    item.classList.remove("active");
  });

  button.classList.add("active");
  activeChamber = button.dataset.chamber || "all";
  
  

  renderBills();
}
document
  .getElementById("bill-list")
  ?.addEventListener("click", async (event) => {
    const button = event.target.closest(".add-watchlist-button");

    if (!button) {
      return;
    }

    const billType = String(button.dataset.billType || "").toLowerCase();
    const billNumber = String(button.dataset.billNumber || "");

    const bill = allBills.find((item) => {
      return (
        String(item.bill_type || "").toLowerCase() === billType &&
        String(item.bill_number || "") === billNumber
      );
    });

    if (!bill) {
      console.warn("Could not find bill for watchlist:", {
        billType,
        billNumber,
      });

      button.textContent = "Could Not Add";
      return;
    }

    const watchlistItem = getBillWatchlistItem(bill);
    button.disabled = true;
    button.textContent = "Saving…";
    let added;
    try {
      added = await addToWatchlist(watchlistItem);
    } catch (error) {
      console.error("Could not save watchlist:", error);
      button.textContent = "Retry Add to Watchlist";
      button.disabled = false;
      return;
    }

    if (added) {
      button.textContent = "Added to Watchlist";
      button.disabled = true;
      return;
    }

    button.textContent = "On Watchlist";
    button.disabled = true;
  });

async function loadBills() {
  const container = document.getElementById("bill-list");

  try {
    const response = await fetch(BILLS_API_URL);

    if (!response.ok) {
      throw new Error(`Bills request failed: ${response.status}`);
    }

    const data = await response.json();

    allBills = Array.isArray(data.bills) ? data.bills : [];
	
	
	const totalBillCount = document.getElementById("total-bill-count");

if (totalBillCount) {
  const total = Number(data.totalCount);

  totalBillCount.textContent = Number.isFinite(total) && total > 0
    ? `${total.toLocaleString()} bills and resolutions introduced in the 119th Congress`
    : "Total introduced measures unavailable";
}

    allBills.sort((a, b) => {
      const aDate = new Date(a.updated_at || 0).getTime();
      const bDate = new Date(b.updated_at || 0).getTime();

      return bDate - aDate;
    });

    renderBills();
  } catch (error) {
    console.error("Could not load bills:", error);

    container.innerHTML = `
      <article class="card">
        <h3>Could not load bills</h3>
        <p>Please try again later.</p>
      </article>
    `;
  }
}

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => setChamber(button));
});


async function startBillsPage() {
  try {
    const { authClient } = await import("./auth.js");
    const { syncWatchlist } = await watchlistSyncModule;
    const { data, error } = await authClient.auth.getSession();
    if (error) throw error;
    if (data.session?.user) await syncWatchlist(data.session.user.id);
  } catch (error) {
    console.error("Watchlist sync failed; adding a bill will retry:", error);
  }
  await loadBills();
}
startBillsPage();

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
  window.location.href = "profile.html";
});

document.getElementById("nav-committees")?.addEventListener("click", () => {
  window.location.href = "committees.html";
});

document.getElementById("nav-votes")?.addEventListener("click", () => {
  window.location.href = "votes.html";
});