/**
 * Odds Monitor — Futebol 1x2 (ML) via WebSocket
 * ================================================
 * Instalação:
 *   npm install
 *
 * Uso:
 *   node odds_monitor.js --key SUA_API_KEY
 *   ou: ODDS_API_KEY=SUA_KEY node odds_monitor.js
 */

const WebSocket = require('ws');
const https     = require('https');
const readline  = require('readline');

// ── CONFIG ────────────────────────────────────────────────────
const LEAGUES = [
    'england-premier-league', 'spain-la-liga', 'germany-bundesliga',
    'italy-serie-a', 'france-ligue-1', 'netherlands-eredivisie',
    'portugal-primeira-liga', 'brazil-serie-a', 'brazil-serie-b',
    'argentina-primera-division', 'usa-mls', 'mexico-liga-mx',
    'champions-league', 'europa-league', 'conference-league',
    'england-championship', 'scotland-premiership', 'turkey-super-lig',
    'greece-super-league', 'belgium-first-division-a',
];

const REST_BASE = 'https://api.odds-api.io/v3';
const WS_BASE   = 'wss://api.odds-api.io/v3/ws';

// ── CORES ANSI ────────────────────────────────────────────────
const c = {
    cyan:    s => `\x1b[36m${s}\x1b[0m`,
    magenta: s => `\x1b[35m${s}\x1b[0m`,
    green:   s => `\x1b[32m${s}\x1b[0m`,
    yellow:  s => `\x1b[33m${s}\x1b[0m`,
    red:     s => `\x1b[31m${s}\x1b[0m`,
    dim:     s => `\x1b[2m${s}\x1b[0m`,
    bold:    s => `\x1b[1m${s}\x1b[0m`,
};

// ── ESTADO ────────────────────────────────────────────────────
const matches = new Map();
let updateCount = 0;
let reconnectAttempts = 0;

// ── DISPLAY ───────────────────────────────────────────────────
function clearScreen() {
    process.stdout.write('\x1B[2J\x1B[0;0H');
}

function fmtOdd(v) {
    const f = parseFloat(v);
    if (isNaN(f)) return '  –  ';
    const color = f < 2.0 ? c.green : f < 3.5 ? c.yellow : c.red;
    return color(f.toFixed(2));
}

function pad(str, len) {
    return String(str ?? '').substring(0, len).padEnd(len);
}

function printMatches() {
    clearScreen();
    const now = new Date().toLocaleString('pt-BR');
    const w   = 80;
    console.log(c.cyan('='.repeat(w)));
    console.log(c.cyan('  ODDS MONITOR 1x2 (ML) - Futebol [Node.js]'));
    console.log(c.cyan(`  ${now}  |  Updates: ${updateCount}`));
    console.log(c.cyan('='.repeat(w)));

    if (matches.size === 0) {
        console.log(c.yellow('\n  Aguardando dados da API...\n'));
        return;
    }

    // Agrupa por liga
    const byLeague = {};
    for (const m of matches.values()) {
        (byLeague[m.liga] ??= []).push(m);
    }

    let total = 0;
    for (const [liga, games] of Object.entries(byLeague).sort()) {
        console.log();
        console.log(c.magenta(`  [${liga.toUpperCase()}]`));
        console.log(c.dim(`  ${'ID'.padEnd(12)} ${'JOGO'.padEnd(33)} ${'BOOKIE'.padEnd(13)} ${'CASA'.padEnd(7)} ${'X'.padEnd(7)} ${'FORA'.padEnd(7)} STATUS`));
        console.log(c.dim('  ' + '-'.repeat(76)));

        games.sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''));
        for (const g of games) {
            const ml     = g.ml ?? {};
            const id     = pad(g.id, 11);
            const jogo   = pad(`${g.home ?? '?'} x ${g.away ?? '?'}`, 32);
            const bk     = pad(g.bookie, 12);
            const isLive = g.status === 'live';
            const status = isLive ? c.red('AO VIVO') : c.dim('PRE-JOGO');
            console.log(
                `  ${id} ${jogo} ${bk} ${fmtOdd(ml.home).padEnd(7)} ${fmtOdd(ml.draw).padEnd(7)} ${fmtOdd(ml.away).padEnd(7)} ${status}`
            );
            total++;
        }
    }

    console.log();
    console.log(c.cyan('='.repeat(w)));
    console.log(`  Total: ${c.yellow(String(total))} | Ctrl+C para sair`);
    console.log(c.cyan('='.repeat(w)));
}

// ── PARSING ────────────────────────────────────────────────────
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
        const name = ev.name ?? '';
        const sep  = name.includes(' vs ') ? ' vs ' : ' - ';
        const pts  = name.split(sep, 2);
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

// ── REST SNAPSHOT ──────────────────────────────────────────────
function fetchSnapshot(apiKey) {
    return new Promise(resolve => {
        console.log(c.yellow('  Buscando snapshot inicial via REST...'));
        const params = new URLSearchParams({
            apiKey, sport: 'football',
            leagues: LEAGUES.join(','), markets: 'ML',
        });
        const url = `${REST_BASE}/odds?${params}`;
        https.get(url, res => {
            let raw = '';
            res.on('data', d => raw += d);
            res.on('end', () => {
                try {
                    const data   = JSON.parse(raw);
                    const events = Array.isArray(data) ? data : (data.data ?? data.events ?? []);
                    events.forEach(ev => {
                        const eid = String(ev.id ?? '');
                        if (!eid) return;
                        const { home, away } = parseTeams(ev);
                        const ml = parseML(ev.markets ?? ev.odds ?? []);
                        matches.set(eid, {
                            id: eid, home, away,
                            starts_at: ev.starts_at ?? ev.start_time ?? '',
                            status: ev.status ?? 'prematch',
                            liga: parseLeague(ev),
                            bookie: ev.bookmaker ?? ev.bookie ?? '',
                            ml: ml ?? {},
                        });
                    });
                    console.log(c.green(`  Snapshot OK: ${events.length} eventos`));
                } catch (e) {
                    console.log(c.yellow(`  Snapshot falhou: ${e.message}`));
                }
                resolve();
            });
        }).on('error', e => {
            console.log(c.yellow(`  Snapshot falhou: ${e.message}`));
            resolve();
        });
    });
}

// ── WEBSOCKET ──────────────────────────────────────────────────
function buildWsUrl(apiKey) {
    const p = new URLSearchParams({
        apiKey, sport: 'football',
        leagues: LEAGUES.join(','), markets: 'ML',
    });
    return `${WS_BASE}?${p}`;
}

function connect(apiKey) {
    console.log(c.cyan(`  Conectando ao WebSocket... (tentativa ${reconnectAttempts + 1})`));
    const ws = new WebSocket(buildWsUrl(apiKey));

    ws.on('open', () => {
        reconnectAttempts = 0;
        console.log(c.green('  WebSocket conectado!'));
        printMatches();
    });

    ws.on('message', raw => {
        let data;
        try { data = JSON.parse(raw); } catch { return; }

        const type = data.type;
        const eid  = String(data.id ?? '');

        if (type === 'welcome') {
            console.log(c.green(`  ${data.message}`));
            if (data.warning) console.log(c.yellow(`  AVISO: ${data.warning}`));
            return;
        }

        if (!eid) return;

        if (type === 'deleted') {
            matches.delete(eid);
            printMatches();
            return;
        }

        if (type === 'created' || type === 'updated') {
            const ml = parseML(data.markets);
            if (!ml) return;
            updateCount++;

            if (!matches.has(eid)) {
                const { home, away } = parseTeams(data);
                matches.set(eid, {
                    id: eid, home, away,
                    starts_at: data.starts_at ?? '',
                    status: data.status ?? 'prematch',
                    liga: parseLeague(data),
                    bookie: data.bookie ?? '',
                    ml,
                });
            } else {
                const m  = matches.get(eid);
                m.ml     = ml;
                m.status = data.status ?? m.status;
                m.bookie = data.bookie ?? m.bookie;
            }
            printMatches();
        }
    });

    ws.on('close', (code) => {
        console.log(c.yellow(`  Desconectado (code=${code})`));
        reconnectAttempts++;
        if (reconnectAttempts > 10) { console.log(c.red('  Máximo de tentativas.')); process.exit(1); }
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 60000);
        console.log(c.yellow(`  Reconectando em ${delay / 1000}s...`));
        setTimeout(() => connect(apiKey), delay);
    });

    ws.on('error', err => {
        console.log(c.red(`  Erro WebSocket: ${err.message}`));
    });
}

// ── MAIN ──────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const keyIdx = args.findIndex(a => a === '--key' || a === '-k');
const apiKey = keyIdx !== -1 ? args[keyIdx + 1] : process.env.ODDS_API_KEY;

if (!apiKey) {
    console.log(c.red('\n  API Key não informada!'));
    console.log('  Uso: node odds_monitor.js --key SUA_API_KEY');
    console.log('  Ou:  ODDS_API_KEY=SUA_KEY node odds_monitor.js');
    process.exit(1);
}

console.log(c.cyan('\n' + '='.repeat(60)));
console.log(c.cyan('  ODDS MONITOR [Node.js] — Iniciando'));
console.log(c.cyan('='.repeat(60)));
console.log(`  Key: ${apiKey.substring(0, 6)}${'*'.repeat(Math.max(0, apiKey.length - 6))}`);
console.log(`  Ligas: ${LEAGUES.length} | Mercado: ML (1x2)\n`);

process.on('SIGINT', () => { console.log(c.yellow('\n  Encerrado.')); process.exit(0); });

(async () => {
    await fetchSnapshot(apiKey);
    printMatches();
    connect(apiKey);
})();
