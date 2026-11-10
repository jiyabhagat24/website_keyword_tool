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

## Build a keyword report

1. Open each completed location tab in Sheets and choose **File → Download → Comma-separated values (.csv)**. Export one file per tab. For custom locations, name the CSV after its tab.
2. Open **Keyword report** and select the exports together. Include **Keyword input** for exact seed hit rates or **Website Input** if you use `kw:` brand seeds.
3. Optionally enter comma-separated brand names. Brand matching uses that list. Intent tags use fixed phrases for price, comparison, doubt, recipes, and usage.
4. Build the report. Select a location and click a competition quadrant to filter the keyword explorer.
5. Download the summary or keyword details as CSV. In your original Google Sheet, use **File → Import → Upload** and choose **Insert new sheet(s)**.

The report processes the CSVs in the browser. It uses distinct positive-volume keywords, counts volume tiers, and uses 1,000 search volume and 50 competition index as the quadrant thresholds. Google rounds search volumes, so the report shows volume buckets and peak values. Seasonality uses the median keyword-level ratio to December 2025 where dated month columns exist. City/state comparisons use keywords found with positive volume in both exported tabs.
