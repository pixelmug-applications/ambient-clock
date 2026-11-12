import micropyxel as pyxel


ATLAS_PATH = "assets/color-digits.png"
INCLUDE_COLORS = True
COLKEY = 0
COLON_COLOR = 7


class ColorfulDigitsClockStyle:
    style_id = "colorful-digits"

    DIGIT_W = 6
    DIGIT_H = 6

    def __init__(self, bank=0):
        self.bank = bank

    def load_assets(self):
        pyxel.images(self.bank).load_from_png(0, 0, ATLAS_PATH, INCLUDE_COLORS)

    def draw(self, app):
        hour = app.clamp_display_value(app.display_hour)
        minute = app.clamp_display_value(app.display_minute)
        digits = (hour // 10, hour % 10, minute // 10, minute % 10)
        y = 5

        self.draw_digit(0, y, digits[0])
        self.draw_digit(6, y, digits[1])
        self.draw_colon(13, y, app)
        self.draw_digit(15, y, digits[2])
        self.draw_digit(21, y, digits[3])

    def draw_digit(self, x, y, digit):
        src_x, src_y = self.digit_source(digit)
        pyxel.blt(x, y, self.bank, src_x, src_y, self.DIGIT_W, self.DIGIT_H, COLKEY)

    def digit_source(self, digit):
        if digit == 0:
            return 4 * self.DIGIT_W, self.DIGIT_H
        digit -= 1
        if digit < 5:
            return digit * self.DIGIT_W, 0
        return (digit - 5) * self.DIGIT_W, self.DIGIT_H

    def draw_colon(self, x, y, app):
        hour, minute, second = app.local_time()
        if second % 2:
            return
        pyxel.pset(x, y + 1, COLON_COLOR)
        pyxel.pset(x, y + 4, COLON_COLOR)

