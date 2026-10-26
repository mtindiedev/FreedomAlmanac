const voteList = document.getElementById("vote-list");
const voteCount = document.getElementById("vote-count");
const filterButtons = document.querySelectorAll(".filter-button");

const SUPABASE_URL = "https://vwxfdgkzyndbfatajsmp.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_cdrmCpjtDYFym0SpbZj_dQ_yMi8nRpF";

const VOTES_API_URL =
  `${SUPABASE_URL}/functions/v1/get-votes`;
  

let allVotes = [];
let activeChamber = "all";

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

function getVoteClass(vote) {
  const normalizedVote = String(vote || "").toLowerCase();

  if (normalizedVote === "yes") {
    return "vote-yes";
  }

  if (normalizedVote === "no") {
    return "vote-no";
  }

  return "vote-not-voting";
}

function renderPartyTotals(partyTotals = []) {
  if (!Array.isArray(partyTotals) || !partyTotals.length) {
    return `
      <p class="small-note">
        Party totals are not available for this vote.
      </p>
    `;
  }

  const rows = partyTotals
    .map((party) => {
      return `
        <tr>
          <td>
            ${escapeHtml(party.party || "Other")}
            (${escapeHtml(party.letter || "—")})
          </td>

         <td>${party.yes ?? 0}</td>
<td>${party.no ?? 0}</td>
<td>${party.present ?? 0}</td>
<td>${party.didNotVote ?? 0}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="vote-table-wrap">
      <table class="vote-totals-table">
        <thead>
          <tr>
          <th>Party</th>
<th>Yes</th>
<th>No</th>
<th>Present</th>
<th>Did Not Vote</th>
          </tr>
        </thead>

        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function renderMemberVotes(members = []) {
  if (!Array.isArray(members) || !members.length) {
    return `
      <p class="small-note">
        Individual member votes are not available for this roll call.
      </p>
    `;
  }

  const rows = members
    .map((member) => {
      return `
        <tr>
          <td>${escapeHtml(member.name || "Unknown member")}</td>
          <td>${escapeHtml(member.state || "—")}</td>
          <td>${escapeHtml(member.district || "—")}</td>
          <td>${escapeHtml(member.party || "—")}</td>
          <td class="${getVoteClass(member.vote)}">
            ${escapeHtml(member.vote || "Did Not Vote")}
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="vote-details-table-wrap">
      <table class="vote-details-table">
        <thead>
          <tr>
            <th>Member</th>
            <th>State</th>
            <th>District</th>
            <th>Party</th>
            <th>Vote</th>
          </tr>
        </thead>

        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}
function formatBillNumber(value) {
  const billNumber = String(value || "").trim();

  if (!billNumber) {
    return "Related measure unavailable";
  }

  const parts = billNumber.split(/\s+/);

  if (parts[0] === "H" && parts[1] === "R") {
    return `H.R. ${parts.slice(2).join(" ")}`;
  }

  if (parts[0] === "S") {
    return `S. ${parts.slice(1).join(" ")}`;
  }

  if (parts[0] === "H" && parts[1] === "RES") {
    return `H.Res. ${parts.slice(2).join(" ")}`;
  }

  if (parts[0] === "S" && parts[1] === "RES") {
    return `S.Res. ${parts.slice(2).join(" ")}`;
  }

  if (parts[0] === "H" && parts[1] === "CON" && parts[2] === "RES") {
    return `H.Con.Res. ${parts.slice(3).join(" ")}`;
  }

  if (parts[0] === "S" && parts[1] === "CON" && parts[2] === "RES") {
    return `S.Con.Res. ${parts.slice(3).join(" ")}`;
  }

  if (parts[0] === "H" && parts[1] === "J" && parts[2] === "RES") {
    return `H.J.Res. ${parts.slice(3).join(" ")}`;
  }

  if (parts[0] === "S" && parts[1] === "J" && parts[2] === "RES") {
    return `S.J.Res. ${parts.slice(3).join(" ")}`;
  }

  return billNumber;
}

function getBillKey(
  billType,
  billNumber
) {
  const type = String(billType || "")
    .trim()
    .toLowerCase();

  const number = Number(billNumber || 0);

  if (!type || !number) {
    return "";
  }

  return `${type}:${number}`;
}

function getVoteBillKey(value) {
  const text = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");

  const patterns = [
    [/^H R (\d+)$/, "hr"],
    [/^S (\d+)$/, "s"],
    [/^H RES (\d+)$/, "hres"],
    [/^S RES (\d+)$/, "sres"],
    [/^H CON RES (\d+)$/, "hconres"],
    [/^S CON RES (\d+)$/, "sconres"],
    [/^H J RES (\d+)$/, "hjres"],
    [/^S J RES (\d+)$/, "sjres"],
  ];

  for (const [pattern, prefix] of patterns) {
    const match = text.match(pattern);

    if (match) {
      return `${prefix}:${match[1]}`;
    }
  }

  return "";
}


function renderVotes() {
  const validVotes = allVotes.filter(
    (vote) => vote && typeof vote === "object"
  );

  const filteredVotes =
    activeChamber === "all"
      ? validVotes
      : validVotes.filter(
          (vote) => vote.chamber === activeChamber
        );

  if (!filteredVotes.length) {
    voteCount.textContent = "No votes found for this chamber.";

    voteList.innerHTML = `
      <article class="card">
        <p>No recent votes are available for this chamber.</p>
      </article>
    `;

    return;
  }

  voteCount.textContent =
  `Showing ${filteredVotes.length} recent ` +
  `${activeChamber === "all" ? "congressional" : activeChamber} ` +
  `vote${filteredVotes.length === 1 ? "" : "s"}.`;

  voteList.innerHTML = filteredVotes
    .map((vote) => {
      const voteId = String(vote.id || "");

const billNumber = formatBillNumber(vote.billNumber);

      const title =
        vote.title ||
        vote.question ||
        "Congressional vote";

      const summary =
        vote.ollamaSummary ||
		vote.plainEnglish ||
        vote.summary ||
        "A plain-language summary is not available yet.";

      return `
        <article class="card vote-card">
          <div class="vote-card-header">
            <div>
              <p class="vote-chamber-label">
                ${escapeHtml(vote.chamberLabel || "House")}
              </p>

              <h3 class="vote-bill-number">
                ${escapeHtml(billNumber)}
              </h3>

              <p class="vote-title">
                ${escapeHtml(title)}
              </p>

              <p class="vote-summary">
                ${escapeHtml(summary)}
              </p>
            </div>

            <p class="vote-result">
              ${escapeHtml(vote.result || "Result unavailable")}
            </p>
          </div>

                    <div class="vote-meta">
            <span>
              ${escapeHtml(vote.date || "Date unavailable")}
            </span>

            <span>
              Roll Call
              ${escapeHtml(vote.rollCallNumber || "—")}
            </span>

            <span class="vote-action">
  <strong>Action:</strong>
  ${escapeHtml(
    vote.action ||
    vote.question ||
    "Vote action unavailable"
  )}
</span>
          </div>

          ${
            vote.latestAction
              ? `
                <div class="vote-latest-action">
                  <p class="vote-latest-action-label">
                   Bill status action
                  </p>

                  <p class="vote-latest-action-text">
                    ${
                      vote.latestActionDate
                        ? `${escapeHtml(
                            vote.latestActionDate
                          )} — `
                        : ""
                    }
                    ${escapeHtml(vote.latestAction)}
                  </p>

                  ${
                    vote.billStatusUrl
                      ? `
                        <a
                          href="${escapeAttribute(
                            vote.billStatusUrl
                          )}"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View bill status on Congress.gov
                        </a>
                      `
                      : ""
                  }
                </div>
              `
              : ""
          }

          <div class="vote-overall-totals">
            <span>
              <strong>Yes:</strong>
              ${vote.totals?.yes ?? 0}
            </span>

            <span>
              <strong>No:</strong>
              ${vote.totals?.no ?? 0}
            </span>

            <span>
              <strong>Present:</strong>
              ${vote.totals?.present ?? 0}
            </span>

            <span>
              <strong>Did Not Vote:</strong>
              ${vote.totals?.didNotVote ?? 0}
            </span>
          </div>

          <div class="vote-party-section">
            <h4>Party totals</h4>
            ${renderPartyTotals(vote.partyTotals)}
          </div>

          <button
            class="vote-details-button"
            type="button"
            data-vote-id="${escapeAttribute(voteId)}"
            aria-expanded="false"
            aria-controls="details-${escapeAttribute(voteId)}"
          >
            More details
          </button>

          <div
            id="details-${escapeAttribute(voteId)}"
            class="vote-details"
            hidden
          >
            <h4>
              ${escapeHtml(vote.chamberLabel || "House")}
              member votes
            </h4>

            ${renderMemberVotes(vote.members)}
          </div>
        </article>
      `;
    })
    .join("");

  document
    .querySelectorAll(".vote-details-button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const voteId = button.dataset.voteId;

        const details = document.getElementById(
          `details-${voteId}`
        );

        if (!details) {
          return;
        }

        const opening = details.hidden;

        details.hidden = !opening;

        button.setAttribute(
          "aria-expanded",
          String(opening)
        );

        button.textContent = opening
          ? "Hide details"
          : "More details";
      });
    });
}

async function loadVotes() {
  voteList.innerHTML = `
    <article class="card">
      <p>Loading recent congressional votes…</p>
    </article>
  `;

  try {
    const requestHeaders = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    };

    const votesResponse = await fetch(VOTES_API_URL, {
      headers: requestHeaders,
    });

    if (!votesResponse.ok) {
      throw new Error(
        `Votes request failed: ${votesResponse.status}`
      );
    }

    const votesData = await votesResponse.json();

    console.log("Votes response:", votesData);
    console.log("First vote:", votesData.votes?.[0]);

    allVotes = (
      Array.isArray(votesData.votes)
        ? votesData.votes
        : []
    ).map((vote) => {
      return {
        ...vote,

        action:
          vote.action ||
          vote.question ||
          "",

        latestAction:
          vote.latestAction ||
          "",

        latestActionDate:
          vote.latestActionDate ||
          "",

        billStatusUrl:
          vote.billUrl ||
          "",
      };
    });

    renderVotes();
  } catch (error) {
    console.error("Could not load votes:", error);

    voteList.innerHTML = `
      <article class="card error-card">
        <h3>Could not load recent votes</h3>
        <p>Please try again later.</p>
      </article>
    `;
  }
}

function setupFilters() {
  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeChamber = button.dataset.chamber || "all";

      filterButtons.forEach((filterButton) => {
        filterButton.classList.toggle(
          "active",
          filterButton === button
        );
      });

      renderVotes();
    });
  });
}

function setupNavigation() {
  const routes = {
    "nav-home": "index.html",
    "nav-delegates": "index.html#delegates",
    "nav-contact": "index.html#contact",
    "nav-profile": "profile.html",
    "nav-bills": "bills.html",
    "nav-votes": "votes.html",
    "nav-committees": "committees.html",
  };

  Object.entries(routes).forEach(
    ([buttonId, destination]) => {
      const button = document.getElementById(buttonId);

      button?.addEventListener("click", () => {
        window.location.href = destination;
      });
    }
  );
}

setupFilters();
setupNavigation();
loadVotes();