"""
Odds API - Monitor 1x2 (ML) Futebol via WebSocket
==================================================
Instalacao:
    pip install websocket-client requests colorama

Uso:
    python odds_terminal.py --key SUA_API_KEY
    # ou
    set ODDS_API_KEY=SUA_API_KEY
    python odds_terminal.py
"""

import websocket
import json
import os
import sys
import time
import threading
import argparse
import requests
from datetime import datetime
from collections import defaultdict

try:
    from colorama import init, Fore, Style
    init(autoreset=True)
except ImportError:
    class Fore:
        CYAN = GREEN = YELLOW = RED = MAGENTA = WHITE = ""
        RESET = ""
    class Style:
        BRIGHT = DIM = RESET_ALL = ""

# ===========================================================================
# Config: ate 20 ligas (limite da API)
# ===========================================================================
FOOTBALL_LEAGUES = [
    "england-premier-league", "spain-la-liga", "germany-bundesliga",
    "italy-serie-a", "france-ligue-1", "netherlands-eredivisie",
    "portugal-primeira-liga", "brazil-serie-a", "brazil-serie-b",
    "argentina-primera-division", "usa-mls", "mexico-liga-mx",
    "champions-league", "europa-league", "conference-league",
    "england-championship", "scotland-premiership", "turkey-super-lig",
    "greece-super-league", "belgium-first-division-a",
]

BASE_REST = "https://api.odds-api.io/v3"
WS_URL    = "wss://api.odds-api.io/v3/ws"

# ===========================================================================
# Estado global
# ===========================================================================
matches      = {}
lock         = threading.Lock()
update_count = 0


def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")


def fmt_odd(v):
    try:
        f = float(v)
        c = Fore.GREEN if f < 2.0 else (Fore.YELLOW if f < 3.0 else Fore.RED)
        return f"{c}{Style.BRIGHT}{f:.2f}{Style.RESET_ALL}"
    except Exception:
        return str(v) if v else "  -  "


def print_matches():
    clear_screen()
    now = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    w = 80
    print(Fore.CYAN + Style.BRIGHT + "=" * w)
    print(Fore.CYAN + "  ODDS MONITOR 1x2 (ML) - Futebol")
    print(Fore.CYAN + f"  {now}  |  Updates recebidos: {update_count}")
    print(Fore.CYAN + Style.BRIGHT + "=" * w)

    with lock:
        snap = dict(matches)

    if not snap:
        print(Fore.YELLOW + "\n  Aguardando dados da API...\n")
        return

    by_league = defaultdict(list)
    for m in snap.values():
        by_league[m.get("liga", "Outras")].append(m)

    total = 0
    for liga, games in sorted(by_league.items()):
        print()
        print(Fore.MAGENTA + Style.BRIGHT + f"  [{liga.upper()}]")
        print(Fore.WHITE + f"  {'ID':<12} {'JOGO':<32} {'BOOKIE':<12} {'CASA':>6} {'X':>6} {'FORA':>6} {'STATUS'}")
        print(Fore.WHITE + "  " + "-" * 76)
        for g in sorted(games, key=lambda x: x.get("starts_at", "")):
            ml  = g.get("ml", {})
            eid = str(g.get("id", ""))[:11]
            jogo = f"{g.get('home','?')[:15]} x {g.get('away','?')[:15]}"[:31]
            bk  = str(g.get("bookie", ""))[:11]
            st  = g.get("status", "")
            sc  = Fore.RED if st == "live" else Fore.WHITE
            sl  = sc + ("AO VIVO" if st == "live" else "PRE-JOGO")
            print(
                f"  {Fore.WHITE}{eid:<12} {jogo:<32} {Fore.CYAN}{bk:<12} "
                f"{fmt_odd(ml.get('home')):>6} {fmt_odd(ml.get('draw')):>6} "
                f"{fmt_odd(ml.get('away')):>6} {sl}"
            )
            total += 1

    print()
    print(Fore.CYAN + "=" * w)
    print(Fore.WHITE + f"  Total de jogos: {Fore.YELLOW}{total}  {Fore.WHITE}| Ctrl+C para sair")
    print(Fore.CYAN + "=" * w)


def display_loop():
    while True:
        try:
            print_matches()
        except Exception:
            pass
        time.sleep(2)


# ===========================================================================
# Snapshot REST inicial
# ===========================================================================
def fetch_snapshot(api_key):
    print(Fore.YELLOW + "  Buscando snapshot inicial via REST...")
    try:
        r = requests.get(
            f"{BASE_REST}/odds",
            params={
                "apiKey": api_key,
                "sport": "football",
                "leagues": ",".join(FOOTBALL_LEAGUES),
                "markets": "ML",
            },
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        events = data if isinstance(data, list) else data.get("data", data.get("events", []))
        with lock:
            for ev in events:
                _ingest_rest(ev)
        print(Fore.GREEN + f"  Snapshot OK: {len(events)} eventos carregados\n")
    except Exception as e:
        print(Fore.YELLOW + f"  Snapshot falhou ({e}). Aguardando WebSocket...\n")


def _parse_teams(ev):
    home = away = ""
    parts = ev.get("participants", ev.get("teams", []))
    if isinstance(parts, list) and len(parts) >= 2:
        home = (parts[0].get("name") if isinstance(parts[0], dict) else parts[0]) or ""
        away = (parts[1].get("name") if isinstance(parts[1], dict) else parts[1]) or ""
    if not home:
        home = ev.get("home_team", ev.get("home", ""))
    if not away:
        away = ev.get("away_team", ev.get("away", ""))
    if not home and not away:
        name = ev.get("name", "")
        sep = " vs " if " vs " in name else " - "
        p = name.split(sep, 1)
        if len(p) == 2:
            home, away = p[0].strip(), p[1].strip()
    return home, away


def _parse_league(ev):
    lg = ev.get("league", "")
    if isinstance(lg, dict):
        return lg.get("slug", lg.get("name", "outras"))
    return ev.get("league_slug", lg or "outras")


def _parse_ml(markets):
    for m in markets:
        if m.get("name", "").upper() == "ML":
            odds = m.get("odds", [{}])
            if odds:
                return {
                    "home": odds[0].get("home"),
                    "draw": odds[0].get("draw"),
                    "away": odds[0].get("away"),
                }
    return {}


def _ingest_rest(ev):
    eid = str(ev.get("id", ""))
    if not eid:
        return
    home, away = _parse_teams(ev)
    ml = _parse_ml(ev.get("markets", ev.get("odds", [])))
    matches[eid] = {
        "id": eid, "home": home, "away": away,
        "starts_at": ev.get("starts_at", ev.get("start_time", "")),
        "status": ev.get("status", "prematch"),
        "liga": _parse_league(ev),
        "bookie": ev.get("bookmaker", ev.get("bookie", "")),
        "ml": ml,
    }


# ===========================================================================
# WebSocket handlers
# ===========================================================================
def on_open(ws):
    print(Fore.GREEN + "  WebSocket conectado!")


def on_message(ws, message):
    global update_count
    try:
        data = json.loads(message)
    except Exception:
        return

    t = data.get("type", "")
    if t == "welcome":
        print(Fore.GREEN + f"  {data.get('message', 'Bem-vindo!')}")
        if data.get("warning"):
            print(Fore.YELLOW + f"  AVISO: {data['warning']}")
        return

    eid = str(data.get("id", ""))
    if not eid:
        return

    with lock:
        if t == "deleted":
            matches.pop(eid, None)
            return
        if t in ("created", "updated"):
            ml = _parse_ml(data.get("markets", []))
            if not ml:
                return
            update_count += 1
            if eid not in matches:
                home, away = _parse_teams(data)
                matches[eid] = {
                    "id": eid, "home": home, "away": away,
                    "starts_at": data.get("starts_at", ""),
                    "status": data.get("status", "prematch"),
                    "liga": _parse_league(data),
                    "bookie": data.get("bookie", ""),
                    "ml": ml,
                }
            else:
                matches[eid]["ml"] = ml
                matches[eid]["status"] = data.get("status", matches[eid].get("status", ""))
                matches[eid]["bookie"] = data.get("bookie", matches[eid].get("bookie", ""))


def on_error(ws, error):
    print(Fore.RED + f"  Erro WebSocket: {error}")


def on_close(ws, code, msg):
    print(Fore.YELLOW + f"  WebSocket desconectado (code={code})")


def connect_ws(api_key):
    url = (
        f"{WS_URL}?apiKey={api_key}"
        f"&sport=football"
        f"&leagues={','.join(FOOTBALL_LEAGUES)}"
        f"&markets=ML"
    )
    attempt = 0
    while True:
        try:
            ws = websocket.WebSocketApp(
                url,
                on_open=on_open,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close,
            )
            ws.run_forever(ping_interval=30, ping_timeout=10)
        except KeyboardInterrupt:
            sys.exit(0)
        except Exception as e:
            print(Fore.RED + f"  Erro conexao: {e}")

        attempt += 1
        delay = min(2 ** attempt, 60)
        print(Fore.YELLOW + f"  Reconectando em {delay}s... (tentativa {attempt})")
        time.sleep(delay)


# ===========================================================================
# Main
# ===========================================================================
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--key", "-k", default=None)
    args = parser.parse_args()

    api_key = args.key or os.environ.get("ODDS_API_KEY")
    if not api_key:
        print(Fore.RED + "\nAPI Key nao encontrada!")
        print("Use: python odds_terminal.py --key SUA_API_KEY")
        print("Ou:  set ODDS_API_KEY=SUA_API_KEY")
        sys.exit(1)

    print(Fore.CYAN + "\n" + "=" * 60)
    print(Fore.CYAN + "  ODDS MONITOR - Iniciando")
    print(Fore.CYAN + "=" * 60)
    print(f"  Key: {api_key[:6]}{'*'*max(0,len(api_key)-6)}")
    print(f"  Ligas: {len(FOOTBALL_LEAGUES)} | Mercado: ML (1x2)\n")

    fetch_snapshot(api_key)

    t = threading.Thread(target=display_loop, daemon=True)
    t.start()

    print(Fore.CYAN + "  Conectando ao WebSocket...")
    try:
        connect_ws(api_key)
    except KeyboardInterrupt:
        print(Fore.YELLOW + "\n  Encerrado.")
        sys.exit(0)


if __name__ == "__main__":
    main()
