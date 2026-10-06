"""Generate SorrisMed logo SVG (text converted to paths) from a font file."""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

font_path, out, variant = sys.argv[1], sys.argv[2], sys.argv[3]
track = float(sys.argv[4]) if len(sys.argv) > 4 else -20
f = TTFont(font_path)
gs = f.getGlyphSet(); cmap = f.getBestCmap(); hm = f['hmtx']
CAP = f['OS/2'].sCapHeight
S = 100 / CAP  # cap height = 100px

COL = {
  'color': dict(txt='#0E5A47', red='#D7262E', smile='#43A637'),
  'white': dict(txt='#FFFFFF', red='#FF4D55', smile='#7ED957'),
}[variant]

def run(text, x0, base=0):
    pen = SVGPathPen(gs)
    x = x0
    for ch in text:
        g = cmap[ord(ch)]
        tp = TransformPen(pen, (S, 0, 0, -S, x, base))
        gs[g].draw(tp)
        x += (hm[g][0] + track) * S
    return pen.getCommands(), x - track * S

def bbox_x(text):
    from fontTools.pens.boundsPen import BoundsPen
    g = cmap[ord(text)]; bp = BoundsPen(gs); gs[g].draw(bp); return bp.bounds

p1, xend = run('Sorris', 0)
# trim right side bearing of final 's'
b = bbox_x('s'); xs = xend - (hm[cmap[ord('s')]][0] - b[2]) * S
# heartbeat "M": coords in px relative to cap height 100, y up
hb = [(0, 38), (20, 38), (37, 106), (55, -44), (80, 152), (97, 34), (108, 34)]
pts = [(xs - 4 + dx, -dy) for dx, dy in hb]
hb_end = pts[-1][0]
b_e = bbox_x('e')
p2, xend2 = run('ed', hb_end - b_e[0] * S - 2)
poly = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)

# smile under "orris": tapered swoosh + arrow tip
o_left = (hm[cmap[ord('S')]][0] + track) * S
sx0, sx1 = xs * 0.17, xs * 0.74
mid = (sx0 + sx1) / 2
smile = (f'M{sx0:.1f},10 Q{mid-10:.1f},44 {sx1-2:.1f},14 '
         f'L{sx1-5:.1f},6 L{sx1+12:.1f},4 L{sx1+5:.1f},22 L{sx1+1:.1f},18 '
         f'Q{mid-10:.1f},70 {sx0:.1f},10 Z')

minx, maxx = -2, xend2 + 2
miny, maxy = -158, 50
w, h = maxx - minx, maxy - miny
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{minx:.0f} {miny} {w:.0f} {h}" role="img" aria-label="SorrisMed">
<title>SorrisMed</title>
<path fill="{COL['txt']}" d="{p1} {p2}"/>
<polyline fill="none" stroke="{COL['red']}" stroke-width="11" stroke-linejoin="miter" stroke-miterlimit="10" stroke-linecap="butt" points="{poly}"/>
<path fill="{COL['smile']}" d="{smile}"/>
</svg>
'''
open(out, 'w').write(svg)
print(out, w, h)
