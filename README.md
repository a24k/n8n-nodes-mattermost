# @a24k/n8n-nodes-mattermost

An [n8n](https://n8n.io/) community node for [Mattermost](https://mattermost.com/) that extends the built-in Mattermost node with support for **file attachments** and **rich message attachments** (Slack-compatible).

## What's different from the built-in node

The built-in Mattermost node already supports plain posts, thread replies, and rich message attachments. The one gap this node fills is **file upload**.

| Feature | Built-in `n8n-nodes-base` | This node |
|---------|--------------------------|-----------|
| Plain posts | ✅ | ✅ |
| Thread replies | ✅ | ✅ |
| Rich attachments (props) | ✅ | ✅ |
| File attachments | ❌ | ✅ Up to 10 files, uploaded in parallel |
| AI Agent tool | ❌ | ✅ |

## Installation

In your n8n instance:

1. Go to **Settings → Community Nodes**
2. Click **Install**
3. Enter `@a24k/n8n-nodes-mattermost`
4. Click **Install**

The node appears as **Mattermost @a24k** in the node palette.

> Requires n8n 1.x or later.
> To use as an AI Agent tool, set `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` on your n8n instance.

## Credentials

This node reuses the built-in **Mattermost API** credential type (`mattermostApi`). No additional credential setup is required.

1. In n8n, go to **Credentials → Add Credential → Mattermost API**
2. Fill in:
   - **Base URL** — your Mattermost server URL (e.g. `https://mattermost.example.com`)
   - **Access Token** — a [personal access token](https://developers.mattermost.com/integrate/reference/personal-access-token/) or bot token
   - **Allow Unauthorized Certs** — enable only if your server uses a self-signed certificate

## Operation: Post Message

A single operation covers plain posts, file-attached posts, and rich attachment posts.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Channel ID | ✅ | Target channel ID (find it in **Channel Info** in the Mattermost UI) |
| Message | — | Post body. Markdown supported. |
| Root Post ID | — | Parent post ID for thread replies |
| Files | — | Comma-separated binary property names (see [File attachments](#file-attachments)) |
| Attachments | — | One or more rich attachments (see [Rich attachments](#rich-attachments)) |

### File attachments

Enter binary property names separated by commas in the **Files** field (e.g. `data, image, report`). Each name must match a binary property on the current n8n item. Up to 10 files are supported and uploaded in parallel before the post is created.

**Example workflow:**

```
HTTP Request (download file) → Mattermost @a24k (post with attachment)
```

In the Mattermost node, set **Files** to `data` (the default binary property name from HTTP Request).

To attach multiple files from a single item, set **Files** to e.g. `data, screenshot, log`.

**Filename handling:** if the binary data has no file extension, one is inferred from the MIME type (`image/jpeg` → `.jpg`, `image/svg+xml` → `.svg`, `text/plain` → `.txt`; other types use the MIME subtype as-is). `application/octet-stream` is left unchanged.

### Rich attachments

Click **Add Attachment** to add one or more [Slack-compatible message attachments](https://developers.mattermost.com/integrate/reference/message-attachments/).

**Required field:**

| Field | Description |
|-------|-------------|
| Fallback | Plain-text summary shown in notifications and clients that don't support rich formatting |

**Optional fields:**

| Field | Description |
|-------|-------------|
| Color | Left border color — `#rrggbb` hex, or keywords `good` (green), `warning` (yellow), `danger` (red) |
| Text | Attachment body. Markdown and @mentions supported. |

**Attachment Options** (expand to reveal):

| Field | Description |
|-------|-------------|
| Pretext | Text displayed above the attachment. @mentions supported. |
| Title | Title text |
| Title Link | URL the title links to |
| Author Name | Author display name |
| Author Link | URL the author name links to |
| Author Icon | Author icon image URL (16×16 px) |
| Image URL | Image displayed below the body (max 400×300 px) |
| Thumb URL | Thumbnail image on the right (75×75 px) |
| Footer | Footer text |
| Footer Icon | Footer icon image URL |

**Fields** (table-style columns within an attachment):

| Field | Description |
|-------|-------------|
| Title | Column header |
| Value | Column content. Markdown and @mentions supported. |
| Short | If enabled, renders side-by-side with the adjacent field |

### Output

On success:

```json
{
  "post_id": "abc123",
  "channel_id": "xyz456",
  "message": "Hello!",
  "file_ids": ["fid1", "fid2"],
  "create_at": 1234567890000
}
```

### Error handling

The node respects n8n's **Continue on Fail** setting.

If files were uploaded successfully but the post creation fails, the error output includes `uploaded_file_ids` so downstream nodes can handle orphaned files:

```json
{
  "error": "...",
  "uploaded_file_ids": ["fid1", "fid2"]
}
```

> Mattermost does not provide a public API to delete orphaned files, so cleanup must be handled at the infrastructure level.

## License

[MIT](LICENSE)
