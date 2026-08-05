# External Agent Repository

Provider: **agency-agents**
Source: [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents)
Imported ref: `main`
Source commit: `c89557f78509868c6d4cc08e5cbc79bc8625fe1c`
Agents imported: **271**

This catalog is an external Agent prompt source, not a replacement for FlowState governance. Every invocation still needs a classified scenario, approved dispatch, scope, evidence, report, and planning review.

## Divisions

| Division | Agents |
|---|---:|
| `academic` | 6 |
| `design` | 10 |
| `engineering` | 58 |
| `finance` | 5 |
| `game-development` | 21 |
| `gis` | 13 |
| `healthcare` | 3 |
| `integrations` | 1 |
| `marketing` | 36 |
| `paid-media` | 7 |
| `product` | 5 |
| `project-management` | 7 |
| `sales` | 9 |
| `security` | 12 |
| `spatial-computing` | 6 |
| `specialized` | 57 |
| `support` | 6 |
| `testing` | 9 |

## Invocation

1. Search `integrations/external-agents/agency-agents/index.json` by division, name, description, and routing terms.
2. Select an Agent by scenario fit, not by name alone.
3. Include `external_agent_id` in the approved task dispatch.
4. The external adapter injects the cached prompt plus the FlowState dispatch contract into the worker session.
5. Return the result as an ordinary execution report and let the planning controller review it.

The cached prompt files retain their upstream paths, SHA, and source URL for auditability.
