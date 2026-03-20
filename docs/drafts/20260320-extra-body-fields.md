# Story: Extra Body Fields (JSON Merge)

## Overview

Add an "Advanced Options" `collection` parameter at the bottom of the node.
Inside it, add an "Extra Body Fields" `json` field that allows users to inject
arbitrary Mattermost API post body fields without needing dedicated UI elements.

---

## Motivation

The Mattermost `POST /api/v4/posts` body supports fields (e.g. `priority`,
`metadata`, custom `props` keys) that are not exposed in the current UI.
Rather than toggling between form mode and JSON mode, the user provides an
additional JSON object that is **merged** into the post body constructed from
the UI fields.

---

## UI Changes

### New parameter: Advanced Options (collection)

Added after the `Attachments` field (last position).

| Property | Value |
|----------|-------|
| Display Name | Advanced Options |
| Name | `advancedOptions` |
| Type | `collection` |
| Placeholder | Add Option |
| Default | `{}` |

### New option inside Advanced Options: Extra Body Fields

| Property | Value |
|----------|-------|
| Display Name | Extra Body Fields |
| Name | `extraBodyFields` |
| Type | `json` |
| Default | `{}` |
| Description | JSON object merged into the Mattermost post body. Use this to set API fields not available in the UI (e.g. `priority`, custom `props` keys). |

---

## Merge Behaviour

The final post body is built in two passes:

### Pass 1 — apply Extra Body Fields as base

Start with the parsed JSON object from `extraBodyFields`. Unknown/arbitrary
keys are preserved as-is and forwarded to the Mattermost API.

### Pass 2 — apply UI fields (UI wins on conflict)

Scalar UI fields overwrite the corresponding JSON keys:

| UI field | Post body key | Rule |
|----------|---------------|------|
| Channel ID | `channel_id` | UI always wins; `channel_id` in JSON is ignored |
| Message | `message` | UI wins if non-empty |
| Root Post ID | `root_id` | UI wins if non-empty |

### Array concatenation

For keys whose values are arrays, the two sources are **concatenated** rather
than one overwriting the other:

| Source | Post body key | Concatenation order |
|--------|---------------|---------------------|
| `files` UI field (binary property names) | *(n8n level, not API body)* | JSON `files` entries first, UI entries appended |
| `Attachments` fixedCollection | `props.attachments` | JSON `props.attachments` first, UI attachments appended |
| *(any)* | `file_ids` | JSON `file_ids` first, uploaded file IDs appended |

**`files` concatenation detail**: `extraBodyFields.files` may be a
comma-separated string or a JSON array of strings; both forms are accepted.
The entries are resolved as binary property names and uploaded alongside those
from the UI `files` field. The concatenated list is subject to the same 10-file
maximum as the UI field.

**`props` deep merge detail**: If `extraBodyFields` contains a `props` key, it
is deep-merged with the node's `props` object (which holds `attachments`).
Keys inside `props` that appear only in JSON are preserved; the
`attachments` sub-array follows the concatenation rule above.

---

## Validation

- `extraBodyFields` must be a valid JSON **object** (not array, string, etc.).
  If parsing fails or the value is not an object, a `NodeOperationError` is
  thrown (respecting `continueOnFail`).
- Entries in `extraBodyFields.files` that do not correspond to an existing
  binary property on the current item cause the same error as if they were
  listed in the UI `files` field.

---

## Implementation Notes

- The `Advanced Options` collection is shared with the Sequential Upload story
  (`20260320-sequential-upload.md`). Both stories must be implemented together
  (or the first one implemented creates the collection; the second extends it).
- No new runtime dependencies.
- `continueOnFail` is respected for all new error paths.

---

## Out of Scope

- Schema validation of `extraBodyFields` values (arbitrary API fields are
  forwarded as-is).
- Support for `extraBodyFields` being a JSON array or any non-object type.
