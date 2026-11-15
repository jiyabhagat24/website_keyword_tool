import {
  reportBrandRows,
  reportBuild,
  reportExportRows,
  reportFacts,
  reportIntents,
  reportKeywordIntents,
  reportQuadrants,
  reportSafeCsv,
  reportTiers,
} from "../keyword-report";
import type { StrategicRead } from "./analysis-workflow";
import { makeZip, type ZipFile } from "./zip";

type Report = ReturnType<typeof reportBuild>;

const MONTHS = [
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

function monthOrder(label: string) {
  const [month = "", year = "0"] = label.toLowerCase().split(" ");
  return Number(year) * 12 + MONTHS.indexOf(month);
}

export function keywordRows(report: Report, locations = report.locations) {
  const labels = [
    ...new Set(report.locations.flatMap((location) => location.monthLabels)),
  ].sort((a, b) => monthOrder(a) - monthOrder(b));
  const rows: unknown[][] = [
    [
      "Location",
      "Keyword",
      "Search volume",
      "Competition index",
      "Low bid (INR)",
      "High bid (INR)",
      "Volume tier",
      "Competition group",
      "Brand",
      "Brand name",
      "Intent tags",
      ...labels,
    ],
  ];
  for (const location of locations) {
    const at = new Map(location.monthLabels.map((l, i) => [l, i]));
    for (const row of location.keywords.values()) {
      rows.push([
        location.name,
        row.keyword,
        row.volume,
        row.competition,
        row.lowBidInr,
        row.highBidInr,
        reportTiers[row.tier],
        reportQuadrants[row.quadrant],
        row.brand,
        row.brandName,
        reportKeywordIntents(row).join(", "),
        ...labels.map((label) => {
          const index = at.get(label);
          return index === undefined ? "" : (row.monthly[index] ?? "");
        }),
      ]);
    }
  }
  return rows;
}

function brandRows(report: Report) {
  return [
    [
      "Brand",
      "Location",
      "Keywords",
      "Indicative volume",
      "Share of branded volume (%)",
    ],
    ...report.locations.flatMap((location) =>
      reportBrandRows(location).map(
        (row: {
          brand: string;
          keywords: number;
          volume: number;
          share: number | null;
        }) => [
          row.brand,
          location.name,
          row.keywords,
          row.volume,
          row.share === null ? "" : Number(row.share.toFixed(1)),
        ],
      ),
    ),
  ];
}

function readme(
  report: Report,
  facts: ReturnType<typeof reportFacts>,
  options: {
    sheetId?: string;
    strategicRead?: StrategicRead | null;
    generatedAt: Date;
  },
) {
  const { sheetId, strategicRead, generatedAt } = options;
  const labels = [
    ...new Set(report.locations.flatMap((location) => location.monthLabels)),
  ].sort((a, b) => monthOrder(a) - monthOrder(b));
  const national = facts.national;
  const list = (items: string[]) => items.map((item) => "- " + item).join("\n");
  const table = (head: string[], rows: unknown[][]) =>
    [
      "| " + head.join(" | ") + " |",
      "| " + head.map(() => "---").join(" | ") + " |",
      ...rows.map(
        (row) => "| " + row.map((cell) => cell ?? "").join(" | ") + " |",
      ),
    ].join("\n");
  const topLocations = facts.topLocations
    .slice(0, 12)
    .map((location: Record<string, unknown>) => [
      location.name,
      location.keywordsWithDemand,
      location.peakVolume,
      location.brandedPct,
      location.pricePct,
      location.topBrand,
    ]);
  const topBrands = (national?.topBrands ?? []).map(
    (brand: { brand: string; keywords: number; volume: number }) => [
      brand.brand,
      brand.keywords,
      brand.volume,
    ],
  );
  const sections = [
    "# Keyword report export: briefing for Claude Code",
    "",
    "Read this file first. It explains the data in the other files, the rules for using it, and what has already been calculated. Do not sum search volume across keywords (see Rules).",
    "",
    "## 1. Source",
    list([
      "Generated: " + generatedAt.toISOString(),
      "Source Google Sheet ID: " + (sheetId ?? "not recorded (CSV upload)"),
      "Locations read: " +
        report.locations.length +
        " (" +
        report.locations.map((l) => l.name).join(", ") +
        ")",
      "Distinct keywords with demand: " + report.unique,
      "Seeds: " +
        report.seedCount +
        " (from " +
        report.seedSource +
        "), seeds with demand: " +
        report.seedHits,
      "Months covered: " +
        (labels.length ? labels.join(", ") : "none found") +
        (labels.length < 12
          ? " (fewer than 12 months, so seasonality cannot be separated from growth)"
          : ""),
      "Brand list used: " +
        (report.brands.length
          ? report.brands.join(", ")
          : report.hasBrandLabels
            ? "brand labels inferred during analysis"
            : "no brand data supplied"),
      "Brands not found in any location: " +
        (report.absentBrands.length ? report.absentBrands.join(", ") : "none"),
      ...(report.errors.length
        ? ["Skipped inputs: " + report.errors.join("; ")]
        : []),
    ]),
    "",
    "## 2. Files",
    list([
      "`keywords_all_locations.csv`: every keyword in every location, one row each, with volume, competition, bids (INR), tags and the monthly volumes. This is the full dataset.",
      "`locations_summary.csv`: per-location counts, tiers, competition groups, intent shares, city-to-state ratios and seasonality (several tables in one file).",
      "`brands_by_location.csv`: brand keyword counts and indicative volume per location (only when a brand list was supplied).",
      "`facts.json`: the calculated facts sent to the AI strategic read, including selected keyword examples.",
      "`strategic_read.md`: the AI hypotheses, only when the user generated them.",
    ]),
    "",
    "## 3. Column guide (keywords_all_locations.csv)",
    list([
      "Search volume: average monthly searches, rounded by Google into buckets.",
      "Competition index: 0 to 100, advertiser competition for the phrase (not SEO difficulty). Blank when unavailable.",
      "Low bid / High bid (INR): estimated cost per click range, in rupees. Assumes the Google Ads account currency is INR.",
      "Volume tier: " + reportTiers.join(", ") + ".",
      "Competition group: " +
        reportQuadrants.join(", ") +
        ". High volume means 1,000 or more searches, high competition means an index of 50 or more.",
      "Brand / Brand name: Branded when the phrase contains a name from the supplied brand list, with the matched name. Blank when no brand list was supplied.",
      "Intent tags: rule-based by words in the phrase: " +
        reportIntents.map(([name]) => name).join(", ") +
        ". They were written for an appliance example and may fit this category loosely, so check them before relying on them.",
      "Month columns: monthly volumes. The baseline for trend indices is December 2025 (= 100).",
    ]),
    "",
    "## 4. Rules for using the data",
    list([
      "Google rounds volume into buckets, so many keywords share one value. Never add volume across keywords and call it demand. Use tiers, counts and distinct buckets. Brand and share volumes in these files add rounded values and are only indicative.",
      "Intent shares use keyword counts. Reported volume shares are a different measure and tags can overlap.",
      "Bids are what advertisers are willing to pay, not what they pay.",
      "This is search demand, not sales. It has no YouTube or Instagram data.",
      "Keep calculated facts and hypotheses apart in anything you write. Label every hypothesis.",
    ]),
    "",
    "## 5. Calculated headline numbers",
    national
      ? list([
          national.name +
            ": " +
            national.keywordsWithDemand +
            " keywords with demand across " +
            national.distinctVolumeBuckets +
            " distinct volume buckets, peak volume " +
            national.peakVolume,
          "Volume tiers: " +
            Object.entries(national.volumeTiers)
              .map(([name, count]) => name + " = " + count)
              .join("; "),
          "Competition groups: " +
            Object.entries(national.competitionGroups)
              .map(([name, count]) => name + " = " + count)
              .join("; "),
          "Keyword shares: branded " +
            national.brandedPct +
            "%, price " +
            national.pricePct +
            "%, comparison " +
            national.comparisonPct +
            "%, doubt " +
            national.doubtPct +
            "%, recipe " +
            national.recipePct +
            "%, usage " +
            national.usagePct +
            "%",
          "Seasonality note: " + (national.seasonalityNote || "none"),
        ])
      : "No national location was found.",
    "",
    "### Largest locations (by keywords with demand)",
    table(
      [
        "Location",
        "Keywords",
        "Peak volume",
        "Branded %",
        "Price %",
        "Top brand",
      ],
      topLocations,
    ),
    "",
    "### Top brands nationally (indicative volume)",
    topBrands.length
      ? table(["Brand", "Keywords", "Indicative volume"], topBrands)
      : "No brand list supplied.",
    "",
    "### Locations with no or one keyword",
    facts.locationsWithNoOrOneKeyword.length
      ? facts.locationsWithNoOrOneKeyword.join(", ")
      : "none",
    "",
    "## 6. Suggested next steps for Claude Code",
    list([
      "Check the intent tags and brand matches on a sample of rows, then fix the rules if they miss this category.",
      "Rank keywords by competition group and bid, and list the Whitespace and Cheap content wins groups with example keywords.",
      "Compare locations on the same measure and flag where one city holds most of a state's reported volume.",
      "Write findings as observation plus hypothesis. Cite the keyword, its volume tier and its bid.",
      "Do not claim festive or seasonal effects when fewer than 12 months are present.",
    ]),
  ];
  if (report.errors.length || !report.hasBrandLabels) {
    sections.push(
      "",
      "## 7. Known gaps",
      list([
        ...(!report.hasBrandLabels
          ? [
              "No brand list was supplied, so brand share and absence were not calculated.",
            ]
          : []),
        ...(report.errors.length
          ? ["Some inputs were skipped (see Source)."]
          : []),
      ]),
    );
  }
  return sections.join("\n") + "\n";
}

function strategicMarkdown(read: StrategicRead) {
  return [
    "# Strategic read (AI hypotheses, not calculated facts)",
    "",
    "Written by " +
      read.model +
      " from the calculated summary only. Check every number against the CSV files.",
    "",
    ...read.items.flatMap((item) => [
      "## " + item.section,
      "",
      "Observation: " + item.observation,
      "",
      "Hypothesis (AI): " + item.hypothesis,
      "",
    ]),
    ...(read.caveats.length
      ? ["## Caveats", "", ...read.caveats.map((c) => "- " + c), ""]
      : []),
  ].join("\n");
}

/** One ZIP with all report data plus a briefing file written for Claude Code. */
export function buildClaudeBundle(
  report: Report,
  options: { sheetId?: string; strategicRead?: StrategicRead | null } = {},
): { name: string; bytes: Uint8Array<ArrayBuffer> } {
  const generatedAt = new Date();
  const facts = reportFacts(report);
  const csv = (rows: unknown[][]) => "﻿" + reportSafeCsv(rows);
  const files: ZipFile[] = [
    {
      name: "README_FOR_CLAUDE_CODE.md",
      content: readme(report, facts, { ...options, generatedAt }),
    },
    { name: "keywords_all_locations.csv", content: csv(keywordRows(report)) },
    { name: "locations_summary.csv", content: csv(reportExportRows(report)) },
    ...(report.hasBrandLabels
      ? [{ name: "brands_by_location.csv", content: csv(brandRows(report)) }]
      : []),
    { name: "facts.json", content: JSON.stringify(facts, null, 2) },
    ...(options.strategicRead
      ? [
          {
            name: "strategic_read.md",
            content: strategicMarkdown(options.strategicRead),
          },
        ]
      : []),
  ];
  const stamp = generatedAt.toISOString().slice(0, 10);
  return {
    name: "keyword-report-for-claude-code-" + stamp + ".zip",
    bytes: makeZip(files, generatedAt),
  };
}
