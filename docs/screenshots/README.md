# Screenshots and image credits

The screenshots in this directory are captured from the running portfolio UI using the real local DEMO catalog, not a design mockup. DEMO listing values are synthetic. Photographs are licensed model references, not photographs of vehicles currently offered for sale.

Photo authors, original source pages, individual licenses and modification notices are in [the complete image credits](../../fixtures/images/CREDITS.md). Those photo licenses continue to apply to the photographs included in screenshots; AutoHunter does not claim ownership of them.

Regenerate the curated screenshots after building the backend and exporting the web client:

```sh
npm run test:browser -- --screenshots
```

No real Brave result content is used in these repository screenshots. The live-provider smoke test writes only local validation evidence under ignored `validation/`.

`synthetic-analysis-*.png` shows the separate saved DEMO analysis computed offline from invented fixture listings. Model-reference photographs retain their individual credits. No marketplace photograph, real listing snapshot or live result is included.
