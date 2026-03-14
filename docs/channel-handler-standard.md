# Channel Handler Standard

This document captures the cross-channel abstraction used by MetaCells channel handlers.

## Unified Abstract Channel

Every channel can be described with the same high-level contract:

- `testConnection({ channel, settings })`
  Verifies credentials and remote access.
- `send({ channel, settings, payload })`
  Performs outbound actions such as post, message send, upload, push, or command execution.
- `poll({ channel, settings })`
  Pulls fresh remote events for receive-capable channels.
- `normalizeEvent({ channel, eventType, payload })`
  Converts native platform events into the common MetaCells event shape used by mentioning/runtime logic.
- `search({ channel, settings, query, options })`
  Returns standardized search results.

## Unified Capability Model

Every channel is described across the same feature set:

- `test`
- `send`
- `receive`
- `poll`
- `normalizeEvent`
- `search`
- `attachments`
- `oauth`
- `actions`
- `entities`

## Standard Search Result

All channel search implementations should return:

```json
{
  "ok": true,
  "query": "invoice",
  "source": "remote|channel_events|none",
  "total": 2,
  "items": [
    {
      "id": "evt-1",
      "title": "Invoice reminder",
      "summary": "Payment due this week",
      "url": "https://example.test/item/1",
      "createdAt": "2026-03-13T10:00:00.000Z",
      "connectorId": "gmail",
      "label": "mail",
      "event": "message.new",
      "raw": {
        "subject": "Invoice reminder",
        "text": "Please pay...",
        "data": {}
      }
    }
  ]
}
```

## Popular Methods By Channel

### IMAP Email

Popular methods / operations:

- IMAP `LIST`
- IMAP `SEARCH`
- IMAP `FETCH`
- SMTP `SEND`
- message attachment fetch / parse

MetaCells mapping:

- `testConnection`
- `send`
- `poll`
- `normalizeEvent`
- `search`

### Gmail

Official references:

- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/list

Popular methods:

- `users.messages.list`
- `users.messages.get`
- `users.messages.send`
- `users.threads.list`

### Telegram

Official reference:

- https://core.telegram.org/bots/api

Popular methods:

- `getMe`
- `sendMessage`
- `sendPhoto`
- `sendDocument`
- `getUpdates`

### X / Twitter

Official references:

- https://developer.x.com/en/docs/x-api/tweets/manage-tweets/introduction
- https://developer.x.com/en/docs/x-api/tweets/search/introduction

Popular methods:

- `POST /2/tweets`
- `GET /2/tweets/search/recent`
- `GET /2/users/me`

### LinkedIn

Official reference:

- https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin

Popular methods:

- `ugcPosts`
- `posts`
- `userinfo`

### Reddit

Official reference:

- https://developers.reddit.com/docs/api/

Popular methods:

- `api/v1/me`
- `api/submit`
- listing endpoints such as `new`
- search/listing retrieval

### WhatsApp Web (Baileys)

Primary library reference:

- https://baileys.wiki/

Popular methods:

- `connect`
- `requestPairingCode`
- `sendMessage`
- `loadMessages`

### GitHub

Official references:

- https://docs.github.com/en/rest/activity/events
- https://docs.github.com/en/rest/search

Popular methods:

- `GET /repos/{owner}/{repo}/events`
- `GET /search/issues`
- `GET /search/repositories`
- local `git pull`
- local `git push`

### Facebook

Official reference:

- https://developers.facebook.com/docs/pages-api/posts

Popular methods:

- `GET /{page-id}`
- `POST /{page-id}/feed`

### Instagram

Official reference:

- https://developers.facebook.com/docs/instagram-platform/content-publishing

Popular methods:

- `GET /{ig-user-id}`
- `POST /{ig-user-id}/media`
- `POST /{ig-user-id}/media_publish`

### Hacker News

Official reference:

- https://github.com/HackerNews/API

Popular methods:

- `maxitem`
- `newstories`
- `topstories`
- `item/{id}`

### Shell

Local capability rather than remote API:

- execute command
- capture stdout
- capture stderr
- set working directory

### Google Drive

Official references:

- https://developers.google.com/drive/api/reference/rest/v3/files/list
- https://developers.google.com/drive/api/reference/rest/v3/changes/list

Popular methods:

- `files.list`
- `files.create`
- `changes.list`
- `files.get`

## Capability Families Shared Across Channels

The common abstractions across all current channels are:

- identity / auth validation
- outbound publish or send action
- remote event intake or polling
- event normalization
- search or query
- attachment or binary payload handling
- pagination / lookback
- structured result summaries

These are the primitives now encoded by `defineChannelHandler(...)` in the server runtime.
