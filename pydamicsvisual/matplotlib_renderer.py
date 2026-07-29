"""
Headless matplotlib rendering for a pydamics World -- no display server
needed, great for servers/CI/sharing results as a GIF.
"""
from __future__ import annotations

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.animation as animation

_DEFAULT_COLORS = ["#e63946", "#457b9d", "#2a9d8f", "#f4a261", "#9b5de5",
                   "#ffb703", "#06d6a0", "#ef476f"]


class MatplotlibRenderer:
    """
    renderer = MatplotlibRenderer(world, xlim=(-1, 8), ylim=(0, 16), floor_y=0.0)
    renderer.track(ball)                      # auto color/radius
    renderer.track(ball2, color="#123456", radius=0.6)
    renderer.save_gif("out.gif", frames=180, dt=1/60)
    """

    def __init__(self, world, xlim=(-5, 5), ylim=(0, 10), floor_y: float | None = 0.0,
                 title: str = "pydamics simulation", figsize=(6, 6)):
        self.world = world
        self._tracked = []  # list of (entity, color, radius)
        self._color_i = 0

        self.fig, self.ax = plt.subplots(figsize=figsize)
        self.ax.set_xlim(*xlim)
        self.ax.set_ylim(*ylim)
        self.ax.set_aspect("equal")
        self.ax.set_title(title)
        if floor_y is not None:
            self.ax.axhline(floor_y, color="black", linewidth=2)

        self._circles = []

    def track(self, entity, color: str | None = None, radius: float = 0.4):
        if color is None:
            color = _DEFAULT_COLORS[self._color_i % len(_DEFAULT_COLORS)]
            self._color_i += 1
        self._tracked.append((entity, color, radius))
        circle = plt.Circle((entity.position.x, entity.position.y), radius, color=color)
        self.ax.add_patch(circle)
        self._circles.append(circle)
        return entity

    def _update(self, frame, dt, steps_per_frame):
        for _ in range(steps_per_frame):
            self.world.step(dt)
        for circle, (entity, _, _) in zip(self._circles, self._tracked):
            circle.center = (entity.position.x, entity.position.y)
        return self._circles

    def animate(self, frames: int = 180, dt: float = 1 / 60, steps_per_frame: int = 1,
                interval: int = 33):
        """Returns a matplotlib.animation.FuncAnimation you can save() or show()."""
        return animation.FuncAnimation(
            self.fig, self._update, frames=frames,
            fargs=(dt, steps_per_frame), interval=interval, blit=True,
        )

    def save_gif(self, path: str, frames: int = 180, dt: float = 1 / 60,
                 steps_per_frame: int = 1, fps: int = 30):
        anim = self.animate(frames=frames, dt=dt, steps_per_frame=steps_per_frame)
        anim.save(path, writer="pillow", fps=fps)
        return path
