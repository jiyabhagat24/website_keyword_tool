import { LOCATIONS } from "./src/config";
("use strict");

const reportVolumeFloor = 1000;
const reportCompetitionFloor = 50;
const reportBaseline = "december 2025";
const reportTiers = [
  "1–99",
  "100–999",
  "1,000–9,999",
  "10,000–99,999",
  "100,000+",
];
const reportQuadrants = [
  "Pay full price",
  "Cheap content wins",
  "Emerging",
  "Whitespace",
  "Competition unavailable",
];
/** @type {[string, RegExp][]} */
const reportIntents = [
  [
    "Price",
    /\b(?:price|cost|cheap|budget|discount|affordable|under\s+(?:rs\.?\s*)?\d[\d,.]*k?)\b/i,
  ],
  ["Comparison", /\b(?:vs\.?|versus|compare|comparison|alternatives?)\b/i],
  [
    "Doubt",
    /^(?:is|are|can|does|do|will|should)\b|\b(?:safe|healthy|worth it|side effects)\b/i,
  ],
  ["Recipe", /\brecipes?\b/i],
  [
    "Usage",
    /\b(?:how to|how long|how much|cook time|cooking time|temperature|settings|cleaning)\b/i,
  ],
];
const reportCityParents = new Map(
  Object.entries({
    bengaluru: "Karnataka",
    cmr: "Tamil Nadu",
    coimbatore: "Tamil Nadu",
    hyderabad: "Telangana",
    mmr: "Maharashtra",
    pmr: "Maharashtra",
    nagpur: "Maharashtra",
    amr: "Gujarat",
    kmr: "West Bengal",
    jaipur: "Rajasthan",
    lucknow: "Uttar Pradesh",
    indore: "Madhya Pradesh",
    kochi: "Kerala",
    ernakulam: "Kerala",
    thiruvananthapuram: "Kerala",
  }),
);
const reportMonthNames = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const reportNumber = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 1,
});
const reportNormalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
const reportPercent = (part, total) => (total ? (100 * part) / total : null);

function reportParseCsv(input) {
  const text = input.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closed = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (quoted) {
      if (character !== '"') field += character;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (character === "," || character === "\r" || character === "\n") {
      row.push(field);
      field = "";
      closed = false;
      if (character === ",") continue;
      if (character === "\r" && text[i + 1] === "\n") i++;
      rows.push(row);
      row = [];
    } else if (character === '"' && !field && !closed) {
      quoted = true;
    } else {
      if (character === '"' || closed)
        throw new Error("The CSV contains an invalid quoted field.");
      field += character;
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  if (field || row.length || closed) rows.push([...row, field]);
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

function reportReadNumber(raw) {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function reportReadBid(raw, header, unmarkedBidsInRupees) {
  const text = String(raw ?? "").trim();
  const amount = reportReadNumber(text.replace(/^₹\s*/, ""));
  if (amount === null) return null;
  if (text.startsWith("₹") || / \((?:₹|inr)\)$/.test(header)) return amount;
  if (header.endsWith(" (micros)") || !unmarkedBidsInRupees)
    return amount / 1_000_000;
  return amount;
}

function reportMedian(values) {
  if (!values.length) return null;
  values.sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  return values.length % 2
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}

function reportTier(volume) {
  return volume < 100
    ? 0
    : volume < 1000
      ? 1
      : volume < 10000
        ? 2
        : volume < 100000
          ? 3
          : 4;
}

function reportQuadrant(volume, competition) {
  if (competition === null) return 4;
  if (volume >= reportVolumeFloor)
    return competition >= reportCompetitionFloor ? 0 : 1;
  return competition >= reportCompetitionFloor ? 2 : 3;
}

function reportFileLabel(filename, knownNames) {
  const stem = filename.replace(/\.csv$/i, "").trim();
  const normalized = reportNormalize(stem);
  return (
    knownNames.find((name) => {
      const location = reportNormalize(name);
      return (
        normalized === location ||
        normalized.endsWith(" - " + location) ||
        normalized.endsWith(" – " + location)
      );
    }) ?? stem
  );
}

function reportReadLocation(name, rows, getTags) {
  const [header = [], ...records] = rows;
  const columns = header.map(reportNormalize);
  const keywordColumn = columns.indexOf("keyword");
  const volumeColumn = columns.findIndex((label) =>
    [
      "search volume",
      "avg. monthly searches",
      "avg monthly searches",
      "avgmonthlysearches",
    ].includes(label),
  );
  const competitionColumn = columns.indexOf("competition index");
  const lowBidColumn = columns.findIndex((label) =>
    /^low (?:bid|big)(?: \((?:₹|inr|micros)\))?$/.test(label),
  );
  const highBidColumn = columns.findIndex((label) =>
    /^high bid(?: \((?:₹|inr|micros)\))?$/.test(label),
  );
  if (rows.length && (keywordColumn < 0 || volumeColumn < 0)) {
    throw new Error("Expected Keyword and Search volume columns.");
  }
  // The older workflows write integer micros into unlabelled bid columns.
  const unmarkedBidColumns = [lowBidColumn, highBidColumn].filter((index) =>
    ["low big", "low bid", "high bid"].includes(columns[index]),
  );
  const unmarkedBidsInRupees = records.some((row) =>
    unmarkedBidColumns.some((index) => {
      const text = (row[index] ?? "").trim();
      const amount = reportReadNumber(text);
      return (
        text.startsWith("₹") || (amount !== null && !Number.isInteger(amount))
      );
    }),
  );
  const months = columns
    .flatMap((label, index) => {
      const match = label.match(/^([a-z]+) (\d{4})$/);
      const month = match ? reportMonthNames.indexOf(match[1]) : -1;
      return month < 0
        ? []
        : [{ label, index, order: Number(match[2]) * 12 + month, ratios: [] }];
    })
    .sort((left, right) => left.order - right.order);
  const baselineIndex = months.findIndex(
    (month) => month.label === reportBaseline,
  );
  const baseIndex = Math.max(0, baselineIndex);
  /** @type {string[]} */
  const monthLabels = months.map(
    ({ label }) => label[0].toUpperCase() + label.slice(1),
  );
  /** @type {Map<string, {keyword: string, volume: number, competition: number | null, lowBidInr: number | null, highBidInr: number | null, tier: number, quadrant: number, monthly: (number | null)[], brand: string, brandName: string, intents: number[]}>} */
  const keywords = new Map();
  const tiers = reportTiers.map(() => 0);
  const quadrants = reportQuadrants.map(() => 0);
  const buckets = new Set();
  let maxVolume = null;
  let branded = 0;
  let reportedVolume = 0;
  let brandedVolume = 0;
  const intentCounts = reportIntents.map(() => 0);
  const intentVolumes = reportIntents.map(() => 0);
  /** @type {Map<string, {keywords: number, volume: number, monthlyRatios: number[][]}>} */
  const brandStats = new Map();
  for (const row of records) {
    const keyword = (row[keywordColumn] ?? "").trim();
    const key = reportNormalize(keyword);
    const volume = reportReadNumber(row[volumeColumn]);
    if (!key || !volume || keywords.has(key)) continue;
    const index = reportReadNumber(row[competitionColumn]);
    const competition = index !== null && index <= 100 ? index : null;
    const tier = reportTier(volume);
    const quadrant = reportQuadrant(volume, competition);
    const tags = getTags(key);
    const monthly = months.map(({ index }) => reportReadNumber(row[index]));
    const baseVolume = monthly[baseIndex];
    keywords.set(key, {
      keyword,
      volume,
      competition,
      lowBidInr: reportReadBid(
        row[lowBidColumn],
        columns[lowBidColumn] ?? "",
        unmarkedBidsInRupees,
      ),
      highBidInr: reportReadBid(
        row[highBidColumn],
        columns[highBidColumn] ?? "",
        unmarkedBidsInRupees,
      ),
      tier,
      quadrant,
      monthly,
      ...tags,
    });
    tiers[tier]++;
    quadrants[quadrant]++;
    buckets.add(volume);
    maxVolume = Math.max(maxVolume ?? 0, volume);
    reportedVolume += volume;
    for (const intent of tags.intents) {
      intentCounts[intent]++;
      intentVolumes[intent] += volume;
    }
    const ratios = monthly.map((value) =>
      baseVolume && value !== null ? (100 * value) / baseVolume : null,
    );
    if (tags.brand === "Branded") {
      branded++;
      brandedVolume += volume;
      const stat = brandStats.get(tags.brandName) ?? {
        keywords: 0,
        volume: 0,
        monthlyRatios: monthLabels.map(() => []),
      };
      stat.keywords++;
      stat.volume += volume;
      ratios.forEach((ratio, index) => {
        if (ratio !== null) stat.monthlyRatios[index].push(ratio);
      });
      brandStats.set(tags.brandName, stat);
    }
    ratios.forEach((ratio, index) => {
      if (ratio !== null) months[index].ratios.push(ratio);
    });
  }
  /** @type {{label: string, index: number | null, pairs: number}[]} */
  const seasonality = months.map((month, index) => ({
    label: monthLabels[index],
    index: reportMedian(month.ratios),
    pairs: month.ratios.length,
  }));
  const usableMonths = seasonality.filter((month) => month.pairs).length;
  const seasonNote = !monthLabels.length
    ? "No dated monthly columns"
    : !usableMonths
      ? `No keywords with a positive ${monthLabels[baseIndex]} baseline`
      : usableMonths < 12
        ? "Fewer than 12 usable months"
        : "";
  const brandTrends = new Map(
    [...brandStats].map(([brand, stat]) => [
      brand,
      stat.monthlyRatios.map((ratios, index) => ({
        label: monthLabels[index],
        index: reportMedian(ratios),
        pairs: ratios.length,
      })),
    ]),
  );
  return {
    name,
    keywords,
    tiers,
    quadrants,
    seedHits: 0,
    cityState:
      /** @type {{name: string, index: number | null, volumeShare: number | null, pairs: number} | null} */ (
        null
      ),
    buckets: buckets.size,
    maxVolume,
    reportedVolume,
    brandedVolume,
    intentVolumes,
    monthLabels,
    baselineLabel: monthLabels[baseIndex] ?? null,
    seasonality,
    seasonNote,
    branded,
    brandStats,
    brandTrends,
    intentCounts,
  };
}

/**
 * "Dot & Key | Dotandkey" also matches "dot and key". The first name is the
 * one shown; every other spelling counts as the same brand.
 */
function reportExpandBrand(entry) {
  const names = entry
    .split("|")
    .map((name) => name.trim())
    .filter(Boolean);
  const spellings = new Set();
  for (const name of names) {
    spellings.add(name);
    const spelled = name.replace(/\s*&\s*/g, " and ").replace(/\s+/g, " ");
    spellings.add(spelled);
    if (/\s/.test(spelled)) spellings.add(spelled.replace(/\s+/g, ""));
  }
  return [...spellings].join(" | ");
}

/**
 * Brand names and intent counts written into the keyword Sheet by the classifier.
 * Only the keyword workflow marks brands; the website workflow does not.
 */
function reportSheetInfo(sources) {
  const known = ["Keyword input", "Website Input"];
  const find = (wanted) =>
    sources.find(
      (source) =>
        !source.error &&
        source.text &&
        reportNormalize(reportFileLabel(source.name, known)) === wanted,
    );
  const column = (header, name) => header.map(reportNormalize).indexOf(name);
  const brands = new Set();
  const intents = new Map();
  const brandKeywords = new Map();
  const keywordInput = find("keyword input");
  if (keywordInput) {
    const [header = [], ...records] = reportParseCsv(keywordInput.text);
    const intentColumn = column(header, "intent");
    const brandColumn = column(header, "brand");
    for (const row of records) {
      const intent = String(row[intentColumn] ?? "").trim();
      if (intent) intents.set(intent, (intents.get(intent) ?? 0) + 1);
      const brand = String(row[brandColumn] ?? "").trim();
      if (brand) {
        brandKeywords.set(brand, (brandKeywords.get(brand) ?? 0) + 1);
        brands.add(brand);
      }
    }
  }
  return {
    brands: [...new Set([...brands].map(reportExpandBrand))],
    intents,
    brandKeywords,
  };
}

function reportBuild(sources, rawBrands, locationNames = LOCATIONS) {
  const sheetInfo = reportSheetInfo(sources);
  rawBrands = [rawBrands, ...sheetInfo.brands.filter((b) => !b.includes(","))]
    .filter(Boolean)
    .join(",");
  const locations = [];
  const errors = [];
  const seeds = new Set();
  const websiteSeeds = new Set();
  const brands = new Set();
  const brandAliases = new Map();
  for (const entry of rawBrands.split(",")) {
    const [brand, ...aliases] = entry.split("|").map(reportNormalize);
    if (!brand) continue;
    brands.add(brand);
    brandAliases.set(brand, brand);
    for (const alias of aliases.filter(Boolean))
      if (!brandAliases.has(alias)) brandAliases.set(alias, brand);
  }
  const brandPattern = brandAliases.size
    ? new RegExp(
        "(?:^|[^\\p{L}\\p{N}])(" +
          [...brandAliases.keys()]
            .sort((a, b) => b.length - a.length)
            .map((brand) => brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("|") +
          ")(?=$|[^\\p{L}\\p{N}])",
        "u",
      )
    : null;
  const tagsByKeyword = new Map();
  function getTags(keyword) {
    if (!tagsByKeyword.has(keyword)) {
      const hit = brandPattern ? brandPattern.exec(keyword) : null;
      tagsByKeyword.set(keyword, {
        brand: brandPattern ? (hit ? "Branded" : "Generic") : "",
        brandName: hit ? brandAliases.get(hit[1]) : "",
        intents: reportIntents.flatMap(([, rule], index) =>
          rule.test(keyword) ? [index] : [],
        ),
      });
    }
    return tagsByKeyword.get(keyword);
  }

  const knownNames = ["Keyword input", "Website Input", ...locationNames].sort(
    (left, right) => right.length - left.length,
  );
  const usedNames = new Set();
  for (const source of sources) {
    const name = reportFileLabel(source.name, knownNames);
    const key = reportNormalize(name);
    try {
      if (source.error) throw new Error(source.error);
      if (!key || usedNames.has(key))
        throw new Error("Use one CSV per tab, with a unique file name.");
      const rows = reportParseCsv(source.text);
      if (key === "keyword input" || key === "website input") {
        const [header = [], ...records] = rows;
        const column = header
          .map(reportNormalize)
          .indexOf(key === "keyword input" ? "keyword" : "website");
        if (column < 0) throw new Error("Expected the input tab’s header.");
        for (const row of records) {
          const value = reportNormalize(row[column]);
          if (key === "keyword input" && value) seeds.add(value);
          if (
            key === "website input" &&
            value.startsWith("kw:") &&
            value.slice(3).trim()
          )
            websiteSeeds.add(value.slice(3).trim());
        }
      } else {
        locations.push(reportReadLocation(name, rows, getTags));
      }
      usedNames.add(key);
    } catch (error) {
      errors.push(source.name + " · " + error.message);
    }
  }

  const selectedSeeds = websiteSeeds.size ? websiteSeeds : seeds;
  const seedHits = new Set();
  const byLocation = new Map(
    locations.map((location) => [reportNormalize(location.name), location]),
  );
  for (const location of locations) {
    location.seedHits = 0;
    for (const keyword of location.keywords.keys()) {
      if (!selectedSeeds.has(keyword)) continue;
      location.seedHits++;
      seedHits.add(keyword);
    }
    const stateName = reportCityParents.get(reportNormalize(location.name));
    const state = byLocation.get(reportNormalize(stateName));
    if (!state) continue;
    const ratios = [];
    let matchedCityVolume = 0;
    let matchedStateVolume = 0;
    for (const [keyword, row] of location.keywords) {
      const stateRow = state.keywords.get(keyword);
      if (!stateRow) continue;
      ratios.push((100 * row.volume) / stateRow.volume);
      matchedCityVolume += row.volume;
      matchedStateVolume += stateRow.volume;
    }
    location.cityState = {
      name: state.name,
      index: reportMedian(ratios),
      volumeShare: reportPercent(matchedCityVolume, matchedStateVolume),
      pairs: ratios.length,
    };
  }

  locations.sort(
    (left, right) =>
      right.keywords.size - left.keywords.size ||
      left.name.localeCompare(right.name),
  );
  const seenBrands = new Set(
    locations.flatMap((location) => [...location.brandStats.keys()]),
  );
  return {
    locations,
    errors,
    unique: tagsByKeyword.size,
    brands: [...brands],
    sheetBrandCount: sheetInfo.brands.length,
    sheetIntents: Object.fromEntries(
      [...sheetInfo.intents.entries()].sort((a, b) => b[1] - a[1]),
    ),
    sheetBrandKeywords: [...sheetInfo.brandKeywords.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([brand, keywords]) => ({ brand, keywords })),
    absentBrands: [...brands].filter((brand) => !seenBrands.has(brand)),
    seedCount: selectedSeeds.size,
    seedHits: seedHits.size,
    seedSource: websiteSeeds.size
      ? "Website Input kw: entries"
      : "Keyword input",
  };
}

/**
 * Brands in one location, largest first. Volumes are sums of Google's rounded
 * values for that brand's keywords, so they are indicative, not exact.
 */
function reportBrandRows(location) {
  const total = [...location.brandStats.values()].reduce(
    (sum, stat) => sum + stat.volume,
    0,
  );
  return [...location.brandStats.entries()]
    .map(([brand, stat]) => ({
      brand,
      keywords: stat.keywords,
      volume: stat.volume,
      share: reportPercent(stat.volume, total),
    }))
    .sort((a, b) => b.volume - a.volume || a.brand.localeCompare(b.brand));
}

function reportVolumeShares(location) {
  return {
    branded: reportPercent(location.brandedVolume, location.reportedVolume),
    intents: location.intentVolumes.map((volume) =>
      reportPercent(volume, location.reportedVolume),
    ),
  };
}

/** @param {ReturnType<typeof reportReadLocation>} location */
function reportOpportunities(location) {
  const rules = [
    { label: "Category leader", score: (row) => row.volume },
    { label: "Highest bid", score: (row) => row.highBidInr ?? 0 },
    {
      label: "High bid below 1,000 searches",
      score: (row) =>
        row.volume < reportVolumeFloor ? (row.highBidInr ?? 0) : 0,
    },
    {
      label: "High volume, low competition",
      score: (row) => (row.quadrant === 1 ? row.volume : 0),
    },
    {
      label: "Whitespace",
      score: (row) => (row.quadrant === 3 ? row.volume : 0),
    },
    ...reportIntents.map(([label], index) => ({
      label: `${label} intent`,
      score: (row) => (row.intents.includes(index) ? row.volume : 0),
    })),
  ];
  return rules.flatMap(({ label, score }) => {
    let best;
    let bestScore = 0;
    for (const row of location.keywords.values()) {
      const candidate = score(row);
      if (candidate > bestScore) {
        best = row;
        bestScore = candidate;
      }
    }
    return best ? [{ label, row: best }] : [];
  });
}

function reportPeak(trend) {
  return (
    trend?.reduce(
      (peak, point) =>
        point.index !== null && (!peak || point.index > peak.index)
          ? point
          : peak,
      null,
    ) ?? null
  );
}

/** Calculated facts and a limited set of keyword examples for the strategic read. */
function reportFacts(report, selectedLocation) {
  const round = (value) =>
    value === null || value === undefined ? null : Number(value.toFixed(1));
  const home =
    report.locations.find((l) => reportNormalize(l.name) === "india") ??
    report.locations[0];
  const focus = selectedLocation ?? home;
  const shares = (location) => ({
    brandedPct: report.brands.length
      ? round(reportPercent(location.branded, location.keywords.size))
      : null,
    ...Object.fromEntries(
      reportIntents.map(([name], index) => [
        name.toLowerCase() + "Pct",
        round(
          reportPercent(location.intentCounts[index], location.keywords.size),
        ),
      ]),
    ),
  });
  return {
    note: "Google rounds search volumes. Keyword shares use counts. Reported volume shares are indicative, use rounded values and can overlap for intent tags. Bids are INR estimates. Trend indices use a baseline of 100.",
    totals: {
      locations: report.locations.length,
      distinctKeywordsWithDemand: report.unique,
      seeds: report.seedCount,
      seedsWithDemand: report.seedHits,
    },
    national: home && {
      name: home.name,
      keywordsWithDemand: home.keywords.size,
      distinctVolumeBuckets: home.buckets,
      peakVolume: home.maxVolume,
      volumeTiers: Object.fromEntries(
        reportTiers.map((name, i) => [name, home.tiers[i]]),
      ),
      competitionGroups: Object.fromEntries(
        reportQuadrants.map((name, i) => [name, home.quadrants[i]]),
      ),
      ...shares(home),
      topBrands: reportBrandRows(home)
        .slice(0, 10)
        .map(({ brand, keywords, volume }) => ({ brand, keywords, volume })),
      seasonality: home.seasonality
        .filter((m) => m.index !== null)
        .map((m) => ({ month: m.label, index: round(m.index) })),
      seasonalityNote: home.seasonNote,
    },
    keywordExamples: focus && {
      location: focus.name,
      examples: reportOpportunities(focus).map(({ label, row }) => ({
        signal: label,
        keyword: row.keyword.slice(0, 200),
        searchVolume: row.volume,
        competitionIndex: row.competition,
        highBidInr: round(row.highBidInr),
        monthly: row.monthly.slice(-12).flatMap((value, index, months) =>
          value === null
            ? []
            : [
                {
                  month:
                    focus.monthLabels[
                      focus.monthLabels.length - months.length + index
                    ],
                  volume: value,
                },
              ],
        ),
      })),
      brandPeakMonths: reportBrandRows(focus)
        .slice(0, 8)
        .flatMap(({ brand }) => {
          const peak = reportPeak(focus.brandTrends.get(brand));
          return peak
            ? [
                {
                  brand,
                  month: peak.label,
                  index: round(peak.index),
                  matchedKeywords: peak.pairs,
                },
              ]
            : [];
        }),
    },
    masterSheet: Object.keys(report.sheetIntents ?? {}).length
      ? {
          note: "Intent and Brand were assigned by rules when the keywords were collected. Counts are keywords, not searches.",
          intentCounts: report.sheetIntents,
          brandsByKeywordCount: report.sheetBrandKeywords,
        }
      : undefined,
    topLocations: report.locations.slice(0, 12).map((location) => {
      const volumeShares = reportVolumeShares(location);
      return {
        name: location.name,
        keywordsWithDemand: location.keywords.size,
        peakVolume: location.maxVolume,
        ...shares(location),
        reportedVolumeShare: {
          branded: report.brands.length ? round(volumeShares.branded) : null,
          ...Object.fromEntries(
            volumeShares.intents.map((share, i) => [
              reportIntents[i][0],
              round(share),
            ]),
          ),
        },
        topBrand: reportBrandRows(location)[0]?.brand ?? null,
      };
    }),
    locationsWithNoOrOneKeyword: report.locations
      .filter((location) => location.keywords.size <= 1)
      .map((location) => location.name),
    cityVersusState: report.locations
      .filter((location) => location.cityState)
      .map((location) => ({
        city: location.name,
        state: location.cityState.name,
        medianCityToStateVolumePct: round(location.cityState.index),
        matchedCityToStateVolumePct: round(location.cityState.volumeShare),
      })),
    brandsNotFoundInAnyLocation: report.absentBrands,
  };
}

function reportSafeCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          let text = String(value ?? "");
          if (typeof value === "string" && /^\s*[=+@-]/.test(text))
            text = "'" + text;
          return '"' + text.replace(/"/g, '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
}

function reportExportRows(report) {
  const fmt = (value) => (value === null ? "" : Number(value.toFixed(1)));
  return [
    ["Keyword Summary"],
    ["Locations", report.locations.length],
    ["Distinct keywords with demand", report.unique],
    ["Seed source", report.seedCount ? report.seedSource : ""],
    ["Seeds", report.seedCount],
    ["Seeds matched", report.seedHits],
    [
      "Seed hit rate (%)",
      fmt(reportPercent(report.seedHits, report.seedCount)),
    ],
    [
      "Google rounds search volumes. Use bucket counts and tiers. Avoid adding volume across keywords.",
    ],
    [
      "High volume threshold",
      reportVolumeFloor,
      "High competition threshold",
      reportCompetitionFloor,
    ],
    ...(report.errors.length
      ? [["Skipped inputs"], ...report.errors.map((message) => [message])]
      : []),
    [],
    [
      "Location",
      "Keywords with demand",
      "Distinct buckets",
      "Peak volume",
      "Seed hits",
      "Seed hit rate (%)",
      "Branded share (%)",
      ...reportIntents.map(([name]) => name + " share (%)"),
      ...reportTiers,
      ...reportQuadrants,
    ],
    ...report.locations.map((location) => [
      location.name,
      location.keywords.size,
      location.buckets,
      location.maxVolume,
      report.seedCount ? location.seedHits : "",
      fmt(reportPercent(location.seedHits, report.seedCount)),
      report.brands.length
        ? fmt(reportPercent(location.branded, location.keywords.size))
        : "",
      ...location.intentCounts.map((count) =>
        fmt(reportPercent(count, location.keywords.size)),
      ),
      ...location.tiers,
      ...location.quadrants,
    ]),
    [],
    [
      "Location",
      "Branded share of reported volume (%)",
      ...reportIntents.map(([name]) => `${name} share of reported volume (%)`),
    ],
    ...report.locations.map((location) => {
      const shares = reportVolumeShares(location);
      return [
        location.name,
        report.brands.length ? fmt(shares.branded) : "",
        ...shares.intents.map(fmt),
      ];
    }),
    [],
    [
      "City",
      "State",
      "Median city-to-state volume ratio (%)",
      "City/state reported volume ratio on matched keywords (%)",
      "Matched keywords",
    ],
    ...report.locations
      .filter((location) => location.cityState)
      .map((location) => [
        location.name,
        location.cityState.name,
        fmt(location.cityState.index),
        fmt(location.cityState.volumeShare),
        location.cityState.pairs,
      ]),
    ...(report.brands.length
      ? [
          [],
          [
            "Brand",
            "Location",
            "Keywords",
            "Indicative volume",
            "Share of branded volume (%)",
            "Peak month",
            "Peak index",
            "Baseline month",
          ],
          ...report.locations.flatMap((location) =>
            reportBrandRows(location).map((row) => {
              const peak = reportPeak(location.brandTrends.get(row.brand));
              return [
                row.brand,
                location.name,
                row.keywords,
                row.volume,
                fmt(row.share),
                peak?.label,
                peak ? fmt(peak.index) : "",
                location.baselineLabel,
              ];
            }),
          ),
          [],
          ["Brands not found in any location"],
          ...report.absentBrands.map((brand) => [brand]),
        ]
      : []),
    [],
    [
      "Location",
      "Opportunity",
      "Keyword",
      "Search volume",
      "Competition index",
      "Low bid (₹)",
      "High bid (₹)",
    ],
    ...report.locations.flatMap((location) =>
      reportOpportunities(location).map(({ label, row }) => [
        location.name,
        label,
        row.keyword,
        row.volume,
        row.competition,
        row.lowBidInr,
        row.highBidInr,
      ]),
    ),
    [],
    [
      "Location",
      "Month",
      "Seasonality index",
      "Baseline month",
      "Matched keywords",
      "Coverage",
    ],
    ...report.locations.flatMap((location) =>
      location.seasonality.length
        ? location.seasonality.map((month) => [
            location.name,
            month.label,
            fmt(month.index),
            location.baselineLabel,
            month.pairs,
            location.seasonNote,
          ])
        : [[location.name, "", "", "", 0, location.seasonNote]],
    ),
  ];
}

export {
  reportBuild,
  reportBrandRows,
  reportVolumeShares,
  reportOpportunities,
  reportPeak,
  reportFacts,
  reportExportRows,
  reportSafeCsv,
  reportPercent,
  reportNormalize,
  reportNumber,
  reportTiers,
  reportQuadrants,
  reportIntents,
};
