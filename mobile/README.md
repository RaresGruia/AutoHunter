# AutoHunter client

Expo / React Native / TypeScript client for **Vehicle Listing Search & Comparison**. The same reusable components render on web and Android. The UI is in Romanian and focuses on cars.

The default entry point is `App.tsx` → `VehicleSearchScreen`. It starts in DEMO with five existing, synthetic car examples and licensed local model-reference photos. LIVE is an explicit mode using the backend Brave integration; neither results nor favorites are mixed between modes.

From the repository root:

```sh
npm ci --prefix mobile
cp mobile/.env.example mobile/.env
npm run web --prefix mobile -- --offline
```

Start the backend separately with `npm run api`. Open http://localhost:8082. No global Expo installation is required. See the [root README](../README.md) for complete setup and API-key handling.

```sh
npm test --prefix mobile
npm run typecheck --prefix mobile
npm run export:web --prefix mobile
npm run export:android --prefix mobile
```

Exports use `dist-demo-images/` for web and `dist-android/` for Android; both are ignored by Git. The browser regression test is run from the root with `npm run test:browser` after building/exporting. It uses actual local DEMO photographs plus explicitly injected provider test data.

For a physical Android device, set `EXPO_PUBLIC_API_BASE_URL` to the PC's LAN IP, configure the backend's bind address appropriately, use the same network and restart Expo. The API credential is never a public Expo variable. Android/Hermes export has been checked; physical-device testing, production APK distribution and store publishing are not claimed.

`LegacyApp.tsx`, category modules and their tests preserve earlier work outside the primary portfolio scope. `LiveScreen.tsx` is a compatibility export; the active shared screen is named `VehicleSearchScreen.tsx`. Metro's existing shared-TypeScript resolver is preserved.
