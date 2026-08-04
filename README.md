# pydamicsvisual

Matplotlib + pygame rendering extension for [`pydamics`](https://pypi.org/project/pydamics/),
a small chainable-syntax 2D physics engine.

`pydamics` itself stays dependency-free (just the physics). This package
is the opt-in visual layer on top.

## Install

```bash
pip install pydamicsvisual        # once published to PyPI -- also installs pydamics
# or, from source:
pip install -e .
```

> **Note:** this uses [`pygame-ce`](https://pyga.me/) (Community Edition), not the
> classic `pygame` package. It's a drop-in replacement (`import pygame` works
> identically) but is actively maintained and ships wheels for current Python
> versions -- classic `pygame` still only has wheels up to Python 3.12, which
> causes a source-build failure (needs Visual Studio Build Tools) on 3.13/3.14.

## Usage

```python
from pydamics import Entity, World
from pydamicsvisual import MatplotlibRenderer, PygameRenderer, floor_bounce

ball = Entity(mass=1.0, position=(2, 10))
ball.physics2d.gravity(force=9.8)
ball.physics2d.fluid(density=1.0, drag=0.2)

world = World()
world.add(ball)
world.on_step = floor_bounce(floor_y=0.0, radius=0.4, damping=0.65)
```

### Headless GIF (matplotlib)

```python
renderer = MatplotlibRenderer(world, xlim=(-1, 8), ylim=(0, 16))
renderer.track(ball, radius=0.4)
renderer.save_gif("out.gif", frames=180, dt=1/60)
```

### Interactive window (pygame)

```python
renderer = PygameRenderer(world, width=800, height=600, ppu=40, floor_y=0.0)
renderer.track(ball, radius=0.4)
renderer.on_click(lambda x, y: print("clicked at", x, y))  # e.g. spawn a new ball
renderer.run(dt=1/120)   # blocks until window closed / ESC -- simple demos
```

For anything beyond a simple demo -- a HUD, a pause overlay, custom key
handling, driving your own timing -- use `step()` instead of `run()`:

```python
renderer.on_key(lambda key, pressed: ...)              # any key, not just click
renderer.on_frame(lambda screen, dt: draw_hud(screen))  # draw after entities, before flip
renderer.draw_text("Score: 10", pos=(10, 10))           # call from inside on_frame

clock = pygame.time.Clock()
while renderer.step(dt=1/120):   # returns False once quit is requested
    clock.tick(60)
```

`run()` is just a thin convenience wrapper around `step()` -- physics
steps **synchronously** inside `step()` (not on a background thread like
early versions), so it's straightforward to reason about and test.

### Shapes beyond circles

```python
renderer.track(crate, shape="box", width=2, height=1)     # a box, not just circles
renderer.track_solid(wall)                                 # reads an SEO object's OWN shape
```

`track_solid()` is the one to reach for when tracking a `pydamics`
solid (`solidify()`/`.seo.solid()`) -- it reads the shape directly off
the object, so the drawn geometry can never drift out of sync with
what actually collides. Works with both renderers.

## API

**`floor_bounce(floor_y=0.0, radius=0.4, damping=0.65, x_bounds=None)`**
Returns a callable for `world.on_step` that keeps entities above the floor
(and optionally between walls), bouncing with energy loss on contact.
This is demo-level logic -- use `pydamics`' real collision/SEO system
for anything beyond quick demo purposes.

**`MatplotlibRenderer(world, xlim, ylim, floor_y=0.0, title=..., figsize=(6,6))`**
- `.track(entity, color=None, radius=0.4, shape="circle", width=None, height=None)` — register an entity to draw; pass `shape="box"` + `width`/`height` for a rectangle
- `.track_solid(seo_obj, color=None)` — track an SEO object, reading its shape directly
- `.label(position, text, color="black", fontsize=10)` — thin wrapper over `ax.text()`
- `.animate(frames=180, dt=1/60, steps_per_frame=1, interval=33)` — returns a `FuncAnimation`
- `.save_gif(path, frames=180, dt=1/60, steps_per_frame=1, fps=30)` — steps the sim and saves a GIF
- `.save_png(path, after_steps=0, dt=1/60)` — a single static frame, optionally stepping forward first

**`PygameRenderer(world, width=800, height=600, ppu=40, floor_y=0.0, title=...)`**
- `.track(entity, color=None, radius=0.4, shape="circle", width=None, height=None)` — same shape options as matplotlib
- `.track_solid(seo_obj, color=None)` — track an SEO object, reading its shape directly
- `.on_click(callback)` — `callback(x_world, y_world)` fires on every mouse click
- `.on_key(callback)` — `callback(key, pressed)` fires on every KEYDOWN/KEYUP
- `.on_frame(callback)` — `callback(screen, dt)` fires once per `step()`, after drawing, before flip
- `.on_event(callback)` — `callback(event)` fires for every raw pygame event (escape hatch)
- `.draw_text(text, pos, size=24, color=(255,255,255), family=None)` — HUD text; call from inside `on_frame`. Fonts are cached by `(family, size)`, not recreated every call
- `.step(dt=1/120)` — advance and draw exactly one frame; returns `False` once quit is requested
- `.run(dt=1/120, fps=60)` — convenience wrapper around `step()`, blocks until closed/ESC

## Examples

```bash
pip install -e ".[dev]"
python examples/matplotlib_demo.py      # -> examples/falling_balls.gif
python examples/matplotlib_v013_demo.py # box shapes, track_solid, label, save_png
python examples/pygame_demo.py          # interactive window, click to drop balls
python examples/v013_demo.py            # step()-driven loop, HUD, pause, box wall
```

## Roadmap

Staged for **v0.1.4**: rotation/orientation support, velocity-based
dynamic color, camera pan/zoom/follow, trigger-zone/debug-shape
visualization (paired with `pydamics` core once it ships), and
sprite/image support.

## Publishing (for maintainers)

Same flow as `pydamics` itself:

```bash
git init
git add .
git commit -m "Initial commit: pydamicsvisual"
git branch -M main
git remote add origin https://github.com/<your-username>/pydamicsvisual.git
git push -u origin main
```

Then set up a PyPI Trusted Publisher (pypi.org → account → Publishing) with:
- PyPI project name: `pydamicsvisual`
- Owner: `<your-github-username>`
- Repository: `pydamicsvisual`
- Workflow: `publish.yml`
- Environment: `pypi`

Create a matching `pypi` environment under GitHub repo Settings →
Environments, then ship a release (tag `v0.1.0`) to trigger the publish
workflow.
