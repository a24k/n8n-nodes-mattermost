# CLAUDE.md

This file provides guidance for Claude Code when working in this repository.

## Project Overview

`@a24k/n8n-nodes-mattermost` is an n8n community node that extends the official Mattermost node with support for file attachments and message attachments (rich posts).

## Docs Structure

```
docs/
  requirements.md       # Living spec: current confirmed specification
  drafts/
    YYYYMMDD-<story>.md # One file per story; deleted after merging into requirements.md
```

**Always work from the draft file specified at the start of a session.**
Do not reference other draft files unless explicitly instructed.
When a story is complete, its content is merged into `requirements.md` and the draft file is deleted.

## Commands

```bash
# Install dependencies
bun install

# Build (compiles TypeScript to dist/ via tsc)
bun run build

# Lint
bun run lint
bun run lint:fix

# Start local n8n instance with this node loaded (hot reload)
bun run dev

# Test
bun test
```

## Architecture

```
src/
  nodes/
    Mattermost/
      Mattermost.node.ts      # Main node definition
      Mattermost.node.json    # Node icon metadata
dist/                         # Compiled output (generated, do not edit)
docs/
  requirements.md
  drafts/
```

No credentials source file is needed. The node references the existing `mattermostApi`
credential type provided by `n8n-nodes-base` directly in its node description.

## Key Implementation Rules

### Credential
Reuse the existing `mattermostApi` credential type from `n8n-nodes-base`. Do not define a new credential type.

The credential exposes these fields (exact names as defined in n8n-nodes-base):
- `baseUrl` — server base URL (note: lowercase `u`, no trailing slash guarantee)
- `accessToken` — bearer token
- `allowUnauthorizedCerts` — boolean, skip SSL validation

When constructing API URLs, strip any trailing slash: `` `${baseUrl.replace(/\/$/, '')}/api/v4/...` ``

### API
Use Mattermost API v4 only.

**File upload** — `POST /api/v4/files?channel_id=<id>`
- Content-Type: `multipart/form-data`
- Form field name for the file binary: **`files`** (plural)
- `channel_id` is passed as a **query parameter** (not a form field)
- Response: `{ file_infos: [{ id: "<file_id>", ... }], client_ids: [...] }`
- Extract the uploaded file ID from `file_infos[0].id`

**Create post** — `POST /api/v4/posts`
- Body: `{ channel_id, message, file_ids, root_id, props: { attachments } }`
- All fields except `channel_id` are optional

### File Upload Flow
1. For each file item, read n8n binary data:
   - `const binaryMeta = this.helpers.assertBinaryData(itemIndex, binaryPropertyName)` → filename, mimeType
   - `const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName)` → Buffer
2. Upload all files in parallel via `Promise.all`; each upload uses form field name `files`
3. Collect `file_infos[0].id` from each upload response
4. Make a single post with all collected `file_id`s

If the post fails after successful uploads, the error output must include `uploaded_file_ids` so downstream nodes can handle cleanup.

> **Note on orphaned files**: Mattermost does not provide a public API to delete orphaned files (files with no associated post). The node surfaces `uploaded_file_ids` in the error output so that operators can handle this at the infrastructure level if needed.

### No Runtime Dependencies
Do not add any runtime dependencies (`dependencies` in `package.json`). All logic must be implemented using Node.js built-ins and the n8n framework only. This is required for npm Verified node eligibility.

### continueOnFail
Always wrap execution in a try/catch and respect `this.continueOnFail()`.

### AI Agent Support
Set `usableAsTool: true` in the node description.

## package.json Requirements

```json
{
  "name": "@a24k/n8n-nodes-mattermost",
  "keywords": ["n8n-community-node-package"],
  "n8n": {
    "n8nNodesApiVersion": 1,
    "nodes": ["dist/nodes/Mattermost/Mattermost.node.js"]
  }
}
```

No `credentials` entry is needed because `mattermostApi` is defined in `n8n-nodes-base`,
not in this package. Only list credentials that this package itself defines.

## Publishing

```bash
bun run build
npm publish --access public
```
