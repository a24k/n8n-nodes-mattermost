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
  credentials/
    MattermostApi.credentials.ts  # Reuses mattermostApi from n8n-nodes-base
dist/                         # Compiled output (generated, do not edit)
docs/
  requirements.md
  drafts/
```

## Key Implementation Rules

### Credential
Reuse the existing `mattermostApi` credential type from `n8n-nodes-base`. Do not define a new credential type. Read `baseURL` and `accessToken` from the credential.

### API
Use Mattermost API v4 only.
- File upload: `POST /api/v4/files?channel_id=<id>` with `multipart/form-data`
- Post: `POST /api/v4/posts` with `{ channel_id, message, file_ids, root_id, props: { attachments } }`

### File Upload Flow
1. Upload all files in parallel via `Promise.all`
2. Collect all `file_id`s
3. Make a single post with all `file_id`s

If the post fails after successful uploads, the error output must include `uploaded_file_ids` so downstream nodes can handle cleanup.

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
    "credentials": ["dist/credentials/MattermostApi.credentials.js"],
    "nodes": ["dist/nodes/Mattermost/Mattermost.node.js"]
  }
}
```

## Publishing

```bash
bun run build
npm publish --access public
```
