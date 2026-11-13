import tbmLogo from "./assets/tbm-logo.png";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Copy,
  FileSpreadsheet,
  Globe2,
  Hash,
  LayoutGrid,
  Loader2,
  LockKeyhole,
  MapPin,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/watermelon/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/watermelon/card";
import { Input } from "@/components/watermelon/input";
import { Label } from "@/components/watermelon/label";
import { Switch } from "@/components/watermelon/switch";
import { Checkbox } from "@/components/watermelon/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/watermelon/tabs";
import { Badge } from "@/components/watermelon/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/watermelon/accordion";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/watermelon/alert";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/watermelon/native-select";
import { WEBHOOKS, SHEETS, LOCATIONS, MONTHS } from "./config";
import { readGoogleSheet, sheetIdFromInput } from "./google-sheets";
import {
  classifyWebsiteKeywords,
  requestStrategicRead,
} from "./analysis-workflow";
import type { StrategicRead, WebsiteKeywordLabel } from "./analysis-workflow";
import { buildClaudeBundle, keywordRows } from "./claude-bundle";
import ReportDashboard from "./ReportDashboard";
import { askNotificationPermission, notifyUser } from "./notify";
import { collectionProgress } from "./watch-sheet";
import {
  reportBuild,
  reportFacts,
  reportExportRows,
  reportSafeCsv,
  reportNumber,
} from "../keyword-report";

type Mode = "website" | "keywords";
const sovCategories = [
  "air conditioner",
  "air fryer",
  "ceiling fans",
  "cold press juicer",
  "dishwasher",
  "Male Skincare",
  "mattress",
  "microwave",
  "mixer grinder",
  "nutri blender",
  "office & gaming chairs",
  "Oven microwave Toaster",
  "pedestal fan",
  "recliner",
  "small plants",
  "smart door locks",
  "tablets",
  "washing machine",
  "Water purifier",
];

function SovCategory({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="field">
      <Label htmlFor={id}>SOV product category</Label>
      <NativeSelect
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <NativeSelectOption value="">No SOV category</NativeSelectOption>
        {sovCategories.map((category) => (
          <NativeSelectOption key={category} value={category}>
            {category}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
type Report = ReturnType<typeof reportBuild>;
const format = (value: number | null) =>
  value === null ? "—" : reportNumber.format(value);
function DownloadButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button variant="outline" onClick={onClick} disabled={disabled}>
      <ArrowDownToLine />
      {children}
    </Button>
  );
}

function downloadCsv(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", reportSafeCsv(rows)], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadClaudeBundle(
  report: Parameters<typeof buildClaudeBundle>[0],
  options: Parameters<typeof buildClaudeBundle>[1],
) {
  const { name, bytes } = buildClaudeBundle(report, options);
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/zip" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Guide({ report = false }: { report?: boolean }) {
  const steps = report
    ? [
        [
          "Connect your sheet",
          "Paste a Sheet link shared with Anyone with the link as a Viewer.",
        ],
        [
          "Choose brand names",
          "Add brand names yourself, or enable AI to detect likely brands. AI usage may incur charges.",
        ],
        [
          "Take your findings back",
          "Download the Summary CSV. In Google Sheets, choose File → Import → Upload → Insert new sheet(s).",
        ],
      ]
    : [
        [
          "Make your own template copy",
          "Choose the template for websites or keywords. Give the Google account used by the automation Editor access to your copy.",
        ],
        [
          "Add your starting points",
          "Add website URLs to Website Input, or search terms to Keyword input. Use column A, starting at row 2.",
        ],
        [
          "Collect, then compare",
          "Run the collection. When the location tabs finish filling in, open Keyword report and connect the same sheet.",
        ],
      ];
  return (
    <Card className="guide-card">
      <CardHeader>
        <div className="section-icon">
          <CircleHelp />
        </div>
        <CardTitle>A little guidance</CardTitle>
        <CardDescription>
          {report
            ? "From spreadsheet to a clear next step."
            : "Your first collection, in three steps."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible defaultValue="0">
          {steps.map(([title, description], i) => (
            <AccordionItem key={title} value={String(i)}>
              <AccordionTrigger>
                <span className="guide-number">0{i + 1}</span>
                {title}
              </AccordionTrigger>
              <AccordionContent>{description}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <div className="guide-note">
          <FileSpreadsheet />
          <p>
            Your spreadsheet is the home for your results. Larger collections
            can take longer to finish.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Collection({
  sovCategory,
  setSovCategory,
  sheet,
  setSheet,
  openReport,
  onFilled,
}: {
  sovCategory: string;
  setSovCategory: (value: string) => void;
  sheet: string;
  setSheet: (value: string) => void;
  openReport: () => void;
  onFilled: (sheetId: string) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [watchTarget, setWatchTarget] = useState<{
    id: string;
    runId: string;
  } | null>(null);
  const [progress, setProgress] =
    useState<Awaited<ReturnType<typeof collectionProgress>>>(null);
  const [watchNote, setWatchNote] = useState("");
  const [mode, setMode] = useState<Mode>("website");
  const [brandsText, setBrandsText] = useState("");
  const [all, setAll] = useState(true);
  const [locations, setLocations] = useState<string[]>([]);
  const [custom, setCustom] = useState(false);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultDates = {
    startMonth: MONTHS[start.getMonth()],
    startYear: start.getFullYear(),
    endMonth: MONTHS[end.getMonth()],
    endYear: end.getFullYear(),
  };
  const [dates, setDates] = useState(defaultDates);
  const [state, setState] = useState<"idle" | "running" | "accepted" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const [sheetLink, setSheetLink] = useState("");
  const [response, setResponse] = useState("");
  useEffect(() => {
    if (!watchTarget) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();
    async function check() {
      try {
        const latest = await collectionProgress(
          watchTarget!.id,
          watchTarget!.runId,
        );
        if (cancelled) return;
        setProgress(latest);
        if (latest && latest.finished === latest.total) {
          setConfirmed(true);
          setWatchTarget(null);
          setWatchNote("Collection finished. Opening your report.");
          onFilled(watchTarget!.id);
          return;
        }
      } catch {
        // Try again on the next round.
      }
      if (cancelled) return;
      if (Date.now() - startedAt > 4 * 3600_000) {
        setWatchTarget(null);
        setWatchNote(
          "Stopped watching after 4 hours. Open the Keyword report tab when your sheet is ready.",
        );
        return;
      }
      timer = setTimeout(check, 45_000);
    }
    timer = setTimeout(check, 15_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [watchTarget]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const raw = sheet.trim();
    const match = raw.match(
      /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)(?:[/?#]|$)/,
    );
    const id = match?.[1] ?? (/^[\w-]{16,}$/.test(raw) ? raw : null);
    let problem = !id
      ? "Paste the link or ID of your Google Sheet copy."
      : !all && !locations.length
        ? "Choose at least one location."
        : "";
    if (
      custom &&
      dates.startYear * 12 + MONTHS.indexOf(dates.startMonth) >
        dates.endYear * 12 + MONTHS.indexOf(dates.endMonth)
    )
      problem = "The start month must come before the end month.";
    if (problem || !id) {
      setError(problem);
      setState("error");
      return;
    }
    setConfirmed(false);
    setWatchTarget(null);
    setWatchNote("");
    setProgress(null);
    void askNotificationPermission();
    setState("running");
    setError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const range = custom ? dates : defaultDates;
    const runId = Array.from(
      crypto.getRandomValues(new Uint8Array(12)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    setSheetLink("https://docs.google.com/spreadsheets/d/" + id + "/edit");
    try {
      const result = await fetch(WEBHOOKS[mode], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetUrl: id,
          runId,
          allLocations: all,
          ...(!all ? { locations } : {}),
          ...(mode === "keywords" && brandsText.trim()
            ? { brands: brandsText.trim() }
            : {}),
          ...range,
        }),
        signal: controller.signal,
      });
      const text = await result.text();
      if (!result.ok)
        throw new Error(
          "The workflow returned HTTP " +
            result.status +
            ". " +
            text.slice(0, 300),
        );
      setResponse(text);
      setState("accepted");
      setWatchTarget({ id, runId });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setState("accepted");
        setWatchTarget({ id, runId });
        setWatchNote(
          "The request is taking longer than expected. Waiting for the workflow to confirm completion.",
        );
        return;
      }
      setError(
        error instanceof Error
          ? error.message
          : "The request failed. Check your connection and try again.",
      );
      setState("error");
    } finally {
      clearTimeout(timeout);
    }
  }
  return (
    <div className="two-column">
      <Card className="collection-card">
        <CardHeader>
          <div className="card-heading">
            <div>
              <CardTitle>Start a collection</CardTitle>
              <CardDescription>
                Choose your source and connect your spreadsheet.
              </CardDescription>
            </div>
            <Badge variant="outline">
              <span className="status-dot" />
              Google Sheets
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
            <TabsList className="source-tabs">
              <TabsTrigger value="website" disabled={state === "running"}>
                <Globe2 />
                From websites
              </TabsTrigger>
              <TabsTrigger value="keywords" disabled={state === "running"}>
                <Hash />
                From keywords
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <form onSubmit={submit} className="collection-form">
            <fieldset disabled={state === "running"}>
              <div className="template-strip">
                <div className="sheet-icon">
                  <FileSpreadsheet />
                </div>
                <div>
                  <strong>
                    {mode === "website"
                      ? "Website input template"
                      : "Keyword input template"}
                  </strong>
                  <p>
                    {mode === "website"
                      ? "Add the websites you want to research."
                      : "Add the search terms you want to measure."}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <a
                    href={SHEETS[mode]}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Copy />
                    Make a copy
                  </a>
                </Button>
              </div>
              <div className="field">
                <Label htmlFor="sheet-url">Your Google Sheet</Label>
                <Input
                  id="sheet-url"
                  value={sheet}
                  onChange={(event) => setSheet(event.target.value)}
                  placeholder="Paste your spreadsheet link or ID"
                  required
                  aria-describedby="sheet-hint"
                />
                <p id="sheet-hint">
                  Use the link to your own copy, with Editor access for the
                  automation account.
                </p>
              </div>
              <SovCategory
                id="collection-sov-category"
                value={sovCategory}
                onChange={setSovCategory}
                disabled={Boolean(watchTarget)}
              />
              {mode === "keywords" && (
                <div className="field">
                  <Label htmlFor="collection-brands">
                    Brands to track (optional)
                  </Label>
                  <Input
                    id="collection-brands"
                    value={brandsText}
                    onChange={(event) => setBrandsText(event.target.value)}
                    placeholder="Dot & Key | dot and key, The Derma Co"
                  />
                  <p>
                    Keywords with these brand names are marked Branded in the
                    Intent column. Separate brands with commas and add other
                    spellings with |.
                  </p>
                </div>
              )}
              <div className="options-heading">
                <SlidersHorizontal />
                <h3>Collection settings</h3>
              </div>
              <div className="setting-row">
                <MapPin />
                <div>
                  <Label htmlFor="all-locations">All locations</Label>
                  <p>India and 47 state and city locations.</p>
                </div>
                <Switch
                  id="all-locations"
                  checked={all}
                  onCheckedChange={setAll}
                />
              </div>
              {!all && (
                <div className="location-picker">
                  <div className="location-actions">
                    <span>{locations.length} selected</span>
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => setLocations([...LOCATIONS])}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => setLocations([])}
                    >
                      Clear
                    </Button>
                  </div>
                  <div className="location-grid">
                    {LOCATIONS.map((name, i) => (
                      <div key={name}>
                        <Checkbox
                          id={"location-" + i}
                          checked={locations.includes(name)}
                          onCheckedChange={(checked) =>
                            setLocations((previous) =>
                              checked
                                ? [...previous, name]
                                : previous.filter((value) => value !== name),
                            )
                          }
                        />
                        <Label htmlFor={"location-" + i}>{name}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="setting-row">
                <SlidersHorizontal />
                <div>
                  <Label htmlFor="custom-dates">Choose a date range</Label>
                  <p>By default, collect the last 12 completed months.</p>
                </div>
                <Switch
                  id="custom-dates"
                  checked={custom}
                  onCheckedChange={setCustom}
                />
              </div>
              {custom && (
                <div className="date-grid">
                  {(["start", "end"] as const).map((side) => (
                    <div key={side}>
                      <Label htmlFor={side + "-month"}>
                        {side === "start" ? "From" : "To"}
                      </Label>
                      <div>
                        <NativeSelect
                          id={side + "-month"}
                          aria-label={side + " month"}
                          value={dates[`${side}Month`]}
                          onChange={(event) =>
                            setDates({
                              ...dates,
                              [`${side}Month`]: event.target.value,
                            })
                          }
                        >
                          {MONTHS.map((month) => (
                            <NativeSelectOption key={month} value={month}>
                              {month[0] + month.slice(1).toLowerCase()}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                        <NativeSelect
                          aria-label={side + " year"}
                          value={dates[`${side}Year`]}
                          onChange={(event) =>
                            setDates({
                              ...dates,
                              [`${side}Year`]: Number(event.target.value),
                            })
                          }
                        >
                          {[
                            now.getFullYear() - 2,
                            now.getFullYear() - 1,
                            now.getFullYear(),
                            now.getFullYear() + 1,
                          ].map((year) => (
                            <NativeSelectOption key={year}>
                              {year}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </fieldset>
            {state === "error" && (
              <Alert variant="destructive">
                <CircleHelp />
                <AlertTitle>Check your request</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {state === "accepted" && (
              <Alert className="success-alert">
                <CheckCircle2 />
                <AlertTitle>Collection requested</AlertTitle>
                <AlertDescription>
                  <p>
                    {confirmed
                      ? "The workflow reported that the location loop finished."
                      : "The workflow accepted your request. Check your spreadsheet to see when it finishes."}
                  </p>
                  {watchTarget && (
                    <p>
                      Watching your sheet:{" "}
                      {progress
                        ? `${progress.finished} of ${progress.total} workflow groups finished.`
                        : "checking…"}{" "}
                      Keep this page open. When the workflow confirms
                      completion, the keyword report opens, the AI summary is
                      written, and you get a browser notification.{" "}
                      <button
                        type="button"
                        className="keyword-trend-link"
                        onClick={() => {
                          setWatchTarget(null);
                          setWatchNote("Stopped watching.");
                        }}
                      >
                        Stop watching
                      </button>
                    </p>
                  )}
                  {watchNote && <p>{watchNote}</p>}
                  <a href={sheetLink} target="_blank" rel="noopener noreferrer">
                    Open your spreadsheet <ArrowUpRight size={14} />
                  </a>
                  {confirmed && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={openReport}
                    >
                      Open keyword report <ArrowRight />
                    </Button>
                  )}
                  {response && (
                    <details>
                      <summary>Workflow response</summary>
                      <pre>{response}</pre>
                    </details>
                  )}
                </AlertDescription>
              </Alert>
            )}
            <div className="form-bottom">
              <span>
                <LockKeyhole />
                Results go to your sheet
              </span>
              <Button
                type="submit"
                disabled={state === "running" || Boolean(watchTarget)}
              >
                {state === "running" ? (
                  <>
                    <Loader2 className="spinner" />
                    Sending request
                  </>
                ) : (
                  <>
                    Start collection <ArrowRight />
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Guide />
    </div>
  );
}

function Reports({
  sovCategory,
  setSovCategory,
  sheet,
  setSheet,
  autoBuild,
}: {
  sovCategory: string;
  setSovCategory: (value: string) => void;
  sheet: string;
  setSheet: (value: string) => void;
  autoBuild: number;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [brands, setBrands] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [reportSheetId, setReportSheetId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const [locationIndex, setLocationIndex] = useState(0);
  const [aiRead, setAiRead] = useState<StrategicRead | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const autoFlow = useRef(false);
  const aiAutoFor = useRef<Report | null>(null);
  const classificationInput = useRef<{
    sources: { name: string; text?: string; error?: string }[];
    brands: string;
  } | null>(null);
  const [websiteLabels, setWebsiteLabels] = useState(
    new Map<string, WebsiteKeywordLabel>(),
  );
  const [classifying, setClassifying] = useState(false);
  const [classificationError, setClassificationError] = useState("");
  const location = report?.locations[locationIndex];
  const websiteBatch = useMemo(() => {
    if (!report || (!report.websiteHosts.length && !sovCategory)) return [];
    return [
      ...new Set(report.locations.flatMap((item) => [...item.keywords.keys()])),
    ]
      .filter((keyword) => !websiteLabels.has(keyword) && keyword.length <= 160)
      .slice(0, 100);
  }, [report, websiteLabels, sovCategory]);
  function applySources(
    sources: { name: string; text?: string; error?: string }[],
    brandList = brands,
    sourceSheetId?: string,
  ) {
    const result = reportBuild(sources, brandList);
    setMessage(result.errors.join("\n"));
    if (!result.locations.length) {
      setMessage(
        ["No valid location tabs were found.", ...result.errors].join("\n"),
      );
      return;
    }
    setLocationIndex(0);
    setAiRead(null);
    setAiMessage("");
    classificationInput.current = { sources, brands: brandList };
    setWebsiteLabels(new Map());
    setClassificationError("");
    setReportSheetId(sourceSheetId);
    setReport(result);
    requestAnimationFrame(() => resultsRef.current?.focus());
  }
  async function classifyWebsiteBatch() {
    const input = classificationInput.current;
    if (!report || !input || !websiteBatch.length || classifying) return report;
    setClassifying(true);
    setClassificationError("");
    try {
      const labels = await classifyWebsiteKeywords(
        report.websiteHosts.slice(0, 20),
        websiteBatch,
        sovCategory,
      );
      if (classificationInput.current !== input) return;
      const combined = new Map([...websiteLabels, ...labels]);
      const updated = reportBuild(
        input.sources,
        input.brands,
        LOCATIONS,
        combined,
      );
      aiAutoFor.current = updated;
      setWebsiteLabels(combined);
      setReport(updated);
      return updated;
    } catch (error) {
      setClassificationError(
        error instanceof Error
          ? error.message
          : "Website classification failed.",
      );
      return report;
    } finally {
      setClassifying(false);
    }
  }
  async function writeStrategicRead(target = report) {
    if (!target) return;
    setAiBusy(true);
    setAiMessage("");
    let written = false;
    try {
      setAiRead(
        await requestStrategicRead(
          reportFacts(target, target.locations[locationIndex]),
        ),
      );
      written = true;
    } catch (error) {
      setAiMessage(
        error instanceof Error ? error.message : "The strategic read failed.",
      );
    } finally {
      setAiBusy(false);
      if (autoFlow.current || document.hidden) {
        notifyUser(
          "Your keyword report is ready",
          `${target.locations.length} locations, ${format(target.unique)} keywords. ` +
            (written
              ? "The AI summary is written."
              : "The AI summary could not be written."),
        );
      }
      autoFlow.current = false;
    }
  }
  useEffect(() => {
    if (!report || !autoFlow.current || aiAutoFor.current === report) return;
    aiAutoFor.current = report;
    if (websiteBatch.length) {
      void classifyWebsiteBatch().then(writeStrategicRead);
    } else {
      void writeStrategicRead(report);
    }
  }, [report]);
  useEffect(() => {
    if (autoBuild > 0) {
      autoFlow.current = true;
      void buildSheet();
    }
  }, [autoBuild]);
  async function buildSheet() {
    const id = sheetIdFromInput(sheet);
    if (!id) {
      setMessage("Paste a valid Google Sheet link or ID.");
      return;
    }
    setBusy(true);
    setMessage("");
    setReport(null);
    try {
      applySources(await readGoogleSheet(id), brands, id);
    } catch (error) {
      autoFlow.current = false;
      setMessage(
        error instanceof Error ? error.message : "Could not read the sheet.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function build(event: FormEvent) {
    event.preventDefault();
    if (!files.length) {
      setMessage("Choose at least one location CSV.");
      return;
    }
    setBusy(true);
    setMessage("");
    setReport(null);
    try {
      const sources = await Promise.all(
        files.map(async (file) => {
          if (!file.name.toLowerCase().endsWith(".csv"))
            return { name: file.name, error: "Choose a .csv export." };
          try {
            return { name: file.name, text: await file.text() };
          } catch {
            return {
              name: file.name,
              error: "The browser could not read this file.",
            };
          }
        }),
      );
      applySources(sources);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The report could not be built.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="two-column">
        <Card>
          <CardHeader>
            <div className="card-heading">
              <div>
                <CardTitle>Build your keyword report</CardTitle>
                <CardDescription>
                  Read your Google Sheet and compare its locations.
                </CardDescription>
              </div>
              <Badge variant="outline">Google Sheets</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="sheet-report-controls">
              <div className="field">
                <Label htmlFor="report-sheet">Google Sheet link or ID</Label>
                <Input
                  id="report-sheet"
                  value={sheet}
                  onChange={(event) => setSheet(event.target.value)}
                  placeholder="Paste your spreadsheet link or ID"
                  disabled={busy}
                />
                <p>
                  Set General access to Anyone with the link. Viewer access is
                  enough to build the report.
                </p>
              </div>
              <div className="field">
                <Label htmlFor="sheet-brands">
                  Brands to match <span>Optional</span>
                </Label>
                <Input
                  id="sheet-brands"
                  value={brands}
                  disabled={busy}
                  onChange={(event) => setBrands(event.target.value)}
                  placeholder="Philips, Agaro, Prestige"
                  maxLength={4000}
                />
                <p>
                  Separate brands with commas. Add aliases with |, for example
                  Dot &amp; Key | dot and key | dot andkey.
                </p>
              </div>
              <div className="sheet-report-actions">
                <Button
                  type="button"
                  onClick={() => buildSheet()}
                  disabled={busy || aiBusy || classifying}
                >
                  {busy ? <Loader2 className="spinner" /> : <ArrowRight />}
                  {busy ? "Reading Sheet" : "Build report from public Sheet"}
                </Button>
              </div>
            </div>
            <details className="csv-alternative">
              <summary>Or import CSV files</summary>
              <form onSubmit={build} className="report-form">
                <div
                  className={"upload-area " + (dragging ? "is-dragging" : "")}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!busy) setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    if (!busy) setFiles([...event.dataTransfer.files]);
                  }}
                >
                  <div className="upload-icon">
                    <UploadCloud />
                  </div>
                  <strong>Drop your location CSVs here</strong>
                  <p>Or choose files from your computer</p>
                  <Input
                    type="file"
                    id="report-files"
                    accept=".csv,text/csv"
                    multiple
                    disabled={busy}
                    aria-label="Choose location CSVs"
                    onChange={(event) =>
                      setFiles([...(event.target.files ?? [])])
                    }
                  />
                  <small>
                    One CSV per location. Include your input tab for seed hit
                    rates.
                  </small>
                </div>
                {files.length > 0 && (
                  <div className="file-list" aria-live="polite">
                    <span>
                      {files.length} {files.length === 1 ? "file" : "files"}{" "}
                      selected
                    </span>
                    {files.map((file, i) => (
                      <Badge key={i} variant="secondary">
                        <FileSpreadsheet size={12} />
                        <span title={file.name}>{file.name}</span>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={"Remove " + file.name}
                          onClick={() =>
                            setFiles((previous) =>
                              previous.filter((_, index) => index !== i),
                            )
                          }
                        >
                          <X size={12} />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="field">
                  <Label htmlFor="report-brands">
                    Brands to match <span>Optional</span>
                  </Label>
                  <Input
                    id="report-brands"
                    value={brands}
                    disabled={busy}
                    onChange={(event) => setBrands(event.target.value)}
                    placeholder="Philips, Agaro, Prestige"
                    maxLength={4000}
                  />
                  <p>Separate brands with commas and add aliases with |.</p>
                </div>
                <div className="form-bottom">
                  <span>
                    <LockKeyhole />
                    Files stay on your device
                  </span>
                  <Button
                    type="submit"
                    disabled={busy || aiBusy || classifying}
                  >
                    {busy ? (
                      <>
                        <Loader2 className="spinner" />
                        Reading files
                      </>
                    ) : (
                      <>
                        Build report <ArrowRight />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </details>
          </CardContent>
        </Card>
        <Guide report />
      </div>
      {message && (
        <Alert variant="destructive" className="report-warning">
          <CircleHelp />
          <AlertTitle>Some inputs need attention</AlertTitle>
          <AlertDescription className="whitespace-pre-line">
            {message}
          </AlertDescription>
        </Alert>
      )}
      {report && location && (
        <ReportDashboard
          report={report}
          locationIndex={locationIndex}
          onLocation={setLocationIndex}
          headingRef={resultsRef}
          aiRead={aiRead}
          aiBusy={aiBusy || classifying}
          aiMessage={aiMessage}
          onWriteAi={() => void writeStrategicRead()}
          actions={
            <div className="sheet-report-actions">
              <DownloadButton
                onClick={() =>
                  downloadCsv("Keyword Summary.csv", reportExportRows(report))
                }
              >
                Summary CSV
              </DownloadButton>
              <DownloadButton
                onClick={() =>
                  downloadCsv(
                    "Keyword Details.csv",
                    keywordRows(report, [location]),
                  )
                }
              >
                Market keyword CSV
              </DownloadButton>
              <DownloadButton
                onClick={() =>
                  downloadClaudeBundle(report, {
                    sheetId: reportSheetId,
                    strategicRead: aiRead,
                  })
                }
              >
                Export for Claude Code
              </DownloadButton>
            </div>
          }
          classifyArea={
            <div className="csv-alternative">
              <SovCategory
                id="report-sov-category"
                value={sovCategory}
                disabled={busy || classifying || aiBusy}
                onChange={(value) => {
                  setSovCategory(value);
                  setWebsiteLabels(new Map());
                  setClassificationError("");
                  setAiRead(null);
                  if (!classificationInput.current || !websiteLabels.size)
                    return;
                  const { sources, brands } = classificationInput.current;
                  const updated = reportBuild(sources, brands);
                  aiAutoFor.current = updated;
                  setReport(updated);
                }}
              />
              <p className="helper">
                Select a category to give AI the TBMSOV brand list.
                Classification uses your keywords and any source domains. OpenAI
                usage may incur charges.
              </p>
              {websiteLabels.size > 0 && (
                <p className="helper" aria-live="polite">
                  AI checked {format(websiteLabels.size)} of{" "}
                  {format(report.unique)} distinct keywords. Review the
                  suggested labels in the explorer.
                </p>
              )}
              {websiteBatch.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={classifyWebsiteBatch}
                  disabled={classifying || aiBusy}
                >
                  <Sparkles />
                  {classifying
                    ? "Classifying…"
                    : `Classify ${websiteBatch.length} keywords with AI`}
                </Button>
              )}
              {classificationError && (
                <Alert variant="destructive">
                  <AlertDescription>{classificationError}</AlertDescription>
                </Alert>
              )}
            </div>
          }
        />
      )}
    </>
  );
}

export default function App() {
  const [sheet, setSheet] = useState("");
  const [sovCategory, setSovCategory] = useState("");
  const [autoBuild, setAutoBuild] = useState(0);
  const [workspace, setWorkspace] = useState<"collection" | "report">(
    "collection",
  );
  return (
    <div className="app">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="./"
          aria-label="The Bored Monkey Keyword Workbench"
        >
          <img className="brand-mark" src={tbmLogo} alt="" />
          <span className="brand-name">
            TheBoredMonkey<span>Keyword Workbench</span>
          </span>
        </a>
        <div className="sidebar-label">Research workspace</div>
        <nav aria-label="Workspace">
          {[
            { id: "collection", title: "Collect data", icon: LayoutGrid },
            { id: "report", title: "Keyword report", icon: BarChart3 },
          ].map(({ id, title, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              aria-current={workspace === id ? "page" : undefined}
              onClick={() => setWorkspace(id as typeof workspace)}
            >
              <Icon />
              {title}
              {workspace === id && <span className="nav-indicator" />}
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-insight">
            <Sparkles />
            <strong>
              Good strategy starts
              <br />
              with a little curiosity.
            </strong>
            <p>Find out what your audience is searching for.</p>
          </div>
          <a
            href="https://theboredmonkey.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Meet The Bored Monkey <ArrowUpRight />
          </a>
        </div>
      </aside>
      <div className="app-body">
        <div className="topbar">
          <span>
            Workspace <ChevronRight size={13} />
            <strong>
              {workspace === "collection" ? "Collect data" : "Keyword report"}
            </strong>
          </span>
          <Badge variant="outline">
            <FileSpreadsheet size={12} />
            Built around Google Sheets
          </Badge>
        </div>
        <main id="workspace" className="main-content">
          <header className="page-heading">
            <div>
              <span className="heading-note">
                {workspace === "collection"
                  ? "Start with the right questions"
                  : "Make sense of your search data"}
              </span>
              <h1>
                {workspace === "collection"
                  ? "A clearer picture of demand."
                  : "Find your next opportunity."}
              </h1>
              <p>
                {workspace === "collection"
                  ? "Research websites and keywords. See what people search for, and where."
                  : "Compare locations, discover useful keywords, and take your findings back to Sheets."}
              </p>
            </div>
            <div className="heading-decoration" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          </header>
          <div hidden={workspace !== "collection"}>
            <Collection
              sovCategory={sovCategory}
              setSovCategory={setSovCategory}
              sheet={sheet}
              setSheet={setSheet}
              openReport={() => setWorkspace("report")}
              onFilled={(id) => {
                setSheet(
                  "https://docs.google.com/spreadsheets/d/" + id + "/edit",
                );
                setWorkspace("report");
                setAutoBuild((n) => n + 1);
              }}
            />
          </div>
          <div hidden={workspace !== "report"}>
            <Reports
              sheet={sheet}
              setSheet={setSheet}
              autoBuild={autoBuild}
              sovCategory={sovCategory}
              setSovCategory={setSovCategory}
            />
          </div>
          <footer>
            <span>The Bored Monkey · Keyword Workbench</span>
            <span>
              <LockKeyhole size={12} /> CSV analysis runs on your device
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
