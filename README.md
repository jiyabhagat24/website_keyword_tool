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

## Connect Google Sheets

1. Create or select a Google Cloud project and enable the Google Sheets API.
2. Configure the OAuth consent screen and create an OAuth client ID of type **Web application**. Add the exact website origin under **Authorized JavaScript origins**. For local development, include the exact Vite origin, such as `http://localhost:5173`.
3. If the OAuth app is in testing mode, add the Google accounts that will sign in as test users.
4. Set `VITE_GOOGLE_CLIENT_ID` to the public web client ID in your hosting service's build settings and rebuild. For local development, set it in a gitignored `.env.local` file. Keep client secrets out of the browser and repository.
5. In **Keyword report**, paste the sheet link and choose **Connect Google Sheet**. Sign in with an account that can view it and grant read-only access. Recognized location tabs and input tabs are loaded. Use CSV import for custom location names.

Google sign-in requires an authorized HTTP or HTTPS origin. See [Google Identity Services setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

## Build a keyword report from CSV

1. Open each completed location tab in Sheets and choose **File → Download → Comma-separated values (.csv)**. Export one file per tab. For custom locations, name the CSV after its tab.
2. Open **Keyword report**, expand **Or import CSV files**, and select the exports together. Include **Keyword input** for exact seed hit rates or **Website Input** if you use `kw:` brand seeds.
3. Optionally enter comma-separated brand names. Brand matching uses that list. Intent tags use fixed phrases for price, comparison, doubt, recipes, and usage.
4. Build the report. Select a location and click a competition quadrant to filter the keyword explorer.
5. Download the summary or keyword details as CSV. In your original Google Sheet, use **File → Import → Upload** and choose **Insert new sheet(s)**.

The report processes the CSVs in the browser. It uses distinct positive-volume keywords, counts volume tiers, and uses 1,000 search volume and 50 competition index as the quadrant thresholds. Google rounds search volumes, so the report shows volume buckets and peak values. Seasonality uses the median keyword-level ratio to December 2025 where dated month columns exist. City/state comparisons use keywords found with positive volume in both exported tabs.
