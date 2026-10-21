
/* Geometry shared by the netlist and its SVG rendering. */
  const lengthOf = points => points.slice(1).reduce((n, p, i) =>
    n + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
  const pathOf = points => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('');
  const api = {lengthOf, pathOf};
  export default api;
