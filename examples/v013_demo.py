"""
Example: pydamics v0.1.3 features -- driving your own loop via step(),
HUD text, box shapes, and track_solid() reading physics geometry
directly (no duplicated wall specs).

Run with: python examples/v013_demo.py
Controls: click to drop a ball, SPACE to pause/unpause, ESC/close to quit.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import random
import pygame
import pydamics
from pydamics import Entity, World
from pydamicsvisual import PygameRenderer

WIDTH, HEIGHT, PPU = 800, 600, 40


class Wall:
    pass


world = World()

# a wall built once, tracked from the SAME object -- no duplicated specs
wall = pydamics.solidify(Wall(), position=(4, 5))
wall.seo.solid(width=1, height=6, restitution=0.4)
world.add_solid(wall)

renderer = PygameRenderer(world, width=WIDTH, height=HEIGHT, ppu=PPU,
                           floor_y=0.0, title="pydamics v0.1.3 demo")
renderer.track_solid(wall)  # reads the wall's own shape, stays in sync forever

score = {"drops": 0}
paused = {"value": False}


def make_ball(x_world, y_world):
    e = Entity(mass=random.uniform(0.5, 2.0), position=(x_world, y_world))
    e.physics2d.gravity(force=9.8)
    e.physics2d.collider(radius=0.4, restitution=0.5)
    world.add(e)
    renderer.track(e, radius=0.4)
    score["drops"] += 1


def toggle_pause(key, pressed):
    if key == pygame.K_SPACE and pressed:
        paused["value"] = not paused["value"]


def draw_hud(screen, dt):
    renderer.draw_text(f"Balls dropped: {score['drops']}", pos=(10, 10))
    renderer.draw_text("SPACE to pause, click to drop a ball", pos=(10, 40), size=16)
    if paused["value"]:
        renderer.draw_text("PAUSED", pos=(WIDTH // 2 - 40, HEIGHT // 2), size=32, color=(200, 30, 30))


renderer.on_click(make_ball)
renderer.on_key(toggle_pause)
renderer.on_frame(draw_hud)

for i in range(3):
    make_ball(1.0 + i * 1.0, 10.0 + i * 2.0)

# driving the loop manually via step() instead of run() -- same spirit
# as matplotlib's animate(), full control over timing/pausing
clock = pygame.time.Clock()
running = True
while running:
    if not paused["value"]:
        running = renderer.step(dt=1 / 120)
    else:
        # still need to pump events/redraw while paused, just skip physics
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
        renderer._draw()
        draw_hud(renderer.screen, 0)
        pygame.display.flip()
    clock.tick(60)

pygame.quit()
