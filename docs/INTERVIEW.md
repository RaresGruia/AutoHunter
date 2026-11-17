# Interview notes

These are explanations of the implemented project, not claims about production scale or work done without assistance. Be ready to open the relevant code and explain it in your own words.

## A short project introduction

> AutoHunter is a TypeScript vehicle listing search and comparison portfolio application. A Fastify backend integrates Brave Search, normalizes and deduplicates discovery links, and exposes a typed API to an Expo web/Android client. The interface supports filtering, local favorites and listing details. A separate, clearly marked DEMO catalog demonstrates licensed photo galleries without API credentials.

## Topics to explain

| Topic                   | A concrete example                                                                         | Trade-off to discuss                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| API integration         | Fixed official Brave endpoint, server-only key, timeout and HTTP error mapping             | Search indexing is not a current inventory feed.                                              |
| Dependency injection    | LiveService accepts a mock adapter, clock and file stores in tests                         | A passing mock test does not demonstrate real provider access.                                |
| TypeScript              | Separate DEMO/LIVE response contracts; nullable unknown fields                             | Types do not validate untrusted JSON, so response and input checks are still needed.          |
| Normalization           | Locale-aware indexed price/mileage parsing with evidence                                   | An indexed value can be old; it must not become a confirmed attribute.                        |
| Deduplication           | Canonical URLs remove tracking parameters and fragments                                    | Equal model/price does not identify the same car; avoid false merges.                         |
| Caching and rate limits | Five-minute bounded memory cache; Retry-After handling                                     | Cache loss on restart is acceptable for a small local project; it is not horizontally shared. |
| State separation        | DEMO starts with five synthetic examples; LIVE has its own response and favorites          | Never fill a failed LIVE search with sample records.                                          |
| Availability            | Expired reports are persisted and reapplied to cache hits; undo returns to unverified      | HTTP 200 and a search hit do not prove an active sale.                                        |
| Responsive UI           | Shared components, measured grid and mobile filter sheet                                   | Android bundle verification differs from testing a physical phone.                            |
| Testing                 | Pure functions, Fastify injection, browser checks and an explicit real-provider smoke test | Tests must check useful behavior, not just reproduce implementation details.                  |

## A useful demonstration order

1. Start in DEMO: show five cars and explain the synthetic-data badge and photo attribution.
2. Filter by price or model, change the sort order and save a favorite.
3. Open the Duster or Focus details and change gallery thumbnails.
4. Reload and show that DEMO favorites persist.
5. Switch to LIVE and search using a configured Brave key. Explain the unverified status, original link and unknown fields.
6. Explain why there are no copied marketplace photos or arbitrary scores.
7. Open the canonical URL helper and one integration test; run the validation commands.

Without an API key, demonstrate the configuration/empty state honestly and use the offline DEMO. Never describe mocked results as current live offers.

## CV wording

- Built a TypeScript/Fastify backend and Expo/React Native client for vehicle listing discovery using Brave Search API, with URL normalization, deduplication, local filtering and persistent bookmarks.
- Added automated backend, client and browser checks covering data provenance, DEMO/LIVE separation, image fallbacks, API failures and responsive layouts.

Only claim the work you understand and can explain. It is reasonable to describe using AI development assistance and the checks you performed to review the resulting code. Do not claim a full Romanian marketplace aggregator, verified live inventory, original live photographs, production Android deployment or resale predictions.
