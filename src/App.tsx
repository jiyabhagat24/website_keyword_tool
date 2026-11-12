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
  ChevronLeft,
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
  Search,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/watermelon/table";
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
import {
  googleSignInConfigured,
  loadGoogleIdentity,
  readGoogleSheet,
  sheetIdFromInput,
} from "./google-sheets";
import { runAnalysisWorkflow, requestStrategicRead } from "./analysis-workflow";
import type { StrategicRead } from "./analysis-workflow";
import {
  reportBuild,
  reportBrandRows,
  reportFacts,
  reportExportRows,
  reportSafeCsv,
  reportPercent,
  reportNormalize,
  reportNumber,
  reportTiers,
  reportQuadrants,
  reportIntents,
} from "../keyword-report";

type Mode = "website" | "keywords";
type Report = ReturnType<typeof reportBuild>;
const format = (value: number | null) =>
  value === null ? "—" : reportNumber.format(value);
const formatBid = (micros: number | null) =>
  micros === null
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(micros / 1_000_000);

function DataTable({
  headers,
  rows,
  label,
}: {
  headers: string[];
  rows: ReactNode[][];
  label: string;
}) {
  return (
    <div className="data-table" tabIndex={0} role="region" aria-label={label}>
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header} scope="col">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {row.map((cell, i) => (
                <TableCell key={i}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

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
  sheet,
  setSheet,
  openReport,
}: {
  sheet: string;
  setSheet: (value: string) => void;
  openReport: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [mode, setMode] = useState<Mode>("website");
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
    if (problem) {
      setError(problem);
      setState("error");
      return;
    }
    setConfirmed(false);
    setState("running");
    setError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const range = custom ? dates : defaultDates;
    try {
      const result = await fetch(WEBHOOKS[mode], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetUrl: id,
          allLocations: all,
          ...(!all ? { locations } : {}),
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
      try {
        const body = JSON.parse(text);
        setConfirmed(body?.status === "success");
      } catch {
        setConfirmed(false);
      }
      setResponse(text);
      setSheetLink("https://docs.google.com/spreadsheets/d/" + id + "/edit");
      setState("accepted");
    } catch (error) {
      setError(
        error instanceof Error && error.name === "AbortError"
          ? "The request timed out. Check your sheet before retrying, as the workflow may still be running."
          : error instanceof Error
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
              <Button type="submit" disabled={state === "running"}>
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
  sheet,
  setSheet,
}: {
  sheet: string;
  setSheet: (value: string) => void;
}) {
  const [accessKey, setAccessKey] = useState("");
  const [brandsDetected, setBrandsDetected] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [brands, setBrands] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const [locationIndex, setLocationIndex] = useState(0);
  const [quadrant, setQuadrant] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [aiRead, setAiRead] = useState<StrategicRead | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const aiSettingsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    void loadGoogleIdentity().catch(() => {});
  }, []);
  const location = report?.locations[locationIndex];
  const matching = useMemo(
    () =>
      location
        ? [...location.keywords.entries()]
            .filter(
              ([key, row]) =>
                key.includes(reportNormalize(search)) &&
                (quadrant === null || row.quadrant === quadrant),
            )
            .map(([, row]) => row)
            .sort(
              (a, b) =>
                b.volume - a.volume || a.keyword.localeCompare(b.keyword),
            )
        : [],
    [location, search, quadrant],
  );
  function applySources(
    sources: { name: string; text?: string; error?: string }[],
    brandList = brands,
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
    setQuadrant(null);
    setSearch("");
    setPage(0);
    setAiRead(null);
    setAiMessage("");
    setReport(result);
    requestAnimationFrame(() => resultsRef.current?.focus());
  }
  async function writeStrategicRead() {
    if (!report) return;
    if (!accessKey.trim()) {
      const settings = aiSettingsRef.current;
      if (settings) {
        settings.open = true;
        settings.querySelector("input")?.focus();
      }
      return;
    }
    setAiBusy(true);
    setAiMessage("");
    try {
      setAiRead(await requestStrategicRead(reportFacts(report), accessKey));
    } catch (error) {
      setAiMessage(
        error instanceof Error ? error.message : "The strategic read failed.",
      );
    } finally {
      setAiBusy(false);
    }
  }
  async function buildSheet(source: "public" | "private" | "ai") {
    const id = sheetIdFromInput(sheet);
    if (!id) {
      setMessage("Paste a valid Google Sheet link or ID.");
      return;
    }
    if (source === "ai" && !accessKey.trim()) {
      setMessage("Enter the access key in Optional AI tools to detect brands.");
      return;
    }
    setBusy(true);
    setMessage("");
    setReport(null);
    setBrandsDetected(false);
    try {
      if (source === "ai") {
        const result = await runAnalysisWorkflow(id, accessKey, true);
        const brandList = [brands.trim(), ...result.brands]
          .filter(Boolean)
          .join(", ");
        setBrands(brandList);
        setBrandsDetected(result.detected);
        applySources(result.sources, brandList);
      } else {
        applySources(await readGoogleSheet(id, source === "private"));
      }
    } catch (error) {
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
  const keywordsCsv = () =>
    downloadCsv("Keyword Details.csv", [
      [
        "Keyword",
        "Search volume",
        "Competition index",
        "Low bid (₹)",
        "High bid (₹)",
        "Volume tier",
        "Quadrant",
        "Brand",
        "Intent tags",
      ],
      ...matching.map((row) => [
        row.keyword,
        row.volume,
        row.competition,
        row.lowBidMicros === null ? "" : row.lowBidMicros / 1_000_000,
        row.highBidMicros === null ? "" : row.highBidMicros / 1_000_000,
        reportTiers[row.tier],
        reportQuadrants[row.quadrant],
        row.brand,
        row.intents.map((i: number) => reportIntents[i][0]).join(", "),
      ]),
    ]);
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
                {brandsDetected && (
                  <p>
                    Review the detected names. Edit the list and rebuild the
                    report to use your corrections.
                  </p>
                )}
              </div>
              <div className="sheet-report-actions">
                <Button
                  type="button"
                  onClick={() => buildSheet("public")}
                  disabled={busy || aiBusy}
                >
                  {busy ? <Loader2 className="spinner" /> : <ArrowRight />}
                  {busy ? "Reading Sheet" : "Build report from public Sheet"}
                </Button>
                {googleSignInConfigured && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => buildSheet("private")}
                    disabled={busy || aiBusy}
                  >
                    Sign in with Google
                  </Button>
                )}
              </div>
            </div>
            <details className="csv-alternative" ref={aiSettingsRef}>
              <summary>Optional AI tools</summary>
              <div className="report-form">
                <div className="field">
                  <Label htmlFor="report-access">AI access key</Label>
                  <Input
                    id="report-access"
                    type="password"
                    autoComplete="off"
                    value={accessKey}
                    onChange={(event) => setAccessKey(event.target.value)}
                    disabled={busy || aiBusy}
                    placeholder="Enter your n8n access key"
                  />
                  <p>Required for brand detection and the strategic read.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => buildSheet("ai")}
                  disabled={busy || aiBusy}
                >
                  <Sparkles /> Detect brands and build report
                </Button>
                <p>
                  Brand detection sends up to 5,000 distinct keywords to OpenAI
                  and may use paid API credits.
                </p>
              </div>
            </details>
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
                  <p>
                    Separate names with commas to distinguish branded and
                    generic keywords.
                  </p>
                </div>
                <div className="form-bottom">
                  <span>
                    <LockKeyhole />
                    Files stay on your device
                  </span>
                  <Button type="submit" disabled={busy || aiBusy}>
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
        <section className="report-results" aria-labelledby="report-title">
          <div className="results-header">
            <div>
              <Badge variant="secondary">
                <Check size={12} />
                Report ready
              </Badge>
              <h2 id="report-title" tabIndex={-1} ref={resultsRef}>
                Your search landscape
              </h2>
              <p>Google rounds search volumes. Compare tiers and buckets.</p>
            </div>
            <DownloadButton
              onClick={() =>
                downloadCsv("Keyword Summary.csv", reportExportRows(report))
              }
            >
              Summary CSV
            </DownloadButton>
          </div>
          <div className="metric-grid">
            <Card>
              <CardContent>
                <span>Locations compared</span>
                <strong>{report.locations.length}</strong>
                <small>From your imported exports</small>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <span>Keywords with demand</span>
                <strong>{format(report.unique)}</strong>
                <small>Distinct across all locations</small>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <span>Seed hit rate</span>
                <strong>
                  {report.seedCount
                    ? format(reportPercent(report.seedHits, report.seedCount)) +
                      "%"
                    : "—"}
                </strong>
                <small>
                  {report.seedCount
                    ? `${report.seedHits} of ${report.seedCount} exact matches`
                    : "Add an input CSV to measure"}
                </small>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Demand by location</CardTitle>
              <CardDescription>
                {report.locations.filter((item) => item.keywords.size <= 1)
                  .length
                  ? "Zero or one keyword with demand in " +
                    report.locations
                      .filter((item) => item.keywords.size <= 1)
                      .map((item) => item.name)
                      .join(", ") +
                    "."
                  : "Compare coverage and the highest reported volume in each location."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                label="Demand by location"
                headers={[
                  "Location",
                  "Keywords with demand",
                  "Volume buckets",
                  "Peak volume",
                  "Seed hits",
                ]}
                rows={report.locations.map((item) => [
                  <span className="location-name">
                    <MapPin size={14} />
                    {item.name}
                  </span>,
                  format(item.keywords.size),
                  format(item.buckets),
                  format(item.maxVolume),
                  report.seedCount ? item.seedHits : "—",
                ])}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="card-heading">
                <div>
                  <CardTitle>Find an opportunity</CardTitle>
                  <CardDescription>
                    Choose a group below to filter the keyword explorer.
                  </CardDescription>
                </div>
                <div className="field">
                  <Label htmlFor="report-location">Location</Label>
                  <NativeSelect
                    id="report-location"
                    value={locationIndex}
                    onChange={(event) => {
                      setLocationIndex(Number(event.target.value));
                      setQuadrant(null);
                      setSearch("");
                      setPage(0);
                    }}
                  >
                    {report.locations.map((item, i) => (
                      <NativeSelectOption key={item.name} value={i}>
                        {item.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="reference-read">
                <h3>What the numbers show</h3>
                <p>
                  In {location.name}, {format(location.keywords.size)} keywords
                  have reported demand across {format(location.buckets)}{" "}
                  distinct volume buckets. The highest reported volume is{" "}
                  {format(location.maxVolume)}. Google rounds these estimates.
                </p>
                <p>
                  {report.brands.length
                    ? `${format(reportPercent(location.branded, location.keywords.size))}% of keywords match your brand list. `
                    : "Add brand names when building the report to measure branded keyword share. "}
                  {reportIntents
                    .map(
                      ([name], index) =>
                        `${name}: ${format(reportPercent(location.intentCounts[index], location.keywords.size))}%`,
                    )
                    .join(" · ")}
                  . Shares are based on keyword counts.
                </p>
                <p>
                  {format(location.quadrants[1])} keywords have high volume and
                  low advertiser competition. Select that group below to inspect
                  them. Competition measures advertisers, and bids are
                  estimates.
                </p>
              </div>
              {report.brands.length > 0 && (
                <div className="brand-breakdown">
                  <h3>Brands in {location.name}</h3>
                  {reportBrandRows(location).length ? (
                    <table>
                      <thead>
                        <tr>
                          <th>Brand</th>
                          <th>Keywords</th>
                          <th>Indicative volume</th>
                          <th>Share of branded volume</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportBrandRows(location)
                          .slice(0, 15)
                          .map((row) => (
                            <tr key={row.brand}>
                              <td>{row.brand}</td>
                              <td>{format(row.keywords)}</td>
                              <td>{format(row.volume)}</td>
                              <td>{format(row.share)}%</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="helper">
                      No brand from your list appears in this location.
                    </p>
                  )}
                  <p className="helper">
                    Volumes add up Google’s rounded values for each brand’s
                    keywords, so treat them as a guide, not an exact figure.
                    {report.absentBrands.length > 0 &&
                      " Not found in any location: " +
                        report.absentBrands.join(", ") +
                        "."}
                  </p>
                </div>
              )}
              <div className="ai-read">
                <h3>Strategic read (AI)</h3>
                <p className="helper">
                  Sends only the calculated summary above, not your keywords, to
                  OpenAI. It may incur API charges. The result is a set of
                  hypotheses, not facts from the data.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={aiBusy}
                  onClick={writeStrategicRead}
                >
                  {aiBusy
                    ? "Writing…"
                    : aiRead
                      ? "Write again"
                      : "Write strategic read"}
                </Button>
                {aiMessage && (
                  <Alert variant="destructive">
                    <AlertDescription>{aiMessage}</AlertDescription>
                  </Alert>
                )}
                {aiRead && (
                  <div>
                    {aiRead.items.map((item, index) => (
                      <div key={index} className="ai-item">
                        <strong>{item.section}</strong>
                        <p>{item.observation}</p>
                        <p>
                          <em>Hypothesis (AI):</em> {item.hypothesis}
                        </p>
                      </div>
                    ))}
                    {aiRead.caveats.length > 0 && (
                      <ul>
                        {aiRead.caveats.map((caveat, index) => (
                          <li key={index}>{caveat}</li>
                        ))}
                      </ul>
                    )}
                    <p className="helper">
                      Written by {aiRead.model}. Check every number against the
                      tables before using it in a client document.
                    </p>
                  </div>
                )}
              </div>
              <div className="opportunity-grid">
                <div>
                  <h3>Competition matrix</h3>
                  <p className="helper">
                    High volume ≥ 1,000 · High competition ≥ 50
                  </p>
                  <div className="matrix">
                    {reportQuadrants.map((name, i) => (
                      <button
                        key={name}
                        type="button"
                        className={"matrix-item matrix-" + i}
                        aria-pressed={quadrant === i}
                        onClick={() => {
                          setQuadrant(quadrant === i ? null : i);
                          setPage(0);
                        }}
                      >
                        <span className="matrix-count">
                          {format(location.quadrants[i])}
                        </span>
                        <strong>{name}</strong>
                        <small>
                          {
                            [
                              "High volume / High competition",
                              "High volume / Low competition",
                              "Low volume / High competition",
                              "Low volume / Low competition",
                              "Blank or invalid competition",
                            ][i]
                          }
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3>Keywords by volume tier</h3>
                  <p className="helper">
                    Count of keywords in each reported range
                  </p>
                  <div className="tiers">
                    {reportTiers.map((tier, i) => (
                      <div className="tier" key={tier}>
                        <span>{tier}</span>
                        <div aria-hidden="true">
                          <div
                            style={{
                              width:
                                (100 * location.tiers[i]) /
                                  Math.max(1, ...location.tiers) +
                                "%",
                            }}
                          />
                        </div>
                        <strong>{format(location.tiers[i])}</strong>
                      </div>
                    ))}
                  </div>
                  {location.cityState && (
                    <p className="comparison-note">
                      {location.cityState.pairs
                        ? `${format(location.cityState.index)}% median city/state ratio vs. ${location.cityState.name}, across ${location.cityState.pairs} matched keywords.`
                        : `No shared positive-volume keywords with ${location.cityState.name}.`}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="card-heading">
                <div>
                  <CardTitle>Explore the keywords</CardTitle>
                  <CardDescription>
                    Brand and intent tags use your brand list and fixed phrase
                    rules.
                  </CardDescription>
                </div>
                <DownloadButton
                  disabled={!matching.length}
                  onClick={keywordsCsv}
                >
                  Keyword CSV
                </DownloadButton>
              </div>
            </CardHeader>
            <CardContent>
              <div className="search-row">
                <div className="search-field">
                  <Search />
                  <Input
                    aria-label="Find a keyword"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(0);
                    }}
                    placeholder="Find a keyword in this location"
                  />
                </div>
                {quadrant !== null && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setQuadrant(null);
                      setPage(0);
                    }}
                  >
                    {reportQuadrants[quadrant]}
                    <X />
                  </Button>
                )}
              </div>
              {matching.length ? (
                <DataTable
                  label="Keyword explorer"
                  headers={[
                    "Keyword",
                    "Volume",
                    "Competition",
                    "Low bid (₹)",
                    "High bid (₹)",
                    "Tier",
                    "Brand",
                    "Intent",
                  ]}
                  rows={matching
                    .slice(page * 50, (page + 1) * 50)
                    .map((row) => [
                      row.keyword,
                      format(row.volume),
                      format(row.competition),
                      formatBid(row.lowBidMicros),
                      formatBid(row.highBidMicros),
                      reportTiers[row.tier],
                      row.brand ? (
                        <Badge variant="secondary">{row.brand}</Badge>
                      ) : (
                        "—"
                      ),
                      row.intents
                        .map((i: number) => reportIntents[i][0])
                        .join(", ") || "—",
                    ])}
                />
              ) : (
                <div className="empty-result">
                  <Search />
                  <strong>No matching keywords</strong>
                  <p>Try another search or clear the competition filter.</p>
                </div>
              )}
              <div className="pagination">
                <span>
                  {matching.length
                    ? `${page * 50 + 1}–${Math.min((page + 1) * 50, matching.length)} of ${format(matching.length)} keywords`
                    : "0 keywords"}
                </span>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Previous page"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Next page"
                    disabled={(page + 1) * 50 >= matching.length}
                    onClick={() => setPage(page + 1)}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Seasonality</CardTitle>
              <CardDescription>
                {location.seasonNote ||
                  "Median per-keyword ratio, with December 2025 set to 100."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {location.seasonality.some((month) => month.pairs) ? (
                <DataTable
                  label="Seasonality"
                  headers={["Month", "Index", "Matched keywords"]}
                  rows={location.seasonality.map((month) => [
                    month.label,
                    format(month.index),
                    month.pairs,
                  ])}
                />
              ) : (
                <p className="helper">
                  Use dated month headers, such as December 2025, to compare
                  seasonal demand.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </>
  );
}

export default function App() {
  const [sheet, setSheet] = useState("");
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
              sheet={sheet}
              setSheet={setSheet}
              openReport={() => setWorkspace("report")}
            />
          </div>
          <div hidden={workspace !== "report"}>
            <Reports sheet={sheet} setSheet={setSheet} />
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
