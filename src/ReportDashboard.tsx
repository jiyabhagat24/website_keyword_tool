import { useMemo, useState, type ReactNode, type RefObject } from "react";
import {
  reportBrandRows,
  reportBuild,
  reportClassification,
  reportKeywordIntents,
  reportNumber,
  reportPercent,
} from "../keyword-report";
import type { StrategicRead } from "./analysis-workflow";
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
  sheetIntent?: string;
}

const CITY_PARENTS = new Set([
  "bengaluru",
  "cmr",
  "coimbatore",
  "hyderabad",
  "mmr",
  "pmr",
  "nagpur",
  "amr",
  "kmr",
  "jaipur",
  "lucknow",
  "indore",
  "kochi",
  "ernakulam",
  "thiruvananthapuram",
  "delhi ncr",
]);

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
  const intents = reportKeywordIntents(row) as string[];
  if (intents.length) return intents[0];
  if (row.brand === "Branded" || row.brand === "Competitor brand")
    return row.brand;
  return "Generic";
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

function OpportunityMap({ rows }: { rows: Row[] }) {
  const points = useMemo(() => {
    const valid = rows.filter((row) => row.competition !== null);
    return valid.sort((a, b) => b.volume - a.volume).slice(0, 800);
  }, [rows]);
  const w = 620;
  const h = 300;
  const pad = { l: 44, r: 12, t: 10, b: 30 };
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
  return (
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
        height={y(1000) - pad.t}
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
            {t >= 1000000
              ? "10L"
              : t >= 100000
                ? "1L"
                : t >= 1000
                  ? t / 1000 + "k"
                  : t}
          </text>
        </g>
      ))}
      {[0, 25, 50, 75, 100].map((c) => (
        <text
          key={c}
          x={x(c)}
          y={h - 10}
          textAnchor="middle"
          className="chart-axis"
        >
          {c}
        </text>
      ))}
      {points.map((p) => (
        <circle
          key={p.keyword}
          cx={x(p.competition as number)}
          cy={y(p.volume)}
          r="2.6"
          className={
            p.volume >= 1000 && (p.competition as number) < 50
              ? "dot open"
              : "dot"
          }
        >
          <title>{`${p.keyword}: ${fmt(p.volume)} searches, competition ${p.competition}`}</title>
        </circle>
      ))}
    </svg>
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
  const hasBrands = report.brands.length > 0 || report.websiteHosts.length > 0;
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
    for (const row of rows)
      counts.set(intentOf(row), (counts.get(intentOf(row)) ?? 0) + 1);
    return counts;
  }, [rows]);
  const priceCount =
    (intentCounts.get("Price / Buy") ?? 0) + (intentCounts.get("Price") ?? 0);

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

  const groups = useMemo(() => {
    const national = report.locations
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.name.toLowerCase() === "india");
    const cities = report.locations
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => CITY_PARENTS.has(l.name.toLowerCase()));
    const states = report.locations
      .map((l, i) => ({ l, i }))
      .filter(
        ({ l }) =>
          l.name.toLowerCase() !== "india" &&
          !CITY_PARENTS.has(l.name.toLowerCase()),
      );
    return { national, states, cities };
  }, [report]);

  const lines: ReactNode[] = [];
  if (sorted[0]) {
    const [a, b] = sorted;
    lines.push(
      <>
        <b className="hl">{a.keyword}</b> leads at {fmt(a.volume)} monthly
        searches
        {b
          ? a.volume === b.volume
            ? `, tied with ${b.keyword}.`
            : `, ahead of ${b.keyword} at ${fmt(b.volume)}.`
          : "."}
      </>,
    );
  }
  if (hasBrands && brandRows[0]) {
    lines.push(
      <>
        <b className="hl">{brandRows[0].brand}</b> holds{" "}
        {fmt(brandRows[0].share)}% of branded search volume here, and{" "}
        {fmt(share(loc.branded, total))}% of all keywords name a brand.
      </>,
    );
  } else {
    lines.push(
      <>
        No brand names are marked yet, so branded share is not measured. Add
        them when you build the report.
      </>,
    );
  }
  if (peak && trough && seasonal.length > 2) {
    lines.push(
      <>
        Search level peaks in <b className="hl">{peak.label}</b> at{" "}
        {fmt(Math.round(peak.index))} and is lowest in{" "}
        <b className="hl">{trough.label}</b> at {fmt(Math.round(trough.index))}{" "}
        ({loc.baselineLabel} = 100). The cheapest window to build recall is
        around the trough, before everyone crowds in.
      </>,
    );
  }
  if (open.length) {
    lines.push(
      <>
        <b className="hl">{fmt(open.length)}</b> keywords have real volume and a
        competition index under 50. The largest is{" "}
        <b className="hl">{open[0].keyword}</b> at {fmt(open[0].volume)}.
        Content wins these; paid media is not fighting for them.
      </>,
    );
  } else {
    lines.push(
      <>
        No keyword pairs volume above 1,000 with a competition index under 50.
        Every term with scale is already being bid on.
      </>,
    );
  }
  if (priceCount) {
    lines.push(
      <>
        Price and buying intent is{" "}
        <b className="hl">{fmt(share(priceCount, total))}%</b> of keywords in
        this market.
      </>,
    );
  }

  const [q, setQ] = useState("");
  const [intentFilter, setIntentFilter] = useState("");
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
        (!intentFilter || intentOf(r) === intentFilter),
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
  }, [rows, q, intentFilter, sort]);
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

  const marketBars = [...report.locations]
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
    .filter(([name]) => name !== "Generic" && name !== "Branded")
    .sort((a, b) => b[1] - a[1]);
  const intentTotal = intentList.reduce((sum, [, n]) => sum + n, 0);
  const noIntent = total - intentTotal;

  return (
    <section className="dash" aria-labelledby="report-title">
      <header className="dash-head">
        <div>
          <h2 id="report-title" tabIndex={-1} ref={headingRef}>
            Search demand monitor
          </h2>
          <p className="sub">
            Keyword Planner · {report.locations.length} markets ·{" "}
            {fmt(report.unique)} keywords with demand
          </p>
        </div>
        <div className="dash-controls">
          <div className="field">
            <label htmlFor="dash-market">Market</label>
            <select
              id="dash-market"
              value={locationIndex}
              onChange={(e) => {
                onLocation(Number(e.target.value));
                setPage(0);
                setOpenKeyword("");
              }}
            >
              {groups.national.map(({ l, i }) => (
                <option key={l.name} value={i}>
                  {l.name}
                </option>
              ))}
              {groups.states.length > 0 && (
                <optgroup label="States and UTs">
                  {groups.states.map(({ l, i }) => (
                    <option key={l.name} value={i}>
                      {l.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {groups.cities.length > 0 && (
                <optgroup label="Cities and metro regions">
                  {groups.cities.map(({ l, i }) => (
                    <option key={l.name} value={i}>
                      {l.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div className="dash-actions">{actions}</div>
        </div>
      </header>

      <div className="kpis">
        <div className="kpi">
          <span>Keywords with demand</span>
          <b>{fmt(total)}</b>
          <small>{fmt(loc.buckets)} distinct volume levels</small>
        </div>
        <div className="kpi">
          <span>Branded</span>
          <b>{hasBrands ? fmt(share(loc.branded, total)) + "%" : "—"}</b>
          <small>
            {hasBrands ? "of keywords name a brand" : "no brand names set"}
          </small>
        </div>
        <div className="kpi">
          <span>Price intent</span>
          <b>{priceCount ? fmt(share(priceCount, total)) + "%" : "—"}</b>
          <small>of keywords in this market</small>
        </div>
        <div className="kpi">
          <span>Latest vs {loc.baselineLabel?.split(" ")[0] ?? "start"}</span>
          <b>
            {latest
              ? (latest.index >= 100 ? "+" : "") +
                fmt(Math.round(latest.index - 100)) +
                "%"
              : "—"}
          </b>
          <small>{latest ? latest.label : "no month data"}</small>
        </div>
        <div className="kpi">
          <span>Open keywords</span>
          <b>{fmt(open.length)}</b>
          <small>volume over 1,000, competition under 50</small>
        </div>
      </div>

      <div className="panel summary">
        <div className="phead">
          <h3>What this market is telling us</h3>
          <span className="meta">calculated from the selected market</span>
        </div>
        <p className="pdesc">
          Every line below is calculated from the selected market, not written
          by hand. Change the market and the read rewrites itself.
        </p>
        <ul>
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <div className="note">
          <b>Read with care</b>
          Google rounds volume into bands: these {fmt(total)} keywords share
          only <b>{fmt(loc.buckets)}</b> distinct values. Treat volume as a
          tier, not a figure, and never add the column up.
        </div>
      </div>

      <div className="grid">
        <div className="panel">
          <div className="phead">
            <h3>Demand over time</h3>
            <span className="meta">
              search level, {loc.baselineLabel} = 100
            </span>
          </div>
          <p className="pdesc">
            The shape matters more than the number.{" "}
            {seasonal.length < 12
              ? `${seasonal.length} months cannot separate a festive peak from category growth, so read direction, not season.`
              : "Twelve months or more allows a seasonal read."}
          </p>
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
        <div className="panel">
          <div className="phead">
            <h3>Opportunity map</h3>
            <span className="meta">volume against competition</span>
          </div>
          <p className="pdesc">
            Each dot is a keyword. Up means more people searching. Left means
            fewer advertisers bidding. The shaded band is where content wins
            cheaply.
          </p>
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
            Bare category and brand names are set aside, because they say
            nothing about what the person wants. These are the searches that do,
            as a share of each other.
          </p>
          {intentList.length ? (
            <Bars
              items={intentList.map(([name, n]) => ({
                label: name,
                value: n,
                display: fmt(share(n, intentTotal)) + "%",
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
            <span className="meta">top 16, brand share marked</span>
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
          {loc.name}. It goes to OpenAI and costs well under a rupee per report.
        </p>
        <button
          type="button"
          className="btn"
          disabled={aiBusy}
          onClick={onWriteAi}
        >
          {aiBusy ? "Writing…" : aiRead ? "Write again" : "Write AI read"}
        </button>
        {aiMessage && <p className="warnbox">{aiMessage}</p>}
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
                        <span className="pill">{r.brandName}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {signal ? (
                        <span
                          className={
                            "tag " +
                            (signal === "Open ground" ? "good" : "warn")
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

      <div className="panel notes">
        <div className="phead">
          <h3>Build notes</h3>
          <span className="meta">how to read this page</span>
        </div>
        <div className="grid">
          <div>
            <h4>Where each number comes from</h4>
            <div className="maprow">
              <code>volume</code>
              <span>
                Average monthly searches. Banded by Google, so it is a tier and
                never a sum.
              </span>
            </div>
            <div className="maprow">
              <code>competition</code>
              <span>
                Counts advertisers bidding, not how hard a keyword is to rank
                for.
              </span>
            </div>
            <div className="maprow">
              <code>bids</code>
              <span>
                What advertisers offer per click, in rupees. Not what they
                spend.
              </span>
            </div>
            <div className="maprow">
              <code>months</code>
              <span>
                One sheet column per month. Search level is the median
                per-keyword trend with the first month = 100.
              </span>
            </div>
            <div className="maprow">
              <code>intent</code>
              <span>
                Rules on the words in the phrase. Brands come from the list you
                give. Keep the rules auditable.
              </span>
            </div>
          </div>
          <div>
            <h4>What this data cannot do</h4>
            <div className="maprow">
              <code>not sales</code>
              <span>
                Search demand only. High search with flat sales is a conversion
                problem.
              </span>
            </div>
            <div className="maprow">
              <code>not video</code>
              <span>
                Google search only. Recipe and how-to demand also lives on
                YouTube.
              </span>
            </div>
            <div className="maprow">
              <code>not SEO</code>
              <span>
                A keyword at competition 1 can still be hard to rank for
                organically.
              </span>
            </div>
            {report.seedCount > 0 && (
              <div className="maprow">
                <code>dead seeds</code>
                <span>
                  Of {fmt(report.seedCount)} starting keywords only{" "}
                  {fmt(report.seedHits)} returned demand.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
