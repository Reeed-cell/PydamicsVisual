"""
Example: MatplotlibRenderer v0.1.3 features -- box shapes, track_solid(),
label(), and save_png().

Run with: python examples/matplotlib_v013_demo.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pydamics
from pydamics import Entity, World
from pydamicsvisual import MatplotlibRenderer


class Platform:
    pass


world = World()

# a platform built once, tracked from the SAME object -- no duplicated specs
platform = pydamics.solidify(Platform(), position=(0, 0))
platform.seo.solid(width=6, height=1, restitution=0.4)
world.add_solid(platform)

ball = Entity(mass=1.0, position=(0.5, 8))
ball.physics2d.gravity(force=9.8)
ball.physics2d.collider(radius=0.4, restitution=0.4)
world.add(ball)

renderer = MatplotlibRenderer(world, xlim=(-4, 4), ylim=(-1, 10),
                               title="pydamicsvisual v0.1.3")
renderer.track(ball, radius=0.4)
renderer.track_solid(platform)  # reads the platform's own shape directly
renderer.label((-3.5, 9), "Start")

# a static snapshot of the starting layout, no stepping
renderer.save_png("examples/starting_layout.png")

# then the usual animated GIF
renderer.save_gif("examples/box_demo.gif", frames=150, dt=1 / 60, steps_per_frame=2)
print("Saved examples/starting_layout.png and examples/box_demo.gif")
