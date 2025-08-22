## Performance & DB-Last Reduktion

Kurzüberblick der implementierten Maßnahmen zur Senkung gleichzeitiger MongoDB-Verbindungen und Query-Last:

1. Verbindungspool reduziert (MONGODB_POOL_SIZE=3) mit Retry & Metriken (`/api/health`).
2. Server-seitige Pagination & Filter für Kursliste (`/api/kurse?page=...&limit=10`).
3. In-Memory Cache pro Runtime:
   - Kursliste (`/api/kurse`) – 30s TTL (`COURSE_LIST_CACHE_MS`).
   - Lesson-Liste eines Kurses (`/api/kurs/:id/lektionen`) – 30s TTL (`LESSON_LIST_CACHE_MS`) + ETag Unterstützung.
4. Polling reduziert / pausiert:
   - Unread Messages min. 120s & Tab-Visibility gesteuert.
   - Arena Autosave Default 15s & pausiert im Hintergrund.
5. Health Endpoint erweitert (readyState, Pool-Konfig, Prozessinfos, Metriken).

### Konfigurierbare ENV Variablen

```
MONGODB_POOL_SIZE=3
MONGODB_MIN_POOL_SIZE=0
COURSE_LIST_CACHE_MS=30000
LESSON_LIST_CACHE_MS=30000
NEXT_PUBLIC_UNREAD_POLL_MS=120000   # client kann erhöhen, Backend setzt Minimum
NEXT_PUBLIC_ARENA_AUTOSAVE_MS=15000
```

### Empfehlungen (noch offen / optional)
* ETag / Cache auch für einzelne Lektion (`/api/lessons/:id`).
* Aggregierter Dashboard Endpoint (User + unread + last progress in 1 Request).
* Rate Limiting / Debounce bei schnell aufeinanderfolgenden Lernfortschritt-Updates.
* Optionaler Persist-Cache (KV) falls Serverless Kaltstarts häufig.

### Debug
* `/api/health` – Metriken & Prozessdaten.
* Browser DevTools: Netzwerktabs prüfen – weniger parallele /api/kurse und /api/kurs/:id/lektionen Aufrufe.

Diese Datei dient der schnellen Orientierung über aktuelle Optimierungsmechanismen.