# Public data provenance

This repository was built as a separate clean-history copy. The original private AutoHunter project and its Git history were not changed. The public tree excludes saved OLX HTML pages, real listing snapshots, historical real-offer validation reports, imported user data, environment files, caches and generated execution logs. No old commit is part of this repository.

## Included examples

- `fixtures/olx-search.html` and `fixtures/details/` are invented parser fixtures. Their listing URLs use `example.invalid`; no publisher page is bundled.
- `fixtures/tractors.json` and `fixtures/tools.json` are explicitly synthetic.
- `fixtures/synthetic-analysis-snapshot.json` was calculated offline by the original engine from the invented car fixtures. Its `mode: DEMO` and `synthetic: true` flags distinguish it from a real listing response. The legacy `source: OLX` field describes the parser contract used by older tests, not the origin of a real offer.
- `fixtures/images/` contains local model-reference photographs from Wikimedia Commons. See `fixtures/images/CREDITS.md`, `SOURCES.json` and each `rights.json` for the author, source, license and attribution. These photos are not of the advertised DEMO vehicles. Their individual licenses also apply to screenshots showing them.
- `mobile/assets/demo/` contains old generated category illustrations that are no longer displayed. Their origin is documented in that folder.

LIVE search is separate: Brave can discover links but does not confirm the seller's stock, grant image republication rights or supply enough verified comparable data for a valuation. The old OLX parser remains in the source tree for offline fixture tests; unauthorized live collection is not enabled by the application.
