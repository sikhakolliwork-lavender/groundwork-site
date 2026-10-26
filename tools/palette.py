"""Derive the Groundwork palette from requirements instead of taste.

Requirements (see design/DESIGN.md, "Colour"):
  1. Body text >= 7:1 (WCAG AAA) and APCA Lc >= 75 in both modes. Muted text >= 4.5:1.
  2. The graph's two note types (metric, decision) stay distinguishable under normal vision and
     simulated protanopia, deuteranopia and tritanopia (Machado et al. 2009, full severity).
  3. Every graph mark >= 3:1 against its background (WCAG 1.4.11, non-text contrast).
  4. Light and dark share hues; only OKLCH lightness/chroma move, so both read as one identity.
  5. Chromatic colour is reserved for data. UI chrome is neutral "ink and paper".

Run:  python3 tools/palette.py            -> prints the search result and a validation report
      python3 tools/palette.py --json     -> machine-readable palette
"""
import itertools, json, math, sys

# ---------- colour maths ----------
def srgb_to_lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lin_to_srgb(c): return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055

def lin_to_oklab(r, g, b):
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = (math.copysign(abs(v) ** (1 / 3), v) for v in (l, m, s))
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)

def oklab_to_lin(L, a, b):
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)

def oklch_to_lin(L, C, h):
    return oklab_to_lin(L, C * math.cos(math.radians(h)), C * math.sin(math.radians(h)))

def in_gamut(lin): return all(-1e-4 <= v <= 1 + 1e-4 for v in lin)

def max_chroma(L, h, cap=0.4):
    lo, hi = 0.0, cap
    for _ in range(30):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if in_gamut(oklch_to_lin(L, mid, h)) else (lo, mid)
    return lo

def lin_to_hex(lin):
    return "#" + "".join(f"{round(max(0, min(1, lin_to_srgb(max(0, min(1, v))))) * 255):02x}" for v in lin)

def hex_to_lin(hx):
    hx = hx.lstrip("#"); return tuple(srgb_to_lin(int(hx[i:i + 2], 16) / 255) for i in (0, 2, 4))

# ---------- contrast ----------
def rel_lum(lin): return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
def wcag(a, b):
    la, lb = sorted((rel_lum(a), rel_lum(b)), reverse=True); return (la + 0.05) / (lb + 0.05)

def apca(text_lin, bg_lin):
    """APCA 0.0.98G-4g lightness contrast Lc (absolute value)."""
    def Y(lin):
        rgb = [lin_to_srgb(max(0.0, min(1.0, v))) for v in lin]
        y = sum(k * (c ** 2.4) for k, c in zip((0.2126729, 0.7151522, 0.0721750), rgb))
        return y + (0.022 - y) ** 1.414 if y < 0.022 else y
    yt, yb = Y(text_lin), Y(bg_lin)
    if yb > yt:   # dark text on light
        s = (yb ** 0.56 - yt ** 0.57) * 1.14
        return 0.0 if s < 0.1 else (s - 0.027) * 100
    s = (yb ** 0.65 - yt ** 0.62) * 1.14
    return 0.0 if s > -0.1 else abs((s + 0.027) * 100)

# ---------- colour-vision deficiency (Machado 2009, severity 1.0, linear RGB) ----------
CVD = {
    "protan": ((0.152286, 1.052583, -0.204868), (0.114503, 0.786281, 0.099216), (-0.003882, -0.048116, 1.051998)),
    "deutan": ((0.367322, 0.860646, -0.227968), (0.280085, 0.672501, 0.047413), (-0.011820, 0.042940, 0.968881)),
    "tritan": ((1.255528, -0.076749, -0.178779), (-0.078411, 0.930809, 0.147602), (0.004733, 0.691367, 0.303900)),
}
def simulate(lin, kind):
    if kind == "normal": return lin
    M = CVD[kind]; return tuple(max(0, min(1, sum(M[i][j] * lin[j] for j in range(3)))) for i in range(3))

def de_ok(a, b):  # OKLab distance x100; ~2 is a just-noticeable difference
    A, B = lin_to_oklab(*a), lin_to_oklab(*b)
    return 100 * math.dist(A, B)

VISIONS = ("normal", "protan", "deutan", "tritan")
def min_de(a, b): return min(de_ok(simulate(a, v), simulate(b, v)) for v in VISIONS)

# ---------- fixed neutrals: ink and paper ----------
NEUTRAL_H, NEUTRAL_C = 255, 0.012          # a faint cool tint; reads as ink, never as "a colour"
MODES = {
    # bg L: light avoids pure-white glare; dark avoids pure black (halation, smearing for astigmatic readers)
    "light": dict(bg=(0.975, 0.004), surface=(0.995, 0.002), fg=(0.235, 0.018), muted=(0.47, 0.016), line=(0.88, 0.008)),
    "dark":  dict(bg=(0.185, 0.014), surface=(0.225, 0.016), fg=(0.935, 0.008), muted=(0.79, 0.012), line=(0.32, 0.016)),
}
def neutral(mode, key):
    L, C = MODES[mode][key]; return oklch_to_lin(L, C, NEUTRAL_H)

# ---------- search: two data hues shared across modes ----------
def best_for(mode, hA, hB, bg):
    """Choose L (and max in-gamut chroma, capped) per hue for one mode; maximise the worst-case separation."""
    other = neutral(mode, "muted")
    Ls = [x / 100 for x in (range(40, 66) if mode == "light" else range(64, 90))]
    best = None
    for LA, LB in itertools.product(Ls, Ls):
        cA, cB = min(0.17, max_chroma(LA, hA)), min(0.17, max_chroma(LB, hB))
        if cA < 0.08 or cB < 0.08: continue                       # must read as clearly chromatic
        A, B = oklch_to_lin(LA, cA, hA), oklch_to_lin(LB, cB, hB)
        if min(wcag(A, bg), wcag(B, bg)) < 3.0: continue          # requirement 3
        sep = min_de(A, B)
        sep_other = min(min_de(A, other), min_de(B, other))       # data must not look like a grey "other" note
        score = min(sep, 1.6 * sep_other)
        if not best or score > best[0]: best = (score, sep, sep_other, (LA, cA), (LB, cB))
    return best

def search():
    results = []
    for hA in range(200, 300, 5):          # cool family candidates
        for hB in range(20, 110, 5):       # warm family candidates
            per = {m: best_for(m, hA, hB, neutral(m, "bg")) for m in MODES}
            if any(v is None for v in per.values()): continue
            results.append((min(per[m][0] for m in MODES), hA, hB, per))
    results.sort(key=lambda r: r[0], reverse=True)
    return results

def report(hA, hB, per):
    out = {"neutral": {}, "data": {}, "checks": []}
    for m in MODES:
        bg = neutral(m, "bg")
        out["neutral"][m] = {k: lin_to_hex(neutral(m, k)) for k in MODES[m]}
        (LA, cA), (LB, cB) = per[m][3], per[m][4]
        A, B = oklch_to_lin(LA, cA, hA), oklch_to_lin(LB, cB, hB)
        # link/label colour: the cool data hue, pushed to >= 7:1 so it can carry text
        Ls = [x / 1000 for x in (range(600, 200, -5) if m == "light" else range(700, 980, 5))]
        lc_min = 75 if m == "light" else 60     # APCA: light-on-dark scores lower, so the floor differs by polarity
        link = next(c for c in (oklch_to_lin(L, min(0.14, max_chroma(L, hA)), hA) for L in Ls)
                    if wcag(c, bg) >= 7 and apca(c, bg) >= lc_min)
        out["data"][m] = {"metric": lin_to_hex(A), "decision": lin_to_hex(B), "link": lin_to_hex(link),
                          "metric_oklch": f"oklch({LA:.2f} {cA:.3f} {hA})", "decision_oklch": f"oklch({LB:.2f} {cB:.3f} {hB})"}
        fg, mu, sf = neutral(m, "fg"), neutral(m, "muted"), neutral(m, "surface")
        out["checks"] += [
            (m, "body text on bg", f"{wcag(fg, bg):.1f}:1", f"Lc {apca(fg, bg):.0f}"),
            (m, "body text on surface", f"{wcag(fg, sf):.1f}:1", f"Lc {apca(fg, sf):.0f}"),
            (m, "muted text on bg", f"{wcag(mu, bg):.1f}:1", f"Lc {apca(mu, bg):.0f}"),
            (m, "link text on bg", f"{wcag(link, bg):.1f}:1", f"Lc {apca(link, bg):.0f}"),
            (m, "button label (bg on fg)", f"{wcag(bg, fg):.1f}:1", f"Lc {apca(bg, fg):.0f}"),
            (m, "metric dot vs bg", f"{wcag(A, bg):.1f}:1", ""),
            (m, "decision dot vs bg", f"{wcag(B, bg):.1f}:1", ""),
        ] + [(m, f"metric vs decision, {v}", f"ΔE {de_ok(simulate(A, v), simulate(B, v)):.0f}", "") for v in VISIONS]
    return out

if __name__ == "__main__":
    res = search()
    # Tie-break: among pairs within 0.5 of the best worst-case score, take the decision hue nearest 65° (amber).
    # Warm reads as "human judgement"; hues near 30-45° read as red, the colour of errors, which decisions are not.
    top = [r for r in res if r[0] >= res[0][0] - 0.5]
    score, hA, hB, per = min(top, key=lambda r: (abs(r[2] - 65), -r[0]))
    rep = report(hA, hB, per)
    if "--json" in sys.argv:
        print(json.dumps({"hues": {"metric": hA, "decision": hB, "neutral": NEUTRAL_H}, **rep}, indent=1)); sys.exit()
    print("Top hue pairs (worst-case ΔE across normal + 3 CVD types, both modes):")
    for s, a, b, _ in res[:8]: print(f"  metric h={a:3d}  decision h={b:3d}  score={s:5.1f}")
    print(f"\nChosen: metric hue {hA}, decision hue {hB}\n")
    print(json.dumps({k: rep[k] for k in ("neutral", "data")}, indent=1))
    print("\nValidation:")
    for row in rep["checks"]: print("  " + " | ".join(row))
