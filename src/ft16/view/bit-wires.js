/* Parallel bit lanes inside the router's 10-unit channels. The simulator
 * still transports whole words atomically; each lane shows its own bit of
 * that same event, with the same departure and arrival time. */
export const bitPitch = width => width <= 1 ? 0 : Math.min(1.6, 7.5 / (width - 1));
export const bitOffset = (width, bit) => (bit - (width - 1) / 2) * bitPitch(width);
export const bitStroke = width => width === 1 ? 1.4 : bitPitch(width) * 0.6;
export const bitValue = (value, bit) => (value >>> bit) & 1;

const direction = (a, b) => [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
const normal = ([x, y]) => [-y, x];

export function bitPin(port, bit) {
  const outward = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }[port.side];
  const [nx, ny] = normal(outward);
  const offset = bitOffset(port.width, bit) * (port.dir === 'in' ? -1 : 1);
  return [port.x + nx * offset, port.y + ny * offset];
}

export function bitLane(wire, bit) {
  const offset = bitOffset(wire.width, bit);
  const points = wire.points.map((p, i, all) => {
    const before = i ? normal(direction(all[i - 1], p)) : null;
    const after = i + 1 < all.length ? normal(direction(p, all[i + 1])) : null;
    // Intersect the offset horizontal/vertical segments at a bend. Using
    // a translation of the whole path would cross the bits at every bend.
    const n = !before ? after : !after ? before
      : before[0] === after[0] && before[1] === after[1] ? before
        : [before[0] + after[0], before[1] + after[1]];
    return [p[0] + n[0] * offset, p[1] + n[1] * offset];
  });
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const length = lengths.reduce((a, b) => a + b, 0);
  const timing = [{ at: 0, distance: 0 }];
  let modelDistance = 0, visualDistance = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = wire.points[i], next = wire.points[i + 1];
    modelDistance += Math.hypot(p[0] - wire.points[i - 1][0], p[1] - wire.points[i - 1][1]);
    visualDistance += lengths[i - 1];
    const incoming = direction(wire.points[i - 1], p), outgoing = direction(p, next);
    const shift = [points[i][0] - p[0], points[i][1] - p[1]];
    const dot = d => shift[0] * d[0] + shift[1] * d[1];
    // Preserve the centreline travel speed along the shared trunk. Scaling
    // each complete lane by its own length would put fan-out wavefronts at
    // different positions on the SAME trunk. Only the short bend region
    // absorbs the difference in inner/outer lane length.
    timing.push({ at: modelDistance + dot(incoming), distance: visualDistance });
    const resume = Math.min(5, Math.hypot(next[0] - p[0], next[1] - p[1]) / 2);
    timing.push({ at: modelDistance + resume, distance: visualDistance + resume - dot(outgoing) });
  }
  timing.push({ at: wire.length, distance: length });
  return { bit, points, lengths, length, timing, modelLength: wire.length };
}

export function laneProgress(lane, fraction) {
  const at = Math.max(0, Math.min(1, fraction)) * lane.modelLength;
  for (let i = 1; i < lane.timing.length; i++) {
    const a = lane.timing[i - 1], b = lane.timing[i];
    if (at <= b.at) return (a.distance + (b.distance - a.distance) * (at - a.at) / (b.at - a.at)) / lane.length;
  }
  return 1;
}

export function lanePoint(lane, fraction) {
  let left = Math.max(0, Math.min(1, fraction)) * lane.length;
  for (let i = 0; i < lane.lengths.length; i++) {
    const length = lane.lengths[i];
    if (left <= length) {
      const t = length ? left / length : 0, a = lane.points[i], b = lane.points[i + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= length;
  }
  return lane.points.at(-1);
}

/* A junction may be inside a simplified straight segment or at a bend.
 * Return its bit-lane position and its centreline distance from the source. */
export function laneJunction(wire, lane, point) {
  let distance = 0;
  for (let i = 1; i < wire.points.length; i++) {
    const a = wire.points[i - 1], b = wire.points[i];
    const length = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    if (point[0] >= Math.min(a[0], b[0]) && point[0] <= Math.max(a[0], b[0]) &&
        point[1] >= Math.min(a[1], b[1]) && point[1] <= Math.max(a[1], b[1])) {
      const along = Math.abs(point[0] - a[0]) + Math.abs(point[1] - a[1]);
      const p = along === length ? lane.points[i] : along === 0 ? lane.points[i - 1]
        : a[0] === b[0] ? [lane.points[i][0], point[1]] : [point[0], lane.points[i][1]];
      const d = direction(a, b);
      const shift = (p[0] - point[0]) * d[0] + (p[1] - point[1]) * d[1];
      return { point: p, fraction: (distance + along + shift) / wire.length };
    }
    distance += length;
  }
  return null;
}
