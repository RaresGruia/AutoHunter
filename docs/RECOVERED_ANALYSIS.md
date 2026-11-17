# Saved synthetic analysis

The original estimator, Deal Score, Flip Potential and risk code remain in `src/analysis/` and `src/services/`. The public repository excludes the old raw marketplace captures and real listing snapshots. It keeps a small, explicitly synthetic snapshot in `fixtures/synthetic-analysis-snapshot.json`, computed offline from the invented listings in `fixtures/olx-search.html` by the unchanged analysis engine. These prices and scores describe no real sale.

The separate **Analiză DEMO salvată** screen reads this fixture through `GET /api/history/cars`. The internal `HISTORICAL` mode is a saved-snapshot contract, distinct from both current DEMO search and LIVE discovery. The response includes a SHA-256 of the local fixture; the UI labels every result as synthetic. Model-reference photos come only from credited local assets. No original marketplace photo or link is included.

LIVE discovery through Brave returns indexed URLs, not verified inventory. The live analysis bridge requires confirmed current attributes, at least five retained comparables and sufficient confidence; otherwise it displays **Date insuficiente**. DEMO and saved-snapshot data never enter LIVE comparable pools.

The old snapshot, its exact historical metrics and the original Git history remain only in the private AutoHunter project. This public copy does not claim to reproduce a current real-data valuation.
