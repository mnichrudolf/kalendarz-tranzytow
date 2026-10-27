#!/usr/bin/env python3
"""
Generator danych dla "Kalendarza Tranzytów" (Warszawa, Europe/Warsaw).

Liczy z efemeryd Swiss Ephemeris (tryb Moshier, bez plików zewnętrznych):
  - ingresy (wejścia planet i Księżyca w znaki),
  - dokładne aspekty (0, 60, 90, 120, 180) między Słońcem, Księżycem i planetami,
  - stacje planet (początek / koniec retrogradacji),
  - fazy Księżyca (nów, pierwsza kwadra, pełnia, ostatnia kwadra) + zaćmienia,
  - Księżyc bez kursu (void of course),
  - pozycje dzienne (godz. 12:00 czasu warszawskiego).

Okno danych przesuwa się samo: od początku poprzedniego miesiąca do końca
miesiąca za 36 miesięcy od dziś. Użycie:
    python3 generate.py                # okno liczone względem dzisiejszej daty
    python3 generate.py 2026-10-26     # okno liczone względem podanej daty
Wynik: data.json (kompaktowy) obok skryptu.
"""
import json, sys, datetime as dt
from zoneinfo import ZoneInfo
import swisseph as swe

TZ = ZoneInfo("Europe/Warsaw")
FL = swe.FLG_MOSEPH | swe.FLG_SPEED
GEO = (21.0122, 52.2297, 100.0)  # Warszawa (dł., szer., wys.)
STEP = 30.0 / 1440.0             # krok skanowania: 30 minut
SUN, MOON, MERC, VEN, MARS, JUP, SAT, URA, NEP, PLU = range(10)
NODE_IDX = 10
BODIES = list(range(10))
ASPECTS = [0, 60, -60, 90, -90, 120, -120, 180]  # znak = kierunek różnicy


def n180(x):
    return (x + 180.0) % 360.0 - 180.0


def lon_speed(jd, b):
    ipl = swe.TRUE_NODE if b == NODE_IDX else b
    r = swe.calc_ut(jd, ipl, FL)[0]
    return r[0], r[3]


def lon(jd, b):
    return lon_speed(jd, b)[0]


def to_min(jd):
    """JD (UT) -> minuty uniksowe (zaokrąglone)."""
    return int(round((jd - 2440587.5) * 1440.0))


def bisect(f, a, b, it=28):
    fa = f(a)
    for _ in range(it):
        m = (a + b) / 2
        fm = f(m)
        if (fa <= 0) == (fm <= 0):
            a, fa = m, fm
        else:
            b = m
    return (a + b) / 2


def jd_of(d):  # data lokalna 12:00 -> JD UT
    t = dt.datetime(d.year, d.month, d.day, 12, 0, tzinfo=TZ).astimezone(dt.timezone.utc)
    return swe.julday(t.year, t.month, t.day, t.hour + t.minute / 60.0)


def jd_midnight(d):
    t = dt.datetime(d.year, d.month, d.day, 0, 0, tzinfo=TZ).astimezone(dt.timezone.utc)
    return swe.julday(t.year, t.month, t.day, t.hour + t.minute / 60.0)


def main():
    today = dt.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else dt.date.today()
    # okno publikowane
    first = (today.replace(day=1) - dt.timedelta(days=1)).replace(day=1)  # pocz. poprzedniego miesiąca
    m = today.month - 1 + 36
    ey, em = today.year + m // 12, m % 12 + 1
    last = (dt.date(ey + (em == 12), em % 12 + 1, 1)) - dt.timedelta(days=1)  # koniec miesiąca +36
    # okno liczone (zapas na klastry aspektów i VoC)
    calc_first = first - dt.timedelta(days=330)
    calc_last = last + dt.timedelta(days=40)
    jd0 = jd_midnight(calc_first)
    jd1 = jd_midnight(calc_last)
    n = int((jd1 - jd0) / STEP) + 2

    # --- skan długości i prędkości ---
    jds = [jd0 + i * STEP for i in range(n)]
    L = {b: [] for b in BODIES}
    V = {b: [] for b in BODIES}
    for jd in jds:
        for b in BODIES:
            l, v = lon_speed(jd, b)
            L[b].append(l)
            V[b].append(v)

    events = []
    moon_asp = []  # wszystkie aspekty Księżyca (do VoC), (jd, body)

    # --- ingresy ---
    for b in BODIES:
        for i in range(n - 1):
            s0, s1 = int(L[b][i] // 30), int(L[b][i + 1] // 30)
            if s0 != s1:
                # znak się zmienił; ustal granicę
                edge = (max(s0, s1) % 12) * 30.0 if abs(s0 - s1) < 6 else 0.0
                def f(jd, b=b, edge=edge):
                    return n180(lon(jd, b) - edge)
                t = bisect(f, jds[i], jds[i + 1])
                retro = 1 if V[b][i] < 0 else 0
                newsign = int(((lon(t + 1e-4, b)) // 30) % 12)
                events.append([to_min(t), "I", b, newsign, retro, 0])

    # --- aspekty ---
    asp_hits = []  # (jd, i, j, angle)
    for ia in range(len(BODIES)):
        for ib in range(ia + 1, len(BODIES)):
            a, b = BODIES[ia], BODIES[ib]
            for A in ASPECTS:
                if A == 0:
                    pass
                prev = n180(L[b][0] - L[a][0] - A)
                for i in range(1, n):
                    cur = n180(L[b][i] - L[a][i] - A)
                    if (prev <= 0) != (cur <= 0) and abs(prev) < 5 and abs(cur) < 5:
                        def f(jd, a=a, b=b, A=A):
                            return n180(lon(jd, b) - lon(jd, a) - A)
                        t = bisect(f, jds[i - 1], jds[i])
                        asp_hits.append((t, a, b, abs(A)))
                    prev = cur

    # Słońce–Księżyc: 0/90/180 to fazy, nie aspekty
    out_hits = []
    for t, a, b, A in asp_hits:
        if a == SUN and b == MOON and A in (0, 90, 180):
            moon_asp.append(t)
            continue
        if b == MOON or a == MOON:
            moon_asp.append(t)
        out_hits.append((t, a, b, A))
    # a<b i MOON=1: pary (SUN,MOON) -> a=0,b=1. OK.

    # klastry kontaktów (retrogradacje) dla par obu planet >= Mars
    out_hits.sort()
    groups = {}
    for t, a, b, A in out_hits:
        if a >= MARS and b >= MARS:
            groups.setdefault((a, b, A), []).append(t)
    pass_info = {}
    for key, ts in groups.items():
        ts.sort()
        clusters, cur = [], [ts[0]]
        for t in ts[1:]:
            if t - cur[-1] < 250:
                cur.append(t)
            else:
                clusters.append(cur)
                cur = [t]
        clusters.append(cur)
        for c in clusters:
            for k, t in enumerate(c):
                pass_info[(key, t)] = (k + 1, len(c))
    for t, a, b, A in out_hits:
        k, N = pass_info.get(((a, b, A), t), (0, 0))
        if N == 1:
            k = N = 0
        events.append([to_min(t), "A", a, b, A, k, N])

    # --- stacje ---
    for b in range(MERC, PLU + 1):
        for i in range(1, n):
            if (V[b][i - 1] <= 0) != (V[b][i] <= 0):
                def f(jd, b=b):
                    return lon_speed(jd, b)[1]
                t = bisect(f, jds[i - 1], jds[i])
                is_retro = 1 if V[b][i - 1] > 0 else 0
                events.append([to_min(t), "S", b, is_retro, int(round((lon(t, b) % 360) * 10)) % 3600])

    # --- fazy Księżyca ---
    def elong(jd):
        return (lon(jd, MOON) - lon(jd, SUN)) % 360.0
    for k, target in enumerate((0, 90, 180, 270)):
        for i in range(1, n):
            e0 = n180(elong(jds[i - 1]) - target)
            e1 = n180(elong(jds[i]) - target)
            if (e0 <= 0) != (e1 <= 0) and abs(e0) < 5 and abs(e1) < 5:
                def f(jd, target=target):
                    return n180(elong(jd) - target)
                t = bisect(f, jds[i - 1], jds[i])
                ecl, vis = 0, 0
                if k in (0, 2):
                    ecl, vis = eclipse_info(t, solar=(k == 0))
                events.append([to_min(t), "P", k, ecl, vis, int(round((lon(t, MOON) % 360) * 10)) % 3600])

    # --- Księżyc bez kursu ---
    moon_ing = sorted(e for e in events if e[1] == "I" and e[2] == MOON)
    moon_asp.sort()
    moon_asp_min = [to_min(t) for t in moon_asp]
    for idx, e in enumerate(moon_ing):
        t_end = e[0]
        t_prev_ing = moon_ing[idx - 1][0] if idx else t_end - 3 * 1440
        cand = [x for x in moon_asp_min if t_prev_ing <= x < t_end]
        start = cand[-1] if cand else t_prev_ing
        events.append([start, "V", t_end, 0, 0, 0])

    # --- pozycje dzienne ---
    days = []
    d = first
    while d <= last:
        jd = jd_of(d)
        row = []
        for b in BODIES + [NODE_IDX]:
            l, v = lon_speed(jd, b)
            row.append((int(round((l % 360) * 100)) % 36000) * 10 + (1 if v < 0 else 0))
        days.append(row)
        d += dt.timedelta(days=1)

    # --- przycinanie i zapis ---
    lo = to_min(jd_midnight(first - dt.timedelta(days=4)))
    hi = to_min(jd_midnight(last + dt.timedelta(days=2)))
    events = [e for e in events if lo <= e[0] <= hi]
    events.sort(key=lambda e: (e[0], e[1]))
    data = {
        "generated": today.isoformat(),
        "first": first.isoformat(),
        "last": last.isoformat(),
        "place": "Warszawa",
        "events": events,
        "pos": days,
    }
    with open("data.json", "w", encoding="utf-8") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(f"okno {first} .. {last}, zdarzeń: {len(events)}, dni: {len(days)}")


def eclipse_info(t, solar):
    """Zwraca (typ, widoczne_w_Warszawie). typ: 0 brak, 1 częściowe, 2 całkowite, 3 obrączkowe, 4 półcieniowe, 5 hybrydowe."""
    try:
        if solar:
            ret, tr = swe.sol_eclipse_when_glob(t - 2.0, swe.FLG_MOSEPH)
            if abs(tr[0] - t) > 1.0:
                return 0, 0
            typ = 2 if ret & swe.ECL_TOTAL else 3 if ret & swe.ECL_ANNULAR else 5 if ret & swe.ECL_ANNULAR_TOTAL else 1
            try:
                r2, tr2, attr = swe.sol_eclipse_when_loc(t - 2.0, GEO, swe.FLG_MOSEPH)
                vis = 1 if (abs(tr2[0] - t) < 1.0 and attr[0] > 0 and attr[5] > 0) else 0
            except Exception:
                vis = 0
            return typ, vis
        else:
            ret, tr = swe.lun_eclipse_when(t - 2.0, swe.FLG_MOSEPH)
            if abs(tr[0] - t) > 1.0:
                return 0, 0
            typ = 2 if ret & swe.ECL_TOTAL else 1 if ret & swe.ECL_PARTIAL else 4
            r2, attr = swe.lun_eclipse_how(tr[0], GEO, swe.FLG_MOSEPH)
            vis = 1 if attr[5] > 0 else 0
            return typ, vis
    except Exception:
        return 0, 0


if __name__ == "__main__":
    main()
