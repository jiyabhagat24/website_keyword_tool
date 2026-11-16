import { useMemo, useState, type ReactNode, type RefObject } from "react";
import {
  reportBrandRows,
  reportBuild,
  reportClassification,
  reportKeywordIntents,
  reportNumber,
  reportPercent,
  reportTrendMovers,
} from "../keyword-report";
import type { StrategicRead } from "./analysis-workflow";
import { REGIONS, regionOf, type Region } from "./regions";
import "./dashboard.css";

type Report = ReturnType<typeof reportBuild>;
type Loc = Report["locations"][number];

interface Row {
  keyword: string;
  volume: number;
  competition: number | null;
  lowBidInr: number | null;
  highBidInr: number | null;
  tier: number;
  quadrant: number;
  monthly: (number | null)[];
  brand: string;
  brandName: string;
  intents: number[];
  sheetIntent: string;
}

const INTENT_MEANING: Record<string, string> = {
  Branded: "names a tracked brand",
  "Competitor brand": "names another brand",
  Generic: "a plain product or category term",
  "Best / Review": "looking for the best option or reviews",
  "Price / Buy": "price, deals or buying online",
  Question: "asking something, such as is it safe",
  "How-to": "wants to learn how to use or do something",
  Concern: "a skin or hair problem",
  Ingredient: "an active ingredient",
  Comparison: "comparing options",
  Local: "near me or nearby",
  Price: "price, cost or budget",
  Doubt: "is it safe, side effects, worth it",
  Usage: "how to use or apply it",
  Recipe: "recipes",
};

const fmt = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : reportNumber.format(value);
const rupees = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: value >= 100 ? 0 : 2,
      }).format(value);
const share = (part: number, total: number) => {
  const value = reportPercent(part, total);
  return value === null ? null : Math.round(value * 10) / 10;
};
const shortMonth = (label: string) => {
  const [month = "", year = ""] = label.split(" ");
  return month.slice(0, 3) + " " + year.slice(-2);
};

function intentOf(row: Row): string {
  return reportKeywordIntents(row).join(", ") || "No intent tag";
}

function signalOf(row: Row, bidCut: number): string {
  if (row.volume >= 1000 && row.competition !== null && row.competition < 50)
    return "Open ground";
  if (row.highBidInr !== null && bidCut > 0 && row.highBidInr >= bidCut)
    return "Expensive click";
  return "";
}

function Bars({
  items,
  accent = "var(--s1)",
}: {
  items: { label: string; value: number; display: string; part?: number }[];
  accent?: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="bars">
      {items.map((item) => (
        <div className="bar-row" key={item.label}>
          <span className="bar-label" title={item.label}>
            {item.label}
          </span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{
                width: (100 * item.value) / max + "%",
                background: accent,
              }}
            >
              {item.part !== undefined && (
                <span
                  className="bar-part"
                  style={{ width: Math.min(100, item.part) + "%" }}
                />
              )}
            </span>
          </span>
          <span className="bar-value">{item.display}</span>
        </div>
      ))}
    </div>
  );
}

function MonthBars({
  labels,
  values,
  baseline,
}: {
  labels: string[];
  values: (number | null)[];
  baseline?: number;
}) {
  const nums = values.filter((v): v is number => v !== null);
  const max = Math.max(1, ...nums);
  const w = 600;
  const h = 170;
  const step = w / Math.max(1, values.length);
  return (
    <svg
      viewBox={`0 0 ${w} ${h + 28}`}
      className="chart"
      role="img"
      aria-label="Monthly bar chart"
    >
      {baseline !== undefined && max > 0 && (
        <line
          x1="0"
          x2={w}
          y1={h - (baseline / max) * (h - 18)}
          y2={h - (baseline / max) * (h - 18)}
          className="baseline"
        />
      )}
      {values.map((value, i) => {
        const barH = value === null ? 0 : (value / max) * (h - 18);
        return (
          <g key={labels[i] + i}>
            <rect
              x={i * step + step * 0.18}
              y={h - barH}
              width={step * 0.64}
              height={barH}
              rx="3"
              className="bar-svg"
            >
              <title>{`${labels[i]}: ${fmt(value)}`}</title>
            </rect>
            {value !== null && (
              <text
                x={i * step + step / 2}
                y={h - barH - 5}
                textAnchor="middle"
                className="chart-num"
              >
                {fmt(Math.round(value))}
              </text>
            )}
            <text
              x={i * step + step / 2}
              y={h + 16}
              textAnchor="middle"
              className="chart-axis"
            >
              {shortMonth(labels[i])}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

type Zone = "sweet" | "crowded" | "niche" | "skip";
const ZONES: { id: Zone; name: string; hint: string }[] = [
  {
    id: "sweet",
    name: "Sweet spot",
    hint: "1,000+ searches, few advertisers. Content can win cheaply.",
  },
  {
    id: "crowded",
    name: "Crowded",
    hint: "1,000+ searches, many advertisers. Expect to pay more.",
  },
  {
    id: "niche",
    name: "Small and cheap",
    hint: "Under 1,000 searches, few advertisers. Low effort, small reward.",
  },
  {
    id: "skip",
    name: "Low value",
    hint: "Under 1,000 searches, many advertisers. Usually not worth it.",
  },
];
const zoneOf = (r: Row): Zone => {
  const high = r.volume >= 1000;
  const busy = (r.competition as number) >= 50;
  return high ? (busy ? "crowded" : "sweet") : busy ? "skip" : "niche";
};

function OpportunityMap({ rows }: { rows: Row[] }) {
  const [zone, setZone] = useState<Zone | "">("");
  const [pinned, setPinned] = useState<Row | null>(null);
  const [hover, setHover] = useState<Row | null>(null);
  const points = useMemo(
    () =>
      rows
        .filter((row) => row.competition !== null)
        .sort((a, b) => b.volume - a.volume),
    [rows],
  );
  const plotted = useMemo(() => points.slice(0, 800), [points]);
  const counts = useMemo(() => {
    const c: Record<Zone, number> = { sweet: 0, crowded: 0, niche: 0, skip: 0 };
    for (const p of points) c[zoneOf(p)]++;
    return c;
  }, [points]);
  const w = 620;
  const h = 340;
  const pad = { l: 56, r: 12, t: 12, b: 44 };
  const maxLog =
    Math.log10(Math.max(1000, ...points.map((p) => p.volume))) + 0.1;
  const minLog = 2;
  const x = (c: number) => pad.l + (c / 100) * (w - pad.l - pad.r);
  const y = (v: number) =>
    pad.t +
    (1 - (Math.log10(Math.max(100, v)) - minLog) / (maxLog - minLog)) *
      (h - pad.t - pad.b);
  const ticks = [100, 1000, 10000, 100000, 1000000].filter(
    (t) => Math.log10(t) <= maxLog,
  );
  const label = (t: number) =>
    t >= 1000000
      ? "10L"
      : t >= 100000
        ? "1L"
        : t >= 1000
          ? t / 1000 + "k"
          : "" + t;
  const shown = hover ?? pinned;
  const list = zone
    ? points.filter((p) => zoneOf(p) === zone).slice(0, 10)
    : [];
  const split = y(1000);
  return (
    <div className="opp">
      <div className="zones" role="group" aria-label="Filter by zone">
        {ZONES.map((z) => (
          <button
            key={z.id}
            type="button"
            className={"zone z-" + z.id + (zone === z.id ? " on" : "")}
            aria-pressed={zone === z.id}
            onClick={() => setZone(zone === z.id ? "" : z.id)}
          >
            <b>{z.name}</b>
            <span className="zn">{fmt(counts[z.id])} keywords</span>
            <span className="zh">{z.hint}</span>
          </button>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="chart"
        role="img"
        aria-label="Keywords by search volume and advertiser competition"
      >
        <rect
          x={x(0)}
          y={pad.t}
          width={x(50) - x(0)}
          height={split - pad.t}
          className="band"
        />
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={w - pad.r}
              y1={y(t)}
              y2={y(t)}
              className="grid"
            />
            <text
              x={pad.l - 6}
              y={y(t) + 3}
              textAnchor="end"
              className="chart-axis"
            >
              {label(t)}
            </text>
          </g>
        ))}
        <line
          x1={x(50)}
          x2={x(50)}
          y1={pad.t}
          y2={h - pad.b}
          className="grid split"
        />
        <line
          x1={pad.l}
          x2={w - pad.r}
          y1={split}
          y2={split}
          className="grid split"
        />
        <text x={x(0) + 6} y={pad.t + 14} className="zone-label">
          Sweet spot
        </text>
        <text
          x={w - pad.r - 6}
          y={pad.t + 14}
          textAnchor="end"
          className="zone-label"
        >
          Crowded
        </text>
        <text x={x(0) + 6} y={h - pad.b - 6} className="zone-label">
          Small and cheap
        </text>
        <text
          x={w - pad.r - 6}
          y={h - pad.b - 6}
          textAnchor="end"
          className="zone-label"
        >
          Low value
        </text>
        {[0, 25, 50, 75, 100].map((c) => (
          <text
            key={c}
            x={x(c)}
            y={h - pad.b + 14}
            textAnchor="middle"
            className="chart-axis"
          >
            {c}
          </text>
        ))}
        <text
          x={(pad.l + w - pad.r) / 2}
          y={h - 6}
          textAnchor="middle"
          className="axis-title"
        >
          Advertisers bidding: few ← → many (0 to 100)
        </text>
        <text
          transform={`translate(12 ${(pad.t + h - pad.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          className="axis-title"
        >
          Monthly searches (log scale)
        </text>
        {plotted.map((p) => {
          const z = zoneOf(p);
          const dim = zone && zone !== z;
          return (
            <circle
              key={p.keyword}
              cx={x(p.competition as number)}
              cy={y(p.volume)}
              r={pinned === p ? 6 : 3.4}
              className={"dot z-" + z + (dim ? " dim" : "")}
              tabIndex={dim ? -1 : 0}
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p)}
              onBlur={() => setHover(null)}
              onClick={() => setPinned(pinned === p ? null : p)}
            >
              <title>{`${p.keyword}: ${fmt(p.volume)} searches, competition ${p.competition}`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="opp-detail" aria-live="polite">
        {shown ? (
          <>
            <b>{shown.keyword}</b>
            <span>{fmt(shown.volume)} searches a month</span>
            <span>Competition {shown.competition} of 100</span>
            <span>
              Bid {rupees(shown.lowBidInr)} to {rupees(shown.highBidInr)} per
              click
            </span>
            <span className={"pill z-" + zoneOf(shown)}>
              {ZONES.find((z) => z.id === zoneOf(shown))?.name}
            </span>
          </>
        ) : (
          <span>
            Hover or tap a dot to read it. Pick a zone above to list its best
            keywords.
          </span>
        )}
      </div>
      {zone && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Top keywords in this zone</th>
                <th>Searches</th>
                <th>Competition</th>
                <th>Bid (low to high)</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.keyword}>
                  <td>{p.keyword}</td>
                  <td className="num">{fmt(p.volume)}</td>
                  <td className="num">{p.competition}</td>
                  <td className="num">
                    {rupees(p.lowBidInr)} to {rupees(p.highBidInr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {points.length > plotted.length && (
        <p className="pdesc">
          The map draws the {fmt(plotted.length)} biggest of{" "}
          {fmt(points.length)} keywords. Zone counts use all of them.
        </p>
      )}
    </div>
  );
}

export default function ReportDashboard({
  report,
  locationIndex,
  onLocation,
  actions,
  aiRead,
  aiBusy,
  aiMessage,
  onWriteAi,
  classifyArea,
  headingRef,
}: {
  report: Report;
  locationIndex: number;
  onLocation: (index: number) => void;
  actions: ReactNode;
  aiRead: StrategicRead | null;
  aiBusy: boolean;
  aiMessage: string;
  onWriteAi: () => void;
  classifyArea: ReactNode;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const loc: Loc = report.locations[locationIndex];
  const movers = useMemo(() => reportTrendMovers(loc), [loc]);
  const rows = useMemo(
    () => [...loc.keywords.values()] as unknown as Row[],
    [loc],
  );
  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => b.volume - a.volume || a.keyword.localeCompare(b.keyword),
      ),
    [rows],
  );
  const total = rows.length;
  const brandRows = useMemo(
    () =>
      reportBrandRows(loc) as {
        brand: string;
        keywords: number;
        volume: number;
        share: number | null;
      }[],
    [loc],
  );
  const hasBrands = report.hasBrandLabels;
  const classification = useMemo(
    () =>
      reportClassification(loc) as {
        value: string;
        group: string;
        label: string;
        count: number;
        share: number | null;
      }[],
    [loc],
  );
  const bidCut = useMemo(() => {
    const bids = rows
      .map((r) => r.highBidInr)
      .filter((b): b is number => b !== null && b > 0)
      .sort((a, b) => a - b);
    return bids.length >= 10 ? bids[Math.floor(bids.length * 0.97)] : 0;
  }, [rows]);

  const intentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const intents = reportKeywordIntents(row);
      for (const intent of intents.length ? intents : ["No intent tag"])
        counts.set(intent, (counts.get(intent) ?? 0) + 1);
    }
    return counts;
  }, [rows]);
  const priceCount = rows.filter((row) =>
    reportKeywordIntents(row).some(
      (intent) => intent === "Price" || intent === "Price / Buy",
    ),
  ).length;

  const seasonal = loc.seasonality.filter(
    (m: { index: number | null }) => m.index !== null,
  ) as { label: string; index: number; pairs: number }[];
  const latest = seasonal.at(-1);
  const peak = seasonal.reduce<typeof latest>(
    (best, m) => (!best || m.index > best.index ? m : best),
    undefined,
  );
  const trough = seasonal.reduce<typeof latest>(
    (best, m) => (!best || m.index < best.index ? m : best),
    undefined,
  );
  const open = rows
    .filter(
      (r) => r.volume >= 1000 && r.competition !== null && r.competition < 50,
    )
    .sort((a, b) => b.volume - a.volume);

  const groups = useMemo(
    () => ({
      national: report.locations
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => l.name.toLowerCase() === "india"),
    }),
    [report],
  );

  const [region, setRegion] = useState<Region | "">("");
  const regionData = useMemo(() => {
    const list = REGIONS.map((name) => {
      const places = report.locations
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => regionOf(l.name) === name);
      const union = new Map<string, number>();
      for (const { l } of places)
        for (const r of l.keywords.values() as Iterable<Row>)
          union.set(r.keyword, Math.max(union.get(r.keyword) ?? 0, r.volume));
      const top = [...union.entries()].sort((a, b) => b[1] - a[1])[0];
      return { name, places, keywords: union.size, top };
    }).filter((r) => r.places.length > 0);
    const other = report.locations
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.name.toLowerCase() !== "india" && !regionOf(l.name));
    return { list, other };
  }, [report]);
  const activeRegion = regionData.list.find((r) => r.name === region);

  const lines: { tag: string; text: ReactNode }[] = [];
  if (sorted[0]) {
    const [a, b] = sorted;
    lines.push({
      tag: "Leader",
      text: (
        <>
          <b className="hl">{a.keyword}</b> leads at {fmt(a.volume)} monthly
          searches
          {b
            ? a.volume === b.volume
              ? `, tied with ${b.keyword}.`
              : `, ahead of ${b.keyword} at ${fmt(b.volume)}.`
            : "."}
        </>
      ),
    });
  }
  if (hasBrands && brandRows[0]) {
    lines.push({
      tag: "Brands",
      text: (
        <>
          <b className="hl">{brandRows[0].brand}</b> holds{" "}
          {fmt(brandRows[0].share)}% of branded search volume here, and{" "}
          {fmt(share(loc.branded, total))}% of all keywords name a brand.
        </>
      ),
    });
  } else {
    lines.push({
      tag: "Brands",
      text: (
        <>
          No brand names are marked yet, so branded share is not measured. Add
          them when you build the report.
        </>
      ),
    });
  }
  if (peak && trough && seasonal.length > 2) {
    lines.push({
      tag: "Season",
      text: (
        <>
          Search level peaks in <b className="hl">{peak.label}</b> at{" "}
          {fmt(Math.round(peak.index))} and is lowest in{" "}
          <b className="hl">{trough.label}</b> at{" "}
          {fmt(Math.round(trough.index))} ({loc.baselineLabel} = 100). The
          cheapest window to build recall is around the trough, before everyone
          crowds in.
        </>
      ),
    });
  }
  if (open.length) {
    lines.push({
      tag: "Open ground",
      text: (
        <>
          <b className="hl">{fmt(open.length)}</b> keywords have real volume and
          a competition index under 50. The largest is{" "}
          <b className="hl">{open[0].keyword}</b> at {fmt(open[0].volume)}.
          These are candidates to test in content or paid search.
        </>
      ),
    });
  } else {
    lines.push({
      tag: "Open ground",
      text: (
        <>
          No keyword with a recorded competition score pairs at least 1,000
          searches with a score under 50.
        </>
      ),
    });
  }
  if (priceCount) {
    lines.push({
      tag: "Price",
      text: (
        <>
          Price and buying intent is{" "}
          <b className="hl">{fmt(share(priceCount, total))}%</b> of keywords in
          this market.
        </>
      ),
    });
  }

  const [q, setQ] = useState("");
  const [intentFilter, setIntentFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({
    key: "volume",
    dir: -1,
  });
  const [page, setPage] = useState(0);
  const [openKeyword, setOpenKeyword] = useState("");

  const table = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!needle || r.keyword.toLowerCase().includes(needle)) &&
        (!intentFilter ||
          reportKeywordIntents(r).includes(intentFilter) ||
          (intentFilter === "No intent tag" &&
            !reportKeywordIntents(r).length)) &&
        (!brandFilter || (r.brand || "Brand unclassified") === brandFilter),
    );
    const get = (r: Row): number | string => {
      switch (sort.key) {
        case "keyword":
          return r.keyword;
        case "competition":
          return r.competition ?? -1;
        case "low":
          return r.lowBidInr ?? -1;
        case "high":
          return r.highBidInr ?? -1;
        case "intent":
          return intentOf(r);
        case "brand":
          return r.brandName;
        default:
          return r.volume;
      }
    };
    return list.sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const c =
        typeof x === "string"
          ? x.localeCompare(y as string)
          : (x as number) - (y as number);
      return c * sort.dir || b.volume - a.volume;
    });
  }, [rows, q, intentFilter, brandFilter, sort]);
  const pages = Math.max(1, Math.ceil(table.length / 50));
  const th = (key: string, label: string, numeric = false) => (
    <th
      className={numeric ? "num" : undefined}
      aria-sort={
        sort.key === key
          ? sort.dir === 1
            ? "ascending"
            : "descending"
          : undefined
      }
    >
      <button
        type="button"
        onClick={() => {
          setSort((s) => ({
            key,
            dir: s.key === key ? (s.dir === 1 ? -1 : 1) : numeric ? -1 : 1,
          }));
          setPage(0);
        }}
      >
        {label}
        {sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );

  const marketBars = report.locations
    .filter((l) => !region || regionOf(l.name) === region)
    .sort((a, b) => b.keywords.size - a.keywords.size)
    .slice(0, 16)
    .map((l) => ({
      label: l.name,
      value: l.keywords.size,
      display: fmt(l.keywords.size),
      part: hasBrands ? (share(l.branded, l.keywords.size) ?? 0) : undefined,
    }));
  const concentration = report.locations
    .filter((l) => l.cityState && l.cityState.volumeShare !== null)
    .sort(
      (a, b) =>
        (b.cityState!.volumeShare as number) -
        (a.cityState!.volumeShare as number),
    );
  const intentList = [...intentCounts.entries()]
    .filter(([name]) => name !== "No intent tag")
    .sort((a, b) => b[1] - a[1]);
  const noIntent = intentCounts.get("No intent tag") ?? 0;

  return (
    <section className="dash" aria-labelledby="report-title">
      <div className="bar">
        <div className="bar-in">
          <div className="brand">
            <h2 id="report-title" tabIndex={-1} ref={headingRef}>
              Search Demand Monitor
              <span className="place"> · {loc.name}</span>
            </h2>
            <span className="sub">
              Keyword Planner · {report.locations.length} markets ·{" "}
              {fmt(report.unique)} keywords
            </span>
          </div>
          <div className="ctrls">{actions}</div>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="k">Keywords with demand</span>
          <span className="v">{fmt(total)}</span>
          <span className="d">{fmt(loc.buckets)} distinct volume levels</span>
        </div>
        <div className="kpi">
          <span className="k">Branded</span>
          <span className="v">
            {hasBrands ? fmt(share(loc.branded, total)) + "%" : "—"}
          </span>
          <span className="d">
            {hasBrands ? "of keywords name a brand" : "no brand names set"}
          </span>
        </div>
        <div className="kpi">
          <span className="k">Price intent</span>
          <span className="v">
            {priceCount ? fmt(share(priceCount, total)) + "%" : "—"}
          </span>
          <span className="d">of keywords in this market</span>
        </div>
        <div className="kpi">
          <span className="k">
            Latest vs {loc.baselineLabel?.split(" ")[0] ?? "start"}
          </span>
          <span className="v">
            {latest
              ? (latest.index >= 100 ? "+" : "") +
                fmt(Math.round(latest.index - 100)) +
                "%"
              : "—"}
          </span>
          <span className="d">{latest ? latest.label : "no month data"}</span>
        </div>
        <div className="kpi">
          <span className="k">Open keywords</span>
          <span className="v">{fmt(open.length)}</span>
          <span className="d">volume over 1,000, competition under 50</span>
        </div>
      </div>

      {regionData.list.length > 0 && (
        <div className="panel">
          <div className="phead">
            <h3>Regions</h3>
            <span className="meta">pick a region to see every place in it</span>
          </div>
          {groups.national[0] && (
            <button
              type="button"
              className="toggle"
              onClick={() => {
                onLocation(groups.national[0].i);
                setPage(0);
                setOpenKeyword("");
                setIntentFilter("");
                setBrandFilter("");
                document
                  .getElementById("place-view")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              Open India overview
            </button>
          )}
          <div className="regions" role="group" aria-label="Region">
            {regionData.list.map((r) => (
              <button
                key={r.name}
                type="button"
                className={"region" + (region === r.name ? " on" : "")}
                aria-pressed={region === r.name}
                onClick={() => setRegion(region === r.name ? "" : r.name)}
              >
                <b>{r.name}</b>
                <span>
                  {r.places.length} {r.places.length === 1 ? "place" : "places"}
                </span>
                <span>{fmt(r.keywords)} distinct keywords</span>
                {r.top && (
                  <span>
                    Top: {r.top[0]} ({fmt(r.top[1])})
                  </span>
                )}
              </button>
            ))}
          </div>
          {activeRegion && (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Place</th>
                    <th>Keywords with demand</th>
                    <th>Top keyword</th>
                    <th>Top searches</th>
                    <th>Branded %</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {activeRegion.places.map(({ l, i }) => {
                    const ks = [...l.keywords.values()] as unknown as Row[];
                    const top = ks.reduce<Row | undefined>(
                      (b, r) => (!b || r.volume > b.volume ? r : b),
                      undefined,
                    );
                    const branded = ks.filter((r) => r.brand === "Branded");
                    return (
                      <tr
                        key={l.name}
                        className={i === locationIndex ? "cur" : ""}
                      >
                        <td>{l.name}</td>
                        <td className="num">{fmt(ks.length)}</td>
                        <td>{top?.keyword ?? ""}</td>
                        <td className="num">{top ? fmt(top.volume) : ""}</td>
                        <td className="num">
                          {report.hasBrandLabels && ks.length
                            ? fmt(
                                Math.round((branded.length / ks.length) * 100),
                              ) + "%"
                            : ""}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="toggle"
                            onClick={() => {
                              onLocation(i);
                              setPage(0);
                              setOpenKeyword("");
                              setIntentFilter("");
                              setBrandFilter("");
                              document
                                .getElementById("place-view")
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                });
                            }}
                          >
                            Open full data
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="panel summary">
        <div className="phead">
          <h3 id="place-view">What {loc.name} is telling us</h3>
          <span className="meta">calculated from the selected market</span>
        </div>
        <p className="pdesc">
          Every line below is calculated from the selected market, not written
          by hand. Change the market and the read rewrites itself.
        </p>
        <ul>
          {lines.map((line, i) => (
            <li key={i}>
              <span className="tag">{line.tag}</span>
              <span>{line.text}</span>
            </li>
          ))}
          <li>
            <span className="tag">Read with care</span>
            <span>
              Google rounds volume into bands: these {fmt(total)} keywords share
              only <b>{fmt(loc.buckets)}</b> distinct values. Treat volume as a
              tier, not a figure, and never add the column up.
            </span>
          </li>
        </ul>
      </div>

      <div className="grid">
        <div className="panel wide">
          <div className="phead">
            <h3>Demand over time</h3>
            <span className="meta">
              search level, {loc.baselineLabel} = 100
            </span>
          </div>
          <p className="pdesc">
            Each bar is one month. A bar at 100 is the same level as December
            2025; taller means more searches that month, shorter means fewer.{" "}
            {seasonal.length < 12
              ? `${seasonal.length} months cannot separate a festive peak from category growth, so read direction, not season.`
              : "Twelve months or more allows a seasonal read."}
          </p>
          <div className="note">
            <b>Build note</b>
            Search level is the median of each keyword&apos;s monthly searches
            divided by its first-month value, times 100. It avoids adding
            rounded volumes together.
          </div>
          {seasonal.length ? (
            <MonthBars
              labels={seasonal.map((m) => m.label)}
              values={seasonal.map((m) => m.index)}
              baseline={100}
            />
          ) : (
            <p className="pdesc">No dated month columns were found.</p>
          )}
        </div>
        <div className="panel wide">
          <div className="phead">
            <h3>Opportunity map</h3>
            <span className="meta">which keywords are worth going after</span>
          </div>
          <p className="pdesc">
            Each dot is one keyword. Higher means more people search for it.
            Further left means fewer advertisers are bidding on it. Start with
            the green Sweet spot.
          </p>
          <div className="note">
            <b>Build note</b>x is the competition index (0 to 100, advertisers
            bidding). y is monthly searches on a log scale. The shaded band is
            volume of 1,000 or more with competition under 50.
          </div>
          <OpportunityMap rows={rows} />
        </div>
      </div>

      <div className="grid">
        <div className="panel">
          <div className="phead">
            <h3>Biggest keywords</h3>
            <span className="meta">top 12 by monthly searches</span>
          </div>
          <p className="pdesc">
            What the market actually types. Anything missing from this list is
            our vocabulary, not theirs.
          </p>
          <Bars
            items={sorted.slice(0, 12).map((r) => ({
              label: r.keyword,
              value: r.volume,
              display: fmt(r.volume),
            }))}
          />
        </div>
        <div className="panel">
          <div className="phead">
            <h3>Who owns the brand conversation</h3>
            <span className="meta">
              {hasBrands
                ? fmt(share(loc.branded, total)) + "% of keywords name a brand"
                : "no brand names set"}
            </span>
          </div>
          <p className="pdesc">
            Only the searches that name a brand. The leader is the default name
            in the category, not simply the biggest advertiser. Volumes add
            rounded values, so they are a guide.
          </p>
          <div className="note">
            <b>Build note</b>
            Brand matches come from the brand list, the Sheet&apos;s Brand
            column, or the AI labels. Shares add rounded volumes, so read them
            as a guide.
          </div>
          {brandRows.length ? (
            <Bars
              accent="var(--s2)"
              items={brandRows.slice(0, 10).map((b) => ({
                label: b.brand,
                value: b.volume,
                display: fmt(b.share) + "%",
              }))}
            />
          ) : (
            <p className="pdesc">No branded searches in this market.</p>
          )}
          <h4 className="subhead">Brand type of every keyword</h4>
          <Bars
            items={classification
              .filter((c) => c.group === "Brand")
              .map((c) => ({
                label: c.label,
                value: c.count,
                display: fmt(share(c.count, total)) + "%",
              }))}
          />
          {classifyArea}
          {report.absentBrands.length > 0 && (
            <p className="pdesc">
              Not found in any market: {report.absentBrands.join(", ")}.
            </p>
          )}
        </div>
      </div>

      <div className="grid">
        <div className="panel">
          <div className="phead">
            <h3>What they are asking for</h3>
            <span className="meta">
              {fmt(share(noIntent, total))}% carries no intent
            </span>
          </div>
          <p className="pdesc">
            Shares use all keywords in this market. A keyword can match multiple
            intents.
          </p>
          {intentList.length ? (
            <Bars
              items={intentList.map(([name, n]) => ({
                label: name,
                value: n,
                display: fmt(share(n, total)) + "%",
              }))}
            />
          ) : (
            <p className="pdesc">No keyword carries a clear intent here.</p>
          )}
          <div className="legend">
            {intentList.slice(0, 6).map(([name]) => (
              <span key={name}>
                <b>{name}</b> {INTENT_MEANING[name] ?? ""}
              </span>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="phead">
            <h3>Demand by market</h3>
            <span className="meta">
              top 16 places{region ? " in " + region : ""}, brand share marked
            </span>
          </div>
          <p className="pdesc">
            Where the category is searching
            {hasBrands
              ? ", and how much of each market the named brands hold. Dark means a larger brand share"
              : ""}
            .
          </p>
          <Bars items={marketBars} />
        </div>
      </div>

      {concentration.length > 0 && (
        <div className="panel">
          <div className="phead">
            <h3>How concentrated each state is</h3>
            <span className="meta">city demand as a share of its state</span>
          </div>
          <p className="pdesc">
            A high number means one city is the whole state and a single media
            buy covers it. A low number means the demand sits in towns beyond
            the metro.
          </p>
          <Bars
            accent="var(--s2)"
            items={concentration.map((l) => ({
              label: `${l.name} · ${l.cityState!.name}`,
              value: l.cityState!.volumeShare as number,
              display:
                fmt(share(l.cityState!.volumeShare as number, 100)) + "%",
            }))}
          />
        </div>
      )}

      <div className="panel">
        <div className="phead">
          <h3>AI read</h3>
          <span className="meta">
            written automatically, hypotheses not facts
          </span>
        </div>
        <p className="pdesc">
          Written from the calculated summary and keyword examples for{" "}
          {loc.name}. It goes to OpenAI and costs well under a rupee per place.
        </p>
        {aiRead?.cachedAt && (
          <p className="pdesc">
            Reused the analysis saved on{" "}
            {new Date(aiRead.cachedAt).toLocaleString()}. The data has not
            changed, so nothing was sent to OpenAI and nothing was charged.
          </p>
        )}
        {aiBusy && !aiRead && (
          <p className="pdesc" aria-live="polite">
            Writing the AI read for {loc.name}…
          </p>
        )}
        {aiMessage && (
          <p className="warnbox">
            {aiMessage}{" "}
            <button type="button" className="btn" onClick={onWriteAi}>
              Try again
            </button>
          </p>
        )}
        {aiRead && (
          <div className="ai">
            {aiRead.items.map((item, i) => (
              <div key={i} className="ai-item">
                <strong>{item.section}</strong>
                <p>{item.observation}</p>
                <p className="hyp">
                  <em>Hypothesis (AI):</em> {item.hypothesis}
                </p>
              </div>
            ))}
            {aiRead.caveats.length > 0 && (
              <ul>
                {aiRead.caveats.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
            <p className="pdesc">
              Written by {aiRead.model}. Check every number against the tables
              before using it in a client document.
            </p>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="phead">
          <h3>Every keyword in this market</h3>
          <span className="meta">{fmt(table.length)} shown</span>
        </div>
        <p className="pdesc">
          The raw rows behind every chart above. Sort any column, filter by
          intent, or search the text.
        </p>
        <div className="tctl">
          <div className="field">
            <label htmlFor="dash-q">Search keywords</label>
            <input
              id="dash-q"
              type="search"
              value={q}
              placeholder="price, serum, derma co…"
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="dash-intent">Intent</label>
            <select
              id="dash-intent"
              value={intentFilter}
              onChange={(e) => {
                setIntentFilter(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All intents</option>
              {[...intentCounts.keys()].sort().map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="dash-brand">Brand type</label>
            <select
              id="dash-brand"
              value={brandFilter}
              onChange={(event) => {
                setBrandFilter(event.target.value);
                setPage(0);
              }}
            >
              <option value="">All brand types</option>
              {classification
                .filter((item) => item.group === "Brand" && item.count > 0)
                .map((item) => (
                  <option key={item.label}>{item.label}</option>
                ))}
            </select>
          </div>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                {th("keyword", "Keyword")}
                {th("volume", "Monthly searches", true)}
                {th("competition", "Competition", true)}
                {th("low", "Low bid", true)}
                {th("high", "Top bid", true)}
                {th("intent", "Intent")}
                {th("brand", "Brand")}
                <th>Signal</th>
              </tr>
            </thead>
            <tbody>
              {table.slice(page * 50, page * 50 + 50).flatMap((r) => {
                const signal = signalOf(r, bidCut);
                const rowsOut = [
                  <tr key={r.keyword}>
                    <td>
                      <button
                        type="button"
                        className="kwlink"
                        onClick={() =>
                          setOpenKeyword(
                            openKeyword === r.keyword ? "" : r.keyword,
                          )
                        }
                      >
                        {r.keyword}
                      </button>
                    </td>
                    <td className="num">{fmt(r.volume)}</td>
                    <td className="num">{fmt(r.competition)}</td>
                    <td className="num">{rupees(r.lowBidInr)}</td>
                    <td className="num">{rupees(r.highBidInr)}</td>
                    <td>{intentOf(r)}</td>
                    <td>
                      {r.brandName ? (
                        <span className="pill">
                          {r.brandName} · {r.brand}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {signal ? (
                        <span
                          className={
                            "pill" + (signal === "Open ground" ? " op" : "")
                          }
                        >
                          {signal}
                        </span>
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>,
                ];
                if (openKeyword === r.keyword)
                  rowsOut.push(
                    <tr key={r.keyword + "-trend"} className="trend-row">
                      <td colSpan={8}>
                        <MonthBars
                          labels={loc.monthLabels}
                          values={r.monthly}
                        />
                      </td>
                    </tr>,
                  );
                return rowsOut;
              })}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <button
            type="button"
            className="btn"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <button
            type="button"
            className="btn"
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {movers.length > 0 && (
        <div className="panel">
          <div className="phead">
            <h3>Biggest changes in demand</h3>
            <span className="meta">
              {movers[0].firstMonth} to {movers[0].lastMonth}
            </span>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Earlier searches</th>
                  <th>Latest searches</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {movers.map((row) => (
                  <tr key={row.keyword}>
                    <td>{row.keyword}</td>
                    <td className="num">{fmt(row.from)}</td>
                    <td className="num">{fmt(row.to)}</td>
                    <td className="num">
                      {row.change > 0 ? "+" : ""}
                      {fmt(row.change)} ({fmt(row.pct)}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
