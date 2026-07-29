"""
Run with:  python examples/pygame_demo.py
Controls:  click anywhere to drop a ball, ESC or close window to quit.
"""
import random
from pydamics import Entity, World
from pydamicsvisual import PygameRenderer, floor_bounce

WIDTH, HEIGHT, PPU = 800, 600, 40

world = World()
world.on_step = floor_bounce(floor_y=0.0, radius=0.4, damping=0.65,
                              x_bounds=(0, WIDTH / PPU))

renderer = PygameRenderer(world, width=WIDTH, height=HEIGHT, ppu=PPU,
                           floor_y=0.0, title="pydamics -- click to drop balls")


def make_ball(x_world, y_world):
    e = Entity(mass=random.uniform(0.5, 2.0), position=(x_world, y_world))
    e.physics2d.gravity(force=9.8)
    e.physics2d.fluid(density=1.0, drag=random.uniform(0.05, 0.3))
    world.add(e)
    renderer.track(e, radius=0.4)


for i in range(3):
    make_ball(2.0 + i * 1.5, 10.0 + i * 2.0)

renderer.on_click(make_ball)
renderer.run(dt=1 / 120)
