# Fotografii reale per anunț DEMO

Sunt incluse 16 fotografii reale, licențiate, pentru 12 dintre cele 15 anunțuri din setul inițial:
5 mașini, 5 tractoare și 2 scule. Vezi [STARTER.md](STARTER.md) pentru modelele și directoarele exacte,
[CREDITS.md](CREDITS.md) pentru atribuiri și [SOURCES.json](SOURCES.json) pentru proveniență și SHA-256.
Fotografiile sunt reprezentative pentru model; nu documentează produsul efectiv din anunțul sintetic.
Ilustrațiile vechi din mobile/assets/demo sunt arhivate și nu se afișează în aplicație.
Nu copia aceeași fotografie generică la anunțuri diferite și nu folosi imagini fără drept de afișare.

Pentru fiecare anunț, folosește directorul din [CATALOG.md](CATALOG.md). Exemple:

```text
fixtures/images/cars/demo-duster-good/01.jpg
fixtures/images/cars/demo-duster-good/02.jpg
fixtures/images/cars/demo-duster-good/thumbnail.jpg
fixtures/images/cars/demo-duster-good/rights.json

fixtures/images/tractors/demo-tractor-0/01.jpg
fixtures/images/tractors/demo-tractor-0/02.jpg
fixtures/images/tractors/demo-tractor-0/rights.json

fixtures/images/tools/tool-local-0-0/01.jpg
fixtures/images/tools/tool-local-0-0/02.jpg
fixtures/images/tools/tool-local-0-0/rights.json
```

`01.jpg` este poza principală; `02.jpg`–`99.jpg` sunt poze suplimentare.
Pentru `ACTUAL_ITEM`, toate fotografiile trebuie să fie ale aceluiași produs.
Pentru `REPRESENTATIVE_MODEL`, galeria poate arăta exemplare diferite ale modelului și este etichetată astfel.
`thumbnail.jpg` este opțional, o versiune mai mică a pozei principale, folosită în listă.
Se acceptă și .jpeg, .png sau .webp, nume mici. Nu pune două extensii pentru același număr.
Recomandare practică: imagini JPEG/WebP de circa 1200–1600 px, sub 1 MB fiecare;
serverul refuză fișierele peste 10 MB. Nu sunt necesare dimensiuni exacte, proporțiile se păstrează.

În fiecare `rights.json`, declară dreptul real, de exemplu pentru fotografiile tale:

```json
{"status":"OWNED","evidence":"Fotografii realizate de mine pentru acest produs; 2026-10-25"}
```

Pentru fotografii licențiate: `status: "LICENSED"`, iar `evidence` descrie acordul sau licența.
Poți adăuga un SOURCE.md cu autorul, proveniența și condițiile. Nu pune parole sau tokenuri.
O declarație goală sau absentă lasă imaginile neafișate. Aplicația verifică declarația,
nu poate certifica automat drepturile juridice asupra fotografiei.

După copiere, din rădăcina AutoHunter:

```powershell
npm run demo:images
```

Comanda creează directoarele lipsă, actualizează `fixtures/demo-images.json` și catalogul.
Nu descarcă imagini și nu șterge fotografii. Fotografiile reprezentative nu cresc scorul de completitudine.
Declarațiile `rights.json` existente sunt păstrate. Cele 15 directoare din setul inițial primesc
o declarație UNKNOWN numai dacă nu există deja una. Manifestul este generat:
modifică fișierele și rights.json, apoi rulează comanda, în loc să editezi manual manifestul.
Pornește o căutare nouă în aplicație pentru a primi metadatele noi; nu este nevoie de rebuild
Expo pentru fotografii. Serverul API trebuie să ruleze în DEMO pe PC. Telefonul încarcă
imaginile prin aceeași adresă LAN ca API-ul, fără internet sau acces la surse de anunțuri.

Backend-ul servește numai imaginile declarate și autorizate în manifest, prin
`/demo-images/<categorie>/<id>/<fișier>`. Fișierele lipsă sau defecte afișează fallback.
În detalii, miniaturile permit alegerea fotografiei; în listă se folosește thumbnail dacă
există, altfel imaginea principală. Eticheta ANUNȚ DEMO rămâne vizibilă.

Manifestul acoperă 378 de înregistrări: 34 mașini, 116 tractoare și 228 scule, incluzând comparabilele.
Pentru început, completează fotografiile anunțurilor afișate în rezultate; comparabilele pot rămâne fără poze.

Pentru o verificare fără modificări:

```powershell
npm run demo:images -- --check
```

Comanda semnalează manifestul neactualizat și fișierele/drepturile lipsă. Codul de ieșire 1 este
așteptat cât timp cele trei scule din STARTER.md nu au fotografii și drepturi confirmate.
`STATUS.json` și `CATALOG.md` sunt rapoarte generate; nu modifica manual numărul fotografiilor.

Diagnostic: `MISSING_PHOTOS` = lipsesc fișierele numerotate; `INVALID_FILENAMES` = nume/extensii
neacceptate; `MISSING_RIGHTS` / `UNCONFIRMED_RIGHTS` / `INVALID_RIGHTS_JSON` = declarație absentă,
neconfirmată sau JSON invalid; `DUPLICATE_IMAGE_NUMBER` = două extensii pentru același număr;
`INVALID_IMAGE_SIZE` = fișier gol sau peste 10 MB. `READY` confirmă pregătirea metadatelor,
iar testul în browser confirmă decodarea și afișarea fotografiilor.
