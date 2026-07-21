# Website & Keyword Automation Tool

A lightweight, single-file web dashboard for triggering automated SEO 
and website analysis workflows via n8n, with results written directly 
to a connected Google Sheet.

## Features
- **Two automation modes**: Website analysis and keyword research
- **Google Sheets integration**: Users copy a template sheet, paste 
  their Sheet ID, and results populate automatically
- **n8n webhook triggers**: Each mode posts to a dedicated n8n webhook 
  endpoint to kick off backend processing
- **6 built-in themes**: Midnight, Light, Cyberpunk, Emerald, Nordic, 
  and Sunset
- **Debug mode**: Append `?debug=1` to the URL to see request/response 
  payloads inline
- **Zero build step**: Pure HTML/CSS/JS — no frameworks, no bundler, 
  just open the file or host it statically

## How it works
1. User selects a tool (Website or Keyword)
2. User copies the linked Google Sheet template and grabs the Sheet ID 
   from the URL
3. User pastes the Sheet ID (or raw URL/keywords) into the input
4. On submit, the app POSTs a JSON payload to the corresponding n8n 
   webhook
5. n8n processes the request and writes results back into the user's 
   Google Sheet

## Tech stack
- Vanilla HTML/CSS/JS
- n8n (workflow automation backend, hosted separately)
- Google Sheets (data output)
