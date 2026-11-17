# Setul inițial: 15 anunțuri DEMO

Rădăcina fotografiilor este `fixtures/images`.
Fiecare director de mai jos conține `rights.json`. Fotografiile și declarațiile pentru cele 12 anunțuri
complete sunt deja incluse. Nu trebuie descărcate la pornire și nu necesită internet.

| Categorie / model | Director în fixtures/images | Fișiere incluse |
| --- | --- | --- |
| Dacia Duster II | cars/demo-duster-good | 01.jpg, 02.jpg |
| Ford Focus III facelift | cars/demo-Focus-0 | 01.jpg, 02.jpg |
| Volkswagen Golf VII | cars/demo-Golf-0 | 01.jpg |
| Renault Mégane IV | cars/demo-Megane-0 | 01.jpg |
| Toyota Yaris XP130 facelift | cars/demo-no-comparables | 01.jpg |
| UTB / Universal 650 | tractors/demo-tractor-0 | 01.jpg |
| Zetor 7245 | tractors/demo-tractor-8 | 01.jpg, 02.jpg |
| Belarus 820 | tractors/demo-tractor-12 | 01.jpg |
| John Deere 6400 | tractors/demo-tractor-16 | 01.jpg |
| Massey Ferguson 390 | tractors/demo-tractor-24 | 01.jpg |
| Makita DGA504 | tools/tool-local-0-0 | 01.jpg, 02.jpg |
| Makita DDF484 | tools/tool-local-1-0 | Lipsește 01.jpg și autorizarea |
| Stihl MS 261 | tools/tool-local-9-0 | Lipsește 01.jpg și autorizarea |
| Husqvarna 135 Mark II | tools/tool-local-10-0 | Lipsește 01.jpg și autorizarea |
| Kärcher K5, fotografie K5 Smart Control | tools/tool-local-11-0 | 01.jpg |

Sunt fotografii ale modelului, nu ale produselor disponibile la vânzare. Culoarea, anul, motorul,
echiparea și accesoriile pot diferi de datele DEMO. Unele galerii arată exemplare diferite.
Fotografia Husqvarna 135 găsită în cercetare nu a fost inclusă: versiunea Mark II nu este confirmată.
La Makita DGA504, a doua imagine este versiunea decupată publicată separat pe Commons,
cu atribuirea ambilor autori; nu reprezintă un al doilea unghi fotografiat.
Pentru celelalte două scule nu a fost identificată o fotografie potrivită cu licență verificată.
Nu înlocui aceste modele cu fotografii ale unei scule asemănătoare.

Pentru completarea uneia dintre cele trei scule:

1. Pune fotografia corespunzătoare modelului exact în directorul indicat, cu numele `01.jpg`.
2. Opțional, adaugă `02.jpg` pentru galerie și `thumbnail.jpg` pentru listă.
3. Completează drepturile reale. Pentru o fotografie reprezentativă licențiată, structura este:

```json
{
  "status": "LICENSED",
  "evidence": "URL-ul paginii care acordă licența și data verificării",
  "imagePresentation": "REPRESENTATIVE_MODEL",
  "imageAttributions": [{
    "imageUrl": "/demo-images/tools/tool-local-1-0/01.jpg",
    "title": "Titlul fotografiei",
    "author": "Autorul real",
    "sourceUrl": "https://sursa-autorizata.example/pagina-fotografiei",
    "license": "Numele și versiunea licenței reale",
    "licenseUrl": "https://sursa-autorizata.example/licenta",
    "changes": "Descrie redimensionarea sau alte modificări; dacă nu există, scrie Nemodificată."
  }]
}
```

Exemplul conține valori de înlocuit și nu acordă drepturi. Schimbă ID-ul pentru Stihl sau Husqvarna.
Adaugă câte o atribuire pentru fiecare fotografie. Pentru fotografiile tale, folosește OWNED și
documentează autorul și condițiile reale. Nu înlocui UNKNOWN înainte să existe dreptul de utilizare.

4. Rulează `npm run demo:images` din rădăcina AutoHunter și începe o căutare nouă în aplicație.
5. Verifică poza în rezultate și detalii, creditele și miniaturile. Fișierele fără fotografii
autorizate păstrează mesajul „Fotografie indisponibilă”.

Pe localhost:8082: pornește o căutare DEMO și apasă „VEZI TOATE CELE …” dacă modelul nu apare
în primele 10. Makita DGA504 se află după primele 10 rezultate în setările implicite.
Deschide „VEZI DETALII”. Duster, Focus, Zetor și Makita DGA504 au câte două miniaturi.
Restul catalogului conține alte anunțuri fără fotografii; fallback-ul lor este normal.
