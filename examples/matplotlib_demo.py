"""
Run with:  python examples/matplotlib_demo.py
Output:    examples/falling_balls.gif
"""
from pydamics import Entity, World
from pydamicsvisual import MatplotlibRenderer, floor_bounce

balls_config = [
    dict(mass=1.0, position=(1.0, 12.0), drag=0.15),
    dict(mass=2.0, position=(3.0, 9.0), drag=0.05),
    dict(mass=0.5, position=(5.0, 14.0), drag=0.35),
]

world = World()
world.on_step = floor_bounce(floor_y=0.0, radius=0.4, damping=0.65)

renderer = MatplotlibRenderer(world, xlim=(-1, 8), ylim=(0, 16),
                               title="pydamics: bouncing balls (gravity + drag)")

for cfg in balls_config:
    ball = Entity(mass=cfg["mass"], position=cfg["position"])
    ball.physics2d.gravity(force=9.8)
    ball.physics2d.fluid(density=1.0, drag=cfg["drag"])
    world.add(ball)
    renderer.track(ball, radius=0.4)

out_path = renderer.save_gif("examples/falling_balls.gif", frames=180,
                              dt=1 / 60, steps_per_frame=2, fps=30)
print(f"Saved animation to {out_path}")
