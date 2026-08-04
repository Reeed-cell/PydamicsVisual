import os
os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

from pydamics import Entity, World
from pydamicsvisual import MatplotlibRenderer, PygameRenderer, floor_bounce


def test_floor_bounce_keeps_entity_above_floor():
    e = Entity(mass=1.0, position=(0, 0.1))
    e.physics2d.gravity(force=9.8)
    world = World()
    world.add(e)
    world.on_step = floor_bounce(floor_y=0.0, radius=0.4, damping=0.65)
    for _ in range(120):
        world.step(1 / 60)
    assert e.position.y >= 0.0 - 1e-9


def test_matplotlib_renderer_tracks_and_animates():
    e = Entity(mass=1.0, position=(0, 5))
    e.physics2d.gravity(force=9.8)
    world = World()
    world.add(e)

    renderer = MatplotlibRenderer(world, xlim=(-2, 2), ylim=(0, 10))
    renderer.track(e, radius=0.3)
    anim = renderer.animate(frames=5, dt=1 / 60)
    assert anim is not None


def test_matplotlib_save_gif(tmp_path):
    e = Entity(mass=1.0, position=(0, 5))
    e.physics2d.gravity(force=9.8)
    world = World()
    world.add(e)
    world.on_step = floor_bounce(floor_y=0.0, radius=0.3)

    renderer = MatplotlibRenderer(world, xlim=(-2, 2), ylim=(0, 10))
    renderer.track(e, radius=0.3)

    out = tmp_path / "test_out.gif"
    renderer.save_gif(str(out), frames=5, dt=1 / 60)
    assert out.exists()
    assert out.stat().st_size > 0


def test_pygame_renderer_constructs_and_tracks():
    e = Entity(mass=1.0, position=(0, 5))
    e.physics2d.gravity(force=9.8)
    world = World()
    world.add(e)

    renderer = PygameRenderer(world, width=200, height=200, ppu=20)
    renderer.track(e, radius=0.3)
    assert e in renderer._tracked


def test_pygame_world_to_screen_conversion():
    world = World()
    renderer = PygameRenderer(world, width=800, height=600, ppu=40, floor_y=0.0)
    from pydamics import Vec2
    sx, sy = renderer._world_to_screen(Vec2(2.0, 3.0))
    assert sx == 80  # 2.0 * 40
    assert sy == 600 - 120  # height - (3.0 * 40)
