import { useState, useEffect, useRef, useCallback } from 'react';

const LEAGUES = [
  'england-premier-league','spain-la-liga','germany-bundesliga',
  'italy-serie-a','france-ligue-1','netherlands-eredivisie',
  'portugal-primeira-liga','brazil-serie-a','brazil-serie-b',
  'argentina-primera-division','usa-mls','mexico-liga-mx',
  'champions-league','europa-league','conference-league',
  'england-championship','scotland-premiership','turkey-super-lig',
  'greece-super-league','belgium-first-division-a',
];
const REST_BASE = 'https://api.odds-api.io/v3';
const WS_BASE   = 'wss://api.odds-api.io/v3/ws';

function parseTeams(ev) {
  let home = '', away = '';
  const parts = ev.participants ?? ev.teams ?? [];
  if (Array.isArray(parts) && parts.length >= 2) {
    home = typeof parts[0] === 'object' ? (parts[0].name ?? '') : parts[0];
    away = typeof parts[1] === 'object' ? (parts[1].name ?? '') : parts[1];
  }
  if (!home) home = ev.home_team ?? ev.home ?? '';
  if (!away) away = ev.away_team ?? ev.away ?? '';
  if (!home && !away) {
    const n = ev.name ?? '';
    const sep = n.includes(' vs ') ? ' vs ' : ' - ';
    const pts = n.split(sep, 2);
    if (pts.length === 2) { home = pts[0].trim(); away = pts[1].trim(); }
  }
  return { home, away };
}

function parseLeague(ev) {
  let lg = ev.league ?? '';
  if (typeof lg === 'object') return lg.slug ?? lg.name ?? 'outras';
  return ev.league_slug ?? lg || 'outras';
}

function parseML(markets = []) {
  for (const m of markets) {
    if ((m.name ?? '').toUpperCase() === 'ML') {
      const o = m.odds?.[0] ?? {};
      if (o.home || o.draw || o.away) return { home: o.home, draw: o.draw, away: o.away };
    }
  }
  return null;
}

export function useOddsWebSocket(apiKey, statusFilter) {
  const [matches,     setMatches]     = useState({});
  const [wsStatus,    setWsStatus]    = useState('disconnected');
  const [updateCount, setUpdateCount] = useState(0);
  const [logs,        setLogs]        = useState([]);
  const wsRef         = useRef(null);
  const retryRef      = useRef(0);
  const retryTimer    = useRef(null);

  const addLog = useCallback((msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString('pt-BR');
    setLogs(prev => [{ ts, msg, type, id: Date.now() + Math.random() }, ...prev].slice(0, 200));
  }, []);

  // REST snapshot
  const fetchSnapshot = useCallback(async () => {
    addLog('Buscando snapshot inicial (REST)...', 'info');
    const params = new URLSearchParams({ apiKey, sport: 'football', leagues: LEAGUES.join(','), markets: 'ML' });
    if (statusFilter) params.set('status', statusFilter);
    try {
      const res  = await fetch(`${REST_BASE}/odds?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const evts = Array.isArray(data) ? data : (data.data ?? data.events ?? []);
      const snap = {};
      evts.forEach(ev => {
        const eid = String(ev.id ?? '');
        if (!eid) return;
        const { home, away } = parseTeams(ev);
        const ml = parseML(ev.markets ?? ev.odds ?? []);
        snap[eid] = { id: eid, home, away, starts_at: ev.starts_at ?? '', status: ev.status ?? 'prematch', liga: parseLeague(ev), bookie: ev.bookmaker ?? ev.bookie ?? '', ml: ml ?? {} };
      });
      setMatches(snap);
      addLog(`Snapshot OK — ${evts.length} eventos`, 'ok');
    } catch (e) {
      addLog(`Snapshot falhou: ${e.message}`, 'warn');
    }
  }, [apiKey, statusFilter, addLog]);

  // WebSocket connect
  const connect = useCallback(() => {
    if (wsRef.current) { try { wsRef.current.close(); } catch (_) {} }
    const p = new URLSearchParams({ apiKey, sport: 'football', leagues: LEAGUES.join(','), markets: 'ML' });
    if (statusFilter) p.set('status', statusFilter);
    const url = `${WS_BASE}?${p}`;
    addLog('Conectando ao WebSocket...', 'info');
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryRef.current = 0;
      setWsStatus('connected');
      addLog('WebSocket conectado!', 'ok');
    };

    ws.onclose = (ev) => {
      setWsStatus('disconnected');
      addLog(`Desconectado (code=${ev.code})`, 'warn');
      retryRef.current++;
      if (retryRef.current <= 10) {
        const delay = Math.min(1000 * Math.pow(2, retryRef.current), 60000);
        addLog(`Reconectando em ${delay / 1000}s... (${retryRef.current}/10)`, 'warn');
        retryTimer.current = setTimeout(connect, delay);
      } else {
        addLog('Máximo de reconexões atingido.', 'err');
      }
    };

    ws.onerror = () => addLog('Erro no WebSocket', 'err');

    ws.onmessage = (ev) => {
      let data;
      try { data = JSON.parse(ev.data); } catch { return; }
      const { type } = data;
      if (type === 'welcome') {
        addLog(data.message ?? 'Bem-vindo!', 'ok');
        if (data.warning) addLog('⚠ ' + data.warning, 'warn');
        return;
      }
      const eid = String(data.id ?? '');
      if (!eid) return;
      if (type === 'deleted') {
        setMatches(prev => { const n = { ...prev }; delete n[eid]; return n; });
        return;
      }
      if (type === 'created' || type === 'updated') {
        const ml = parseML(data.markets ?? []);
        if (!ml) return;
        setUpdateCount(c => c + 1);
        setMatches(prev => {
          const existing = prev[eid];
          if (!existing) {
            const { home, away } = parseTeams(data);
            return { ...prev, [eid]: { id: eid, home, away, starts_at: data.starts_at ?? '', status: data.status ?? 'prematch', liga: parseLeague(data), bookie: data.bookie ?? '', ml, _new: true } };
          }
          return { ...prev, [eid]: { ...existing, ml, status: data.status ?? existing.status, bookie: data.bookie ?? existing.bookie } };
        });
      }
    };
  }, [apiKey, statusFilter, addLog]);

  useEffect(() => {
    if (!apiKey) return;
    fetchSnapshot().then(connect);
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (wsRef.current) { try { wsRef.current.close(1000, 'cleanup'); } catch (_) {} }
    };
  }, [apiKey, statusFilter]); // eslint-disable-line

  const disconnect = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (wsRef.current) { try { wsRef.current.close(1000, 'user'); } catch (_) {} }
    setWsStatus('disconnected');
  }, []);

  return { matches, wsStatus, updateCount, logs, disconnect };
}
