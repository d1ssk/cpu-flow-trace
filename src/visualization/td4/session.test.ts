import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CpuSession } from './session';

test('playback defaults to the former 2× rate and manual steps keep their model duration', async t => {
  const keys = ['document', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const original = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  let frame: FrameRequestCallback;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false, addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => { frame = callback; return 1; } });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: () => {} });
  const session = new CpuSession([0x60, 0x90, 0xf0], 'overview');
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
  assert.equal(session.getSnapshot().speed, 1);
  session.input('I0'); frame!(0); frame!(100);
  assert.equal(session.getSnapshot().time, 200);
  session.speed(0.125); session.input('I1'); frame!(200);
  assert.equal(session.getSnapshot().time, 225);
  session.speed(4); session.input('I2'); frame!(300);
  assert.equal(session.getSnapshot().time, 1025);
  session.pause(); session.step();
  assert.equal(session.getSnapshot().time, 1125);
});
