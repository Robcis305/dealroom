# Issue tracker: Linear (+ Slack)

Issues and PRDs for this repo live in **Linear**, in the **"deal"** team/project.
Issues are referenced by their Linear identifier, e.g. `DEAL-42`, and by URL.
**Slack** (`#p-cis-deal-room`) is an alternate intake surface — quick requests
land there and get promoted into Linear.

## Access

There is no Linear CLI. Use, in order of preference:

1. **Linear MCP server** — if a `mcp__*linear*` tool is connected, use it for all
   create/read/update/label operations. (Not connected as of this writing —
   connect the Linear MCP, or fill in the API approach below.)
2. **Linear API** — `POST https://api.linear.app/graphql` with an API key in the
   `Authorization` header. _(Store the key outside the repo; reference it here.)_
3. **Slack** — when Linear is unavailable or the request is informal, post to
   `#p-cis-deal-room` using the Slack MCP tools.

## Conventions

- **Create an issue**: create a Linear issue in the **deal** team. Title = concise
  summary; description = full body (markdown). Apply triage labels per
  `triage-labels.md`.
- **Read an issue**: fetch by identifier (`DEAL-NN`) or URL, including comments.
- **List issues**: query the **deal** team, filtered by state/label.
- **Comment**: add a comment to the issue.
- **Apply / remove labels**: use Linear labels matching the triage vocabulary.
- **Close**: move the issue to a terminal state (Done / Canceled).

## Slack intake

When a skill says "publish to the issue tracker" and Linear isn't reachable, post
the issue to `#p-cis-deal-room` via the Slack MCP, clearly formatted (title +
body + proposed triage label), so it can be promoted into Linear later.

## When a skill says "publish to the issue tracker"

Create a Linear issue in the **deal** team (or post to `#p-cis-deal-room` as
fallback).

## When a skill says "fetch the relevant ticket"

Fetch the Linear issue by its `DEAL-NN` identifier or URL.
