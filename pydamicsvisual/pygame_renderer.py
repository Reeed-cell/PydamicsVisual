"""
Interactive pygame rendering for a pydamics World.

v0.1.3: step() drives one frame at a time (events -> synchronous
world.step(dt) -> draw -> flip), with on_frame/on_key/on_event hooks so
a real game can draw a HUD, react to any key, or drive its own loop.
run() is now a thin convenience wrapper around step() for simple demos --
nothing about the old run()-only usage breaks.

Note: physics now steps SYNCHRONOUSLY inside step() (previously
world.run() ran physics on a background thread independent of the
render loop). This is a deliberate behavior change, not a side effect --
synchronous stepping is far easier to reason about and test, and avoids
on_frame/on_key callbacks racing against physics updates on another
thread.
"""
from __future__ import annotations

import random
import pygame
from pydamics import SEOShapeBox, SEOShapeCircle

_DEFAULT_COLORS = [(230, 57, 70), (69, 123, 157), (42, 157, 143),
                   (244, 162, 97), (155, 93, 229), (255, 183, 3)]

_font_cache = {}  # (family, size) -> pygame.font.Font, shared across renderers


def _get_font(family, size):
    key = (family, size)
    if key not in _font_cache:
        _font_cache[key] = pygame.font.SysFont(family, size)
    return _font_cache[key]


class PygameRenderer:
    """
    renderer = PygameRenderer(world, width=800, height=600, ppu=40, floor_y=0.0)
    renderer.track(ball, radius=0.4)                      # circle (default)
    renderer.track(crate, shape="box", width=2, height=1)  # box
    renderer.track_solid(wall)                             # reads an SEO object's own shape
    renderer.on_click(lambda x_world, y_world: spawn_new_ball(x_world, y_world))
    renderer.on_key(lambda key, pressed: ...)
    renderer.on_frame(lambda screen, dt: draw_hud(screen))
    renderer.draw_text("Score: 10", pos=(10, 10))

    renderer.run(dt=1/120)   # blocks until window closed / ESC -- simple demos
    # or drive your own loop:
    while renderer.step(dt=1/120):
        clock.tick(60)
    """

    def __init__(self, world, width: int = 800, height: int = 600, ppu: float = 40,
                 floor_y: float = 0.0, bg_color=(245, 245, 245), title="pydamics"):
        self.world = world
        self.width = width
        self.height = height
        self.ppu = ppu
        self.floor_y = floor_y
        self.bg_color = bg_color
        self.title = title

        self._tracked = {}  # entity -> dict(color, shape, radius, width, height, seo_obj)
        self._click_callback = None
        self._key_callbacks = []
        self._frame_callbacks = []
        self._event_callbacks = []
        self._color_i = 0

        self.screen = None
        self._quit_requested = False
        self._initialized = False

    def _next_color(self):
        color = _DEFAULT_COLORS[self._color_i % len(_DEFAULT_COLORS)]
        self._color_i += 1
        return color

    def track(self, entity, color=None, radius: float = 0.4, shape: str = "circle",
              width: float = None, height: float = None):
        """Track an entity. shape="circle" (default, uses radius) or
        shape="box" (uses width/height)."""
        if color is None:
            color = self._next_color()
        self._tracked[entity] = {
            "color": color, "shape": shape, "radius": radius,
            "width": width, "height": height, "seo_obj": None,
        }
        return entity

    def track_solid(self, seo_obj, color=None):
        """Track an SEO object (from pydamics.solidify()/`.seo.solid()`),
        reading its shape directly -- no need to separately specify
        width/height/radius, and no risk of the drawn shape drifting out
        of sync with the actual collision geometry."""
        if seo_obj.seo.shape is None:
            raise ValueError(
                f"{type(seo_obj).__name__}.seo has no shape yet -- call "
                f".seo.solid(...) before track_solid()."
            )
        if color is None:
            color = self._next_color()
        shape_obj = seo_obj.seo.shape
        if isinstance(shape_obj, SEOShapeBox):
            entry = {"color": color, "shape": "box", "radius": None,
                      "width": shape_obj.width, "height": shape_obj.height, "seo_obj": seo_obj}
        elif isinstance(shape_obj, SEOShapeCircle):
            entry = {"color": color, "shape": "circle", "radius": shape_obj.radius,
                      "width": None, "height": None, "seo_obj": seo_obj}
        else:
            raise TypeError(f"Unknown SEO shape type: {type(shape_obj).__name__}")
        self._tracked[seo_obj] = entry
        return seo_obj

    def on_click(self, callback):
        """callback(x_world, y_world) is called on every mouse click,
        e.g. to spawn a new entity at that position."""
        self._click_callback = callback

    def on_key(self, callback):
        """callback(key, pressed) -- fires on every KEYDOWN (pressed=True)
        and KEYUP (pressed=False). `key` is a pygame key constant."""
        self._key_callbacks.append(callback)

    def on_frame(self, callback):
        """callback(screen, dt) -- fires once per step(), after entities
        are drawn but before the display flips. Use this to draw a HUD,
        overlays, or anything else on top of the tracked shapes."""
        self._frame_callbacks.append(callback)

    def on_event(self, callback):
        """callback(event) -- fires for every raw pygame event, in
        addition to on_click/on_key/QUIT/ESCAPE handling. Escape hatch
        for anything those don't cover."""
        self._event_callbacks.append(callback)

    def draw_text(self, text, pos, size: int = 24, color=(255, 255, 255), family=None):
        """Draw HUD text at `pos` (screen pixels, e.g. (10, 10) for a
        top-left score display) -- call this from an on_frame callback.
        Fonts are cached by (family, size), not recreated every call."""
        if self.screen is None:
            raise RuntimeError("draw_text() needs an active window -- call inside on_frame().")
        font = _get_font(family, size)
        surface = font.render(text, True, color)
        self.screen.blit(surface, pos)

    def _world_to_screen(self, pos):
        sx = pos.x * self.ppu
        sy = self.height - (pos.y * self.ppu)
        return int(sx), int(sy)

    def _screen_to_world(self, px, py):
        return px / self.ppu, (self.height - py) / self.ppu

    def _draw(self):
        self.screen.fill(self.bg_color)
        floor_px = self.height - int(self.floor_y * self.ppu)
        pygame.draw.line(self.screen, (20, 20, 20), (0, floor_px), (self.width, floor_px), 3)

        for obj, entry in self._tracked.items():
            position = obj.position
            sx, sy = self._world_to_screen(position)
            color = entry["color"]
            if entry["shape"] == "box":
                w_px = int(entry["width"] * self.ppu)
                h_px = int(entry["height"] * self.ppu)
                rect = pygame.Rect(0, 0, w_px, h_px)
                rect.center = (sx, sy)
                pygame.draw.rect(self.screen, color, rect)
            else:
                pygame.draw.circle(self.screen, color, (sx, sy), int(entry["radius"] * self.ppu))

    def _ensure_window(self):
        if not self._initialized:
            pygame.init()
            self.screen = pygame.display.set_mode((self.width, self.height))
            pygame.display.set_caption(self.title)
            self._initialized = True

    def step(self, dt: float = 1 / 120) -> bool:
        """Advance and draw exactly one frame: handle input, step physics
        SYNCHRONOUSLY (dt), draw, fire on_frame callbacks, flip. Returns
        False once a quit has been requested (window closed / ESC),
        True otherwise -- drive your own `while renderer.step(): ...`
        loop with it, same spirit as matplotlib's animate()."""
        self._ensure_window()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self._quit_requested = True
            elif event.type == pygame.KEYDOWN:
                for cb in self._key_callbacks:
                    cb(event.key, True)
                if event.key == pygame.K_ESCAPE:
                    self._quit_requested = True
            elif event.type == pygame.KEYUP:
                for cb in self._key_callbacks:
                    cb(event.key, False)
            elif event.type == pygame.MOUSEBUTTONDOWN and self._click_callback:
                x_world, y_world = self._screen_to_world(*event.pos)
                self._click_callback(x_world, y_world)
            for cb in self._event_callbacks:
                cb(event)

        self.world.step(dt)
        self._draw()
        for cb in self._frame_callbacks:
            cb(self.screen, dt)
        pygame.display.flip()

        return not self._quit_requested

    def run(self, dt: float = 1 / 120, fps: int = 60):
        """Convenience wrapper for simple demos: blocks until quit,
        calling step() every frame. For anything needing more control
        (your own loop, custom timing), call step() yourself instead."""
        self._ensure_window()
        clock = pygame.time.Clock()
        try:
            while self.step(dt=dt):
                clock.tick(fps)
        finally:
            pygame.quit()
            self._initialized = False
