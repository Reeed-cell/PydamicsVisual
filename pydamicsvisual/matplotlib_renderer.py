"""
Headless matplotlib rendering for a pydamics World -- no display server
needed, great for servers/CI/sharing results as a GIF.

v0.1.3: box shapes (in addition to circles), track_solid() to read an
SEO object's own shape directly, label() for text annotations, and
save_png() for a single static frame instead of always needing a GIF.
"""
from __future__ import annotations

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import matplotlib.animation as animation
from pydamics import SEOShapeBox, SEOShapeCircle

_DEFAULT_COLORS = ["#e63946", "#457b9d", "#2a9d8f", "#f4a261", "#9b5de5",
                   "#ffb703", "#06d6a0", "#ef476f"]


class MatplotlibRenderer:
    """
    renderer = MatplotlibRenderer(world, xlim=(-1, 8), ylim=(0, 16), floor_y=0.0)
    renderer.track(ball)                            # circle, auto color/radius
    renderer.track(ball2, color="#123456", radius=0.6)
    renderer.track(crate, shape="box", width=2, height=1)
    renderer.track_solid(wall)                      # reads an SEO object's own shape
    renderer.label((0, 8), "Start")
    renderer.save_gif("out.gif", frames=180, dt=1/60)
    renderer.save_png("thumbnail.png")               # current state, no stepping
    """

    def __init__(self, world, xlim=(-5, 5), ylim=(0, 10), floor_y: float | None = 0.0,
                 title: str = "pydamics simulation", figsize=(6, 6)):
        self.world = world
        self._tracked = []  # list of dicts: entity, color, shape, radius/width/height, patch
        self._color_i = 0

        self.fig, self.ax = plt.subplots(figsize=figsize)
        self.ax.set_xlim(*xlim)
        self.ax.set_ylim(*ylim)
        self.ax.set_aspect("equal")
        self.ax.set_title(title)
        if floor_y is not None:
            self.ax.axhline(floor_y, color="black", linewidth=2)

    def _next_color(self):
        color = _DEFAULT_COLORS[self._color_i % len(_DEFAULT_COLORS)]
        self._color_i += 1
        return color

    def track(self, entity, color: str | None = None, radius: float = 0.4,
              shape: str = "circle", width: float = None, height: float = None):
        """Track an entity. shape="circle" (default, uses radius) or
        shape="box" (uses width/height)."""
        if color is None:
            color = self._next_color()

        if shape == "box":
            w, h = width or 1.0, height or 1.0
            patch = patches.Rectangle(
                (entity.position.x - w / 2, entity.position.y - h / 2), w, h, color=color,
            )
        else:
            patch = plt.Circle((entity.position.x, entity.position.y), radius, color=color)

        self.ax.add_patch(patch)
        self._tracked.append({
            "obj": entity, "color": color, "shape": shape,
            "radius": radius, "width": width, "height": height, "patch": patch,
        })
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
        shape_obj = seo_obj.seo.shape
        if isinstance(shape_obj, SEOShapeBox):
            return self.track(seo_obj, color=color, shape="box",
                               width=shape_obj.width, height=shape_obj.height)
        elif isinstance(shape_obj, SEOShapeCircle):
            return self.track(seo_obj, color=color, shape="circle", radius=shape_obj.radius)
        else:
            raise TypeError(f"Unknown SEO shape type: {type(shape_obj).__name__}")

    def label(self, position, text, color="black", fontsize=10, **text_kwargs):
        """Thin wrapper over ax.text() -- a static text annotation at a
        fixed data-space position (not tied to a tracked entity)."""
        return self.ax.text(position[0], position[1], text, color=color,
                             fontsize=fontsize, **text_kwargs)

    def _update(self, frame, dt, steps_per_frame):
        for _ in range(steps_per_frame):
            self.world.step(dt)
        return self._redraw_patches()

    def _redraw_patches(self):
        artists = []
        for entry in self._tracked:
            pos = entry["obj"].position
            patch = entry["patch"]
            if entry["shape"] == "box":
                w, h = entry["width"] or 1.0, entry["height"] or 1.0
                patch.set_xy((pos.x - w / 2, pos.y - h / 2))
            else:
                patch.center = (pos.x, pos.y)
            artists.append(patch)
        return artists

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

    def save_png(self, path: str, after_steps: int = 0, dt: float = 1 / 60):
        """Save a single static frame -- the current state by default,
        or step forward `after_steps` times first. Handy for a "starting
        layout" screenshot, a thumbnail, or a debug snapshot partway
        through a run, without needing a whole GIF."""
        for _ in range(after_steps):
            self.world.step(dt)
        self._redraw_patches()
        self.fig.savefig(path)
        return path
