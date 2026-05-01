# Draft: Thread Map

**Story:** Automatically thread posts by a logical key using Mattermost Preferences API as backing store.

---

## Motivation

Currently, threading posts with a logical key requires a 3-node workflow:
1. Read from Data Tables (look up key → Root Post ID)
2. Mattermost Post (with Root Post ID if found)
3. Write to Data Tables (save new mapping if first post)

This story collapses that into a single node by persisting the mapping in the Mattermost Preferences API, scoped to the bot user's account.

---

## New Parameter: Thread Group Key

Added to **Advanced Options** (alongside Extra Body Fields, Channel ID for Test Run, Upload Files Sequentially).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Thread Group Key | `string` | — | Logical identifier for a thread group. Posts with the same Thread Group Key and Channel ID are automatically linked as a Mattermost thread. Ignored if Root Post ID is also set. |

**UI order (Advanced Options):** Extra Body Fields → Channel ID for Test Run → Upload Files Sequentially → Thread Group Key

---

## Behavior

### When Thread Group Key is empty

No change to existing behavior.

### When both Thread Group Key and Root Post ID are set

Root Post ID takes precedence. Thread Group Key is silently ignored.

### When Thread Group Key is set and Root Post ID is empty

Execution flow:

1. Compute `name`:
   ```
   input = "${effectiveChannelId}:${threadGroupKey}"
   name  = SHA-256(input) → base64url → first 32 characters
   ```

2. Look up existing mapping:
   ```
   GET /api/v4/users/me/preferences/n8n_nodes_mattermost_threadmap/${name}
   ```
   - **200**: Use `preference.value` as `root_id` → post as thread reply
   - **404**: No mapping exists → post as new root post

3. Create post (`POST /api/v4/posts`) with or without `root_id`.

4. If a new root post was created (step 2 returned 404):
   ```
   PUT /api/v4/users/me/preferences
   Body: [{ user_id: "me", category: "n8n_nodes_mattermost_threadmap", name: "${name}", value: "${post_id}" }]
   ```

---

## Preferences Storage Design

| Field | Value |
|-------|-------|
| Category | `n8n_nodes_mattermost_threadmap` (30 chars, within 32-char limit) |
| Name | SHA-256(`"${channelId}:${threadGroupKey}"`) → base64url → first 32 chars (192 bits) |
| Value | Mattermost Post ID (26 chars, within 2000-char limit) |

**Rationale:**
- Category uniquely identifies this node package and its purpose.
- Name uses SHA-256 (not MD5, which is deprecated) with base64url encoding for maximum bit density within the 32-character column limit (enforced by `Preference.IsValid()` in the Mattermost server).
- The channel ID is included in the hash input so that the same logical key in different channels maps to independent threads.
- `effectiveChannelId` (post-testChannelId substitution) is used as the hash input so that test-mode executions produce separate threads in the sandbox channel.
- Preferences are scoped to the bot user's account and are not visible in the Mattermost UI for custom categories.

---

## Output Schema

### Thread Group Key not used

No change.

### Thread Group Key used — new root post created

```json
{
  "post_id": "...",
  "channel_id": "...",
  "message": "...",
  "file_ids": [],
  "create_at": 1234567890000,
  "thread_group_key": "my-incident-123",
  "thread_root_post_id": null
}
```

### Thread Group Key used — reply to existing thread

```json
{
  "post_id": "...",
  "channel_id": "...",
  "message": "...",
  "file_ids": [],
  "create_at": 1234567890000,
  "thread_group_key": "my-incident-123",
  "thread_root_post_id": "..."
}
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Preferences GET returns non-404 error | Throw (respects `continueOnFail`) |
| Post creation fails | Existing behavior (no preference is written) |
| Preference PUT fails after successful post | Silently ignored. Post output is returned normally with `thread_root_post_id: null`. Next invocation with the same key will create a new thread. |
| Root Post ID in preference points to a deleted post | Mattermost API returns error on post creation; preference is not cleaned up automatically |

---

## API Details (additions)

| Operation | Endpoint |
|-----------|----------|
| Look up thread mapping | `GET /api/v4/users/me/preferences/n8n_nodes_mattermost_threadmap/{name}` |
| Store thread mapping | `PUT /api/v4/users/me/preferences` |

---

## Out of Scope

- Deleting or resetting a thread mapping (manual cleanup via Mattermost API)
- Handling the case where the root post has been deleted (stale preference)
- Cross-channel thread reuse
