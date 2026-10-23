export function smoothUnion(a,b,radius){
  if(!(radius>0))return Math.max(a,b);
  const h=Math.max(radius-Math.abs(a-b),0)/radius;
  return Math.max(a,b)+h*h*radius*.25;
}

// Positive near the exterior unless the same node is near a selected open face.
export function skinField(skin,exteriorDistance,openFaceDistance=Infinity,smoothing=0){
  if(!(skin>0))return -Infinity;
  const fullSkin=skin-exteriorDistance,openLimit=openFaceDistance-skin;
  return -smoothUnion(-fullSkin,-openLimit,smoothing);
}
