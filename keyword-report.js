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
  if (rows.length && (keywordColumn < 0 || volumeColumn < 0)) {
    throw new Error("Expected Keyword and Search volume columns.");
  }
  const months = columns
    .flatMap((label, index) => {
      const match = label.match(/^([a-z]+) (\d{4})$/);
      const month = match ? reportMonthNames.indexOf(match[1]) : -1;
      return month < 0
        ? []
        : [{ label, index, order: Number(match[2]) * 12 + month, ratios: [] }];
    })
    .sort((left, right) => left.order - right.order);
  const baseline = months.find((month) => month.label === reportBaseline);
  const keywords = new Map();
  const tiers = reportTiers.map(() => 0);
  const quadrants = reportQuadrants.map(() => 0);
  const buckets = new Set();
  let maxVolume = null;
  let branded = 0;
  const intentCounts = reportIntents.map(() => 0);
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
    keywords.set(key, {
      keyword,
      volume,
      competition,
      tier,
      quadrant,
      ...tags,
    });
    tiers[tier]++;
    quadrants[quadrant]++;
    buckets.add(volume);
    maxVolume = Math.max(maxVolume ?? 0, volume);
    if (tags.brand === "Branded") branded++;
    for (const intent of tags.intents) intentCounts[intent]++;
    const baseVolume = reportReadNumber(row[baseline?.index]);
    if (!baseVolume) continue;
    for (const month of months) {
      const monthly = reportReadNumber(row[month.index]);
      if (monthly !== null) month.ratios.push((100 * monthly) / baseVolume);
    }
  }
  /** @type {{label: string, index: number | null, pairs: number}[]} */
  const seasonality = months.map((month) => ({
    label: month.label.replace(/^./, (letter) => letter.toUpperCase()),
    index: reportMedian(month.ratios),
    pairs: month.ratios.length,
  }));
  const usableMonths = seasonality.filter((month) => month.pairs).length;
  const seasonNote = !baseline
    ? "No December 2025 column"
    : !usableMonths
      ? "No keywords with a positive December baseline"
      : usableMonths < 12
        ? "Fewer than 12 usable months"
        : "";
  return {
    name,
    keywords,
    tiers,
    quadrants,
    seedHits: 0,
    cityState:
      /** @type {{name: string, index: number | null, pairs: number} | null} */ (
        null
      ),
    buckets: buckets.size,
    maxVolume,
    seasonality,
    seasonNote,
    branded,
    intentCounts,
  };
}

function reportBuild(sources, rawBrands, locationNames = LOCATIONS) {
  const locations = [];
  const errors = [];
  const seeds = new Set();
  const websiteSeeds = new Set();
  const brands = [
    ...new Set(rawBrands.split(",").map(reportNormalize).filter(Boolean)),
  ];
  const brandPattern = brands.length
    ? new RegExp(
        "(?:^|[^\\p{L}\\p{N}])(?:" +
          brands
            .map((brand) => brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("|") +
          ")(?=$|[^\\p{L}\\p{N}])",
        "u",
      )
    : null;
  const tagsByKeyword = new Map();
  function getTags(keyword) {
    if (!tagsByKeyword.has(keyword)) {
      tagsByKeyword.set(keyword, {
        brand: brandPattern
          ? brandPattern.test(keyword)
            ? "Branded"
            : "Generic"
          : "",
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
    for (const [keyword, row] of location.keywords) {
      const stateRow = state.keywords.get(keyword);
      if (stateRow) ratios.push((100 * row.volume) / stateRow.volume);
    }
    location.cityState = {
      name: state.name,
      index: reportMedian(ratios),
      pairs: ratios.length,
    };
  }

  locations.sort(
    (left, right) =>
      right.keywords.size - left.keywords.size ||
      left.name.localeCompare(right.name),
  );
  return {
    locations,
    errors,
    unique: tagsByKeyword.size,
    brands,
    seedCount: selectedSeeds.size,
    seedHits: seedHits.size,
    seedSource: websiteSeeds.size
      ? "Website Input kw: entries"
      : "Keyword input",
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
      "City",
      "State",
      "Median city-to-state volume ratio (%)",
      "Matched keywords",
    ],
    ...report.locations
      .filter((location) => location.cityState)
      .map((location) => [
        location.name,
        location.cityState.name,
        fmt(location.cityState.index),
        location.cityState.pairs,
      ]),
    [],
    [
      "Location",
      "Month",
      "Seasonality index (December 2025 = 100)",
      "Matched keywords",
      "Coverage",
    ],
    ...report.locations.flatMap((location) =>
      location.seasonality.length
        ? location.seasonality.map((month) => [
            location.name,
            month.label,
            fmt(month.index),
            month.pairs,
            location.seasonNote,
          ])
        : [[location.name, "", "", 0, location.seasonNote]],
    ),
  ];
}

export {
  reportBuild,
  reportExportRows,
  reportSafeCsv,
  reportPercent,
  reportNormalize,
  reportNumber,
  reportTiers,
  reportQuadrants,
  reportIntents,
};
