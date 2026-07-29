"""
Interactive pygame rendering for a pydamics World -- opens a real window,
runs physics on the engine's own background thread (world.run()), and
draws whatever positions exist each frame.
"""
from __future__ import annotations

import random
import pygame

_DEFAULT_COLORS = [(230, 57, 70), (69, 123, 157), (42, 157, 143),
                   (244, 162, 97), (155, 93, 229), (255, 183, 3)]


class PygameRenderer:
    """
    renderer = PygameRenderer(world, width=800, height=600, ppu=40, floor_y=0.0)
    renderer.track(ball, radius=0.4)
    renderer.on_click(lambda x_world, y_world: spawn_new_ball(x_world, y_world))
    renderer.run(dt=1/120)   # blocks until window closed / ESC
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

        self._tracked = {}  # entity -> (color, radius_world)
        self._click_callback = None
        self._color_i = 0

    def track(self, entity, color=None, radius: float = 0.4):
        if color is None:
            color = _DEFAULT_COLORS[self._color_i % len(_DEFAULT_COLORS)]
            self._color_i += 1
        self._tracked[entity] = (color, radius)
        return entity

    def on_click(self, callback):
        """callback(x_world, y_world) is called on every mouse click,
        e.g. to spawn a new entity at that position."""
        self._click_callback = callback

    def _world_to_screen(self, pos):
        sx = pos.x * self.ppu
        sy = self.height - (pos.y * self.ppu)
        return int(sx), int(sy)

    def _screen_to_world(self, px, py):
        return px / self.ppu, (self.height - py) / self.ppu

    def run(self, dt: float = 1 / 120, fps: int = 60):
        pygame.init()
        screen = pygame.display.set_mode((self.width, self.height))
        pygame.display.set_caption(self.title)
        clock = pygame.time.Clock()

        self.world.run(dt=dt, real_time=True)

        running = True
        try:
            while running:
                for event in pygame.event.get():
                    if event.type == pygame.QUIT:
                        running = False
                    elif event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                        running = False
                    elif event.type == pygame.MOUSEBUTTONDOWN and self._click_callback:
                        x_world, y_world = self._screen_to_world(*event.pos)
                        self._click_callback(x_world, y_world)

                screen.fill(self.bg_color)
                floor_px = self.height - int(self.floor_y * self.ppu)
                pygame.draw.line(screen, (20, 20, 20), (0, floor_px), (self.width, floor_px), 3)

                for entity, (color, radius) in self._tracked.items():
                    sx, sy = self._world_to_screen(entity.position)
                    pygame.draw.circle(screen, color, (sx, sy), int(radius * self.ppu))

                pygame.display.flip()
                clock.tick(fps)
        finally:
            self.world.stop()
            pygame.quit()
