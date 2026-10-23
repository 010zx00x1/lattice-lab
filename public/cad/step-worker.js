// occt-import-js is distributed as a separate, unmodified WASM library.
// Its LGPL notices and source are linked in the About dialog.
importScripts('/cad/occt-import-js.js');

let importerPromise;
self.onmessage = async ({ data }) => {
  try {
    importerPromise ||= occtimportjs({ locateFile: path => path.endsWith('.wasm') ? '/cad/occt-import-js.wasm' : path });
    const occt = await importerPromise;
    const result = occt.ReadStepFile(new Uint8Array(data.buffer), {
      linearUnit: 'millimeter',
      linearDeflectionType: 'bounding_box_ratio',
      linearDeflection: 0.002,
      angularDeflection: 0.5
    });
    if (!result.success || !result.meshes?.length) throw new Error('El archivo STEP no contiene una pieza triangulable.');
    const triangleCount = result.meshes.reduce((sum, mesh) => sum + mesh.index.array.length / 3, 0);
    if (triangleCount > 80000) throw new Error('El STEP supera el límite de 80.000 triángulos tras la conversión.');
    const positions = new Float32Array(triangleCount * 9);
    const cadFaces=[],bodies=[];
    let offset = 0,triangleOffset=0;
    for (const [meshIndex,mesh] of result.meshes.entries()) {
      const xyz = mesh.attributes.position.array, indices = mesh.index.array;
      const bodyName=mesh.name?`${mesh.name} · ${meshIndex+1}`:`Cuerpo ${meshIndex+1}`;
      bodies.push({name:bodyName,first:triangleOffset,last:triangleOffset+indices.length/3-1});
      for(const [faceIndex,face] of (mesh.brep_faces||[]).entries()){
        if(Number.isInteger(face.first)&&Number.isInteger(face.last)&&face.first>=0&&face.last>=face.first&&face.last<indices.length/3){
          cadFaces.push({first:triangleOffset+face.first,last:triangleOffset+face.last,name:`${bodyName} · cara ${faceIndex+1}`});
        }
      }
      for (const id of indices) {
        const n = id * 3;
        positions[offset++] = xyz[n]; positions[offset++] = xyz[n + 1]; positions[offset++] = xyz[n + 2];
      }
      triangleOffset+=indices.length/3;
    }
    self.postMessage({ type: 'done', positions, cadFaces, bodies }, [positions.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error.message || error) });
  }
};
