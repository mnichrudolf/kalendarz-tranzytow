# Kalendarz Tranzytów (Warszawa)

Strona z dziennymi tranzytami (widok „Dzień"), tygodniami i miesiącami, na 3 lata do przodu.
Wszystko liczone z efemeryd Swiss Ephemeris dla czasu Europe/Warsaw.

## Co jest w środku

- `docs/index.html` – gotowa strona (jeden plik, działa wszędzie).
- `generate.py` – liczy efemerydy i zapisuje `data.json`.
- `build.py` – wkleja dane do `template.html` i tworzy `docs/index.html`.
- `.github/workflows/odswiez.yml` – co miesiąc sam uruchamia generate + build i przesuwa okno 3 lat.

## Linki do konkretnych dni

Adres kończący się na `#dzien-2026-11-03`, `#tydzien-2026-11-02` lub `#miesiac-2026-11` otwiera dany widok.

## Ręczne przeliczenie

```
pip install pyswisseph fonttools brotli
python generate.py
python build.py
```

Dokładność: pozycje Moshier (Swiss Ephemeris), kontrola z niezależną biblioteką: aspekty ±0,01°, fazy ±1 min.
Czcionka symboli (planety, znaki) to podzbiór DejaVu Sans (licencja Bitstream Vera, swobodna).
