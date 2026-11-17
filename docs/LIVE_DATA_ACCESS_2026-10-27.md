# Acces la date LIVE — verificare 27 octombrie 2026

## Verdict și metodă

Nu am obținut un set complet de anunțuri actuale autorizate pentru AutoHunter. În această etapă: **0 anunțuri importate și analizate, 0 rezultate cu minimum cinci comparabile și încredere suficientă, 0 fotografii originale cu drept de afișare verificat pentru proiect**. Aceste numere nu includ DEMO, snapshotul din septembrie sau simple linkuri indexate.

Am verificat documentații și condiții publicate de furnizori. Local, există cheia Brave, dar nu un feed configurat sau `data/imports/live-offers.json`; în `config/` există numai exemplul cu sursele dezactivate. Verificarea locală `/api/live/status` a răspuns HTTP 200, cu Brave configurat. Nu am lansat căutări Brave, importuri, colectare de anunțuri, descărcări de fotografii, înregistrări de cont sau abonamente. Aplicația, designul și formulele nu au fost modificate. Documentul acesta este singurul fișier adăugat.

## Candidat API concret: CarAPIS

[Pagina furnizorului pentru Autovit](https://docs.carapis.com/platforms/eastern-europe/autovit) declară acces la date românești, inclusiv caracteristici, fotografii și câmpuri de disponibilitate. Acoperirea efectivă trebuie verificată în cont; pagina însăși indică lista de surse accesibile cheii drept dovadă mai bună decât prezentarea comercială. Nu am primit sau testat o cheie CarAPIS.

[Termenii, secțiunea 3](https://carapis.com/terms/) acordă condiționat analiza și afișarea datelor/fotografiilor în aplicația clientului, cu păstrarea atribuirilor. Secțiunile 4–5 restricționează redistribuirea și concurența și mențin responsabilitatea pentru drepturile surselor. Secțiunea 8 nu garantează actualitatea în planurile standard. Există un plan gratuit limitat; accesul la România și costul concret nu sunt confirmate. Licența publicată este o pistă reală, nu dovada că AutoHunter are deja acces sau drepturi pentru un lot de imagini.

Pașii de acces documentați în [Authentication](https://docs.carapis.com/api/authentication): cont la `my.carapis.com`, generarea cheii și autentificare Bearer. Cheia trebuie păstrată numai local, pe backend, niciodată în chat sau în `EXPO_PUBLIC_*`. Un eventual `CARAPIS_API_KEY` nu este consumat încă de aplicație; nu există un conector nou.

Înainte de integrare trebuie clarificată o neconcordanță: [Listings](https://docs.carapis.com/api/listings) documentează `/v2/listings`, dar pagina Autovit descrie și `/apix/api/sources/`, `/apix/api/vehicles/` și alte câmpuri. Solicităm schema aplicabilă contului, o probă Autovit actuală și explicația verificării disponibilității. Descrierea comercială menționează și tratarea protecțiilor anti-bot; nu o echivalăm cu o autorizare din partea platformei originale. Nu au fost folosite asemenea mecanisme în AutoHunter.

Solicitarea concretă către furnizor, pregătită dar **netrimisă**:

> Solicit un acces de evaluare pentru analiza personală AutoHunter: inventar auto din România, preferabil Dacia Duster, preț original și monedă, marcă/model, an, km, combustibil, cilindree/configurație, localitate și URL original. Confirmați sursa activă, endpointul/schema, condițiile de colectare și reutilizare, permisiunea pentru fotografiile exacte, limitele și eventualul cost. Cum sunt verificate disponibilitatea și momentul ultimei actualizări? Putem primi un eșantion suficient pentru un vehicul și minimum cinci comparabile actuale?

## Rute directe și alternative

| Sursă                                                                 | Dovadă publicată                                                                                 | Accesul care lipsește                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Parcly](https://parcly.ro/) — furnizor românesc pentru parcuri auto  | Descrie stoc cu fotografii și stări, exporturi către platforme și exportarea stocului clientului | Acordul unui dealer client și export/feed furnizat explicit; nu există un endpoint public de citire documentat. Site-ul `autodemo` nu este un inventar LIVE de utilizat                                                                                                   |
| [Direcția](https://directia.ro/preturi)                               | Documentează importul și sincronizarea stocului dealerului prin XML/CSV/API                      | Aceasta este o integrare de intrare, nu acces de citire oferit AutoHunter. [Termenii, secțiunea 8](https://directia.ro/termeni) cer acord pentru reutilizare. Se poate cere colaborare prin [contactul oficial](https://directia.ro/contact), fără promisiune de aprobare |
| [OLX/Autovit Partner APIs](https://developer.olxgroup.com/products)   | Administrarea inventarului utilizatorilor autorizați                                             | [FAQ](https://developer.olxgroup.com/faq) exclude accesul general la piață și precizează restricții de aprobare pentru proiecte de încercare/studenți. Contul unui dealer nu este acces la stocul tuturor vânzătorilor                                                    |
| [mobile.de Search API](https://services.mobile.de/manual/index.html)  | Căutare/descărcare prin API-Account activat; contul dealerului pentru propriul stoc              | Credențiale acordate de suport, acoperire utilă în România și drepturi contractuale pentru afișare; nu este o sursă românească confirmată pentru proiect                                                                                                                  |
| [MotorAPIs — OLX România](https://motorapis.com/coverage/olx-romania) | Declară date JSON și cheie de evaluare la cerere                                                 | Furnizor independent; nu am verificat permisiunea sursei originale sau licența fotografiilor. Pagina nu este dovadă de acces acordat proiectului                                                                                                                          |

Nu am contactat furnizori și nu am acceptat contracte în numele utilizatorului.

## Calea recomandată și proba următoare

Prima opțiune de verificat este accesul de evaluare CarAPIS, cu răspunsurile de mai sus, fără cumpărarea unui abonament înainte de confirmarea sursei și a unui eșantion. Alternativa directă este un dealer român care autorizează folosirea exportului propriului stoc, de exemplu prin furnizorul Parcly. Nu avem încă un dealer care a acordat acest acces; nu atribuim permisiuni pe baza existenței unui site public.

După acces: o interogare limitată pentru un singur model și detalii numai pentru candidații necesari; normalizare/deduplicare existente; confirmarea prețului integral, caracteristicilor și actualității; motorul original pentru mediană, Deal Score și Flip Potential. Minimum cinci comparabile și încredere minimum 40 rămân obligatorii. Un lot de șase mașini nu garantează că sunt suficient de asemănătoare. Nici rezultatele furnizorului nu vor fi numite confirmate doar pentru că un URL răspunde.

Nu am implementat adaptoare, modificat scoruri sau demonstrat analiză LIVE pe date simulate. Nu am rulat regresii de cod în această etapă de documentare; verificările din etapa precedentă nu constituie dovadă de acces LIVE nou.
