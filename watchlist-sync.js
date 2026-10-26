import { authClient } from "./auth.js";
const LOCAL = "wa_watchlist";
const OWNER = "wa_watchlist_owner_v1";
const key = item => `${item.type}:${item.id}`;
function read(name, fallback) {
  const value = localStorage.getItem(name);
  return value === null ? fallback : JSON.parse(value);
}
function baselineKey(userId) { return `wa_watchlist_baseline_v1:${userId}`; }
async function requireUser(userId) {
  const { data, error } = await authClient.auth.getSession();
  if (error) throw error;
  if (data.session?.user?.id !== userId) throw new Error("Account changed. Refresh and retry.");
}
function remember(userId, rows) {
  const items = databaseWatchlistToBrowser(rows);
  localStorage.setItem(LOCAL, JSON.stringify(items));
  localStorage.setItem(baselineKey(userId), JSON.stringify(items.map(key)));
  localStorage.setItem(OWNER, userId);
}
async function fetchRows(userId) {
  const { data, error } = await authClient
    .from("user_watchlist")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return await attachCurrentBillData(data || []);
}

function savedBillSummary(bill) {
  let analysis = bill.analysis;

  if (typeof analysis === "string") {
    try {
      analysis = JSON.parse(analysis);
    } catch {
      return analysis.trim();
    }
  }

  const values = [
    analysis?.plain_english,
    analysis?.plainEnglish,
    analysis?.plain_english_summary,
    analysis?.plainEnglishSummary,
    analysis?.summary,
    bill.summary,
  ];

  return values
    .find(value => typeof value === "string" && value.trim())
    ?.trim() || "";
}

function watchedBillIdentity(row) {
  if (row.item_type !== "bill") return null;

  let congress = Number(row.congress_number);
  let type = String(row.bill_type || "").trim().toLowerCase();
  let number = Number(row.bill_number);

  // Older entries may have only a Congress.gov URL.
  if (!congress || !type || !number) {
    const resolved = watchlistItemToDatabase(
      {
        type: "bill",
        id: row.item_key,
        url: row.source_url,
      },
      row.user_id
    );

    congress = Number(resolved.congress_number);
    type = String(resolved.bill_type || "").toLowerCase();
    number = Number(resolved.bill_number);
  }

  if (
    !Number.isInteger(congress) ||
    congress < 1 ||
    !/^(hr|s|hres|sres|hjres|sjres|hconres|sconres)$/.test(type) ||
    !Number.isInteger(number) ||
    number < 1
  ) {
    return null;
  }

  return {
    congress,
    type,
    number,
    key: `${congress}:${type}:${number}`,
  };
}

async function attachCurrentBillData(rows) {
  const groups = new Map();
  const identities = rows.map(watchedBillIdentity);

  for (const identity of identities) {
    if (!identity) continue;

    const groupKey = `${identity.congress}:${identity.type}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        congress: identity.congress,
        type: identity.type,
        numbers: new Set(),
      });
    }

    groups.get(groupKey).numbers.add(identity.number);
  }

  const currentBills = new Map();

  for (const group of groups.values()) {
    const numbers = [...group.numbers];

    // Batch the lookup rather than making one request per card.
    for (let offset = 0; offset < numbers.length; offset += 100) {
      const batch = numbers.slice(offset, offset + 100);

      const { data, error } = await authClient
        .from("bills")
        .select(
          "congress_number,bill_type,bill_number,title," +
          "summary,analysis,status,source_url,updated_at"
        )
        .eq("congress_number", group.congress)
        .eq("bill_type", group.type)
        .in("bill_number", batch);

      if (error) {
        throw new Error(
          `Could not load current watchlist bill data: ${error.message}`
        );
      }

      for (const bill of data || []) {
        const billKey =
          `${bill.congress_number}:` +
          `${String(bill.bill_type).toLowerCase()}:` +
          `${bill.bill_number}`;

        currentBills.set(billKey, bill);
      }
    }
  }

  return rows.map((row, index) => {
    if (row.item_type !== "bill") return row;

    const identity = identities[index];
    const bill = identity
      ? currentBills.get(identity.key)
      : null;

    if (!bill) {
      return {
        ...row,
        summary: identity
          ? "Current saved bill information is unavailable."
          : "This watchlist entry needs a valid bill identity before current information can be loaded.",
        status: "",
        bill_updated_at: null,
      };
    }

    return {
      ...row,

      // Preserve watchlist identity, creation time, and membership.
      // Replace display content with the current shared bill data.
      congress_number: identity.congress,
      bill_type: identity.type,
      bill_number: identity.number,
      title: bill.title || row.title,
      summary:
        savedBillSummary(bill) ||
        "No saved plain-language summary is available yet.",
      source_url: bill.source_url || row.source_url,
      status: bill.status || "",
      bill_updated_at: bill.updated_at || null,
    };
  });
}
let queue = Promise.resolve();
function queued(task) {
  const next = queue.then(task);
  queue = next.catch(() => {});
  return next;
}
async function sync(userId) {
  await requireUser(userId);
  const owner = localStorage.getItem(OWNER);
  const local = !owner || owner === userId ? read(LOCAL, []) : [];
  if (!Array.isArray(local)) throw new Error("Invalid local watchlist.");
  const previous = new Set(read(baselineKey(userId), []));
  const candidates = local.filter(item => !previous.has(key(item)));
  const rows = candidates.map(item => watchlistItemToDatabase(item, userId));
  const unique = [...new Map(rows.map(row => [`${row.item_type}:${row.item_key}`, row])).values()];
  if (unique.length) {
    const { error } = await authClient.from("user_watchlist").upsert(unique, {
      onConflict: "user_id,item_type,item_key", ignoreDuplicates: true,
    });
    if (error) throw error;
  }
  const saved = await fetchRows(userId);
  await requireUser(userId);
  remember(userId, saved);
  return saved;
}
export function syncWatchlist(userId) { return queued(() => sync(userId)); }
export function addAccountWatchlistItem(item) {
  return queued(async () => {
    const { data, error } = await authClient.auth.getSession();
    if (error) throw error;
    const user = data.session?.user;
    if (!user) {
      if (localStorage.getItem(OWNER)) {
        localStorage.setItem(LOCAL, "[]");
        localStorage.removeItem(OWNER);
      }
      const list = read(LOCAL, []);
      if (!list.some(saved => key(saved) === key(item))) list.push(item);
      localStorage.setItem(LOCAL, JSON.stringify(list));
      return;
    }
    await sync(user.id);
    const row = watchlistItemToDatabase(item, user.id);
    const { error: saveError } = await authClient.from("user_watchlist").upsert(row, {
      onConflict: "user_id,item_type,item_key", ignoreDuplicates: true,
    });
    if (saveError) throw saveError;
    const rows = await fetchRows(user.id);
    await requireUser(user.id);
    remember(user.id, rows);
  });
}
export function removeAccountWatchlistItem(userId, item) {
  return queued(async () => {
    await sync(userId);
    const { error } = await authClient.from("user_watchlist").delete()
      .eq("user_id", userId).eq("item_type", item.type).eq("item_key", String(item.id));
    if (error) throw error;
    const rows = await fetchRows(userId);
    await requireUser(userId);
    remember(userId, rows);
    return rows;
  });
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

