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
renderer.run(dt=1/120)   # blocks until window closed / ESC
```

## API

**`floor_bounce(floor_y=0.0, radius=0.4, damping=0.65, x_bounds=None)`**
Returns a callable for `world.on_step` that keeps entities above the floor
(and optionally between walls), bouncing with energy loss on contact.
This is demo-level logic, not a real collision system.

**`MatplotlibRenderer(world, xlim, ylim, floor_y=0.0, title=..., figsize=(6,6))`**
- `.track(entity, color=None, radius=0.4)` — register an entity to draw (auto color if omitted)
- `.animate(frames=180, dt=1/60, steps_per_frame=1, interval=33)` — returns a `FuncAnimation`
- `.save_gif(path, frames=180, dt=1/60, steps_per_frame=1, fps=30)` — steps the sim and saves a GIF

**`PygameRenderer(world, width=800, height=600, ppu=40, floor_y=0.0, title=...)`**
- `.track(entity, color=None, radius=0.4)`
- `.on_click(callback)` — `callback(x_world, y_world)` fires on every mouse click
- `.run(dt=1/120, fps=60)` — opens the window, steps physics on a background thread, blocks until closed/ESC

## Examples

```bash
pip install -e ".[dev]"
python examples/matplotlib_demo.py   # -> examples/falling_balls.gif
python examples/pygame_demo.py       # interactive window, click to drop balls
```

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
