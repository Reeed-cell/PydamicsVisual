import os
os.environ.setdefault("SDL_VIDEODRIVER", "dummy")

import pytest
import pydamics
from pydamics import Entity, World
from pydamicsvisual import MatplotlibRenderer


def test_box_shape_tracked_and_renders():
    crate = Entity(mass=1.0, position=(0, 0))
    world = World()
    world.add(crate)
    renderer = MatplotlibRenderer(world, xlim=(-5, 5), ylim=(-5, 5))
    renderer.track(crate, shape="box", width=2, height=1)

    entry = renderer._tracked[0]
    assert entry["shape"] == "box"
    # Rectangle's xy is the bottom-left corner, centered on the entity
    assert entry["patch"].get_x() == -1.0  # center.x - width/2
    assert entry["patch"].get_y() == -0.5  # center.y - height/2


def test_box_patch_follows_entity_across_steps():
    crate = Entity(mass=1.0, position=(0, 10))
    crate.physics2d.gravity(force=9.8)
    world = World()
    world.add(crate)
    renderer = MatplotlibRenderer(world, xlim=(-5, 15), ylim=(-5, 15))
    renderer.track(crate, shape="box", width=2, height=1)

    renderer.animate(frames=5, dt=1 / 60)  # constructs FuncAnimation
    renderer._update(0, 1 / 60, 1)  # manually drive one update
    entry = renderer._tracked[0]
    assert entry["patch"].get_x() == crate.position.x - 1.0
    assert entry["patch"].get_y() == crate.position.y - 0.5


def test_track_solid_reads_seo_shape_box():
    class Platform:
        pass

    platform = pydamics.solidify(Platform(), position=(0, 0))
    platform.seo.solid(width=4, height=1)

    world = World()
    renderer = MatplotlibRenderer(world, xlim=(-5, 5), ylim=(-5, 5))
    renderer.track_solid(platform)

    entry = renderer._tracked[0]
    assert entry["shape"] == "box"
    assert entry["width"] == 4 and entry["height"] == 1


def test_track_solid_reads_seo_shape_circle():
    class Boulder:
        pass

    boulder = pydamics.solidify(Boulder(), position=(0, 0))
    boulder.seo.solid(radius=1.5)

    world = World()
    renderer = MatplotlibRenderer(world, xlim=(-5, 5), ylim=(-5, 5))
    renderer.track_solid(boulder)

    entry = renderer._tracked[0]
    assert entry["shape"] == "circle"
    assert entry["radius"] == 1.5


def test_track_solid_without_shape_raises():
    class Platform:
        pass

    platform = pydamics.solidify(Platform(), position=(0, 0))
    world = World()
    renderer = MatplotlibRenderer(world, xlim=(-5, 5), ylim=(-5, 5))
    with pytest.raises(ValueError):
        renderer.track_solid(platform)


def test_label_adds_text_annotation():
    world = World()
    renderer = MatplotlibRenderer(world, xlim=(-5, 5), ylim=(-5, 5))
    text_artist = renderer.label((1, 2), "Start")
    assert text_artist.get_text() == "Start"
    assert text_artist.get_position() == (1, 2)


def test_save_png_current_state(tmp_path):
    ball = Entity(mass=1.0, position=(0, 5))
    world = World()
    world.add(ball)
    renderer = MatplotlibRenderer(world, xlim=(-5, 5), ylim=(-5, 10))
    renderer.track(ball)

    out = tmp_path / "snapshot.png"
    renderer.save_png(str(out))
    assert out.exists()
    assert out.stat().st_size > 0


def test_save_png_after_steps_advances_first(tmp_path):
    ball = Entity(mass=1.0, position=(0, 10))
    ball.physics2d.gravity(force=9.8)
    world = World()
    world.add(ball)
    renderer = MatplotlibRenderer(world, xlim=(-5, 5), ylim=(-5, 15))
    renderer.track(ball)

    position_before = ball.position.y
    out = tmp_path / "later.png"
    renderer.save_png(str(out), after_steps=60, dt=1 / 60)

    assert ball.position.y < position_before  # world actually stepped forward first
    assert out.exists()
