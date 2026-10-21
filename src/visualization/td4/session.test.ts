import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { CpuSession } from './session';
import type { View } from '../../circuits/td4/runtime';

async function setup(t: TestContext, view: View = 'overview') {
  const keys = ['document', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const original = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  let frame: FrameRequestCallback;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false, addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => { frame = callback; return 1; } });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: () => {} });
  const session = new CpuSession([0x60, 0x90, 0xf0], view);
  t.after(() => {
    session.stop();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const ready = new Promise<void>(resolve => session.subscribe(() => { if (!session.getSnapshot().loading) resolve(); }));
  session.start(); await ready;
  assert.equal(session.getSnapshot().error, null);
  let now = 0;
  const tick = () => { frame!(now); now += 100; };
  const until = (condition: () => boolean) => {
    for (let i = 0; !condition(); i++) { assert.ok(i < 1000, 'playback must reach its target'); tick(); }
  };
  return { session, tick, until };
}

test('playback defaults to the former 2× rate and manual steps keep their model duration', async t => {
  const { session, tick } = await setup(t);
  assert.equal(session.getSnapshot().speed, 1);
  session.input('I0'); session.togglePlayback(); tick(); tick();
  assert.equal(session.getSnapshot().time, 200);
  session.speed(0.125); session.input('I1'); tick();
  assert.equal(session.getSnapshot().time, 225);
  session.speed(4); session.input('I2'); tick();
  assert.equal(session.getSnapshot().time, 1025);
  session.pause(); session.step();
  assert.equal(session.getSnapshot().time, 1125);
});

for (const view of ['overview', 'module', 'mos-power'] as const) {
  test(`${view}: pause freezes in-flight wires immediately and play resumes without resetting`, async t => {
    const { session, tick, until } = await setup(t, view);
    assert.equal(session.getSnapshot().mode, 'paused');
    session.input('I0'); tick(); tick();
    assert.equal(session.getSnapshot().time, 0);
    session.togglePlayback(); tick(); tick();
    session.togglePlayback();
    assert.ok(session.getSnapshot().busy);
    const snapshot = JSON.stringify(session.getSnapshot());
    const wires = JSON.stringify(session.sim!.wires);
    for (let i = 0; i < 20; i++) tick();
    assert.equal(JSON.stringify(session.getSnapshot()), snapshot);
    assert.equal(JSON.stringify(session.sim!.wires), wires);
    session.togglePlayback(); session.speed(4);
    until(() => session.getSnapshot().cycles >= 2 && session.getSnapshot().output === 1);
    session.pause();
    const stopped = JSON.stringify(session.getSnapshot()); tick(); tick();
    assert.equal(JSON.stringify(session.getSnapshot()), stopped);
  });

  test(`${view}: instruction step handles pending input, finishes a partial clock, and stops after exactly one instruction`, async t => {
    const { session, tick, until } = await setup(t, view);
    session.speed(4); session.input('I1'); session.input('I3');
    session.clock(); until(() => session.getSnapshot().mode === 'paused');
    assert.equal(session.getSnapshot().cycles, 1);
    assert.equal(session.getSnapshot().registers.b, 10);
    assert.ok(session.getSnapshot().ready);
    const time = session.getSnapshot().time; tick(); tick();
    assert.equal(session.getSnapshot().time, time);
    session.clock(); until(() => session.getSnapshot().cycles === 2);
    session.pause(); assert.ok(session.getSnapshot().busy);
    session.clock(); until(() => session.getSnapshot().mode === 'paused');
    assert.equal(session.getSnapshot().cycles, 2);
    assert.equal(session.getSnapshot().output, 10);
    session.next();
    assert.equal(session.getSnapshot().mode, 'paused');
    assert.ok(session.getSnapshot().busy);
    for (let i = 0; session.getSnapshot().busy; i++) { assert.ok(i < 10000); session.next(); }
    assert.equal(session.getSnapshot().cycles, 3);
    const stepped = session.getSnapshot().time; tick(); tick();
    assert.equal(session.getSnapshot().time, stepped);
    session.step();
    assert.equal(session.getSnapshot().time, stepped + 100);
    assert.equal(session.getSnapshot().mode, 'paused');
  });
}

test('reset and program selection return to a paused start, and a construction switch completes a single step', async t => {
  const { session, tick, until } = await setup(t);
  session.clock(); tick(); tick();
  await session.changeView('module');
  assert.equal(session.getSnapshot().mode, 'paused');
  assert.equal(session.getSnapshot().cycles, 1);
  session.togglePlayback(); session.speed(4);
  until(() => session.getSnapshot().cycles > 1);
  for (const action of [() => session.reset(), () => session.loadProgram([0xb7, 0xf1])]) {
    action();
    const ready = new Promise<void>(resolve => {
      const unsubscribe = session.subscribe(() => { if (!session.getSnapshot().loading) { unsubscribe(); resolve(); } });
    });
    await ready; tick(); tick();
    assert.equal(session.getSnapshot().mode, 'paused');
    assert.equal(session.getSnapshot().time, 0);
    assert.equal(session.getSnapshot().cycles, 0);
  }
});
