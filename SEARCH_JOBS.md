# Căutări recuperabile — search jobs

Motorul OLX și CLI-ul sunt păstrate. Doar API-ul și modul în care mobile urmărește căutarea au fost schimbate. O căutare aparține acum procesului backend, nu conexiunii HTTP a telefonului.

## Protocol

POST `/api/cars/search` validează aceleași setări ca înainte și returnează rapid HTTP 202:

```json
{ "searchId": "UUID", "status": "RUNNING", "startedAt": "2026-09-09T15:00:00.000Z" }
```

GET `/api/cars/search/:searchId` returnează una dintre formele:

```json
{ "searchId": "UUID", "status": "RUNNING", "startedAt": "..." }
```

```json
{
  "searchId": "UUID",
  "status": "COMPLETED",
  "startedAt": "...",
  "completedAt": "...",
  "response": { "meta": {}, "results": [], "needsManualVerification": [], "excludedAfterVerification": [] }
}
```

```json
{
  "searchId": "UUID",
  "status": "FAILED",
  "startedAt": "...",
  "completedAt": "...",
  "error": { "code": "SOURCE_UNAVAILABLE", "message": "Source could not be accessed." }
}
```

Obiectul `response` are exact contractul rezultatelor anterior. FAILED este un job terminal returnat cu HTTP 200, distinct de o eroare HTTP de acces. Un ID necunoscut produce 404 `SEARCH_NOT_FOUND`.

GET `/api/cars/search/current` returnează jobul RUNNING, altfel ultimul COMPLETED/FAILED, altfel JSON `null`. Rutele de status au `Cache-Control: no-store`. Un POST valid concurent primește 409 cu `error.code=SEARCH_IN_PROGRESS` și `searchId` existent, fără a porni alt motor.

## Memorie și retenție

`src/api/searchJobs.ts` păstrează maximum un job activ plus ultimul job terminal. Jobul intern include id, status, startedAt, completedAt, request, result și error. Cererea și setările sunt copiate la pornire. Nu sunt trimise clientului HTML, rawData sau stack trace.

Începerea unui nou job nu șterge rezultatul terminal anterior. Finalizarea noului job îl înlocuiește. Toate joburile se pierd la restartarea backend-ului. Nu există database, istoric persistent, TTL, conturi sau anulare. Joburile sunt comune clienților aceleiași instanțe LAN.

## Mobile

`SearchSession` gestionează o singură operație de control și un singur timer. Nu există timeout global pentru căutare.

1. La pornire/revenire, citește currentSearchId din AsyncStorage; dacă există, cere statusul. Fără ID, verifică `/current`, astfel încât să recupereze și un POST acceptat al cărui răspuns s-a pierdut.
2. La o căutare nouă, verifică întâi `/current`. Dacă există RUNNING, se atașează; altfel face POST numai pentru acțiunea explicită a utilizatorului.
3. Salvează imediat ID-ul primit. Pentru 409 cu ID îl salvează și începe urmărirea aceluiași job.
4. Polling-ul RUNNING are pauză de 2 secunde după răspuns. Cererile nu se suprapun. Reveniri rapide în foreground sunt reunite, fără timere duplicate.
5. AppState background/inactive oprește timerul. Cererea scurtă deja în zbor poate termina și salva ID-ul; nu lansează alt job. La foreground citește din nou stocarea și statusul.
6. COMPLETED/FAILED oprește timerul și șterge currentSearchId; arată rezultatul sau eroarea. Reîntoarcerea din OLX nu redeschide automat același rezultat terminal deja consumat în sesiunea curentă.
7. La o întrerupere de rețea, păstrează ID-ul și afișează „Reconectare...”. Face cel mult 5 încercări consecutive eșuate, separate prin 5 secunde, apoi oferă „RECONECTEAZĂ LA CĂUTARE”. Acest buton și foreground reiau GET-urile, fără un POST automat.
8. Un ID expirat/necunoscut este șters și se verifică `/current`. Dacă serverul nu mai are nimic, explică pierderea rezultatului și permite o căutare nouă explicită.

Fiecare cerere HTTP de control are timeout 15 secunde. Timeoutul nu înseamnă job FAILED. Erorile de stocare sunt afișate separat; recuperarea poate folosi jobul curent al PC-ului. Rezultatul și statutul jobului din backend sunt autoritative.

Integrarea lifecycle folosește [AppState din React Native](https://reactnative.dev/docs/appstate.html). Mesajul „Cannot connect to Expo CLI” nu este modificat; el privește încărcarea/reconectarea bundle-ului Expo Go și nu dovedește că API-ul este offline. Dacă Expo Go nu poate rula JavaScript, recuperarea AutoHunter se produce când aplicația poate rula din nou. Un APK standalone nu ar depinde de Metro/Expo CLI, dar nu este creat în acest milestone.

## Actualizare și test pe telefon

Oprește și repornește backend-ul existent cu `npm run api`. Repornește Expo din `mobile/` cu `npx expo start --clear`. Păstrează `EXPO_PUBLIC_API_BASE_URL` și aceeași rețea Wi-Fi. Ambele componente trebuie actualizate: vechiul client așteaptă HTTP 200 cu rezultate, cel nou așteaptă 202 cu ID.

Pe telefon: MAȘINI → CAUTĂ OFERTE → trimite aplicația în background → revino. Trebuie să continue loading-ul sau să apară rezultatul. Repetă cu reload în Expo Go. Pentru întrerupere de Wi-Fi, trebuie să apară reconectarea, iar după refacerea rețelei să fie urmărit același job. Oprește/repornește backend-ul numai dacă accepți pierderea joburilor din memorie.

Verificările automate și LIVE sunt în [SEARCH_JOBS_VALIDATION.md](SEARCH_JOBS_VALIDATION.md). Nu s-au adăugat servicii cloud, AI, notificări sau motoare pentru alte categorii.
