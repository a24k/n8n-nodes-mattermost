# Story: Sequential File Upload

## Overview

Add an "Upload Files Sequentially" boolean option inside the "Advanced Options"
`collection` parameter. When enabled, files are uploaded one at a time in the
order they are listed, rather than in parallel.

---

## Motivation

Mattermost displays uploaded files in the order they were registered with the
server. Parallel uploads (`Promise.all`) do not guarantee registration order,
so the display order of attachments in the post may differ from the order
specified in the `files` field. Sequential upload gives users explicit control
over file display order.

---

## UI Changes

### Advanced Options collection (shared with Extra Body Fields story)

See `20260320-extra-body-fields.md` for the collection definition.
This story adds one option inside it:

### New option: Upload Files Sequentially

| Property | Value |
|----------|-------|
| Display Name | Upload Files Sequentially |
| Name | `uploadFilesSequentially` |
| Type | `boolean` |
| Default | `false` |
| Description | When enabled, files are uploaded one at a time in the listed order. Use this to control the display order of files in the Mattermost post. Parallel upload (default) is faster but does not guarantee order. |

---

## Behaviour

### Default (`false`) — parallel upload

Current behaviour: all file uploads are issued concurrently via `Promise.all`.
No change.

### Sequential mode (`true`)

Files are uploaded one at a time using a `for...of` loop in the order they
appear in the resolved `files` list (UI `files` entries first, then
`extraBodyFields.files` entries, matching the concatenation order defined in
the Extra Body Fields story).

The collected `file_ids` are passed to the post body in the same order,
preserving display order in Mattermost.

---

## Error Handling

If an upload fails mid-sequence:

- `uploaded_file_ids` contains the IDs of files that were successfully uploaded
  before the failure (same field as the existing parallel-upload error path).
- `continueOnFail` behaviour is unchanged.

This is consistent with the existing error contract so downstream cleanup nodes
work the same regardless of upload mode.

---

## Implementation Notes

- The `Advanced Options` collection is shared with the Extra Body Fields story
  (`20260320-extra-body-fields.md`). Both must be implemented together or
  sequentially (the first story creates the collection; the second extends it).
- No new runtime dependencies.
- The sequential loop must `await` each upload before starting the next.
