# Lunchtipset

Lunchtips för Coops huvudkontor i Solna: dagens menyer i en vy, förslag utifrån
dina preferenser, och röstsamtal med lunchassistenter som redan vet vad du gillar.

## Struktur

```
shared/   Typer, datumhjälp och poängmodellen (används av både api och web)
api/      Node + Hono + Drizzle/Postgres. Menyhämtning med Gemini, Clerk-auth
web/      React + Vite, vanlig CSS, i18n (sv/en), ElevenLabs-samtal
docs/     Uppsättning av ElevenLabs-agenten
```

`api/` och `web/` har egna `node_modules` (inga npm workspaces, eftersom E:-disken
är exFAT och inte klarar symlänkar). `shared/` importeras via sökvägsalias
`@lunch/shared` i tsconfig och Vite.

## Kom igång

```sh
cp .env.example .env      # fyll i nycklar
npm install               # installerar även api/ och web/
docker run -d --name lunch-pg -e POSTGRES_PASSWORD=lunch -e POSTGRES_DB=lunch -p 5433:5432 postgres:17-alpine
npm run dev               # api på :3001, web på :5173
```

Migreringar körs automatiskt när API:t startar. Efter ändringar i
`api/src/db/schema.ts`: `npm run db:generate`.

Utan Clerk-nycklar körs appen i gästläge: preferenser och historik ligger i
IndexedDB, och man kan läsa och ringa men inte bidra.

## Kommandon

|                                         |                                      |
| --------------------------------------- | ------------------------------------ |
| `npm run dev`                           | API + webb med omladdning            |
| `npm run lint` / `lint:fix`             | Biome                                |
| `npm run typecheck`                     | tsc för shared, api, web             |
| `npm test`                              | Vitest (poängmodellen)               |
| `npm --prefix api run fetch-menus [id]` | Hämta menyer en gång från terminalen |
| `npm --prefix api run sync-agents`      | Skapa/uppdatera ElevenLabs-agenter   |

## Hur det hänger ihop

- **Menyer**: ett cron-jobb (vardagar 09:30) hämtar varje restaurangs meny-URL
  (HTML eller PDF) och låter Gemini tolka hela veckans lunch till rätter
  (namn, beskrivning, pris). Sidor som kräver JavaScript eller saknar meny syns
  som ”kunde inte hämtas”, och då kan man ladda upp ett foto.
- **Uppladdning**: fotot tolkas → användaren granskar och rättar → publiceras.
  Bilden sparas aldrig. En uppladdning för en dag går före den automatiska menyn.
  Röstassistenten kan också lägga till och ta bort rätter.
- **Förslag**: `shared/src/scoring.ts` räknar fram en poäng 0–100 per restaurang
  från avstånd, kollegors omdömen, variation (restaurang och rätt), smak och pris,
  viktat med användarens reglage. Allt om mat bygger på fritext: Gemini läser
  användarens beskrivning av sig själv och senaste luncherna mot dagens rätter
  (`api/src/menus/taste.ts`) och ger varje rätt smak, variation och ”går inte”
  (kost, allergi). Maxavstånd, maxpris och bortvalda restauranger filtrerar bort.
- **Samtal**: webben bygger en systemprompt med assistentens personlighet, dagens
  menyer, preferenser, historik och rankingen, och startar ElevenLabs-agenten med
  den som override. Verktyg (ändra preferenser, logga lunch, lämna info, …) körs i
  webbläsaren.
- **Assistenter** definieras i `api/src/data/assistants.ts` (namn, språk,
  personlighet, första replik, ElevenLabs-röst, bild, bakgrundsljud, valfri LLM
  och TTS-modell). Varje assistent får en egen ElevenLabs-agent som API:t skapar
  och håller uppdaterad vid start, så ElevenLabs GUI behövs inte. Se
  [docs/elevenlabs-agent.md](docs/elevenlabs-agent.md).
- **Admin**: Clerk-användare i `ADMIN_USER_IDS` kan lägga upp restauranger
  (avstånd i meter), granska föreslagna webbsidor och starta menyhämtning.

## Railway

En tjänst plus Postgres. API:t serverar den byggda webben från `web/dist`.
`railway.json` sätter bygg- och startkommando och health check. Lägg in
variablerna från `.env.example`; `VITE_CLERK_PUBLISHABLE_KEY` måste finnas vid
bygget.
