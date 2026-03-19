# n8n Community Node Specification: Mattermost Node

## Overview

The official n8n Mattermost node does not support file attachments or message attachments (rich posts). This node fills that gap, enabling plain posts, file-attached posts, and attachment-rich posts all from a single node.

- **Package name**: `@a24k/n8n-nodes-mattermost`
- **Display name**: `Mattermost @a24k` (can be changed freely in future versions without breaking existing workflows)
- **Target n8n version**: 1.x and above
- **Distribution**: Published to npm with the `n8n-community-node-package` keyword
- **Build environment**: Bun (as package manager and test runner); TypeScript compiled via `@n8n/node-cli` (tsc-based)

---

## Background & Motivation

| Issue | Detail |
|-------|--------|
| No file attachment support | The official node calls `POST /api/v4/posts` only and does not support the `file_ids` parameter |
| Two-step API requirement | Mattermost file attachment requires: ① upload via `POST /files` to get a `file_id`, then ② post via `POST /posts` with that ID |
| Orphaned file risk | If the upload succeeds but the post fails, the file remains in storage with an empty `post_id` and cannot be cleaned up via the API |
| No attachment support | The official node has no UI for setting Slack-compatible `attachments` fields |

---

## Functional Requirements

### Operation

A single **Post Message** operation covers all cases. If files are specified, the post includes file attachments; otherwise it behaves as a plain post.

---

### Parameter Design

#### Top-level (always visible)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Credential | `mattermostApi` | ✅ | Reuses the existing Mattermost credential |
| Channel ID | `string` | ✅ | Target channel ID (direct input) |
| Message | `string` | — | Post body (optional, Markdown supported) |
| Root Post ID | `string` | — | Parent post ID for thread replies |

#### Files (fixedCollection, repeatable)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Binary Property | `string` | ✅ | Name of the n8n binary data property (e.g. `data`) |

- Up to 10 files per post (aligned with the Mattermost server-side limit)
- Files are uploaded in parallel; a single Posts API call is made after all `file_id`s are collected

#### Attachments (fixedCollection, repeatable)

Multiple attachments can be added to a single post. Each attachment has the following structure.

**Primary (always visible)**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Fallback | `string` | ✅ | Plain-text fallback for notifications and unsupported clients |
| Color | `string` | — | Left border color (`#hex` or `good` / `warning` / `danger`) |
| Text | `string` | — | Attachment body (Markdown and @mention supported) |

**Secondary (collapsed under "Attachment Options")**

| Field | Type | Description |
|-------|------|-------------|
| Pretext | `string` | Text displayed above the attachment (@mention supported) |
| Title | `string` | Title text |
| Title Link | `string` | URL for the title |
| Author Name | `string` | Author display name |
| Author Link | `string` | URL for the author name |
| Author Icon | `string` | Author icon URL (16×16px) |
| Image URL | `string` | Image displayed below the body (max 400×300px) |
| Thumb URL | `string` | Thumbnail displayed on the right side (75×75px) |
| Footer | `string` | Footer text |
| Footer Icon | `string` | Footer icon URL |

**Fields (fixedCollection, repeatable)**

Renders tabular information within the attachment.

| Field | Type | Description |
|-------|------|-------------|
| Title | `string` | Column title |
| Value | `string` | Column value (Markdown and @mention supported) |
| Short | `boolean` | If `true`, renders side-by-side with adjacent fields |

**Additional Fields (Key/Value, fixedCollection)**

An escape hatch for any fields not covered above, or fields added in future Mattermost versions.

| Field | Type | Description |
|-------|------|-------------|
| Key | `string` | Field name |
| Value | `string` | Field value (sent as a string) |

> `ts` (timestamp) is explicitly listed as unsupported in the official Mattermost documentation and is therefore not given a dedicated field. It can be passed via Additional Fields if needed.

---

## Non-functional Requirements

### Error Handling

- If file upload succeeds but the post fails, include the collected `file_id`s in the error output to enable retry or manual cleanup in downstream nodes
- Support `continueOnFail`

### AI Agent Tool Support

Set `usableAsTool: true` so the node can be invoked as a tool from an AI Agent node. (Requires `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` on the n8n instance.)

---

## Output Schema

### On success

```json
{
  "post_id": "...",
  "channel_id": "...",
  "message": "...",
  "file_ids": ["...", "..."],
  "create_at": 1234567890000
}
```

### On file upload success + post failure (continueOnFail)

```json
{
  "error": "...",
  "uploaded_file_ids": ["...", "..."]
}
```

---

## Implementation Notes

- Uses Mattermost API v4 (`/api/v4/files`, `/api/v4/posts`)
- Reuses the `mattermostApi` credential type from `n8n-nodes-base`
  - Credential fields: `baseUrl` (note lowercase `u`), `accessToken`, `allowUnauthorizedCerts`
  - No credentials source file is required in this package
  - `package.json` `n8n` section does **not** include a `credentials` entry
- No runtime dependencies (required for npm Verified status)
- Package name must begin with `@<scope>/n8n-nodes-` — `@a24k/n8n-nodes-mattermost` satisfies this requirement
- `package.json` must include the `n8n-community-node-package` keyword

### File Upload API Details

**Endpoint**: `POST /api/v4/files?channel_id=<id>`

- Multipart form field for the file binary: **`files`** (plural)
- `channel_id` is a query parameter, not a form field
- Response: `{ "file_infos": [{ "id": "<file_id>", ... }] }`
- File ID for the post is `file_infos[0].id`

### Binary Data Handling

Access n8n binary data using the framework helpers:

```typescript
// Get metadata (fileName, mimeType)
const meta = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);

// Get the raw buffer for upload
const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);

// Pass to multipart form
formData['files'] = {
  value: buffer,
  options: { filename: meta.fileName, contentType: meta.mimeType },
};
```

---

## Out of Scope (Future Consideration)

- Channel dropdown selection (two-level Team → Channel picker using `getChannelsInTeam()`)
- File upload as a standalone operation (returns `file_id` only)
- Message edit and delete
- Reaction add
- Channel management operations

---

## References

- [Mattermost API v4 – Files](https://api.mattermost.com/#tag/files)
- [Mattermost API v4 – Posts](https://api.mattermost.com/#tag/posts)
- [Mattermost Message Attachments Reference](https://developers.mattermost.com/integrate/reference/message-attachments/)
- [n8n community node technical requirements](https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/)
- [getChannelsInTeam workaround for Bot token issue](https://github.com/mattermost/mattermost/issues/14851)
- [File upload reference implementation (Gist)](https://gist.github.com/deseven/dd03b26895232465211ef09f75400d94)
