# Requirements

This document reflects the current confirmed specification.
It is updated incrementally as draft stories are completed and merged.

---

## Package

| Item | Value |
|------|-------|
| Package name | `@a24k/n8n-nodes-mattermost` |
| Display name | `Mattermost @a24k` |
| npm keyword | `n8n-community-node-package` |
| Target n8n version | 1.x and above |
| Runtime dependencies | None (required for npm Verified node eligibility) |

---

## Operation: Post Message

A single **Post Message** operation covers all cases: plain posts, file-attached posts, and rich attachment posts.

### Parameters

#### Top-level

UI order: Channel ID → Message → Root Post ID → Files → Attachments.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Credential | `mattermostApi` | ✅ | Reuses the credential type from `n8n-nodes-base` |
| Channel ID | `string` | ✅ | Target channel ID |
| Message | `string` | — | Post body (Markdown supported) |
| Root Post ID | `string` | — | Parent post ID for thread replies |
| Files | `string` | — | Comma-separated binary property names (see below) |
| Attachments | `fixedCollection` | — | Rich message attachments (see below) |

#### Files

A single `string` field. Enter binary property names separated by commas (e.g. `data, image, report`). Max 10 entries (combined with any entries from `extraBodyFields.files`).

Each name refers to an n8n binary data property on the current item. Files are uploaded via `POST /api/v4/files`; a single `POST /api/v4/posts` call is made after all `file_id`s are collected.

Upload mode is controlled by the **Advanced Options → Upload Files Sequentially** toggle:
- Default (`false`): all uploads are issued concurrently via `Promise.all` (faster, order not guaranteed).
- Sequential (`true`): files are uploaded one at a time in the listed order (UI `files` entries preceded by any `extraBodyFields.files` entries), preserving display order in Mattermost.

When the filename in the binary metadata has no extension, one is appended based on the MIME type (`image/jpeg→jpg`, `image/svg+xml→svg`, `text/plain→txt`; other types use the MIME subtype). `application/octet-stream` is left unchanged.

#### Attachments

`fixedCollection` with `multipleValues: true`. Each attachment:

**Primary (always visible)**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Fallback | `string` | ✅ | Plain-text fallback for notifications and unsupported clients |
| Color | `string` | — | Left border color (`#hex` or `good` / `warning` / `danger`). Labeled *(optional)* in UI. |
| Text | `string` | — | Attachment body (Markdown and @mention supported). Labeled *(optional)* in UI. |

**Attachment Options (collapsed `collection`)**

| Field | API key | Description |
|-------|---------|-------------|
| Pretext | `pretext` | Text above the attachment (@mention supported) |
| Title | `title` | Title text |
| Title Link | `title_link` | URL for the title |
| Author Name | `author_name` | Author display name |
| Author Link | `author_link` | URL for the author name |
| Author Icon | `author_icon` | Author icon URL (16×16px) |
| Image URL | `image_url` | Image below the body (max 400×300px) |
| Thumb URL | `thumb_url` | Thumbnail on the right (75×75px) |
| Footer | `footer` | Footer text |
| Footer Icon | `footer_icon` | Footer icon URL |

**Fields (nested `fixedCollection`, `multipleValues: true`)**

| Field | Type | Description |
|-------|------|-------------|
| Title | `string` | Column title |
| Value | `string` | Column value (Markdown and @mention supported) |
| Short | `boolean` | If `true`, renders side-by-side with adjacent fields |

#### Advanced Options (collection)

Added after `Attachments`.

| Option | Name | Type | Default | Description |
|--------|------|------|---------|-------------|
| Extra Body Fields | `extraBodyFields` | `json` | `{}` | JSON object merged into the Mattermost post body. Use to set API fields not exposed in the UI (e.g. `priority`, custom `props` keys). |
| Upload Files Sequentially | `uploadFilesSequentially` | `boolean` | `false` | When enabled, files are uploaded one at a time in the listed order. Use to control display order. Parallel upload (default) is faster but does not guarantee order. |

**Extra Body Fields merge rules:**

The final post body is built in two passes.

*Pass 1 — Extra Body Fields as base:* Start with the parsed JSON object; arbitrary keys are forwarded to the API as-is.

*Pass 2 — UI fields win on conflict:*

| UI field | Post body key | Rule |
|----------|---------------|------|
| Channel ID | `channel_id` | UI always wins |
| Message | `message` | UI wins if non-empty |
| Root Post ID | `root_id` | UI wins if non-empty |

*Array concatenation:*

| Source | Post body key | Order |
|--------|---------------|-------|
| `extraBodyFields.files` (string or array) | *(resolved as binary prop names)* | JSON entries first, UI entries appended |
| `extraBodyFields.file_ids` | `file_ids` | JSON IDs first, uploaded IDs appended |
| `extraBodyFields.props.attachments` + UI Attachments | `props.attachments` | JSON entries first, UI entries appended |

Other keys inside `extraBodyFields.props` are deep-merged; keys unique to JSON are preserved.

`extraBodyFields` must be a valid JSON **object**. If it is not an object (e.g. an array or primitive), a `NodeOperationError` is thrown (respecting `continueOnFail`).

---

## Output Schema

### Success

```json
{
  "post_id": "...",
  "channel_id": "...",
  "message": "...",
  "file_ids": ["..."],
  "create_at": 1234567890000
}
```

### File upload succeeded, post failed (`continueOnFail`)

```json
{
  "error": "...",
  "uploaded_file_ids": ["..."]
}
```

Mattermost does not provide a public API to delete orphaned files. `uploaded_file_ids` is surfaced so downstream nodes or operators can handle cleanup.

This output also applies when a mid-sequence upload failure occurs in sequential mode. `uploaded_file_ids` contains the IDs of files that were successfully uploaded before the failure.

---

## Non-functional Requirements

- `continueOnFail()` is respected for all errors
- `usableAsTool: true` is set for AI Agent node support (requires `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` on the n8n instance)
- Credential: reuses `mattermostApi` from `n8n-nodes-base`; no `credentials` entry in `package.json`

---

## API Details

| Operation | Endpoint |
|-----------|----------|
| File upload | `POST /api/v4/files?channel_id=<id>` |
| Create post | `POST /api/v4/posts` |

File upload uses `multipart/form-data` with field name **`files`** (plural). `channel_id` is a query parameter. Response: `{ file_infos: [{ id: "..." }] }`.

---

## Out of Scope (Future Consideration)

- Channel dropdown selection (Team → Channel picker)
- File upload as a standalone operation
- Additional Fields escape hatch (arbitrary key/value props)
- Message edit and delete
- Reaction add
- Channel management operations
