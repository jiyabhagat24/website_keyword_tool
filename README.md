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

For private Sheets, enable the Google Sheets API and set `VITE_GOOGLE_CLIENT_ID` to a Google OAuth web client ID. Add the website's origin under **Authorized JavaScript origins**, configure the consent screen for the read-only Sheets scope, and rebuild. Select **Sign in with Google** and use an account that can view the Sheet.

If you configure `VITE_GOOGLE_SHEETS_API_KEY`, the public import uses the Google Sheets API. Restrict the browser API key to your website's HTTP referrers and the Google Sheets API. The report reads standard location and input tabs. Use CSV import for custom location names.

## Configure optional AI tools in n8n

1. Import `workflows/Keyword Report - n8n Analysis.json` as a new n8n workflow. It is inactive when imported.
2. In **Analysis Webhook**, create or choose a Header Auth credential with header name `X-Report-Key` and a strong value. Share that value only with people who may run reports. Replace `https://YOUR-WEBSITE-ORIGIN` in the webhook's allowed origins with the exact origin of your website.
3. Connect the existing Google Sheets OAuth credential to **List Sheet Tabs** and **Read Sheet Tabs**. That Google account needs access to the copied spreadsheet.
4. To use optional brand detection, connect the existing OpenAI credential to **OpenAI Detect Brands**. Brand detection sends keywords to OpenAI and can incur API charges. The workflow allows up to 5,000 distinct keywords when it is enabled. It uses `gpt-4.1-mini`, which can be changed in that node.
5. Publish the workflow. Set `VITE_ANALYSIS_WEBHOOK_URL` in your hosting service to the production HTTPS webhook URL and rebuild the website. For local development, place that variable in the gitignored `.env.local` file.
6. In **Keyword report**, open **Optional AI tools** and enter the analysis access key. Choose **Detect brands and build report** for OpenAI brand detection or **Write strategic read** after a report is available. Review suggested brands before using them for decisions.

The workflow reads the standard location and input tabs. Use CSV import for custom location names. The analysis runs after the user starts it and the n8n webhook responds; large sheets and paid brand detection can hit execution, response-size, rate, or proxy timeout limits. Check the n8n execution before retrying after a timeout. The live n8n workflow and its completion behavior must be tested in your instance before relying on automatic handoff.

## Build a keyword report from CSV

1. Open each completed location tab in Sheets and choose **File → Download → Comma-separated values (.csv)**. Export one file per tab. For custom locations, name the CSV after its tab.
2. Open **Keyword report**, expand **Or import CSV files**, and select the exports together. Include **Keyword input** for exact seed hit rates or **Website Input** if you use `kw:` brand seeds.
3. Optionally enter comma-separated brand names. Brand matching uses that list. Intent tags use fixed phrases for price, comparison, doubt, recipes, and usage.
4. Build the report. Select a location and click a competition quadrant to filter the keyword explorer.
5. Download the summary or keyword details as CSV. In your original Google Sheet, use **File → Import → Upload** and choose **Insert new sheet(s)**.

The report processes the CSVs in the browser. It uses distinct positive-volume keywords, counts volume tiers, and uses 1,000 search volume and 50 competition index as the quadrant thresholds. Google rounds search volumes, so the report shows volume buckets and peak values. Seasonality uses the median keyword-level ratio to December 2025 where dated month columns exist. City/state comparisons use keywords found with positive volume in both exported tabs.

## Brand breakdown and strategic read

- With a brand list, each location shows a table of brands (keywords, indicative volume, share of branded volume). Brands that appear in no location are listed under the table and in the CSV download. Volumes add up Google's rounded values, so they are a guide only.
- **Write strategic read** sends the calculated summary (no raw keywords) to the analysis workflow, which asks OpenAI (`gpt-4.1-mini`) for 8–12 observation and hypothesis pairs. They are labelled as AI hypotheses; the numbers in them should be checked against the tables. It may incur API charges and only runs when the button is pressed.
- After importing the updated workflow, connect your OpenAI credential to both **OpenAI Detect Brands** and **OpenAI Strategic Read**.
