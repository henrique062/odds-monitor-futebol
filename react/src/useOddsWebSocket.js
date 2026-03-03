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

function or(val, fallback) { return (val !== null && val !== undefined) ? val : fallback; }

function parseTeams(ev) {
  var home = '', away = '';
  var parts = or(ev.participants, or(ev.teams, []));
  if (Array.isArray(parts) && parts.length >= 2) {
    home = typeof parts[0] === 'object' ? or(parts[0].name, '') : parts[0];
    away = typeof parts[1] === 'object' ? or(parts[1].name, '') : parts[1];
  }
  if (!home) home = or(ev.home_team, or(ev.home, ''));
  if (!away) away = or(ev.away_team, or(ev.away, ''));
  if (!home && !away) {
    var n = or(ev.name, '');
    var sep = n.indexOf(' vs ') !== -1 ? ' vs ' : ' - ';
    var pts = n.split(sep);
    if (pts.length >= 2) { home = pts[0].trim(); away = pts.slice(1).join(sep).trim(); }
  }
  return { home: home, away: away };
}

function parseLeague(ev) {
  var lg = or(ev.league, '');
  if (typeof lg === 'object' && lg !== null) return or(lg.slug, or(lg.name, 'outras'));
  return or(ev.league_slug, lg || 'outras');
}

function parseML(markets) {
  if (!markets) return null;
  for (var i = 0; i < markets.length; i++) {
    var m = markets[i];
    if ((or(m.name, '')).toUpperCase() === 'ML') {
      var odds = m.odds;
      var o = (odds && odds.length > 0) ? odds[0] : {};
      if (o.home || o.draw || o.away) {
        return { home: o.home, draw: o.draw, away: o.away };
      }
    }
  }
  return null;
}

function buildSnapshot(events) {
  var snap = {};
  events.forEach(function(ev) {
    var eid = String(or(ev.id, ''));
    if (!eid) return;
    var teams = parseTeams(ev);
    var ml = parseML(or(ev.markets, or(ev.odds, [])));
    snap[eid] = {
      id: eid,
      home: teams.home,
      away: teams.away,
      starts_at: or(ev.starts_at, or(ev.start_time, '')),
      status: or(ev.status, 'prematch'),
      liga: parseLeague(ev),
      bookie: or(ev.bookmaker, or(ev.bookie, '')),
      ml: ml || {},
    };
  });
  return snap;
}

export function useOddsWebSocket(apiKey, statusFilter) {
  const [matches,     setMatches]     = useState({});
  const [wsStatus,    setWsStatus]    = useState('disconnected');
  const [updateCount, setUpdateCount] = useState(0);
  const [logs,        setLogs]        = useState([]);
  const wsRef      = useRef(null);
  const retryRef   = useRef(0);
  const retryTimer = useRef(null);

  const addLog = useCallback(function(msg, type) {
    if (!type) type = 'info';
    var ts = new Date().toLocaleTimeString('pt-BR');
    setLogs(function(prev) {
      return [{ ts: ts, msg: msg, type: type, id: Date.now() + Math.random() }].concat(prev).slice(0, 200);
    });
  }, []);

  const fetchSnapshot = useCallback(function() {
    addLog('Buscando snapshot inicial (REST)...', 'info');
    var params = new URLSearchParams({
      apiKey: apiKey, sport: 'football',
      leagues: LEAGUES.join(','), markets: 'ML',
    });
    if (statusFilter) params.set('status', statusFilter);
    return fetch(REST_BASE + '/odds?' + params.toString())
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {
        var events = Array.isArray(data) ? data : or(data.data, or(data.events, []));
        setMatches(buildSnapshot(events));
        addLog('Snapshot OK — ' + events.length + ' eventos', 'ok');
      })
      .catch(function(e) {
        addLog('Snapshot falhou: ' + e.message, 'warn');
      });
  }, [apiKey, statusFilter, addLog]);

  const connect = useCallback(function() {
    if (wsRef.current) { try { wsRef.current.close(); } catch(ex) {} }
    var p = new URLSearchParams({
      apiKey: apiKey, sport: 'football',
      leagues: LEAGUES.join(','), markets: 'ML',
    });
    if (statusFilter) p.set('status', statusFilter);
    var url = WS_BASE + '?' + p.toString();
    addLog('Conectando ao WebSocket...', 'info');
    var ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = function() {
      retryRef.current = 0;
      setWsStatus('connected');
      addLog('WebSocket conectado!', 'ok');
    };

    ws.onclose = function(ev) {
      setWsStatus('disconnected');
      addLog('Desconectado (code=' + ev.code + ')', 'warn');
      retryRef.current++;
      if (retryRef.current <= 10) {
        var delay = Math.min(1000 * Math.pow(2, retryRef.current), 60000);
        addLog('Reconectando em ' + Math.round(delay/1000) + 's... (' + retryRef.current + '/10)', 'warn');
        retryTimer.current = setTimeout(connect, delay);
      } else {
        addLog('Máximo de reconexões atingido.', 'err');
      }
    };

    ws.onerror = function() { addLog('Erro no WebSocket', 'err'); };

    ws.onmessage = function(ev) {
      var data;
      try { data = JSON.parse(ev.data); } catch(ex) { return; }
      var type = data.type;
      if (type === 'welcome') {
        addLog(or(data.message, 'Bem-vindo!'), 'ok');
        if (data.warning) addLog('⚠ ' + data.warning, 'warn');
        return;
      }
      var eid = String(or(data.id, ''));
      if (!eid) return;

      if (type === 'deleted') {
        setMatches(function(prev) {
          var n = Object.assign({}, prev);
          delete n[eid];
          return n;
        });
        return;
      }

      if (type === 'created' || type === 'updated') {
        var ml = parseML(or(data.markets, []));
        if (!ml) return;
        setUpdateCount(function(c) { return c + 1; });
        setMatches(function(prev) {
          var existing = prev[eid];
          if (!existing) {
            var teams = parseTeams(data);
            var entry = {
              id: eid, home: teams.home, away: teams.away,
              starts_at: or(data.starts_at, ''),
              status: or(data.status, 'prematch'),
              liga: parseLeague(data),
              bookie: or(data.bookie, ''),
              ml: ml, _new: true,
            };
            return Object.assign({}, prev, { [eid]: entry });
          }
          var updated = Object.assign({}, existing, {
            ml: ml,
            status: or(data.status, existing.status),
            bookie: or(data.bookie, existing.bookie),
          });
          return Object.assign({}, prev, { [eid]: updated });
        });
      }
    };
  }, [apiKey, statusFilter, addLog]);

  useEffect(function() {
    if (!apiKey) return;
    fetchSnapshot().then(connect);
    return function() {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (wsRef.current) { try { wsRef.current.close(1000, 'cleanup'); } catch(ex) {} }
    };
  }, [apiKey, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const disconnect = useCallback(function() {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (wsRef.current) { try { wsRef.current.close(1000, 'user'); } catch(ex) {} }
    setWsStatus('disconnected');
  }, []);

  return { matches: matches, wsStatus: wsStatus, updateCount: updateCount, logs: logs, disconnect: disconnect };
}
