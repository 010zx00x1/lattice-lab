// Signed distance to the solid part of a periodic lattice. Positive is solid.
// TPMS use a level set; beam cells use the union of round line segments.
const CORNERS=[];
for(const z of [0,1])for(const y of [0,1])for(const x of [0,1])CORNERS.push([x,y,z]);
const FACE_CENTERS=[[0,.5,.5],[1,.5,.5],[.5,0,.5],[.5,1,.5],[.5,.5,0],[.5,.5,1]];
const BEAMS={
  cubic:[[[0,0,0],[1,0,0]],[[0,0,0],[0,1,0]],[[0,0,0],[0,0,1]]],
  bcc:CORNERS.map(c=>[c,[.5,.5,.5]]),
  fcc:FACE_CENTERS.flatMap(f=>CORNERS.filter(c=>f.some((v,i)=>v===c[i]&&(v===0||v===1))).map(c=>[f,c])),
  octa:FACE_CENTERS.flatMap((f,i)=>FACE_CENTERS.slice(i+1).filter(g=>f.reduce((n,v,j)=>n+(Math.abs(v-g[j])===1?1:0),0)===0).map(g=>[f,g])),
};
BEAMS.octet=[...BEAMS.fcc,...BEAMS.octa];

// Approximate equal-density scaling at wall=.26, sampled over one periodic cell.
// These nodal surfaces have different level-set amplitudes; one raw threshold
// would make some nearly solid and others nearly empty.
const TPMS_LEVEL_SCALE={gyroid:1,schwarz:1.15,diamond:.8,iwp:2.43,neovius:2.15,fks:.66,frd:1.53,fcy:1.47};

function segmentDistanceSquared(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy+(p[2]-a[2])*dz)/(dx*dx+dy*dy+dz*dz)));
  const x=p[0]-a[0]-t*dx,y=p[1]-a[1]-t*dy,z=p[2]-a[2]-t*dz;
  return x*x+y*y+z*z;
}
function packedSegmentDistanceSquared(x,y,z,sites,a,b){
  const dx=sites[b]-sites[a],dy=sites[b+1]-sites[a+1],dz=sites[b+2]-sites[a+2];
  const t=Math.max(0,Math.min(1,((x-sites[a])*dx+(y-sites[a+1])*dy+(z-sites[a+2])*dz)/(dx*dx+dy*dy+dz*dz)));
  const qx=x-sites[a]-t*dx,qy=y-sites[a+1]-t*dy,qz=z-sites[a+2]-t*dz;
  return qx*qx+qy*qy+qz*qz;
}

export function beamField(x,y,z,pattern,cell,wall){
  const segments=BEAMS[pattern];
  if(!segments)throw new Error(`Celda de vigas desconocida: ${pattern}`);
  const p=[x/cell,y/cell,z/cell],local=p.map(v=>v-Math.floor(v));
  const radius=wall*.35;
  // Struts in adjacent periodic cells can be closest near a cell face.
  const offsets=local.map(v=>v<radius?[-1,0]:v>1-radius?[0,1]:[0]);
  let best=Infinity;
  for(const oz of offsets[2])for(const oy of offsets[1])for(const ox of offsets[0]){
    for(const [a,b] of segments){
      const d=segmentDistanceSquared(local,[a[0]+ox,a[1]+oy,a[2]+oz],[b[0]+ox,b[1]+oy,b[2]+oz]);
      if(d<best)best=d;
    }
  }
  return (radius-Math.sqrt(best))*cell;
}

function randomSite(i,j,k,seed,channel){
  let h=Math.imul(i,73856093)^Math.imul(j,19349663)^Math.imul(k,83492791)^Math.imul(seed+channel*1013,2654435761);
  h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);
  return ((h^(h>>>16))>>>0)/4294967296;
}

const voronoiSiteCache=new Map();
function nearbySites(ix,iy,iz,cell,seed){
  const key=`${cell}|${seed}|${ix}|${iy}|${iz}`;
  const cached=voronoiSiteCache.get(key);if(cached)return cached;
  const sites=new Float64Array(27*3);let n=0;
  for(let k=iz-1;k<=iz+1;k++)for(let j=iy-1;j<=iy+1;j++)for(let i=ix-1;i<=ix+1;i++){
    sites[n++]=(i+.15+.7*randomSite(i,j,k,seed,0))*cell;
    sites[n++]=(j+.15+.7*randomSite(i,j,k,seed,1))*cell;
    sites[n++]=(k+.15+.7*randomSite(i,j,k,seed,2))*cell;
  }
  if(voronoiSiteCache.size>10000)voronoiSiteCache.clear();
  voronoiSiteCache.set(key,sites);
  return sites;
}

// Irregular closed-cell foam from a jittered Voronoi tessellation. The nearest
// seed defines a cell; the distance to its closest bisector defines a wall.
export function voronoiField(x,y,z,cell,wall,seed=0){
  const ix=Math.floor(x/cell),iy=Math.floor(y/cell),iz=Math.floor(z/cell),sites=nearbySites(ix,iy,iz,cell,seed);
  let closest=0,best=Infinity;
  for(let n=0;n<sites.length;n+=3){
    const d2=(x-sites[n])**2+(y-sites[n+1])**2+(z-sites[n+2])**2;
    if(d2<best){best=d2;closest=n;}
  }
  const ox=sites[closest],oy=sites[closest+1],oz=sites[closest+2];let boundary=Infinity;
  for(let n=0;n<sites.length;n+=3){
    if(n===closest)continue;
    const sx=sites[n],sy=sites[n+1],sz=sites[n+2];
    const d2=(x-sx)**2+(y-sy)**2+(z-sz)**2;
    const span=Math.hypot(sx-ox,sy-oy,sz-oz);
    boundary=Math.min(boundary,(d2-best)/(2*span));
  }
  return cell*wall*.2-boundary;
}

// Voronoi edges are the intersections of at least three cell regions. The
// difference between the first and third nearest sites gives a smooth,
// reproducible approximation of their edge skeleton.
export function voronoiBarField(x,y,z,cell,wall,seed=0){
  const sites=nearbySites(Math.floor(x/cell),Math.floor(y/cell),Math.floor(z/cell),cell,seed);
  let first=Infinity,second=Infinity,third=Infinity;
  for(let n=0;n<sites.length;n+=3){
    const d=Math.hypot(x-sites[n],y-sites[n+1],z-sites[n+2]);
    if(d<first){third=second;second=first;first=d;}
    else if(d<second){third=second;second=d;}
    else if(d<third)third=d;
  }
  return cell*wall*.22-(third-first)*.5;
}

// A local nearest-neighbour graph approximates Delaunay struts. Segments are
// cached for each neighbourhood so their field does not jump when the nearest
// few sites change. This is not a full 3-D tetrahedralization.
const delaunaySegmentCache=new Map();
function nearbyDelaunaySegments(ix,iy,iz,cell,seed){
  const key=`${cell}|${seed}|${ix}|${iy}|${iz}`;
  const cached=delaunaySegmentCache.get(key);if(cached)return cached;
  const sites=nearbySites(ix,iy,iz,cell,seed),segments=[],seen=new Set();
  for(let i=0;i<27;i++){
    const a=i*3,neighbors=[];
    for(let j=0;j<27;j++){
      if(i===j)continue;
      const b=j*3,d2=(sites[a]-sites[b])**2+(sites[a+1]-sites[b+1])**2+(sites[a+2]-sites[b+2])**2;
      if(d2<(cell*1.8)**2)neighbors.push({j,d2});
    }
    neighbors.sort((u,v)=>u.d2-v.d2);
    for(const {j} of neighbors.slice(0,7)){
      const lo=Math.min(i,j),hi=Math.max(i,j),edge=`${lo}:${hi}`;
      if(!seen.has(edge)){seen.add(edge);segments.push([lo*3,hi*3]);}
    }
  }
  if(delaunaySegmentCache.size>1000)delaunaySegmentCache.clear();
  delaunaySegmentCache.set(key,{sites,segments});return {sites,segments};
}
export function delaunayBarField(x,y,z,cell,wall,seed=0){
  const {sites,segments}=nearbyDelaunaySegments(Math.floor(x/cell),Math.floor(y/cell),Math.floor(z/cell),cell,seed);
  let best=Infinity;
  for(const [a,b] of segments){
    const d2=packedSegmentDistanceSquared(x,y,z,sites,a,b);
    if(d2<best)best=d2;
  }
  return cell*wall*.22-Math.sqrt(best);
}

// A sum of seeded, oblique waves provides a smooth stochastic-like spinodal
// field. This is a procedural approximation, not a simulated phase separation.
export function spinodalField(x,y,z,cell,wall,seed=0,form='sheet'){
  const directions=[[1,.31,.17],[-.27,1,.42],[.23,-.39,1],[.71,.64,-.3],[-.55,.28,.78],[.37,-.82,.47]];
  let f=0;
  for(let n=0;n<directions.length;n++){
    const [dx,dy,dz]=directions[n],phase=2*Math.PI*randomSite(n,seed,0,seed,9);
    f+=Math.sin((x*dx+y*dy+z*dz)*2*Math.PI/cell+phase);
  }
  f/=Math.sqrt(directions.length);
  return (form==='network'?f+(wall-.26)*1.8:wall*1.8-Math.abs(f))*cell/(2*Math.PI);
}

export function latticeField(x,y,z,pattern,cell,wall,seed=0,form='sheet'){
  if(pattern==='voronoi')return voronoiField(x,y,z,cell,wall,seed);
  if(pattern==='voronoi-bars')return voronoiBarField(x,y,z,cell,wall,seed);
  if(pattern==='delaunay-bars')return delaunayBarField(x,y,z,cell,wall,seed);
  if(pattern==='spinodal')return spinodalField(x,y,z,cell,wall,seed,form);
  if(BEAMS[pattern])return beamField(x,y,z,pattern,cell,wall);
  const q=2*Math.PI/cell,a=x*q,b=y*q,c=z*q;
  const ca=Math.cos(a),cb=Math.cos(b),cc=Math.cos(c);
  const sa=Math.sin(a),sb=Math.sin(b),sc=Math.sin(c);
  let f;
  if(pattern==='schwarz')f=ca+cb+cc;
  else if(pattern==='diamond')f=sa*sb*sc+sa*cb*cc+ca*sb*cc+ca*cb*sc;
  else if(pattern==='gyroid')f=sa*cb+sb*cc+sc*ca;
  else if(pattern==='iwp')f=2*(ca*cb+cb*cc+cc*ca)-(Math.cos(2*a)+Math.cos(2*b)+Math.cos(2*c));
  else if(pattern==='neovius')f=3*(ca+cb+cc)+4*ca*cb*cc;
  else if(pattern==='fks')f=Math.cos(2*a)*sb*cc+ca*Math.cos(2*b)*sc+sa*cb*Math.cos(2*c);
  else if(pattern==='frd')f=4*ca*cb*cc-(Math.cos(2*a)*Math.cos(2*b)+Math.cos(2*b)*Math.cos(2*c)+Math.cos(2*c)*Math.cos(2*a));
  else if(pattern==='fcy')f=-sa*sb*sc+Math.sin(2*a)*sb+Math.sin(2*b)*sc+Math.sin(2*c)*sa-ca*cb*cc+Math.sin(2*a)*cc+Math.sin(2*b)*ca+Math.sin(2*c)*cb;
  else throw new Error(`Estructura desconocida: ${pattern}`);
  const scale=TPMS_LEVEL_SCALE[pattern];
  return (form==='network'?f+(wall-.26)*3.1*scale:wall*3.1*scale-Math.abs(f))*cell/(2*Math.PI);
}
