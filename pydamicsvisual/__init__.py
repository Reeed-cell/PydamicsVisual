"""
pydamicsvisual -- rendering extension for the pydamics physics engine.

    from pydamics import Entity, World
    from pydamicsvisual import MatplotlibRenderer, PygameRenderer, floor_bounce

    ball = Entity(mass=1.0, position=(2, 10))
    ball.physics2d.gravity(force=9.8)

    world = World()
    world.add(ball)
    world.on_step = floor_bounce(floor_y=0.0, radius=0.4)

    renderer = MatplotlibRenderer(world, xlim=(-1, 8), ylim=(0, 16))
    renderer.track(ball)
    renderer.save_gif("out.gif")
"""
from .matplotlib_renderer import MatplotlibRenderer
from .pygame_renderer import PygameRenderer
from .helpers import floor_bounce

__all__ = ["MatplotlibRenderer", "PygameRenderer", "floor_bounce"]

__version__ = "0.1.4"
