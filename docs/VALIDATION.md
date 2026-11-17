# Local verification — public copy

This report describes the **separate public-copy working tree**. It is not a deployment or a remote GitHub Actions run. Tests use synthetic fixtures and injected provider responses; they do not confirm live marketplace inventory.

| Check | Result |
| --- | --- |
| Backend/API tests | 269 passed |
| Mobile/shared tests | 94 passed |
| Backend build and both TypeScript checks | Passed |
| Expo Web export | Passed |
| Android/Hermes export | Passed; no physical device or APK test |
| Offline browser regression | Passed at 1440, 1920, 390 and 320 px |

The browser test verified DEMO images and gallery, the saved **synthetic** analysis (Duster: 9,500 EUR example price, 11,500 EUR fixture median, Deal 40, Flip 54, risk 28), filtering, favorites, result deduplication, unavailable-result exclusion and no horizontal overflow. It made zero backend calls to external providers. Screenshots in `docs/screenshots/` were captured from that local test.

`npm run validate -- --core` runs tests, the backend build and TypeScript checks. `npm run web:export` builds the Expo Web client. `npm run test:browser -- --screenshots` runs the offline browser test and refreshes screenshots. Android/Hermes bundling passed with `npm run export:android --prefix mobile`. A physical-device run and production APK were **not** part of this verification.

The LIVE Brave adapter is real code, but no paid Brave query or current-offer verification was run for this public-copy audit. A URL discovered by Brave remains unverified; no real listing price, photograph or Deal Score is inferred from a search snippet.
