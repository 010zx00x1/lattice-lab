export function conformalCoordinates(x,y,z,top,axis){
  const coords=[x,y,z];coords[axis]=top-coords[axis];return coords;
}

// Positive in a perforated band at a fixed inward depth. The transverse
// cylindrical holes stay aligned with the selected print axis.
export function equidistantLayerField(x,y,z,depth,period,wall,axis){
  const width=period*wall*.4;
  const band=width/2-Math.abs((depth-period/2)-Math.round((depth-period/2)/period)*period);
  const coords=[x,y,z].filter((_,index)=>index!==axis);
  const du=coords[0]-Math.round(coords[0]/period)*period,dv=coords[1]-Math.round(coords[1]/period)*period;
  const outsideHole=Math.hypot(du,dv)-period*.16;
  return Math.min(band,outsideHole);
}
