import struct, zlib, math

W = H = 512
px = [[(0,0,0,0)]*W for _ in range(H)]
R,G,B = 0, 255, 100  # neon green

def clamp(v): return max(0, min(255, int(v)))

def sp(x, y, r, g, b, a=255):
    if 0 <= x < W and 0 <= y < H:
        px[y][x] = (clamp(r), clamp(g), clamp(b), clamp(a))

def fill_rect(x1, y1, x2, y2, r, g, b, a=255):
    for yy in range(max(0,y1), min(H,y2+1)):
        for xx in range(max(0,x1), min(W,x2+1)):
            sp(xx, yy, r, g, b, a)

def fill_circle(cx, cy, rad, r, g, b, a=255):
    for dy in range(-rad, rad+1):
        for dx in range(-rad, rad+1):
            if dx*dx + dy*dy <= rad*rad:
                sp(cx+dx, cy+dy, r, g, b, a)

def ring(cx, cy, r_outer, r_inner, r, g, b, a=255):
    for dy in range(-r_outer, r_outer+1):
        for dx in range(-r_outer, r_outer+1):
            d2 = dx*dx + dy*dy
            if r_inner*r_inner < d2 <= r_outer*r_outer:
                sp(cx+dx, cy+dy, r, g, b, a)

def stroke_rect(x1, y1, x2, y2, t, r, g, b, a=255):
    fill_rect(x1,      y1,      x2,      y1+t-1, r,g,b,a)
    fill_rect(x1,      y2-t+1,  x2,      y2,     r,g,b,a)
    fill_rect(x1,      y1,      x1+t-1,  y2,     r,g,b,a)
    fill_rect(x2-t+1,  y1,      x2,      y2,     r,g,b,a)

def fill_rounded_rect(x1, y1, x2, y2, rad, r, g, b, a=255):
    # fill body
    fill_rect(x1+rad, y1, x2-rad, y2, r,g,b,a)
    fill_rect(x1, y1+rad, x2, y2-rad, r,g,b,a)
    # corners
    for cr, cc, sa, ea in [(x1+rad,y1+rad,180,270),(x2-rad,y1+rad,270,360),
                            (x2-rad,y2-rad,0,90),(x1+rad,y2-rad,90,180)]:
        for angle in range(sa, ea+1):
            ax = cr + rad*math.cos(math.radians(angle))
            ay = cc + rad*math.sin(math.radians(angle))
            # fill the wedge
            for dx in range(-rad-1, rad+2):
                for dy in range(-rad-1, rad+2):
                    if dx*dx+dy*dy <= (rad+1)*(rad+1):
                        sp(cr+dx, cc+dy, r,g,b,a)

def stroke_rounded_rect(x1, y1, x2, y2, rad, thick, r, g, b, a=255):
    fill_rounded_rect(x1, y1, x2, y2, rad, r, g, b, a)
    # cut inner
    inner_rad = max(0, rad - thick)
    fill_rounded_rect(x1+thick, y1+thick, x2-thick, y2-thick, inner_rad, 0, 0, 0, 0)

def line_thick(x0, y0, x1, y1, thick, r, g, b, a=255):
    x0,y0,x1,y1 = int(round(x0)),int(round(y0)),int(round(x1)),int(round(y1))
    dx, dy = x1-x0, y1-y0
    steps = max(abs(dx), abs(dy), 1)
    for i in range(steps+1):
        t = i/steps
        cx = round(x0 + dx*t)
        cy = round(y0 + dy*t)
        fill_circle(cx, cy, thick//2, r, g, b, a)

# ── Clipboard outline (transparent hole inside) ───────────────────
T = 24   # stroke thickness
RAD = 40

# Outer shape
stroke_rounded_rect(60, 160, 452, 470, RAD, T, R,G,B)

# Tab at top
stroke_rounded_rect(176, 62, 336, 168, 22, T, R,G,B)
# Bridge: erase bottom of main rect top edge where tab sits, connect sides
fill_rect(60+T, 160, 175, 160+T-1, 0,0,0,0)  # erase left gap
fill_rect(337, 160, 452-T, 160+T-1, 0,0,0,0) # erase right gap
# Redraw tab bottom sides connecting to body
fill_rect(176, 160, 176+T-1, 170, R,G,B)
fill_rect(336-T+1, 160, 336, 170, R,G,B)

# ── ">_" prompt inside ────────────────────────────────────────────
# ">"  chevron — two thick lines
line_thick(115, 240, 200, 310, T+4, R,G,B)
line_thick(115, 390, 200, 310, T+4, R,G,B)

# "_" underscore
fill_rect(220, 385, 350, 385+T, R,G,B)

# ── Scanlines (subtle, inside the clipboard area) ─────────────────
for y in range(185, 460, 20):
    for x in range(85, 430):
        if px[y][x][3] == 0:
            sp(x, y, R,G,B, 18)

# ── Write PNG ─────────────────────────────────────────────────────
def make_png(w, h, rows):
    def chunk(tag, data):
        c = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', c)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    raw = b''
    for row in rows:
        raw += b'\x00'
        for (rv,gv,bv,av) in row:
            raw += bytes([clamp(rv),clamp(gv),clamp(bv),clamp(av)])
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR',ihdr) + chunk(b'IDAT',zlib.compress(raw,9)) + chunk(b'IEND',b'')

with open('app-icon.png','wb') as f:
    f.write(make_png(W,H,px))
print('done', W, 'x', H)
