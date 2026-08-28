import micropyxel as pyxel


COLKEY = 0
ATLAS_PATH = "assets/flip-digits-compact.png"
INCLUDE_COLORS = True
COLON_COLOR = 7


class FlipClockStyle:
    style_id = "flip"

    LEFT_DIGIT_W = 8
    RIGHT_DIGIT_W = 7
    CELL_W = 8
    DIGIT_H = 16
    FRAMES = 6
    TOP_Y = 0
    BOTTOM_Y = 112

    LEFT_TOP_OFFSET = 0
    RIGHT_TOP_OFFSET = 10
    LEFT_BOTTOM_OFFSET = 0
    RIGHT_BOTTOM_OFFSET = 10

    LEFT_HOLD = (0, 1, 2, 3, 4, 5)
    RIGHT_HOLD = (0, 1, 2, 3, 4, 5)
    LEFT_TO_ZERO = {1: 7, 2: 8, 5: 9}
    RIGHT_TO_ZERO = {1: 17, 3: 18}

    def __init__(self, bank):
        self.bank = bank

    def load_assets(self):
        pyxel.images(self.bank).load_from_png(0, 0, ATLAS_PATH, INCLUDE_COLORS)

    def draw(self, app):
        hour = app.clamp_display_value(app.display_hour)
        minute = app.clamp_display_value(app.display_minute)
        prev_hour = app.clamp_display_value(app.prev_hour)
        prev_minute = app.clamp_display_value(app.prev_minute)
        self.draw_two_digits(0, prev_hour, hour, app.hour_flip_frame)
        self.draw_colon(15, app)
        self.draw_two_digits(16, prev_minute, minute, app.minute_flip_frame)

    def draw_colon(self, x, app):
        hour, minute, second = app.local_time()
        if second % 2:
            return
        pyxel.pset(x, 5, COLON_COLOR)
        pyxel.pset(x, 10, COLON_COLOR)

    def draw_two_digits(self, x, old_value, new_value, frame):
        self.draw_digit(x, old_value // 10, new_value // 10, frame, True)
        self.draw_digit(x + self.LEFT_DIGIT_W, old_value % 10, new_value % 10, frame, False)

    def draw_digit(self, x, old_digit, new_digit, frame, is_left):
        src_x, src_y = self.source_rect(old_digit, new_digit, frame, is_left)
        width = self.LEFT_DIGIT_W if is_left else self.RIGHT_DIGIT_W
        pyxel.blt(x, 0, self.bank, src_x, src_y, width, self.DIGIT_H, COLKEY)

    def source_rect(self, old_digit, new_digit, frame, is_left):
        old_digit = old_digit % 10
        new_digit = new_digit % 10
        frame = max(0, min(self.FRAMES - 1, frame))

        if frame >= self.FRAMES - 1:
            return self.static_digit_source(new_digit, is_left)

        strip = self.transition_strip(old_digit, new_digit, is_left)
        if strip is not None:
            return strip * self.CELL_W, self.TOP_Y + frame * self.DIGIT_H

        strip = self.bottom_strip(old_digit, new_digit, is_left)
        if strip is not None:
            return strip * self.CELL_W, self.BOTTOM_Y + frame * self.DIGIT_H

        return self.static_digit_source(new_digit, is_left)

    def transition_strip(self, old_digit, new_digit, is_left):
        if new_digit != (old_digit + 1) % 10:
            return None
        if is_left:
            return self.LEFT_TOP_OFFSET + old_digit
        return self.RIGHT_TOP_OFFSET + old_digit

    def bottom_strip(self, old_digit, new_digit, is_left):
        if old_digit == new_digit:
            if is_left and old_digit in self.LEFT_HOLD:
                return self.LEFT_BOTTOM_OFFSET + old_digit
            if not is_left and old_digit in self.RIGHT_HOLD:
                return self.RIGHT_BOTTOM_OFFSET + old_digit
        if new_digit == 0:
            if is_left and old_digit in self.LEFT_TO_ZERO:
                return self.LEFT_TO_ZERO[old_digit]
            if not is_left and old_digit in self.RIGHT_TO_ZERO:
                return self.RIGHT_TO_ZERO[old_digit]
        return None

    def static_digit_source(self, digit, is_left):
        strip = self.bottom_strip(digit, digit, is_left)
        if strip is not None:
            return strip * self.CELL_W, self.BOTTOM_Y + (self.FRAMES - 1) * self.DIGIT_H

        old_digit = (digit - 1) % 10
        if is_left:
            strip = self.LEFT_TOP_OFFSET + old_digit
        else:
            strip = self.RIGHT_TOP_OFFSET + old_digit
        return strip * self.CELL_W, self.TOP_Y + (self.FRAMES - 1) * self.DIGIT_H

