# Draft: Channel ID for Test Run

## Motivation

Users currently work around test/production channel routing by writing an n8n expression in the Channel ID field:

```
{{ $execution.mode === "test" ? "<test_channel_id>" : "<prod_channel_id>" }}
```

This is functional but requires users to know the internal `$execution.mode` variable and complicates the Channel ID field with routing logic. An explicit Advanced Option makes the intent clearer and reduces expression boilerplate.

## Specification

### New Advanced Option

Add a new option to the existing **Advanced Options** collection, placed before **Upload Files Sequentially**.

| Option | Name | Type | Default | Description |
|--------|------|------|---------|-------------|
| Channel ID for Test Run | `testChannelId` | `string` | `""` | When set, posts are sent to this channel instead of Channel ID during test executions. Useful for routing test runs to a sandbox channel without modifying the main Channel ID. |

### Behavior

- When `testChannelId` is non-empty **and** the execution mode is `"manual"` (i.e. `this.getMode() === "manual"`), use `testChannelId` as the effective channel ID for both:
  - The file upload URL query parameter (`channel_id=<id>`)
  - The post body `channel_id` field
- In all other modes (`trigger`, `webhook`, `cli`, etc.), use the main Channel ID as before.
- When `testChannelId` is empty, behavior is identical to the current implementation regardless of mode.

**Note:** `$execution.mode` in n8n expressions maps `WorkflowExecuteMode` as follows:
- `"manual"` (editor Test Workflow button) → `$execution.mode === "test"`
- all other modes → `$execution.mode === "production"`

The node implementation uses `this.getMode() === "manual"` (the internal API value), which corresponds to `$execution.mode === "test"` in user expressions.

### Merge rules update

The existing **Extra Body Fields merge rules** table gains a note:

> `channel_id` in the post body is resolved to `testChannelId` when non-empty and execution mode is `"test"`, before the UI-always-wins rule is applied.

## Implementation Notes

- Use `this.getMode() === "manual"` (`WorkflowExecuteMode`) to detect test execution. This corresponds to `$execution.mode === "test"` in n8n expressions (n8n maps `"manual"` → `"test"` / everything else → `"production"` for the expression layer).
- No new dependencies required.
- Change is confined to `src/nodes/Mattermost/Mattermost.node.ts`.

## Test Cases

1. `testChannelId` is set, mode is `"manual"` → post sent to `testChannelId`
2. `testChannelId` is set, mode is `"trigger"` → post sent to `channelId`
3. `testChannelId` is empty, mode is `"manual"` → post sent to `channelId`
4. `testChannelId` is set, file upload URL uses `testChannelId` when mode is `"manual"`
