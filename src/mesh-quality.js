// Mesh inspection and conservative repairs for triangle soups such as STL.
// Coordinates stay in millimetres. Topology is determined after welding only
// vertices within a small scale-relative tolerance.
export function prepareMesh(input, { repair = true, maxHoleDiameterRatio = 0.15, minComponentTriangles = 0 } = {}) {
  if (!input || input.length % 9 !== 0) throw new Error('La malla no contiene triángulos válidos.');
  const inputTriangles = input.length / 9;
  if (!inputTriangles) throw new Error('La malla está vacía.');

  const extent = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < input.length; i += 3) {
    const x = input[i], y = input[i + 1], z = input[i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    extent[0] = Math.min(extent[0], x); extent[1] = Math.min(extent[1], y); extent[2] = Math.min(extent[2], z);
    extent[3] = Math.max(extent[3], x); extent[4] = Math.max(extent[4], y); extent[5] = Math.max(extent[5], z);
  }
  const scale = Math.max(extent[3] - extent[0], extent[4] - extent[1], extent[5] - extent[2]);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('La pieza no tiene volumen medible.');
  const tolerance = Math.max(scale * 1e-6, 1e-7);
  const buckets = new Map(), vertices = [], faces = [];
  let removedDegenerate = 0, removedInvalid = 0;

  const vertexId = (x, y, z) => {
    const ix = Math.floor(x / tolerance), iy = Math.floor(y / tolerance), iz = Math.floor(z / tolerance);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const list = buckets.get(`${ix + dx},${iy + dy},${iz + dz}`);
      if (!list) continue;
      for (const id of list) {
        const v = vertices[id];
        if (Math.abs(v[0] - x) <= tolerance && Math.abs(v[1] - y) <= tolerance && Math.abs(v[2] - z) <= tolerance) return id;
      }
    }
    const id = vertices.length, key = `${ix},${iy},${iz}`;
    vertices.push([x, y, z]);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(id);
    return id;
  };

  for (let i = 0; i < input.length; i += 9) {
    const coords = Array.from(input.slice(i, i + 9));
    if (coords.some(v => !Number.isFinite(v))) { removedInvalid++; continue; }
    const a = vertexId(coords[0], coords[1], coords[2]);
    const b = vertexId(coords[3], coords[4], coords[5]);
    const c = vertexId(coords[6], coords[7], coords[8]);
    if (a === b || b === c || c === a) { removedDegenerate++; continue; }
    const A = vertices[a], B = vertices[b], C = vertices[c];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz <= tolerance ** 4) { removedDegenerate++; continue; }
    faces.push([a, b, c]);
  }
  if (!faces.length) throw new Error('La malla no conserva triángulos tras retirar los degenerados.');

  const edgeMap = () => {
    const map = new Map();
    for (let fi = 0; fi < faces.length; fi++) {
      const f = faces[fi];
      for (let j = 0; j < 3; j++) {
        const a = f[j], b = f[(j + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ face: fi, a, b, sign: a < b ? 1 : -1 });
      }
    }
    return map;
  };

  // A valid orientable shell has opposite edge directions on neighboring faces.
  let map = edgeMap(), orientationConflicts = 0, flippedTriangles = 0;
  let faceFlip = new Int8Array(faces.length).fill(-1);
  const orient = () => {
    const adjacent = Array.from({ length: faces.length }, () => []);
    for (const uses of map.values()) if (uses.length === 2) {
      const [a, b] = uses, diff = a.sign === b.sign ? 1 : 0;
      adjacent[a.face].push([b.face, diff]); adjacent[b.face].push([a.face, diff]);
    }
    const components = [];
    for (let root = 0; root < faces.length; root++) {
      if (faceFlip[root] !== -1) continue;
      faceFlip[root] = 0;
      const queue = [root], component = [];
      for (let q = 0; q < queue.length; q++) {
        const fi = queue[q]; component.push(fi);
        for (const [other, diff] of adjacent[fi]) {
          const desired = faceFlip[fi] ^ diff;
          if (faceFlip[other] === -1) { faceFlip[other] = desired; queue.push(other); }
          else if (faceFlip[other] !== desired) orientationConflicts++;
        }
      }
      components.push(component);
    }
    return components;
  };
  let components = orient();
  if (repair) {
    for (let i = 0; i < faces.length; i++) if (faceFlip[i] === 1) { [faces[i][1], faces[i][2]] = [faces[i][2], faces[i][1]]; flippedTriangles++; }
    map = edgeMap();
  }

  let holesFilled = 0, filledTriangles = 0;
  if (repair && !orientationConflicts) {
    const boundary = [...map.values()].filter(uses => uses.length === 1).map(uses => uses[0]);
    const outgoing = new Map();
    for (const edge of boundary) {
      if (!outgoing.has(edge.a)) outgoing.set(edge.a, []);
      outgoing.get(edge.a).push(edge);
    }
    const visited = new Set();
    for (const start of boundary) {
      if (visited.has(start)) continue;
      const loop = [], local = [];
      let edge = start, closed = false;
      while (edge && !visited.has(edge) && loop.length < 16) {
        visited.add(edge); local.push(edge); loop.push(edge.a);
        if (edge.b === start.a) { closed = true; break; }
        const next = (outgoing.get(edge.b) || []).filter(e => !visited.has(e));
        edge = next.length === 1 ? next[0] : null;
      }
      if (!closed || loop.length < 3 || loop.length > 8) continue;
      const points = loop.map(id => vertices[id]);
      let diameter = 0;
      for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
        diameter = Math.max(diameter, Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1], points[i][2] - points[j][2]));
      }
      if (diameter > scale * maxHoleDiameterRatio) continue;
      const p0 = points[0], p1 = points[1], p2 = points[2];
      const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const v = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const nl = Math.hypot(...n);
      if (nl <= tolerance ** 2) continue;
      if (points.some(p => Math.abs((p[0] - p0[0]) * n[0] + (p[1] - p0[1]) * n[1] + (p[2] - p0[2]) * n[2]) / nl > tolerance * 5)) continue;
      // Small planar loops are capped only if the fan has a consistent turn.
      let convex = true, turnSign = 0;
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length], c = points[(i + 2) % points.length];
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const bc = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
        const turn = (ab[1] * bc[2] - ab[2] * bc[1]) * n[0] + (ab[2] * bc[0] - ab[0] * bc[2]) * n[1] + (ab[0] * bc[1] - ab[1] * bc[0]) * n[2];
        if (Math.abs(turn) <= tolerance ** 3) continue;
        const sign = Math.sign(turn);
        if (turnSign && sign !== turnSign) { convex = false; break; }
        turnSign = sign;
      }
      if (!convex) continue;
      for (let i = 1; i < loop.length - 1; i++) { faces.push([loop[0], loop[i + 1], loop[i]]); filledTriangles++; }
      holesFilled++;
    }
    if (holesFilled) map = edgeMap();
  }

  // Recompute connected shells after repairs and make each outward oriented.
  const adjacent = Array.from({ length: faces.length }, () => []);
  for (const uses of map.values()) if (uses.length === 2) {
    adjacent[uses[0].face].push(uses[1].face); adjacent[uses[1].face].push(uses[0].face);
  }
  const seen = new Uint8Array(faces.length); components = [];
  for (let root = 0; root < faces.length; root++) {
    if (seen[root]) continue;
    const queue = [root], component = []; seen[root] = 1;
    for (let q = 0; q < queue.length; q++) {
      const fi = queue[q]; component.push(fi);
      for (const other of adjacent[fi]) if (!seen[other]) { seen[other] = 1; queue.push(other); }
    }
    components.push(component);
  }
  let removedComponents = 0, removedComponentTriangles = 0;
  if (minComponentTriangles > 0 && components.length > 1) {
    const kept = components.filter(component => component.length >= minComponentTriangles);
    if (kept.length && kept.length < components.length) {
      removedComponents = components.length - kept.length;
      removedComponentTriangles = faces.length - kept.reduce((sum, component) => sum + component.length, 0);
      const keptFaces = kept.map(component => component.map(fi => faces[fi]));
      faces.length = 0; components = [];
      for (const shell of keptFaces) {
        const ids = [];
        for (const face of shell) { ids.push(faces.length); faces.push(face); }
        components.push(ids);
      }
      map = edgeMap();
    }
  }
  let signedVolume = 0, flippedShells = 0;
  for (const component of components) {
    let volume = 0;
    for (const fi of component) {
      const [a, b, c] = faces[fi], A = vertices[a], B = vertices[b], C = vertices[c];
      volume += (A[0] * (B[1] * C[2] - B[2] * C[1]) + A[1] * (B[2] * C[0] - B[0] * C[2]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
    }
    if (repair && volume < 0) {
      for (const fi of component) [faces[fi][1], faces[fi][2]] = [faces[fi][2], faces[fi][1]];
      volume = -volume; flippedShells++;
    }
    signedVolume += volume;
  }

  const boundaryEdges = [...map.values()].filter(uses => uses.length === 1).length;
  const nonManifoldEdges = [...map.values()].filter(uses => uses.length > 2).length;
  const misorientedEdges = [...map.values()].filter(uses => uses.length === 2 && uses[0].sign === uses[1].sign).length;
  const valid = boundaryEdges === 0 && nonManifoldEdges === 0 && misorientedEdges === 0 && orientationConflicts === 0 && Math.abs(signedVolume) > tolerance ** 3;
  const output = new Float32Array(faces.length * 9);
  for (let i = 0; i < faces.length; i++) for (let j = 0; j < 3; j++) output.set(vertices[faces[i][j]], i * 9 + j * 3);
  const componentSizes = components.map(component => component.length).sort((a, b) => b - a);
  return { positions: output, report: { valid, inputTriangles, triangles: faces.length, vertices: vertices.length,
    removedDegenerate, removedInvalid, flippedTriangles, flippedShells, holesFilled, filledTriangles,
    removedComponents, removedComponentTriangles,
    boundaryEdges, nonManifoldEdges, misorientedEdges, orientationConflicts, components: components.length,
    largestComponentTriangles: componentSizes[0], tinyComponents: componentSizes.filter(n => n < 100).length,
    volumeMm3: Math.abs(signedVolume), toleranceMm: tolerance } };
}
