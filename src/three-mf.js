import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate';

const MODEL_TYPE = 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml';
const REL_TYPE = 'application/vnd.openxmlformats-package.relationships+xml';
const NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
const START_REL = 'http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel';

// The 3MF package contains one indexed, millimetre-based mesh.
export function create3MF(positions) {
  if (!positions?.length || positions.length % 9 !== 0) throw new Error('No hay una malla triangular para exportar.');
  const unique = new Map(), vertices = [], triangles = [];
  for (let i = 0; i < positions.length; i += 9) {
    const ids = [];
    for (let j = 0; j < 9; j += 3) {
      const x = positions[i + j], y = positions[i + j + 1], z = positions[i + j + 2];
      const key = `${x},${y},${z}`;
      let id = unique.get(key);
      if (id === undefined) { id = unique.size; unique.set(key, id); vertices.push(`<vertex x="${x}" y="${y}" z="${z}"/>`); }
      ids.push(id);
    }
    triangles.push(`<triangle v1="${ids[0]}" v2="${ids[1]}" v3="${ids[2]}"/>`);
  }
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="es-ES" xmlns="${NS}"><resources><object id="1" type="model"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="${REL_TYPE}"/><Default Extension="model" ContentType="${MODEL_TYPE}"/></Types>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rel0" Type="${START_REL}" Target="/3D/3dmodel.model"/></Relationships>`;
  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(relationships),
    '3D/3dmodel.model': strToU8(model)
  }, { level: 6 });
}

export function unitScale3MF(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const modelName = Object.keys(files).find(name => /\.model$/i.test(name));
  if (!modelName) throw new Error('El archivo 3MF no contiene un modelo.');
  const xml = strFromU8(files[modelName]);
  const unit = /<model\b[^>]*\bunit=["']([^"']+)["']/i.exec(xml)?.[1]?.toLowerCase() || 'millimeter';
  const factors = { micron: 0.001, millimeter: 1, centimeter: 10, meter: 1000, inch: 25.4, foot: 304.8 };
  if (!(unit in factors)) throw new Error(`Unidad 3MF no admitida: ${unit}`);
  return factors[unit];
}
