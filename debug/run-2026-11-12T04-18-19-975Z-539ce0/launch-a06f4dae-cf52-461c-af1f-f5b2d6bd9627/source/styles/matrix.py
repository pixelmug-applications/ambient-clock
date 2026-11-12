import micropyxel as pyxel

SCREEN_W = 32
SCREEN_H = 16
DIGIT_ATLAS_PATH = "assets/custom.png"
INCLUDE_COLORS = True
COL_BLACK = 0
COL_WHITE = 7
DIGIT_W = 4
DIGIT_H = 7
DIGIT_Y = 7
DIGIT_XS = (5, 10, 17, 22)
COLON_X = 15
COL_TRAIL_LO = 2
COL_TRAIL_HI = 8
COL_HEAD = 14


class MatrixClockStyle:
    style_id = "matrix"

    def __init__(self, bank):
        self.bank = bank
        self.cells = bytearray(SCREEN_W * SCREEN_H)
        self.seeded = False

    def load_assets(self):
        pyxel.images(self.bank).load_from_png(0, 0, DIGIT_ATLAS_PATH, INCLUDE_COLORS)
        self.configure_palette()
        self.clear_rain()

    def configure_palette(self):
        self.set_color_safe(COL_TRAIL_LO, 0x003A12)
        self.set_color_safe(COL_TRAIL_HI, 0x00A83B)
        self.set_color_safe(COL_HEAD, 0xD8FFE2)

    def set_color_safe(self, color, rgb):
        try:
            pyxel.set_color(color, rgb)
        except Exception:
            pass

    def clear_rain(self):
        for i in range(len(self.cells)):
            self.cells[i] = 0
        self.seeded = False

    def draw(self, app):
        self.step_rain()
        self.draw_rain()
        self.draw_clock(app)

    def step_rain(self):
        for y in range(SCREEN_H - 1, -1, -1):
            row = y * SCREEN_W
            for x in range(SCREEN_W):
                idx = row + x
                value = self.cells[idx]
                if value == 3:
                    self.cells[idx] = 2
                    if y < SCREEN_H - 1:
                        self.cells[idx + SCREEN_W] = 3
                elif value:
                    self.cells[idx] = value - 1

        if not self.seeded:
            for x in range(0, SCREEN_W, 3):
                self.spawn_head(x)
            self.seeded = True

        if pyxel.rndi(0, 2) == 0:
            self.spawn_head(pyxel.rndi(0, SCREEN_W - 1))

    def spawn_head(self, x):
        self.cells[x] = 3

    def draw_rain(self):
        pyxel.cls(COL_BLACK)
        colors = (COL_BLACK, COL_TRAIL_LO, COL_TRAIL_HI, COL_HEAD)
        for y in range(SCREEN_H):
            row = y * SCREEN_W
            for x in range(SCREEN_W):
                value = self.cells[row + x]
                if value:
                    pyxel.pset(x, y, colors[value])

    def draw_clock(self, app):
        hour = app.clamp_display_value(app.display_hour)
        minute = app.clamp_display_value(app.display_minute)
        digits = (hour // 10, hour % 10, minute // 10, minute % 10)
        for i in range(4):
            self.draw_digit(DIGIT_XS[i], DIGIT_Y, digits[i])
        self.draw_colon(app)

    def draw_digit(self, x, y, digit):
        sx, sy = self.digit_source(digit)
        img = pyxel.images(self.bank)
        for yy in range(DIGIT_H):
            for xx in range(DIGIT_W):
                if img.pget(sx + xx, sy + yy) != COL_BLACK:
                    pyxel.pset(x + xx, y + yy, COL_WHITE)

    def digit_source(self, digit):
        if digit == 0:
            return 4 * (DIGIT_W + 1), 8
        if digit <= 5:
            return (digit - 1) * (DIGIT_W + 1), 0
        return (digit - 6) * (DIGIT_W + 1), 8

    def draw_colon(self, app):
        hour, minute, second = app.local_time()
        if second % 2:
            return
        pyxel.pset(COLON_X, 9, COL_WHITE)
        pyxel.pset(COLON_X, 11, COL_WHITE)

