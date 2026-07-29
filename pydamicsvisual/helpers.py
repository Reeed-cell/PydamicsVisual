"""
Demo-level helpers that aren't part of pydamics' core physics (no proper
collision system yet), but are handy for making visual demos feel alive.
Attach the returned callback to `world.on_step`.
"""
from __future__ import annotations


def floor_bounce(floor_y: float = 0.0, radius: float = 0.4, damping: float = 0.65,
                  x_bounds: tuple[float, float] | None = None):
    """Returns a callable suitable for `world.on_step = floor_bounce(...)`.

    Clamps entities to stay above `floor_y` (accounting for `radius`),
    inverting velocity.y with `damping` on contact. If `x_bounds` is
    given as (min_x, max_x), also bounces off left/right walls.
    """

    def _on_step(world, dt):
        for e in world.entities:
            if e.position.y - radius < floor_y:
                e.position.y = floor_y + radius
                e.velocity.y = -e.velocity.y * damping
                # resync verlet's cached acceleration so the next step isn't skewed
                e._prev_accel = e.compute_total_acceleration()

            if x_bounds is not None:
                min_x, max_x = x_bounds
                if e.position.x - radius < min_x:
                    e.position.x = min_x + radius
                    e.velocity.x = -e.velocity.x * damping
                elif e.position.x + radius > max_x:
                    e.position.x = max_x - radius
                    e.velocity.x = -e.velocity.x * damping

    return _on_step
