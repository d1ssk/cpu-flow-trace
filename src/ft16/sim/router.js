/* Orthogonal net router. Each net is routed as a tree with A* on the grid:
 * modules (with a one-cell halo) are obstacles; sharing a grid edge with
 * another net is a violation, crossing another net at a node is allowed,
 * but turning on a node another net uses is not (it would look like a
 * junction). Nets that end up sharing edges are ripped up and rerouted with
 * growing history costs on contested edges (negotiated congestion), and the
 * best result is kept. Branching far along an existing trunk costs part of
 * the inherited length (a wire's travel time is its whole length). Steps outside the modules' bounding box cost a
 * little more, so wires prefer inner channels to the outer margin. */

export const GRID = 10;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // right, down, left, up
const OUTWARD = { right: 0, bottom: 1, left: 2, top: 3 };

export const ROUTER = { BEND: 3, CROSS: 2, CONFLICT: 100, OUTSIDE: 0.6, HALO: 1.5, HISTORY: 8, ROUNDS: 24, TRUNK: Number(globalThis.process?.env?.TRUNK ?? 0.5) };

class Heap {
  constructor() { this.keys = []; this.values = []; }
  get size() { return this.keys.length; }
  push(value, key) {
    const k = this.keys, v = this.values;
    k.push(key); v.push(value);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p;
    }
  }
  pop() {
    const k = this.keys, v = this.values, top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m;
      }
    }
    return top;
  }
}

export function route(modules, nets) {
  const W = Math.max(...modules.map(m => m.gx + m.gw)) + 4;
  const H = Math.max(...modules.map(m => m.gy + m.gh)) + 4;
  const N = W * H;
  const id = (x, y) => y * W + x;
  const blocked = new Uint8Array(N);
  const reserved = new Int32Array(N).fill(-1);
  const outside = new Uint8Array(N);
  const minX = Math.min(...modules.map(m => m.gx)), maxX = Math.max(...modules.map(m => m.gx + m.gw));
  const minY = Math.min(...modules.map(m => m.gy)), maxY = Math.max(...modules.map(m => m.gy + m.gh));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < minX || x > maxX || y < minY || y > maxY) outside[id(x, y)] = 1;
  const netIndex = new Map(nets.map((n, i) => [n.id, i]));

  // Module boxes block; the ring of cells around each box is usable but
  // costs extra, so wires keep off box edges unless a channel is crowded.
  const halo = new Uint8Array(N);
  for (const m of modules) {
    for (let y = m.gy - 1; y <= m.gy + m.gh + 1; y++) {
      for (let x = m.gx - 1; x <= m.gx + m.gw + 1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const inside = x >= m.gx && x <= m.gx + m.gw && y >= m.gy && y <= m.gy + m.gh;
        if (inside) blocked[id(x, y)] = 1; else halo[id(x, y)] = 1;
      }
    }
  }
  const pinInfo = new Map();
  for (const m of modules) {
    for (const p of m.ports) {
      const out = OUTWARD[p.side];
      const [dx, dy] = DIRS[out];
      const stub = id(p.gx + dx, p.gy + dy);
      pinInfo.set(`${m.id}.${p.name}`, { node: id(p.gx, p.gy), stub, out });
      blocked[stub] = 0;
    }
  }
  for (const net of nets) {
    const ni = netIndex.get(net.id);
    for (const key of [net.from, ...net.sinks]) reserved[pinInfo.get(key).stub] = ni;
  }

  // Occupancy: how many nets use each edge / node / corner, plus which.
  const edgeKey = (u, d) => (d === 0 ? u * 2 : d === 2 ? (u - 1) * 2 : d === 1 ? u * 2 + 1 : (u - W) * 2 + 1);
  const edgeUse = new Int32Array(N * 2), nodeUse = new Int32Array(N), cornerUse = new Int32Array(N);
  const history = new Float32Array(N * 2);
  const routes = new Array(nets.length); // per net: {edges:Set, nodes:Set, corners:Set, wires, dots}

  const S = N * 4;
  const dist = new Float64Array(S), stamp = new Uint32Array(S), prev = new Int32Array(S);
  let generation = 0;

  function routeNet(ni) {
    const net = nets[ni];
    const src = pinInfo.get(net.from);
    const r = { edges: new Set(), nodes: new Set(), corners: new Set(), wires: [], dots: [] };
    const parent = new Map([[src.node, -1], [src.stub, src.node]]);
    const inTree = new Set([src.stub]);
    // Wire length from the source along the tree: a branch inherits it, and
    // its travel time is the whole length, so starting far out costs extra.
    const along = new Map([[src.stub, 0]]);
    const degree = new Map();
    const bump = n => degree.set(n, (degree.get(n) ?? 0) + 1);
    r.nodes.add(src.stub);
    const sinks = [...net.sinks].sort((a, b) => manhattan(pinInfo.get(a).stub, src.stub) - manhattan(pinInfo.get(b).stub, src.stub));
    for (const sinkKey of sinks) {
      const target = pinInfo.get(sinkKey);
      const path = search(ni, inTree, src, target.stub, along);
      for (let i = 1; i < path.length; i++) {
        const [u] = path[i - 1], [v, d] = path[i];
        r.edges.add(edgeKey(u, d));
        parent.set(v, u);
        r.nodes.add(v);
        inTree.add(v);
        along.set(v, (along.get(u) ?? 0) + 1);
        if (i > 1 && path[i - 1][1] !== d) r.corners.add(u);
        if (i === 1) { bump(u); if (parent.get(u) !== undefined && u !== src.stub) r.corners.add(u); }
      }
      parent.set(target.node, target.stub);
      const pts = [];
      for (let n = target.node; n !== -1; n = parent.get(n)) pts.push([(n % W) * GRID, ((n / W) | 0) * GRID]);
      pts.reverse();
      const points = simplify(pts);
      let length = 0;
      for (let i = 1; i < points.length; i++) length += Math.abs(points[i][0] - points[i - 1][0]) + Math.abs(points[i][1] - points[i - 1][1]);
      r.wires.push({ id: `${net.id}>${sinkKey}`, net: net.id, from: net.from, to: sinkKey, width: net.width, points, length });
    }
    for (const [n, count] of degree) {
      const isEndpoint = n === src.stub && count === 1 && sinks.length === 1;
      if (!isEndpoint && (count > 1 || n !== src.stub)) r.dots.push([(n % W) * GRID, ((n / W) | 0) * GRID]);
    }
    return r;
  }
  const apply = (r, sign) => {
    for (const e of r.edges) edgeUse[e] += sign;
    for (const n of r.nodes) nodeUse[n] += sign;
    for (const c of r.corners) cornerUse[c] += sign;
  };
  const violationsOf = () => {
    let count = 0;
    for (let e = 0; e < edgeUse.length; e++) if (edgeUse[e] > 1) count += edgeUse[e] - 1;
    return count;
  };

  // Initial pass: short nets first; they have the fewest alternatives.
  const order = nets.map((_, i) => i).sort((a, b) => span(nets[a]) - span(nets[b]));
  for (const ni of order) { routes[ni] = routeNet(ni); apply(routes[ni], 1); }
  let best = { violations: violationsOf(), routes: [...routes] };
  // A fixed number of rounds (not a time budget) keeps layouts deterministic.
  for (let round = 0; round < ROUTER.ROUNDS && best.violations > 0; round++) {
    const bad = [];
    for (let ni = 0; ni < nets.length; ni++) {
      let hit = false;
      for (const e of routes[ni].edges) if (edgeUse[e] > 1) { history[e] += 1; hit = true; }
      if (hit) bad.push(ni);
    }
    // Reroute the offending nets, longest first this time.
    bad.sort((a, b) => span(nets[b]) - span(nets[a]));
    for (const ni of bad) { apply(routes[ni], -1); routes[ni] = routeNet(ni); apply(routes[ni], 1); }
    const v = violationsOf();
    if (v < best.violations) best = { violations: v, routes: [...routes] };
  }

  // Polish: from the best result, reroute each conflicting net alone with a
  // much higher conflict cost; keep the change only if it removes violations.
  if (best.violations > 0) {
    for (let ni = 0; ni < nets.length; ni++) apply(routes[ni], -1);
    best.routes.forEach((r, ni) => { routes[ni] = r; apply(r, 1); });
    const conflict = ROUTER.CONFLICT;
    for (let pass = 0; pass < 2 && best.violations > 0; pass++) {
      for (let ni = 0; ni < nets.length && best.violations > 0; ni++) {
        if (![...routes[ni].edges].some(e => edgeUse[e] > 1)) continue;
        const old = routes[ni];
        apply(old, -1);
        ROUTER.CONFLICT = conflict * 30;
        const candidate = routeNet(ni);
        ROUTER.CONFLICT = conflict;
        apply(candidate, 1);
        const v = violationsOf();
        if (v < best.violations) { routes[ni] = candidate; best = { violations: v, routes: [...routes] }; }
        else { apply(candidate, -1); apply(old, 1); }
      }
    }
  }

  // Detours: a net whose wire to some sink is far longer than the straight
  // distance is rerouted with a heavy trunk cost (branches near the source);
  // the new route is kept if it has fewer long wires and no more violations.
  const longWires = r => r.wires.filter(w => {
    const [a, b] = [w.points[0], w.points.at(-1)];
    return w.length > 2 * (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])) + 300;
  }).length;
  for (let ni = 0; ni < nets.length; ni++) apply(routes[ni], -1);
  best.routes.forEach((r, ni) => { routes[ni] = r; apply(r, 1); });
  for (let ni = 0; ni < nets.length; ni++) {
    const old = routes[ni], before = longWires(old);
    if (!before) continue;
    apply(old, -1);
    const trunk = ROUTER.TRUNK;
    ROUTER.TRUNK = 4;
    const candidate = routeNet(ni);
    ROUTER.TRUNK = trunk;
    apply(candidate, 1);
    if (longWires(candidate) < before && violationsOf() <= best.violations) { routes[ni] = candidate; best = { violations: violationsOf(), routes: [...routes] }; }
    else { apply(candidate, -1); apply(old, 1); }
  }

  // Which nets share an edge in the result (for layout diagnostics).
  const owners = new Map();
  best.routes.forEach((r, ni) => { for (const e of r.edges) owners.set(e, [...(owners.get(e) ?? []), nets[ni].id]); });
  const conflicts = [...new Set([...owners.values()].filter(list => list.length > 1).map(list => list.join(' & ')))];
  const wires = [], junctions = new Map();
  best.routes.forEach((r, ni) => {
    wires.push(...r.wires);
    if (r.dots.length) junctions.set(nets[ni].id, r.dots);
  });
  return { wires, junctions, violations: best.violations, conflicts };

  function span(net) {
    const pts = [net.from, ...net.sinks].map(k => pinInfo.get(k).node);
    const xs = pts.map(p => p % W), ys = pts.map(p => (p / W) | 0);
    return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys);
  }
  function manhattan(a, b) { return Math.abs(a % W - b % W) + Math.abs(((a / W) | 0) - ((b / W) | 0)); }

  function search(ni, tree, src, target, along) {
    generation++;
    const heap = new Heap();
    const tx = target % W, ty = (target / W) | 0;
    const h = n => Math.abs(n % W - tx) + Math.abs(((n / W) | 0) - ty);
    for (const n of tree) {
      const startDir = n === src.stub ? src.out : -1;
      // Branching off the trunk where another net crosses would look like a junction of both.
      const penalty = n === src.stub ? 0 : 0.5 + ROUTER.TRUNK * (along.get(n) ?? 0) + (nodeUse[n] > 0 ? ROUTER.CONFLICT : 0);
      for (let d = 0; d < 4; d++) {
        if (startDir !== -1 && d !== startDir) continue;
        const s = n * 4 + d;
        stamp[s] = generation; dist[s] = penalty; prev[s] = -1;
        heap.push(s, penalty + h(n));
      }
    }
    while (heap.size) {
      const s = heap.pop();
      const u = (s / 4) | 0, du = s % 4;
      if (u === target) {
        const path = [];
        for (let t = s; t !== -1; t = prev[t]) path.push([(t / 4) | 0, t % 4]);
        return path.reverse();
      }
      const base = dist[s];
      const x = u % W, y = (u / W) | 0;
      for (let d = 0; d < 4; d++) {
        if ((d + 2) % 4 === du && prev[s] !== -1) continue;
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const v = id(nx, ny);
        if (blocked[v] && v !== target) continue;
        if (reserved[v] !== -1 && reserved[v] !== ni) continue;
        if (tree.has(v)) continue;
        let cost = base + 1 + (outside[v] ? ROUTER.OUTSIDE : 0) + (halo[v] ? ROUTER.HALO : 0);
        if (d !== du && prev[s] !== -1) {
          cost += ROUTER.BEND;
          if (nodeUse[u] > 0) cost += ROUTER.CONFLICT;
        }
        const e = edgeKey(u, d);
        const onEdge = edgeUse[e];
        if (onEdge > 0) cost += ROUTER.CONFLICT * onEdge;
        cost += history[e] * ROUTER.HISTORY;
        if (nodeUse[v] > 0) {
          cost += ROUTER.CROSS;
          if (cornerUse[v] > 0) cost += ROUTER.CONFLICT;
        }
        const t = v * 4 + d;
        if (stamp[t] === generation && dist[t] <= cost) continue;
        stamp[t] = generation; dist[t] = cost; prev[t] = s;
        heap.push(t, cost + h(v));
      }
    }
    throw new Error(`No route for net ${nets[ni].id} → node ${target}`);
  }
}

function simplify(points) {
  const out = [];
  for (const p of points) {
    if (out.length >= 2) {
      const a = out[out.length - 2], b = out[out.length - 1];
      if ((a[0] === b[0] && b[0] === p[0]) || (a[1] === b[1] && b[1] === p[1])) { out[out.length - 1] = p; continue; }
    }
    if (out.length && out[out.length - 1][0] === p[0] && out[out.length - 1][1] === p[1]) continue;
    out.push(p);
  }
  return out;
}
