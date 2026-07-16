# Lyric Capital Group Deal Pipeline Site

A hosted, external-facing view of the ACTIVE DEALS board in Asana. Anyone with the link (and the access code, if set) can view it in a browser. No Asana or Claude account required for viewers. Data is pulled from the Asana API on demand and cached for one hour, so the page always reflects the board within the last hour.

## What is in this folder

- index.html: the dashboard page
- api/pipeline.js: a serverless function that pulls the pipeline from Asana

## Setup (about 15 minutes)

### 1. Create an Asana Personal Access Token

1. In Asana, click your profile photo, then Settings, then Apps.
2. Open Manage Developer Apps (or go to app.asana.com/0/my-apps).
3. Create a new Personal Access Token. Name it something like "Pipeline Site".
4. Copy the token. You will paste it into Vercel in step 3. Do not commit it to the repo or share it. Anyone with this token can act as you in Asana.

### 2. Put this folder on GitHub

1. Create a new private repository on GitHub (for example, lyric-pipeline).
2. Upload the contents of this folder to the repository (index.html at the root, pipeline.js inside an api folder).

### 3. Deploy on Vercel

1. Sign up at vercel.com (the free Hobby plan is fine) and import the GitHub repository.
2. No framework settings are needed. Vercel detects the static page and the api folder automatically.
3. Before deploying, add two environment variables under Settings, then Environment Variables:
   - ASANA_PAT: the token from step 1
   - ACCESS_CODE: any code you want viewers to enter (for example, LCG2026). Leave this out entirely if you want the page open to anyone with the link.
4. Deploy. You will get a URL like lyric-pipeline.vercel.app.

### 4. Optional: custom domain

In the Vercel project, open Settings, then Domains, and add something like pipeline.lyriccapitalgroup.com. Vercel shows you the DNS record to add at your domain registrar.

## How updates work

The team updates Asana as usual. When anyone opens the page, the serverless function pulls current tasks from the ACTIVE DEALS project. Responses are cached for one hour, so the page is never more than an hour behind Asana and there is nothing to refresh manually.

## What viewers see

Deals grouped by the ten pipeline stages, with deal name, deal lead, deal source, next steps, and status. Deals marked Passed/Dead or completed are excluded automatically. Stage and strategy filters (Lyric, MMM, SOS) are available at the top.

## Notes

- The access code is a light gate suitable for sharing with known outside parties. It is not a substitute for real authentication. Anyone who has both the link and the code can view the page.
- The page is marked noindex so search engines do not list it.
- To change which fields display, edit index.html. To change which fields are pulled, edit api/pipeline.js.
