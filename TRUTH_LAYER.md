# Verification / truth layer

## Două treceri

Prima trecere păstrează căutarea locală, filtrele, identitatea, cache-ul și bugetul pieței. Maximum 20 de candidați primesc scoruri preliminare. A doua trecere verifică maximum primii 10 după scor, prin `SourceAdapter.getListingDetails()` și `listingVerificationService.ts`.

Datele preliminare sunt păstrate în `result.preliminary`. Detaliile sunt citite într-un obiect separat. Un câmp lipsă în pagina individuală rămâne lipsă; nu este înlocuit cu o valoare presupusă. Nu se rescrie anul structurat folosind descrierea: ambele afirmații contradictorii sunt păstrate în explicație.

După citirea paginilor se recalculează toate scorurile. Nu există căutări de piață suplimentare în această etapă. Referințele cu contradicții grave deja detectabile în text sunt eliminate înainte de estimarea finală, fără accesarea paginilor lor individuale. Dacă datele actualizate nu mai confirmă filtrele locale, anunțul trece în verificarea manuală.

## Status și limite

- `VERIFIED`: pagina a fost citită și parsată cu succes. **Nu înseamnă că afirmațiile vânzătorului sau starea mașinii sunt adevărate.**
- `FAILED`: pagina nu a putut fi accesată/parsată, a fost returnat alt anunț sau accesul a fost oprit după o protecție. Datele preliminare rămân; încrederea se înmulțește cu 0,5.
- `NOT_REQUESTED`: în afara primilor 10 candidați. Nu se face cerere; încrederea se înmulțește cu 0,7.

Pentru `FAILED` și `NOT_REQUESTED`, Deal Score are plafon 45 și Flip Potential plafon 25. CLI le marchează explicit. Contorul `requested` arată apelurile efectuate; `failed` poate include și finaliștii programați care nu au mai fost ceruți după blocare.

Maximum 10 detalii, serial, cu 750 ms pauză. Configurare în `src/config/verificationSettings.ts`. O eroare 404 păstrează rezultatul preliminar și permite următorul finalist. 403/429/CAPTCHA opresc toate cererile rămase, fără retry. Suma maximă a etapelor este 23 cereri per comandă cu OLX: 1 locală + 12 piață + 10 detalii.

## Coerența datelor

`dataConsistency.ts` returnează `dataQualityScore`, `dataConflicts`, `dataWarnings`, `seriousConflict` și `priceAmbiguity`.

| Indiciu | Tratament |
|---|---|
| An diferit cu minimum 2 ani | Conflict grav, −75 calitate |
| An diferit cu 1 an | Warning, −10; fabricație/înmatriculare de clarificat |
| Kilometraj diferit cu peste 30.000 km | Conflict grav, −45 |
| Diferență kilometraj sub 3.000 km | Fără conflict |
| Diferență intermediară de kilometraj | Warning, −10 |
| Combustibil contradictoriu | Conflict grav, −45 |
| Tracțiune sau cilindree contradictorie | Conflict grav, −35 |
| Preț total neclar | −50; avans, rată, preț de pornire, TVA neincluse |
| An/rulaj/combustibil/descriere lipsă | −12 pentru fiecare |
| Titlu înmatriculat vs câmp neînmatriculat | Warning, −20 |

Extracția anilor din descriere cere formulări explicite precum „An 2004”. Distanțele de transport și kilometrajul reviziilor nu sunt atribuite automat rulajului curent. Un titlu „Peugeot 2008” nu este un an de fabricație. Menționarea 4x2 și 4x4 împreună poate descrie moduri selectabile și nu produce singură conflict.

`descriptionContext.ts` recunoaște secțiuni precum „CĂUTAȚI ALT MODEL” sau „Modele disponibile acum”. Textul complet rămâne disponibil; anii, motorizările și defectele din oferta altor vehicule nu sunt atribuite mașinii principale. Este o euristică limitată la formulări recognoscibile, nu o înțelegere completă a limbajului.

Datele din detalii includ titlu, descriere, preț, an, rulaj, cilindree, putere, combustibil, transmisie, tracțiune, caroserie, înmatriculare, vânzător, localitate, coordonate, imagini și datele publicării/actualizării, când sunt prezente. Parserul de preț acceptă suma EUR afișată explicit de OLX și formate locale cu zecimale; nu inventează conversii valutare.

## Riscuri și înmatriculare

`listingRisk.ts` separă `mechanicalRisk`, `accidentRisk`, `cosmeticRisk`, `legalRisk`, `priceRisk`, `dataRisk`, `overallRisk` și `riskReasons`. Câmpurile vechi `riskScore` și `reasons` rămân aliasuri compatibile.

Motor/cutie defecte și lipsa actelor au ponderi mari. Imperfecțiunile estetice primesc 25, zgârieturile 20. Simpla mențiune a injectoarelor/ambreiajului/volantei are doar 5 și mesaj de verificare a contextului; nu dovedește defectul. Riscul agregat este maximul categoriilor plus 25% din celelalte, plafonat la 100.

Importul/neînmatricularea produce risc legal 10 și warning privind documentele și posibilele costuri. Nu este excludere automată. `registrationStatus` poate fi `REGISTERED_RO`, `UNREGISTERED`, `IMPORT`, `UNKNOWN`. Fără dovadă textuală suficientă despre România, statutul nu este inventat. `registrationPenalty` în setările de căutare este configurabil 0–20, implicit 3.

„Km reali”, „stare perfectă”, „fără probleme” sunt `sellerClaims`, marcate neverificate. Nu scad riscul mecanic sau celelalte riscuri. Negarea locală a unei expresii („nu este avariat”) împiedică un fals pozitiv pentru acea expresie; nu anulează un alt defect declarat.

## Scoruri și explicații

Prețul față de piață rămâne factorul principal al Deal Score. Categoria cosmetică penalizează cu 30% din scorul său; riscurile mecanice/accident/acte au impact puternic. Riscul legal mic de import este ponderat moderat. Încrederea pieței se înmulțește cu calitatea datelor; un conflict grav are și plafon de încredere 10, ambiguitatea de preț plafon 20.

Plafoanele finale Deal Score:

- conflict grav: 35;
- accident cu risc ≥70: 25;
- mecanică cu risc ≥70: 35;
- preț ambiguu: 30;
- încredere sub 25: 45.

Conflictele grave, prețurile ambigue și filtrele care nu mai sunt confirmate merg în `needsManualVerification`, afișat după top. Defectele grave descoperite ulterior sunt păstrate în `excludedAfterVerification` când `excludeDamaged=true`; nu dispar fără diagnostic.

`flipPotentialScore` este separat: favorizează discountul, comparabilele, datele coerente și problemele doar cosmetice/minore. Defectele mecanice, accidentele grave, actele sau contradicțiile îl reduc drastic și îi limitează maximul la 15. Reducere nulă/negativă înseamnă Flip Potential 0. Nu estimează reparații și nu este profit net garantat.

`positiveReasons` și `warnings` explică fiecare rezultat, inclusiv finanțarea, TVA, vânzătorul firmă și afirmațiile neverificate. Contoarele din `VERIFIED FINDINGS` se referă numai la paginile citite cu succes; rezultatele neverificate își păstrează propriile avertismente, afișate separat.

## Fișiere principale

```text
src/analysis/dataConsistency.ts
src/analysis/descriptionContext.ts
src/analysis/listingRisk.ts
src/analysis/listingFacts.ts
src/analysis/dealScore.ts
src/analysis/flipPotential.ts
src/analysis/explainListing.ts
src/services/listingVerificationService.ts
src/services/searchService.ts
src/sources/olx/olxDetailParser.ts
src/config/verificationSettings.ts
tests/verification.test.ts
fixtures/details/
```

Testele includ cazurile Suzuki/Megane, diferențe mici/mari de rulaj, combustibil/tracțiune, prețuri, negații, înmatriculare, afirmații ale vânzătorului, plafoane, Flip Potential, reranking, buget, eșec și oprirea la protecții. Testele rulează offline; validarea live este raportată separat.
