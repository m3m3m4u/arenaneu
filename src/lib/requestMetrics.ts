// Einfache In-Memory Request Metriken (pro Runtime / Lambda Instance)
// Nicht persistent – nur für Diagnose von Lastspitzen.
export interface RequestMetricEntry { count: number; last: number; }
interface Hit { t: number; key: string; }
interface MetricsStore { byKey: Map<string, RequestMetricEntry>; started: number; total: number; hits: Hit[]; spikeLogMinute?: number; }
const g: any = global;
if(!g.__REQUEST_METRICS__) g.__REQUEST_METRICS__ = { byKey: new Map(), started: Date.now(), total: 0, hits: [] } as MetricsStore;
const STORE: MetricsStore = g.__REQUEST_METRICS__;

export function recordRequest(path: string, method: string){
  try {
    const key = method.toUpperCase()+" "+path.replace(/\d{24}/g,'{id}'); // maskiere ObjectIds
    let e = STORE.byKey.get(key);
    if(!e){ e = { count:0, last:0 }; STORE.byKey.set(key, e); }
    e.count++; e.last = Date.now(); STORE.total++;
    // Hit in Sliding-Window aufnehmen
    STORE.hits.push({ t: e.last, key });
    // Grobe Begrenzung der Array-Länge, alte Einträge periodisch entfernen
    if (STORE.hits.length > 5000) {
      const cutoff = Date.now() - 10*60*1000; // 10 Minuten
      STORE.hits = STORE.hits.filter(h => h.t >= cutoff);
    }
    // Spike Detection (einfach): wenn > THRESHOLD in aktueller Minute und noch nicht geloggt
    try {
      const THRESHOLD = Number(process.env.REQUEST_SPIKE_THRESHOLD || '80');
      const minute = Math.floor(e.last / 60000);
      if (THRESHOLD > 0) {
        // Zähle aktuelle Minute grob
        const minuteCount = STORE.hits.reduce((acc,h)=> acc + (Math.floor(h.t/60000)===minute ? 1:0), 0);
        if (minuteCount >= THRESHOLD && STORE.spikeLogMinute !== minute) {
          STORE.spikeLogMinute = minute;
          console.warn('[requestMetrics] Spike erkannt', { minuteStart: new Date(minute*60000).toISOString(), count: minuteCount, threshold: THRESHOLD });
        }
      }
    } catch {}
  } catch {}
}

export function getTopEndpoints(limit = 10){
  const arr = Array.from(STORE.byKey.entries()).map(([k,v])=>({ key:k, count:v.count, last:v.last }));
  arr.sort((a,b)=> b.count - a.count);
  return arr.slice(0, limit);
}

export function exportRequestMetrics(){
  const now = Date.now();
  const oneMinute = now - 60_000;
  const fiveMinutes = now - 5*60_000;
  let last1m = 0; let last5m = 0;
  const perKey1m: Record<string, number> = {};
  const perKey5m: Record<string, number> = {};
  for (const h of STORE.hits) {
    if (h.t >= oneMinute) {
      last1m++; perKey1m[h.key] = (perKey1m[h.key]||0)+1;
    }
    if (h.t >= fiveMinutes) {
      last5m++; perKey5m[h.key] = (perKey5m[h.key]||0)+1;
    }
  }
  const top1m = Object.entries(perKey1m).map(([k,v])=>({ key:k, count:v })).sort((a,b)=> b.count-a.count).slice(0,5);
  const top5m = Object.entries(perKey5m).map(([k,v])=>({ key:k, count:v })).sort((a,b)=> b.count-a.count).slice(0,5);
  return {
    started: STORE.started,
    uptimeMs: Date.now() - STORE.started,
    total: STORE.total,
    top: getTopEndpoints(10),
    window: {
      last1m,
      last5m,
      top1m,
      top5m
    }
  };
}
