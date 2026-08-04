import os
os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

import pytest
import pygame
import pydamics
from pydamics import Entity, World
from pydamicsvisual import PygameRenderer


def test_step_advances_physics_synchronously():
    e = Entity(mass=1.0, position=(0, 10))
    e.physics2d.gravity(force=9.8)
    world = World()
    world.add(e)
    renderer = PygameRenderer(world, width=200, height=200, ppu=20)
    renderer.track(e, radius=0.3)

    before = e.position.y
    renderer.step(dt=1 / 60)
    renderer.step(dt=1 / 60)  # velocity verlet's first step only updates
    after = e.position.y      # velocity (zero cached accel); check over two

    assert after < before  # physics actually advanced, synchronously within step()
    assert world.running is False  # confirms no background thread was started


def test_step_returns_true_before_quit_false_after():
    world = World()
    renderer = PygameRenderer(world, width=200, height=200)
    assert renderer.step(dt=1 / 60) is True

    quit_event = pygame.event.Event(pygame.QUIT)
    pygame.event.post(quit_event)
    assert renderer.step(dt=1 / 60) is False


def test_on_frame_fires_once_per_step():
    world = World()
    renderer = PygameRenderer(world, width=200, height=200)
    calls = []
    renderer.on_frame(lambda screen, dt: calls.append(dt))

    renderer.step(dt=1 / 60)
    renderer.step(dt=1 / 60)

    assert calls == [1 / 60, 1 / 60]


def test_on_key_fires_on_keydown_and_keyup():
    world = World()
    renderer = PygameRenderer(world, width=200, height=200)
    events = []
    renderer.on_key(lambda key, pressed: events.append((key, pressed)))

    pygame.event.post(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_SPACE))
    renderer.step(dt=1 / 60)
    pygame.event.post(pygame.event.Event(pygame.KEYUP, key=pygame.K_SPACE))
    renderer.step(dt=1 / 60)

    assert (pygame.K_SPACE, True) in events
    assert (pygame.K_SPACE, False) in events


def test_on_event_fires_for_raw_events():
    world = World()
    renderer = PygameRenderer(world, width=200, height=200)
    seen = []
    renderer.on_event(lambda event: seen.append(event.type))

    pygame.event.post(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_a))
    renderer.step(dt=1 / 60)

    assert pygame.KEYDOWN in seen


def test_box_shape_tracked_and_drawn_without_crash():
    crate = Entity(mass=1.0, position=(0, 0))
    world = World()
    world.add(crate)
    renderer = PygameRenderer(world, width=400, height=400, ppu=20)
    renderer.track(crate, shape="box", width=2, height=1)
    renderer.step(dt=1 / 60)  # should draw the rectangle without error


def test_track_solid_reads_seo_shape_box():
    class Platform:
        pass

    platform = pydamics.solidify(Platform(), position=(0, 0))
    platform.seo.solid(width=4, height=1)

    world = World()
    renderer = PygameRenderer(world, width=400, height=400, ppu=20)
    renderer.track_solid(platform)

    entry = renderer._tracked[platform]
    assert entry["shape"] == "box"
    assert entry["width"] == 4 and entry["height"] == 1


def test_track_solid_reads_seo_shape_circle():
    class Boulder:
        pass

    boulder = pydamics.solidify(Boulder(), position=(0, 0))
    boulder.seo.solid(radius=1.5)

    world = World()
    renderer = PygameRenderer(world, width=400, height=400, ppu=20)
    renderer.track_solid(boulder)

    entry = renderer._tracked[boulder]
    assert entry["shape"] == "circle"
    assert entry["radius"] == 1.5


def test_track_solid_without_shape_raises():
    class Platform:
        pass

    platform = pydamics.solidify(Platform(), position=(0, 0))
    world = World()
    renderer = PygameRenderer(world, width=400, height=400)
    with pytest.raises(ValueError):
        renderer.track_solid(platform)


def test_draw_text_requires_active_window():
    world = World()
    renderer = PygameRenderer(world, width=200, height=200)
    with pytest.raises(RuntimeError):
        renderer.draw_text("hi", pos=(10, 10))  # no step() called yet, no window


def test_draw_text_works_inside_on_frame():
    world = World()
    renderer = PygameRenderer(world, width=200, height=200)
    renderer.on_frame(lambda screen, dt: renderer.draw_text("Score: 0", pos=(10, 10)))
    renderer.step(dt=1 / 60)  # should not raise


def test_font_cache_reuses_font_objects():
    from pydamicsvisual.pygame_renderer import _get_font, _font_cache
    pygame.font.init()
    f1 = _get_font(None, 24)
    f2 = _get_font(None, 24)
    assert f1 is f2  # same (family, size) -> cached, not recreated
