# Keyword Workbench

A React and TypeScript workbench for collecting search data through n8n and comparing Google Sheets exports. Uses Watermelon UI source components and Tailwind CSS, themed with The Bored Monkey’s orange, yellow, charcoal, and white palette.

## Run locally

Use Node.js 22.12 or newer. Run `npm ci` and `npm run dev`.

## Build and publish

Run `npm run build` to check TypeScript and produce the static site in `dist/`. Run `npm run preview` to preview that build. Configure your static host to run `npm ci && npm run build` and publish `dist/`. The relative asset base supports hosting under a repository subpath. Build output is gitignored.

Component provenance and license are in `src/components/watermelon/`. The interface uses Watermelon buttons, cards, inputs, labels, switches, checkboxes, tabs, badges, alerts, accordions, selects, and tables.

## Collect data

1. Select **From websites** or **From keywords** and copy its Google Sheet template.
2. Give the Google account used by the automation Editor access to your copy. Add your input in the matching input tab.
3. Paste your spreadsheet link or ID into the workbench, choose locations or dates if needed, and submit. The workflow writes results to the spreadsheet.

## Read Google Sheets directly

For a public Sheet, set **General access** to **Anyone with the link → Viewer** and allow downloads. In **Keyword report**, paste the link and select **Build report from public Sheet**. The browser reads Google's workbook export directly. No Google sign-in, Google API key, or n8n key is required.


If you configure `VITE_GOOGLE_SHEETS_API_KEY`, the public import uses the Google Sheets API. Restrict the browser API key to your website's HTTP referrers and the Google Sheets API. The report reads standard location and input tabs. Use CSV import for custom location names.

## Configure optional AI tools in n8n

1. Import `workflows/Keyword Report - n8n Analysis.json` as a new n8n workflow. It is inactive when imported.
2. The **Analysis Webhook** has no access key, so anyone who knows its URL can call it and use your OpenAI credits. Replace `https://YOUR-WEBSITE-ORIGIN` in the webhook's allowed origins with the exact website origin, and add the key check back (Header Auth `X-Report-Key`) if the URL is ever shared widely.
3. Connect the existing Google Sheets OAuth credential to **List Sheet Tabs** and **Read Sheet Tabs**. That Google account needs access to the copied spreadsheet.
4. To use optional brand detection, connect the existing OpenAI credential to **OpenAI Detect Brands**. Brand detection sends keywords to OpenAI and can incur API charges. The workflow allows up to 5,000 distinct keywords when it is enabled. It uses `gpt-4.1-mini`, which can be changed in that node.
5. Publish the workflow. Set `VITE_ANALYSIS_WEBHOOK_URL` in your hosting service to the production HTTPS webhook URL and rebuild the website. For local development, place that variable in the gitignored `.env.local` file.
6. In **Keyword report**, choose **Write strategic read** after a report is available. Review suggested brands before using them for decisions.

For automatic analysis, deploy the matching updated collection workflow JSON files and the analysis workflow. Assign the existing Google Sheets credential to **Create Collection Status** and **Mark Collection Complete** in each collection workflow. The browser watches a run-specific status tab in the link-shared Sheet and starts the strategic read once every workflow group reports completion. A website collection first classifies one batch of up to 100 keywords. Use the report's classification button for further batches. Keep the workbench open until the report is ready. Opening a saved Sheet or importing CSV manually lets you start AI from the report.

## Build a keyword report from CSV

1. Open each completed location tab in Sheets and choose **File → Download → Comma-separated values (.csv)**. Export one file per tab. For custom locations, name the CSV after its tab.
2. Open **Keyword report**, expand **Or import CSV files**, and select the exports together. Include **Keyword input** for exact seed hit rates or **Website Input** if you use `kw:` brand seeds.
3. Optionally enter comma-separated brands. Use `Brand | alias | alias` to group spelling variants under one brand. Intent tags use fixed phrases for price, comparison, doubt, recipes, and usage.
4. Build the report and select a location. Select a keyword to see its monthly trend, or rank the explorer by bid to find expensive terms. Expand the regional comparison to see shares of reported volume and city versus state ratios for matched keywords.
5. Download the summary or keyword details as CSV. In your original Google Sheet, use **File → Import → Upload** and choose **Insert new sheet(s)**.

The **Keyword classification** section shows distinct keyword counts and shares by brand type and intent for the selected location. Click a category to open the matching keywords. The report uses labels from **Keyword input** and **Keyword Suggestion** when available, then falls back to the brand list and phrase rules. One keyword can match several intent rules. The Summary CSV includes the classification breakdown for each location.

For reports with a **Website Input** tab, **Classify website keywords with AI** sends domain names and up to 100 unprocessed keywords per click to the analysis workflow. It suggests own-brand, competitor, generic, and intent labels in the report and exports. Uncertain brand labels remain unclassified. The analysis workflow must include the `classify_website` mode from the current workflow export. AI calls may incur charges.

The report processes the CSVs in the browser. It uses distinct positive-volume keywords, counts volume tiers, and uses 1,000 search volume and 50 competition index as the quadrant thresholds. Volume shares use Google's rounded figures and can overlap for intent tags. Location and brand trends use the median keyword-level ratio to December 2025, or the earliest dated column when December 2025 is absent. City/state comparisons use keywords found with positive volume in both exported tabs.

Bid amounts appear in rupees in the report and CSV. For plain `Low bid` and `High bid` headers, the report reads fractional or ₹-prefixed bids as a sign that both columns use rupees. With whole numbers only, it defaults to raw Google Ads micros. Use `Low bid (₹)` and `High bid (₹)` to specify rupees, or add `(micros)` to specify raw micros.

## Brand breakdown and strategic read

- With a brand list, each location shows a brand breakdown, monthly trends, and peak months. Brands that appear in no location are listed under the table and in the CSV download.
- **Write strategic read** sends calculated figures and up to 10 keyword examples for the selected location to the analysis workflow. It asks OpenAI (`gpt-4.1-mini`) for 8–12 observation and hypothesis pairs and may incur API charges when the button is pressed.
- After importing the updated workflow, connect your OpenAI credential to both **OpenAI Detect Brands** and **OpenAI Strategic Read**.


## Export for Claude Code

**Export for Claude Code** (report header) downloads one ZIP with everything in the report: `README_FOR_CLAUDE_CODE.md` (source, column guide, rules, calculated headline numbers, next steps), `keywords_all_locations.csv` (every keyword in every location with bids in rupees, tags and monthly volumes), `locations_summary.csv`, `brands_by_location.csv` (when a brand list was supplied), `facts.json`, and `strategic_read.md` (only if the AI read was generated). Nothing is sent anywhere; the ZIP is built in the browser.

## Automatic report after collection

After **Start collection**, the page asks once for browser notification permission and then watches the Sheet. It counts the rows in each location tab every 45 seconds and, when the total has not changed for about three minutes, opens the **Keyword report**, builds it from the Sheet, and writes the AI strategic read without a click. When that finishes it shows a browser notification. The page has to stay open (a background tab is fine). The watcher stops after 4 hours or when you press **Stop watching**. Collection itself runs in n8n and does not need the page.

## Intent and Brand columns

The **Keyword Classifier** n8n workflow (`POST /webhook/keyword-classifier`, body `{"sheetUrl": "...", "tab": "Keyword input"}`) adds **Intent** and **Brand** columns to a keyword tab. It is rule based, so it costs nothing. Its code is in `workflows/keyword-classifier-code.js`. Add `"dryRun": true` to count without writing and `"overwrite": true` to redo rows that already have an Intent.

Intents, checked in this order: Branded (the site's own brand), Competitor brand (another brand), Comparison, Local, Price / Buy, Best / Review, Question, How-to, Concern, Ingredient, Generic. Brands apply to the **keyword workflow** only: type them under **Brands to track** when you start a keyword collection (`Name | alias, Other brand`), and the Dynamic Sheet workflow passes them to the classifier when it finishes, for the **Keyword input** and **Keyword Suggestion** tabs. The website workflow does not classify brands. Without a brand list, keywords are still sorted by the other intents.

The report reads the Brand and Intent columns from the Sheet, so brand tables and the AI summary work without typing a brand list again.
