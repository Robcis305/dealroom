# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those
roles to the actual labels used in this repo's tracker (Linear, team "deal").

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), apply the
corresponding Linear label from this table. Create the label in the "deal" team if
it doesn't exist yet. (Linear's built-in **Triage** state also maps to
`needs-triage`; **Canceled** maps to `wontfix`.)

Edit the right-hand column to match whatever vocabulary you actually use.
