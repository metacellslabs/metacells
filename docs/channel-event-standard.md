# Channel Event Standard

This document defines the unified event/message object for all MetaCells channels.

## Canonical Shape

Every normalized channel event should be readable as:

```json
{
  "eventId": "mongo-event-id",
  "event": "message.new",
  "channel": {
    "channelId": "configured-channel-id",
    "label": "sf",
    "connectorId": "gmail",
    "subchannel": "INBOX"
  },
  "message": {
    "messageId": "remote-message-id-or-uid",
    "threadId": "remote-thread-or-conversation-id",
    "subject": "Invoice reminder",
    "summary": "Payment request from vendor",
    "text": "Full normalized text content...",
    "from": ["billing@example.com"],
    "to": ["me@example.com"],
    "date": "2026-03-13T10:00:00.000Z",
    "nativeUrl": "https://mail.google.com/...",
    "viewUrl": "/channel-events/<eventId>"
  },
  "data": {
    "channelSpecific": "payload"
  },
  "attachments": [
    {
      "id": "attachment-id",
      "name": "invoice.pdf",
      "type": "application/pdf",
      "size": 120392,
      "disposition": "attachment",
      "error": "",
      "binaryArtifactId": "artifact-binary-id",
      "contentArtifactId": "artifact-text-id",
      "downloadUrl": "/channel-events/<eventId>/attachments/<attachmentId>",
      "previewUrl": "/channel-events/<eventId>/attachments/<attachmentId>"
    }
  ]
}
```

## Field Semantics

### `event`

Normalized event kind produced by the connector.

Examples:

- `message.new`
- `repository.event`
- `file.new`
- `story.new`

### `channel`

Channel-level routing metadata.

- `channelId`
  MetaCells configured channel id.
- `label`
  User-facing `/label` used in formulas.
- `connectorId`
  Connector type such as `gmail`, `github`, `google-drive`.
- `subchannel`
  Channel-specific subdivision such as mailbox, chat, folder, feed, repo, or page.

### `message`

Unified message/content envelope.

- `messageId`
  Best available remote message identifier.
- `threadId`
  Best available remote thread / conversation identifier.
- `subject`
  Subject/title/headline if the source has one.
- `summary`
  Short connector-provided or derived summary.
- `text`
  Main normalized text body.
- `from`
  Sender/author list.
- `to`
  Recipient/target list.
- `date`
  ISO date/time string when available.
- `nativeUrl`
  Best remote URL to open the message/item in the native browser or client web UI.
- `viewUrl`
  MetaCells-local URL for the stored event record.

## Channel-Specific Attributes

Channel-specific payload belongs under `data`.

Examples:

- Gmail / IMAP:
  mailbox flags, provider ids
- GitHub:
  event payload, action, repository metadata
- Google Drive:
  file ids, mime types, web links, owners
- Hacker News:
  score, descendants, story url

The rule is:

- use the unified fields for cross-channel logic
- keep connector-native details in `data`

## Attachments Format

Attachments use a normalized descriptor:

- `id`
- `name`
- `type`
- `size`
- `disposition`
- `error`
- `binaryArtifactId`
- `contentArtifactId`
- `downloadUrl`
- `previewUrl`

## Attachment Helpers

Implemented in [events.js](/Users/zentelechia/playground/thinker/imports/api/channels/events.js#L1):

- `buildChannelAttachmentPath(eventId, attachmentId)`
  Creates the download route for one stored attachment.
- `buildChannelAttachmentDescriptor(eventId, attachment, index)`
  Produces the normalized attachment object.
- `buildUnifiedChannelEvent(eventPayload, options)`
  Produces the canonical event shape.
- `buildChannelNativeMessageLink(eventPayload)`
  Resolves the best browser/native client URL from known payload fields.
- `buildChannelEventViewPath(eventId)`
  Builds the MetaCells-local event view path.

Server route:

- [events-server.js](/Users/zentelechia/playground/thinker/imports/api/channels/events-server.js#L1)
  serves `GET /channel-events/<eventId>/attachments/<attachmentId>`

## Access Pattern In Runtime

The active channel payload map now exposes both:

- legacy root fields for backward compatibility
- unified fields:
  - `channel`
  - `message`
  - `data`
  - normalized `attachments`
  - convenience aliases:
    - `nativeUrl`
    - `viewUrl`
    - `messageId`
    - `threadId`
    - `subchannel`

This is assembled in [runtime-state.js](/Users/zentelechia/playground/thinker/imports/api/channels/runtime-state.js#L1).
