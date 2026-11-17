# AutoHunter HTTP API

`GET /api/history/cars` (DEMO configuration) returns a saved synthetic analysis snapshot under the legacy `HISTORICAL` response contract. The values were calculated offline from invented fixture listings using the original engine. It neither fetches publisher data nor supplies LIVE comparables. See [recovered analysis](docs/RECOVERED_ANALYSIS.md).

Local single-user development API. The portfolio UI uses only the routes below. Responses contain no API credential.

| Route                                | Purpose                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `GET /health`                        | Server identity and legacy runtime mode; does not call a listing provider              |
| `GET /api/demo/cars`                 | Five explicitly tagged DEMO car samples; available with `AUTOHUNTER_MODE=demo`         |
| `GET /demo-images/cars/:id/:file`    | Local licensed DEMO asset, constrained to its listing directory                        |
| `GET /api/live/status`               | Whether Brave is configured; no key value is returned                                  |
| `POST /api/live/search`              | Real Brave discovery, normalization, URL deduplication, cache and availability reports |
| `POST /api/live/availability-report` | Persist or undo a local unavailable/expired report                                     |

Search body:

```json
{ "category": "cars", "query": "Dacia Duster" }
```

A LIVE response has `meta.mode: "LIVE"`. A DEMO response has `meta.mode: "DEMO"` and rows with `origin: "DEMO"`. The client rejects either response in the wrong mode. LIVE search errors never substitute sample data.

Brave rows start with `availability: "UNVERIFIED"`, `lastVerifiedAt: null`, no confirmed price or photographs and no Deal Score. Conservative `indexFacts` may provide display-only values with evidence. Their presence does not confirm availability or current price.

Availability report body:

```json
{
  "originalUrl": "https://example.org/an-original-listing",
  "status": "UNAVAILABLE",
  "note": "User checked the original page"
}
```

This is an illustrative request shape, not a real vehicle offer. Status accepts `UNAVAILABLE`, `EXPIRED` or `UNVERIFIED` to undo a report. It cannot set `ACTIVE_VERIFIED`. Reports are separate user evidence, saved under ignored `data/imports/`. The default search excludes unavailable records; the retained backend can include them for inspection with `includeUnavailable: true`.

The official Brave request has a 12-second timeout and no automatic retries. Provider authentication, rate-limit and transport failures are returned as explicit metadata/error states. The UI maps these to concise messages and allows a manual retry. Input validation rejects malformed categories, empty/oversized queries and unsafe original URLs. Browser calls to LIVE endpoints are restricted to the configured local development origins; CORS is for development, not a production authentication system.

Earlier category job, normalized-source and manual-import APIs remain for existing regression coverage. They are not advertised as finished marketplace integrations and have no technical forms in the portfolio UI. Legacy direct OLX collection is disabled in the default server and CLI entry points.

See [architecture](docs/ARCHITECTURE.md) for contracts, cache limits, image rights and the distinction between discovery and confirmed data.
