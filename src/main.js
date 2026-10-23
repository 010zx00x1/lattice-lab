import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {STLExporter} from 'three/addons/exporters/STLExporter.js';
import {ThreeMFLoader} from 'three/addons/loaders/3MFLoader.js';
import {prepareMesh} from './mesh-quality.js';
import {create3MF,unitScale3MF} from './three-mf.js';
import {MATERIALS,MACHINES,massGrams,fitsBuildVolume} from './materials.js';
import {createProject,readProject} from './project.js';
import {detectFaceGroups,groupsFromFaceRanges} from './face-groups.js';
import {extractFaceTriangles} from './face-boundary.js';
import {sampleSurface,rasterizeSamples} from './software-preview.js';
import {createExample} from './examples.js';
import {createBodyRecords,assembleVisibleBodies} from './source-bodies.js';
import {normalizeFaceSets,combineFaceGroups} from './face-sets.js';
import {normalizeAnalysisCases} from './analysis-cases.js';
import {libraryCandidates,calibration} from './objective-library.js';
import {normalizeWallZones} from './local-wall-zones.js';
import {DesignHistory} from './design-history.js';
import './style.css';

const $=s=>document.querySelector(s);
const STOCHASTIC_PATTERNS=['voronoi','voronoi-bars','delaunay-bars','spinodal'];
const STOCHASTIC_BARS=['voronoi-bars','delaunay-bars'];
const viewport=$('#viewport');
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(45,1,0.1,10000);
let renderer=null,canvas=null,ctx=null;
try{
  renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  viewport.appendChild(renderer.domElement);
}catch(error){
  canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none';viewport.appendChild(canvas);ctx=canvas.getContext('2d',{desynchronized:true});
}
const controls=new OrbitControls(camera,renderer?.domElement||canvas);
controls.enableDamping=true;
controls.dampingFactor=.08;
controls.minDistance=15;
controls.maxDistance=600;
let lastDraw=0,needsDraw=true,softwareImage=null,softwareDepth=null,softwareDetail=true,detailTimer=null;
const softwareSamplesLow=new WeakMap(),softwareSamplesHigh=new WeakMap();
controls.addEventListener('change',()=>{needsDraw=true;if(!renderer){softwareDetail=false;clearTimeout(detailTimer);detailTimer=setTimeout(()=>{softwareDetail=true;needsDraw=true;},140);}});
camera.position.set(80,67,85);
controls.target.set(0,0,0);
const ambient=new THREE.AmbientLight(0xffffff,2.0);scene.add(ambient);
const light=new THREE.DirectionalLight(0xffffff,2.3);light.position.set(60,100,70);scene.add(light);
const fill=new THREE.DirectionalLight(0xa3f2e8,1.2);fill.position.set(-80,20,-50);scene.add(fill);
const grid=new THREE.GridHelper(180,18,0xa8c6be,0xd9e5e1);grid.position.y=-26;scene.add(grid);
const axes=new THREE.AxesHelper(25);axes.position.set(-72,-25,-72);scene.add(axes);
const sourceMaterial=new THREE.MeshPhysicalMaterial({color:0x9fbbb7,metalness:.1,roughness:.42,transparent:true,opacity:.83,side:THREE.DoubleSide,clearcoat:.6});
const latticeMaterial=new THREE.MeshStandardMaterial({color:0x16b9a0,metalness:.2,roughness:.33,side:THREE.DoubleSide});
let sourceMesh=null,latticeMesh=null,previewPoints=null,previewMode='points',worker=null,inspectWorker=null,conversionWorker=null,simulationWorker=null,sourceAnalysisWorker=null,sourceAnalysis=null,pendingGradeRestore=false,pendingCellGradeRestore=false,optimizationWorker=null,optimization=null,pendingOptimization=null,simulation=null,simulationMode='elastic',sourceReport=null,modelKind='cube',bounds=null,baseName='cubo',generation=null,step='prepare',loadId=0,manufacturingWorker=null,thicknessWorker=null,sourceScale=1,quality='draft';
let faceTimer=null,faceGroups=[],faceOverlayMeshes=[],openSkinFaceIds=new Set(),cadFaces=null,sourceBodies=[];
let faceSets=[],editingFaceSetId=null,faceSetCounter=0;
let analysisCases=[],caseCounter=0;
let wallZones=[],editingWallZone=null;
const designHistory=new DesignHistory(50);
const designControlIds=['pattern','tpms-form','voronoi-seed','cell-size','cell-min','use-stress-cell','wall-size','skin-size','skin-mode','rim-width','solid-zone-depth','use-stress-grade','grade-min','equidistant-layers','conformal-cells'];
function designSnapshot(){
  const controls={};for(const id of designControlIds){const input=$(`#${id}`);controls[id]=input.type==='checkbox'?input.checked:input.value;}
  return {controls,quality,wallZones:structuredClone(wallZones),faceIds:[...openSkinFaceIds]};
}
function historyButtons(){$('#undo-design').disabled=!designHistory.canUndo;$('#redo-design').disabled=!designHistory.canRedo;}
function resetDesignHistory(){designHistory.reset(designSnapshot());historyButtons();}
function recordDesignHistory(){if(designHistory.index<0)resetDesignHistory();else{designHistory.push(designSnapshot());historyButtons();}}
function restoreDesign(snapshot){
  $('#pattern').value=snapshot.controls.pattern;$('#pattern').dispatchEvent(new Event('change'));
  for(const id of designControlIds){const input=$(`#${id}`);if(input.type==='checkbox')input.checked=!!snapshot.controls[id];else input.value=String(snapshot.controls[id]);}
  quality=snapshot.quality;document.querySelectorAll('#resolution button').forEach(button=>button.classList.toggle('selected',button.dataset.quality===quality));
  wallZones=normalizeWallZones(snapshot.wallZones);editingWallZone=null;$('#wall-zone-add').textContent='Añadir zona';renderWallZones();
  openSkinFaceIds=new Set(snapshot.faceIds);renderOpenSkinFaces();
  $('#cell-value').textContent=`${$('#cell-size').value} mm`;$('#wall-value').textContent=Number($('#wall-size').value).toFixed(2);
  $('#skin-value').textContent=`${Number($('#skin-size').value).toLocaleString('es',{maximumFractionDigits:1})} mm`;
  $('#solid-zone-value').textContent=`${Number($('#solid-zone-depth').value).toLocaleString('es',{maximumFractionDigits:1})} mm`;
  $('#grade-min-field').hidden=!$('#use-stress-grade').checked;$('#cell-min-field').hidden=!$('#use-stress-cell').checked;
  updateGenerationEstimate();updateBuildVolume();invalidate();historyButtons();
}
$('#undo-design').addEventListener('click',()=>{const state=designHistory.undo();if(state)restoreDesign(state);});
$('#redo-design').addEventListener('click',()=>{const state=designHistory.redo();if(state)restoreDesign(state);});
document.addEventListener('keydown',event=>{
  if(!(event.ctrlKey||event.metaKey)||event.altKey||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
  const key=event.key.toLowerCase(),redo=key==='y'||key==='z'&&event.shiftKey;
  if(key!=='z'&&!redo)return;
  event.preventDefault();(redo?$('#redo-design'):$('#undo-design')).click();
});
$('#lattice-panel').addEventListener('change',event=>{if(designControlIds.includes(event.target.id))recordDesignHistory();});
function renderWallZones(){
  const list=$('#wall-zone-list');list.replaceChildren();
  wallZones.forEach((zone,index)=>{
    const row=document.createElement('div');row.className='body-row';row.setAttribute('role','listitem');
    const title=document.createElement('strong');title.textContent=`${index+1}. ${zone.type==='sphere'?'Esfera':'Caja'} · ${zone.center.join(', ')} mm · ${zone.type==='sphere'?'r':'lado'} ${zone.size} mm · ${zone.wall.toFixed(2)}`;
    const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='Editar';edit.addEventListener('click',()=>{
      editingWallZone=index;$('#wall-zone-type').value=zone.type;
      for(const [selector,value] of [['#wall-zone-x',zone.center[0]],['#wall-zone-y',zone.center[1]],['#wall-zone-z',zone.center[2]],['#wall-zone-size',zone.size],['#wall-zone-wall',zone.wall],['#wall-zone-blend',zone.blend]])$(selector).value=String(value);
      $('#wall-zone-add').textContent='Guardar zona';$('#wall-zones-details').open=true;
    });
    const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Quitar';remove.addEventListener('click',()=>{wallZones.splice(index,1);editingWallZone=null;$('#wall-zone-add').textContent='Añadir zona';renderWallZones();invalidate();recordDesignHistory();});
    row.append(title,edit,remove);list.append(row);
  });
}

function resize(){const {clientWidth:w,clientHeight:h}=viewport;if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();if(renderer)renderer.setSize(w,h,false);else{const scale=Math.min(devicePixelRatio,1.25)*.7;canvas.width=Math.max(1,Math.floor(w*scale));canvas.height=Math.max(1,Math.floor(h*scale));ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);softwareImage=null;softwareDepth=null;}needsDraw=true;}
new ResizeObserver(resize).observe(viewport);resize();
function loop(now=0){requestAnimationFrame(loop);controls.update();if(!needsDraw)return;if(renderer){needsDraw=false;renderer.render(scene,camera);}else if(now-lastDraw>=33){needsDraw=false;drawSoftware();lastDraw=now;}}loop();
function drawSoftware(){
  const w=viewport.clientWidth,h=viewport.clientHeight;
  const active=latticeMesh?.visible?latticeMesh:sourceMesh;
  if(!active){ctx.clearRect(0,0,w,h);return;}
  camera.updateMatrixWorld();
  const pos=active.geometry.getAttribute('position');
  const count=pos.count/3;
  if(count>1800){drawSoftwareFast(active);return;}
  ctx.clearRect(0,0,w,h);
  const faces=[];
  const v0=new THREE.Vector3(),v1=new THREE.Vector3(),v2=new THREE.Vector3(),p0=new THREE.Vector3(),p1=new THREE.Vector3(),p2=new THREE.Vector3();
  for(let t=0;t<count;t++){
    const n=t*3;v0.fromBufferAttribute(pos,n);v1.fromBufferAttribute(pos,n+1);v2.fromBufferAttribute(pos,n+2);
    p0.copy(v0).project(camera);p1.copy(v1).project(camera);p2.copy(v2).project(camera);
    if([p0,p1,p2].some(p=>!Number.isFinite(p.x)||p.z>1))continue;
    const x0=(p0.x+1)*w/2,y0=(1-p0.y)*h/2,x1=(p1.x+1)*w/2,y1=(1-p1.y)*h/2,x2=(p2.x+1)*w/2,y2=(1-p2.y)*h/2;
    const normal=v1.clone().sub(v0).cross(v2.clone().sub(v0)).normalize();
    const light=Math.max(.25,Math.min(1,.53+normal.dot(new THREE.Vector3(.4,.8,.7).normalize())*.38));
    faces.push({x0,y0,x1,y1,x2,y2,z:(p0.z+p1.z+p2.z)/3,light});
  }
  faces.sort((a,b)=>b.z-a.z);
  const generated=active===latticeMesh;
  for(const f of faces){
    ctx.beginPath();ctx.moveTo(f.x0,f.y0);ctx.lineTo(f.x1,f.y1);ctx.lineTo(f.x2,f.y2);ctx.closePath();
    const l=f.light;
    ctx.fillStyle=generated?`rgb(${Math.round(9+25*l)},${Math.round(101+93*l)},${Math.round(88+69*l)})`:`rgb(${Math.round(91+80*l)},${Math.round(131+72*l)},${Math.round(131+64*l)})`;
    ctx.fill();
  }
  drawSoftwareOverlays(w,h);
}
function drawSoftwareFast(active){
  const w=canvas.width,h=canvas.height,geometry=active.geometry;
  const cache=softwareDetail?softwareSamplesHigh:softwareSamplesLow;
  let samples=cache.get(geometry);
  if(!samples){samples=sampleSurface(geometry.getAttribute('position').array,softwareDetail?50000:10000);cache.set(geometry,samples);}
  if(!softwareImage||softwareImage.width!==w||softwareImage.height!==h){softwareImage=ctx.createImageData(w,h);softwareDepth=new Float32Array(w*h);}
  const viewProjection=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  rasterizeSamples(samples,viewProjection.elements,w,h,softwareImage.data,softwareDepth,{generated:active===latticeMesh,radius:softwareDetail?2:1});
  ctx.putImageData(softwareImage,0,0);
  drawSoftwareOverlays(viewport.clientWidth,viewport.clientHeight);
}
function createPointPreview(positions){
  const samples=sampleSurface(positions,80000),count=samples.length/6,vertices=new Float32Array(count*3),colors=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const a=i*6,o=i*3,light=Math.max(.25,Math.min(1,.55+(samples[a+3]*.4+samples[a+4]*.8+samples[a+5]*.7)*.32));
    vertices[o]=samples[a];vertices[o+1]=samples[a+1];vertices[o+2]=samples[a+2];
    colors[o]=(9+25*light)/255;colors[o+1]=(101+93*light)/255;colors[o+2]=(88+69*light)/255;
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  return new THREE.Points(geometry,new THREE.PointsMaterial({size:2.2,sizeAttenuation:false,vertexColors:true,depthWrite:true}));
}
function updateLatticeVisibility(showSource){
  if(latticeMesh)latticeMesh.visible=!showSource&&(!previewPoints||previewMode==='mesh');
  if(previewPoints)previewPoints.visible=!showSource&&previewMode==='points';
  $('#view-status').textContent=showSource?'Malla original':previewPoints&&previewMode==='points'?'Vista fluida de puntos · malla completa conservada':'Lattice generado';
  needsDraw=true;
}
function drawSoftwareOverlays(w,h){
  const p0=new THREE.Vector3(),p1=new THREE.Vector3(),p2=new THREE.Vector3();
  for(const {mesh,role,group} of faceOverlayMeshes){
    if(group.normal.reduce((sum,v,i)=>sum+v*(camera.position.getComponent(i)-group.centroid[i]),0)<=0)continue;
    const overlay=mesh.geometry.getAttribute('position');
    for(let t=0;t<overlay.count;t+=3){
      p0.fromBufferAttribute(overlay,t).project(camera);p1.fromBufferAttribute(overlay,t+1).project(camera);p2.fromBufferAttribute(overlay,t+2).project(camera);
      if([p0,p1,p2].some(p=>!Number.isFinite(p.x)||p.z>1))continue;
      ctx.beginPath();ctx.moveTo((p0.x+1)*w/2,(1-p0.y)*h/2);ctx.lineTo((p1.x+1)*w/2,(1-p1.y)*h/2);ctx.lineTo((p2.x+1)*w/2,(1-p2.y)*h/2);ctx.closePath();
      ctx.fillStyle=role==='support'?'rgba(245,175,52,.58)':'rgba(234,91,69,.56)';ctx.fill();
    }
  }
}

function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3600)}
function formatMass(grams){return grams>=1000?`${(grams/1000).toLocaleString('es',{maximumFractionDigits:2})} kg`:`${grams.toLocaleString('es',{maximumFractionDigits:1})} g`;}
function updateMass(){
  const volume=sourceReport?.valid?sourceReport.volumeMm3:null,density=MATERIALS[$('#material').value]?.density;
  $('#solid-mass').textContent=Number.isFinite(volume)&&density?formatMass(massGrams(volume,density)):'—';
  $('#lattice-mass').textContent=Number.isFinite(volume)&&density&&generation?`${formatMass(massGrams(volume*(1-generation.reduction),density))} · estimada`:'—';
}
const TECHNOLOGY_MATERIALS={fdm:['prusament_pla','pla','petg','abs'],sls:['formlabs_nylon12'],generic:['pla','petg','abs','aluminum','steel']};
function setManufacturingChoices(){
  const technology=$('#technology').value,machine=$('#machine'),material=$('#material');
  $('#overhang-field').hidden=technology!=='fdm';
  machine.replaceChildren(...Object.entries(MACHINES).filter(([,value])=>value.technology===technology).map(([id,value])=>new Option(value.name,id)));
  material.replaceChildren(...TECHNOLOGY_MATERIALS[technology].map(id=>new Option(`${MATERIALS[id].name} · ${MATERIALS[id].density.toLocaleString('es',{maximumFractionDigits:2})} g/cm³`,id)));
  applyMaterial();updateBuildVolume();analyzePrintability();
}
function selectedMachineFits(){
  if(!bounds)return true;
  const machine=MACHINES[$('#machine').value],dims=bounds.max.map((value,index)=>value-bounds.min[index]);
  const verticalAxis='XYZ'.indexOf($('#print-direction').value.slice(-1));
  return fitsBuildVolume(dims,machine?.volume,verticalAxis);
}
function nominalElementThickness(){
  const pattern=$('#pattern').value,cell=Number($('#use-stress-cell').checked?$('#cell-min').value:$('#cell-size').value),wall=Number($('#use-stress-grade').checked?$('#grade-min').value:$('#wall-size').value);
  if(['cubic','bcc','fcc','octa','octet'].includes(pattern))return cell*wall*.7;
  if(pattern==='voronoi')return Number($('#cell-size').value)*wall*.4;
  if(STOCHASTIC_BARS.includes(pattern))return cell*wall*.44;
  return null;
}
function selectedManufacturingFits(){
  const nominal=nominalElementThickness(),minimum=Number($('#min-wall').value);
  const sampled= !generation||generation.thickness?.coverage>=.85&&generation.thickness.p05>=minimum;
  return selectedMachineFits()&&Number.isFinite(minimum)&&minimum>=.1&&minimum<=20&&(nominal===null||nominal>=minimum)&&sampled;
}
function renderThicknessCheck(){
  const label=$('#thickness-result'),exportLabel=$('#thickness-export'),result=generation?.thickness,minimum=Number($('#min-wall').value);
  if(!generation){label.textContent='';exportLabel.textContent='Genera un lattice para medir una muestra del grosor.';return;}
  if(!result){label.textContent=generation.thicknessError||'Midiendo grosor en la malla final…';label.classList.toggle('warning',!!generation.thicknessError);exportLabel.textContent=label.textContent;return;}
  const thin=result.p05<minimum,lowCoverage=result.coverage<.85;
  label.classList.toggle('warning',thin||lowCoverage);
  label.textContent=`Muestreo de grosor: P5 ${result.p05?.toLocaleString('es',{maximumFractionDigits:2})||'—'} mm · mínimo observado ${result.minimum?.toLocaleString('es',{maximumFractionDigits:2})||'—'} mm · ${result.hits}/${result.samples} rayos útiles${thin?' · P5 bajo el mínimo indicado':lowCoverage?' · cobertura insuficiente':''}. No garantiza el mínimo global.`;
  exportLabel.textContent=label.textContent;
}
function runThicknessCheck(){
  if(thicknessWorker){thicknessWorker.terminate();thicknessWorker=null;}
  if(!generation||!latticeMesh)return;
  generation.thickness=null;generation.thicknessError=null;renderThicknessCheck();updateBuildVolume();
  const positions=new Float32Array(latticeMesh.geometry.getAttribute('position').array);
  const current=new Worker(new URL('./thickness-worker.js',import.meta.url),{type:'module'});thicknessWorker=current;
  current.onmessage=({data})=>{
    if(thicknessWorker!==current)return;
    current.terminate();thicknessWorker=null;
    if(data.type==='done')generation.thickness=data.result;
    else generation.thicknessError=`No se pudo medir el grosor: ${data.message}`;
    renderThicknessCheck();updateBuildVolume();
  };
  current.onerror=()=>{if(thicknessWorker!==current)return;current.terminate();thicknessWorker=null;generation.thicknessError='No se pudo medir el grosor de la malla.';renderThicknessCheck();updateBuildVolume();};
  current.postMessage({positions},[positions.buffer]);
}
function updateBuildVolume(){
  const machine=MACHINES[$('#machine').value],label=$('#build-volume-check'),link=$('#machine-source');
  const fits=selectedMachineFits();label.classList.toggle('warning',!fits);
  label.textContent=machine?.volume?`Volumen nominal ${machine.volume.join(' × ')} mm · ${fits?'la caja envolvente cabe':'la caja envolvente no cabe'} en la orientación elegida. Confirma holguras y compensaciones en el software de la máquina.`:'Sin volumen de máquina definido; verifica la cabida en tu equipo.';
  link.hidden=!machine?.source;if(machine?.source)link.href=machine.source;
  const nominal=nominalElementThickness(),minimum=Number($('#min-wall').value),thin=nominal!==null&&nominal<minimum,sampledThin=!!generation?.thickness&&generation.thickness.p05<minimum;
  const thicknessLabel=$('#minimum-thickness-check');thicknessLabel.classList.toggle('warning',thin||sampledThin);
  thicknessLabel.textContent=nominal===null?(generation?.thickness?`Malla generada: grosor P5 muestreado ${generation.thickness.p05?.toLocaleString('es',{maximumFractionDigits:2})||'—'} mm frente a ${minimum.toLocaleString('es',{maximumFractionDigits:2})} mm indicados. El mínimo global sigue sin certificarse.`:'Superficie continua: el espesor local no se conoce sin medir la malla final. Revisa el archivo en software de fabricación.'):`Espesor nominal estimado ${nominal.toLocaleString('es',{maximumFractionDigits:2})} mm frente al mínimo indicado ${Number.isFinite(minimum)?minimum.toLocaleString('es',{maximumFractionDigits:2}):'—'} mm${thin?' · ajusta la celda o el grosor':''}. No sustituye una medición de la malla.`;
  $('#to-lattice').disabled=!sourceReport?.valid||!fits;
  $('#top-export').disabled=!generation?.report?.valid||!selectedManufacturingFits();
  $('#download').disabled=!generation?.report?.valid||!selectedManufacturingFits();
  $('#download-3mf').disabled=!generation?.report?.valid||!selectedManufacturingFits();
}
function applyMaterial(){
  const selected=MATERIALS[$('#material').value];if(!selected)return;
  $('#young-modulus').value=String(selected.E);$('#optimizer-modulus').value=String(selected.E);
  $('#source-analysis-modulus').value=String(selected.E);
  $('#thermal-conductivity').value=String(selected.conductivity);
  const strength=selected.yield?` · límite elástico ${selected.yield} MPa`:selected.ultimate?` · resistencia última ${selected.ultimate} MPa; límite elástico no publicado`:'';
  $('#material-property').textContent=`Densidad ${selected.density.toLocaleString('es',{maximumFractionDigits:2})} g/cm³ · E ${selected.E} GPa${strength} · k ${selected.conductivity} W/m·K${selected.thermalEstimated?' (valor ilustrativo)':''}. ${selected.source?'Ficha de probetas; verifica el lote y la orientación.':'Perfil genérico sin ficha; sustituye estos valores antes de fabricar.'}`;
  const link=$('#material-source');link.hidden=!selected.source;if(selected.source){link.href=selected.source;link.textContent=`${selected.sourceLabel} ↗`;}
  clearSourceAnalysis();clearOptimization();clearSimulation();updateMass();updateManufacturingWarning();
}
function updateManufacturingWarning(){
  if(!generation)return;
  const pattern=$('#pattern').value,minimum=Number($('#min-wall').value),warning=$('#manufacturing-warning');
  if(!Number.isFinite(minimum)||minimum<.1||minimum>20){warning.textContent='Introduce un espesor mínimo entre 0,1 y 20 mm.';warning.classList.add('warning');return;}
  if(['cubic','bcc','fcc','octa','octet'].includes(pattern)){
    const diameter=Number($('#use-stress-cell').checked?$('#cell-min').value:$('#cell-size').value)*Number($('#use-stress-grade').checked?$('#grade-min').value:$('#wall-size').value)*.7;
    const thin=diameter<minimum;
    warning.textContent=`Diámetro nominal mínimo de viga ≈ ${diameter.toLocaleString('es',{maximumFractionDigits:2})} mm · mínimo indicado ${minimum.toLocaleString('es',{maximumFractionDigits:2})} mm${thin?' · por debajo del mínimo':''}. Verifica el STL/3MF.`;
    warning.classList.toggle('warning',thin);
  }else if(pattern==='voronoi'||STOCHASTIC_BARS.includes(pattern)){
    const thickness=nominalElementThickness();
    const thin=thickness<minimum;
    warning.textContent=`${pattern==='voronoi'?'Pared':'Barra'} nominal aproximada ≈ ${thickness.toLocaleString('es',{maximumFractionDigits:2})} mm · mínimo indicado ${minimum.toLocaleString('es',{maximumFractionDigits:2})} mm${thin?' · por debajo del mínimo':''}. Verifica el archivo exportado.`;
    warning.classList.toggle('warning',thin);
  }else{warning.textContent='El espesor local de la superficie varía; compruébalo en el archivo exportado.';warning.classList.remove('warning');}
}
function analyzePrintability(){
  if(manufacturingWorker){manufacturingWorker.terminate();manufacturingWorker=null;}
  const label=$('#overhang-result'),exportLabel=$('#overhang-export');
  if(!latticeMesh){label.textContent='';exportLabel.textContent='Genera un lattice para ver el cribado de voladizos.';return;}
  if($('#technology').value!=='fdm'){label.textContent='El cribado de voladizos FDM no aplica al perfil seleccionado.';label.classList.remove('warning');exportLabel.textContent=label.textContent;return;}
  const direction=$('#print-direction').value,maxAngle=Number($('#max-overhang').value);
  if(!Number.isFinite(maxAngle)||maxAngle<0||maxAngle>90||$('#max-overhang').value===''){
    label.textContent='Indica un voladizo máximo entre 0° y 90°.';label.classList.add('warning');exportLabel.textContent=label.textContent;return;
  }
  label.classList.remove('warning');label.textContent='Evaluando facetas descendentes…';exportLabel.textContent=label.textContent;
  const positions=new Float32Array(latticeMesh.geometry.getAttribute('position').array);
  const current=new Worker(new URL('./overhang-worker.js',import.meta.url),{type:'module'});manufacturingWorker=current;
  current.onmessage=({data})=>{
    if(manufacturingWorker!==current)return;
    current.terminate();manufacturingWorker=null;
    if(data.type==='error'){label.textContent=data.message;label.classList.add('warning');exportLabel.textContent=data.message;return;}
    const {overhangAreaMm2,overhangFraction}=data.result;
    const hasOverhang=overhangAreaMm2>1&&overhangFraction>.001;
    label.classList.toggle('warning',hasOverhang);
    label.textContent=hasOverhang?`Voladizo ${direction} > ${maxAngle}°: ${overhangAreaMm2.toLocaleString('es',{maximumFractionDigits:1})} mm² (${(overhangFraction*100).toLocaleString('es',{maximumFractionDigits:1})} % de la superficie). Revisa soportes en el laminador.`:`Voladizo ${direction} > ${maxAngle}°: no se detectó un área relevante fuera de la base.`;
    exportLabel.textContent=`Cribado geométrico: ${label.textContent} No incluye soportes ni efectos entre capas.`;
  };
  current.onerror=()=>{if(manufacturingWorker!==current)return;current.terminate();manufacturingWorker=null;label.textContent='No se pudo evaluar el voladizo.';label.classList.add('warning');exportLabel.textContent=label.textContent;};
  current.postMessage({positions,direction,maxAngle},[positions.buffer]);
}
function dimensions(b){const d=b.getSize(new THREE.Vector3());return [d.x,d.y,d.z]}
function updateGenerationEstimate(){
  if(!bounds)return;
  const dims=bounds.max.map((value,index)=>value-bounds.min[index]);
  const cell=Number($('#cell-size').value),wall=Number($('#wall-size').value),skin=Number($('#skin-size').value),solid=Number($('#solid-zone-depth').value);
  const minCell=$('#use-stress-cell').checked?Number($('#cell-min').value):cell;
  const minWall=$('#use-stress-grade').checked?Number($('#grade-min').value):wall;
  if(![...dims,cell,wall,skin,solid,minCell,minWall].every(Number.isFinite)||minCell<=0)return;
  let gridStep=minCell/(quality==='normal'?8:5),pattern=$('#pattern').value;
  if(['cubic','bcc','fcc','octa','octet'].includes(pattern))gridStep=Math.min(gridStep,minCell*minWall*.35*(quality==='normal'?.72:1));
  if(STOCHASTIC_PATTERNS.includes(pattern))gridStep=Math.min(gridStep,cell*minWall*.25*(quality==='normal'?.72:1));
  if($('#equidistant-layers').checked)gridStep=Math.min(gridStep,cell*minWall*.2);
  if($('#use-stress-grade').checked)gridStep=Math.min(gridStep,minCell*minWall*.5);
  if(skin>0)gridStep=Math.min(gridStep,Math.max(.5,skin/2));
  if(solid>0)gridStep=Math.min(gridStep,Math.max(.5,solid/2));
  gridStep=Math.max(gridStep,Math.max(...dims)/70);
  const counts=dims.map(d=>Math.ceil((d+3*gridStep)/gridStep)+1),nodes=counts.reduce((a,b)=>a*b,1);
  const fieldBytes=nodes*(4+(skin>0||solid>0||$('#equidistant-layers').checked?1:0));
  const text=`Rejilla estimada: ${counts.join(' × ')} nodos (${Math.round(nodes/1000).toLocaleString('es')} mil). Campo base ≈ ${(fieldBytes/1024/1024).toLocaleString('es',{maximumFractionDigits:1})} MB; la triangulación y el análisis usan memoria adicional.`;
  $('#generation-estimate').textContent=text;
}
function modelInfo(name,geometry,type){
  geometry.computeBoundingBox();const box=geometry.boundingBox;
  bounds={min:box.min.toArray(),max:box.max.toArray()};
  const d=dimensions(box).map(v=>Math.round(v*10)/10);
  $('#project-name').textContent=name;$('#project-type').textContent=`${type} · ${Math.round(Math.max(...d))} mm`;
  $('#model-title').textContent=name;$('#model-info').textContent=`Malla cargada · ${Math.round(geometry.getAttribute('position').count/3).toLocaleString('es')} triángulos`;
  $('#model-dim').textContent=`${d.join(' × ')} mm`;
  const maxDim=Math.max(...d),cell=$('#cell-size');
  cell.min=Math.max(5,Math.ceil(maxDim/12));cell.max=Math.max(20,Math.round(maxDim/2));
  cell.step=1;cell.value=Math.max(Number(cell.min),Math.min(Number(cell.max),Math.round(maxDim/4)));
  $('#cell-value').textContent=`${cell.value} mm`;
  document.querySelector('#cell-size + .range-ends').innerHTML=`<span>${cell.min} mm</span><span>${cell.max} mm</span>`;
  grid.position.y=box.min.y-4;
  fitCamera();
  updateGenerationEstimate();
  updateBuildVolume();
}
function updateQuality(report){
  sourceReport=report;
  updateMass();
  const card=$('#quality-card');card.classList.toggle('warning',!!report&&!report.valid);card.classList.toggle('pending',!report);
  $('#to-lattice').disabled=!report?.valid;
  $('#to-source-simulate').disabled=!report?.valid;
  updateBuildVolume();
  if(!report){$('#quality-icon').textContent='…';$('#quality-title').textContent='Analizando malla';$('#quality-summary').textContent='Comprobando bordes, orientación y volumen…';$('#quality-meta').textContent='El análisis ocurre en tu navegador.';return;}
  $('#quality-icon').textContent=report.valid?'✓':'!';
  $('#quality-title').textContent=report.valid?'Malla cerrada y orientada':'Malla abierta o no manifold';
  $('#quality-summary').textContent=`${report.boundaryEdges} bordes abiertos · ${report.nonManifoldEdges} aristas no manifold · ${report.components} componente${report.components===1?'':'s'}`;
  const repairs=[];
  if(report.removedDegenerate)repairs.push(`${report.removedDegenerate} triángulos degenerados retirados`);
  if(report.holesFilled)repairs.push(`${report.holesFilled} orificio${report.holesFilled===1?'':'s'} pequeño${report.holesFilled===1?'':'s'} cerrado${report.holesFilled===1?'':'s'}`);
  if(report.flippedTriangles||report.flippedShells)repairs.push('orientación corregida');
  $('#quality-meta').textContent=report.valid?(repairs.join(' · ')||'Sin reparaciones necesarias.'):'La generación está bloqueada. Repara la pieza en una herramienta CAD y vuelve a cargarla.';
}
function setSource(geometry,name,kind,type='STL',report=null,faceRanges=null,bodies=null){
  loadId++;
  clearTimeout(faceTimer);
  if(conversionWorker){conversionWorker.terminate();conversionWorker=null;}
  if(inspectWorker){inspectWorker.terminate();inspectWorker=null;}
  if(worker){worker.terminate();worker=null;}
  if(sourceMesh){scene.remove(sourceMesh);sourceMesh.geometry.dispose();}
  clearFaceOverlays();
  clearLattice();
  clearOptimization();
  clearSourceAnalysis();
  pendingOptimization=null;
  openSkinFaceIds.clear();
  wallZones=[];editingWallZone=null;$('#wall-zone-add').textContent='Añadir zona';renderWallZones();
  faceSets=[];editingFaceSetId=null;faceSetCounter=0;
  analysisCases=[];caseCounter=0;renderAnalysisCases();
  if(geometry.index){const expanded=geometry.toNonIndexed();geometry.dispose();geometry=expanded;}
  modelKind=kind;
  sourceBodies=bodies||createBodyRecords(new Float32Array(geometry.getAttribute('position').array),[{name,first:0,last:geometry.getAttribute('position').count/3-1}],faceRanges||[]);
  cadFaces=Array.isArray(faceRanges)&&faceRanges.length?faceRanges:null;
  sourceScale=1;$('#source-scale').value='1';
  for(const selector of ['#source-support-face','#source-load-face','#simulation-support-face','#simulation-load-face'])$(selector).value='';
  sourceMesh=new THREE.Mesh(geometry,sourceMaterial);
  sourceMesh.castShadow=true;scene.add(sourceMesh);
  modelInfo(name,geometry,type);
  renderBodies();
  scheduleFaces();
  sourceMesh.visible=true;
  needsDraw=true;
  updateQuality(report);
  showStep('prepare');
  resetDesignHistory();
}
function renderBodies(){
  const details=$('#bodies-details'),list=$('#body-list');
  details.hidden=sourceBodies.length<=1;$('#body-count').textContent=String(sourceBodies.length);list.replaceChildren();
  for(const [index,body] of sourceBodies.entries()){
    const row=document.createElement('div');row.className='body-row';
    const title=document.createElement('strong');title.textContent=`${index+1}. ${body.name} · ${(body.positions.length/9).toLocaleString('es')} triángulos`;
    const visibility=document.createElement('button');visibility.className='secondary';visibility.type='button';visibility.textContent=body.visible?'Ocultar':'Mostrar';
    visibility.disabled=body.visible&&sourceBodies.filter(item=>item.visible).length===1;
    visibility.addEventListener('click',()=>{body.visible=!body.visible;try{rebuildBodies();}catch(error){body.visible=!body.visible;toast(error.message);}});
    const remove=document.createElement('button');remove.className='secondary';remove.type='button';remove.textContent='Eliminar';remove.disabled=sourceBodies.length===1;
    remove.addEventListener('click',()=>{const next=sourceBodies.filter(item=>item!==body);if(!next.some(item=>item.visible))next[0].visible=true;const previous=sourceBodies;sourceBodies=next;try{rebuildBodies();}catch(error){sourceBodies=previous;toast(error.message);}});
    row.append(title,visibility,remove);list.appendChild(row);
  }
}
function rebuildBodies(){
  const assembled=assembleVisibleBodies(sourceBodies),report=prepareMesh(assembled.positions,{repair:false}).report;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(assembled.positions,3));geometry.computeVertexNormals();
  const name=$('#model-title').textContent,type=$('#project-type').textContent.split(' · ')[0],savedScale=sourceScale;
  setSource(geometry,name,'mesh',type,report,assembled.cadFaces,sourceBodies);
  sourceScale=savedScale;$('#source-scale').value=String(sourceScale);
}
$('#source-scale').addEventListener('change',event=>{
  if(!sourceMesh)return;
  const next=Number(event.target.value);
  if(!Number.isFinite(next)||next<.01||next>100){event.target.value=String(sourceScale);toast('El factor de escala debe estar entre 0,01 y 100.');return;}
  if(next===sourceScale)return;
  const ratio=next/sourceScale;
  const name=$('#model-title').textContent,type=$('#project-type').textContent.split(' · ')[0];
  if(worker){worker.terminate();worker=null;$('#progress').hidden=true;$('#generate').disabled=false;}
  clearLattice();clearOptimization();clearSourceAnalysis();openSkinFaceIds.clear();
  sourceMesh.geometry.scale(ratio,ratio,ratio);
  for(const body of sourceBodies)for(let i=0;i<body.positions.length;i++)body.positions[i]*=ratio;
  sourceMesh.geometry.computeVertexNormals();
  sourceScale=next;
  const prepared=prepareMesh(sourceMesh.geometry.getAttribute('position').array,{repair:false});
  modelInfo(name,sourceMesh.geometry,type);scheduleFaces();updateQuality(prepared.report);
  resetDesignHistory();
  showStep('prepare');toast(`Escala aplicada: ${next.toLocaleString('es')}×.`);
});
function scheduleFaces(){
  clearTimeout(faceTimer);faceGroups=[];clearFaceOverlays();$('#face-count').textContent='…';$('#face-list').textContent='Detectando regiones…';
  $('#open-skin-faces').textContent='Detectando caras…';
  $('#faces-label').textContent=cadFaces?'Caras CAD':'Caras detectadas';
  $('#faces-note').textContent=cadFaces?'Caras de la triangulación B-rep importada desde STEP. Las selecciones siguen la cara CAD mientras no cambie la topología de la malla.':'Agrupación geométrica por continuidad y ángulo; no recupera las caras CAD originales.';
  $('#face-angle-field').hidden=!!cadFaces;
  const expected=sourceMesh;
  faceTimer=setTimeout(()=>{
    if(sourceMesh!==expected)return;
    try{
      const groups=cadFaces?groupsFromFaceRanges(sourceMesh.geometry.getAttribute('position').array,cadFaces):detectFaceGroups(sourceMesh.geometry.getAttribute('position').array,Number($('#face-angle').value));
      faceGroups=groups;
      $('#face-count').textContent=String(groups.length);
      updateFaceSelectionOptions();
      const list=$('#face-list');list.replaceChildren();
      for(const [index,group] of groups.slice(0,30).entries()){
        const row=document.createElement('div');row.setAttribute('role','listitem');
        row.textContent=`${group.name||`Cara ${index+1}`} · ${group.triangles.toLocaleString('es')} triángulos · ${Math.round(group.areaMm2).toLocaleString('es')} mm²`;
        list.appendChild(row);
      }
      if(groups.length>30){const rest=document.createElement('small');rest.textContent=`Y ${groups.length-30} regiones más.`;list.appendChild(rest);}
      renderOpenSkinFaces();
      renderFaceSetEditor();
      refreshFaceOverlays();
    }catch(error){$('#face-count').textContent='!';$('#face-list').textContent=String(error.message||error);}
  },0);
}
function selectedFaceGroup(value){
  if(!value)return null;
  if(value.startsWith('g:')){
    const set=faceSets.find(item=>item.id===value.slice(2));
    return set?combineFaceGroups(faceGroups,set.faceIds,set.name):null;
  }
  return /^\d+$/.test(value)?faceGroups[Number(value)]||null:null;
}
function updateFaceSelectionOptions(){
  for(const selector of ['#source-support-face','#source-load-face','#simulation-support-face','#simulation-load-face']){
    const select=$(selector),previous=select.value;
    select.replaceChildren(new Option('Automática por eje',''));
    for(const [index,group] of faceGroups.slice(0,100).entries())select.add(new Option(`${group.name||`Cara ${index+1}`} · ${Math.round(group.areaMm2).toLocaleString('es')} mm²`,String(index)));
    for(const set of faceSets)select.add(new Option(`Grupo: ${set.name} · ${set.faceIds.length} cara${set.faceIds.length===1?'':'s'}`,`g:${set.id}`));
    select.value=[...select.options].some(option=>option.value===previous)?previous:'';
  }
}
function clearFaceSetEditor(){
  editingFaceSetId=null;$('#face-set-name').value='';
  $('#face-set-picks').querySelectorAll('input').forEach(input=>{input.checked=false;});
  $('#face-set-save').textContent='Crear grupo';
}
function renderFaceSetEditor(){
  const picks=$('#face-set-picks'),list=$('#face-set-list');picks.replaceChildren();list.replaceChildren();
  for(const [index,group] of faceGroups.slice(0,100).entries()){
    const label=document.createElement('label'),input=document.createElement('input');
    input.type='checkbox';input.value=String(index);input.checked=faceSets.find(item=>item.id===editingFaceSetId)?.faceIds.includes(index)||false;
    label.append(input,document.createTextNode(`${group.name||`Cara ${index+1}`} · ${Math.round(group.areaMm2).toLocaleString('es')} mm²`));picks.appendChild(label);
  }
  for(const set of faceSets){
    const row=document.createElement('div');row.className='body-row';
    const title=document.createElement('strong');title.textContent=`${set.name} · ${set.faceIds.length} cara${set.faceIds.length===1?'':'s'}`;
    const edit=document.createElement('button');edit.className='secondary';edit.type='button';edit.textContent='Editar';
    edit.addEventListener('click',()=>{editingFaceSetId=set.id;$('#face-set-name').value=set.name;$('#face-set-save').textContent='Guardar grupo';renderFaceSetEditor();});
    const opening=document.createElement('button');opening.className='secondary';opening.type='button';opening.textContent='Usar como abertura';
    opening.addEventListener('click',()=>{$('#skin-mode').value='full';openSkinFaceIds.clear();for(const id of set.faceIds)openSkinFaceIds.add(String(id));if(Number($('#skin-size').value)<=0){$('#skin-size').value='1.2';$('#skin-value').textContent='1,2 mm';}renderOpenSkinFaces();invalidate();recordDesignHistory();toast(`Abertura aplicada: ${set.name}.`);});
    const remove=document.createElement('button');remove.className='secondary';remove.type='button';remove.textContent='Eliminar';
    remove.addEventListener('click',()=>{faceSets=faceSets.filter(item=>item.id!==set.id);if(editingFaceSetId===set.id)clearFaceSetEditor();updateFaceSelectionOptions();renderFaceSetEditor();refreshFaceOverlays();clearSourceAnalysis();clearSimulation();invalidate();});
    row.append(title,edit,opening,remove);list.appendChild(row);
  }
  if(!faceGroups.length)picks.textContent='Carga una pieza para seleccionar caras.';
  if(!faceSets.length)list.textContent='Todavía no hay grupos.';
}
$('#face-set-save').addEventListener('click',()=>{
  const name=$('#face-set-name').value.trim(),faceIds=[...$('#face-set-picks').querySelectorAll('input:checked')].map(input=>Number(input.value));
  if(!name||name.length>80||!faceIds.length){toast('Escribe un nombre y elige al menos una cara.');return;}
  if(!editingFaceSetId&&faceSets.length>=32){toast('Máximo de 32 grupos.');return;}
  const id=editingFaceSetId||`g${faceSetCounter++}`;
  const next=faceSets.filter(item=>item.id!==id).concat({id,name,faceIds});
  try{faceSets=normalizeFaceSets(next,faceGroups.length);}catch(error){toast(error.message);return;}
  clearFaceSetEditor();updateFaceSelectionOptions();renderFaceSetEditor();refreshFaceOverlays();clearSourceAnalysis();clearSimulation();invalidate();toast(`Grupo ${name} guardado.`);
});
$('#face-set-clear').addEventListener('click',clearFaceSetEditor);
function renderOpenSkinFaces(){
  const list=$('#open-skin-faces');list.replaceChildren();
  for(const id of openSkinFaceIds)if(!faceGroups[Number(id)])openSkinFaceIds.delete(id);
  for(const [index,group] of faceGroups.slice(0,100).entries()){
    const label=document.createElement('label'),input=document.createElement('input');
    input.type='checkbox';input.value=String(index);input.checked=openSkinFaceIds.has(String(index));
    input.addEventListener('change',()=>{if(input.checked)openSkinFaceIds.add(input.value);else openSkinFaceIds.delete(input.value);updateOpenSkinSummary();if(Number($('#skin-size').value)>0)invalidate();recordDesignHistory();});
    label.append(input,document.createTextNode(`${group.name||`Cara ${index+1}`} · ${Math.round(group.areaMm2).toLocaleString('es')} mm² · normal ${group.normal.map(v=>v.toFixed(1)).join(', ')}`));
    list.appendChild(label);
  }
  if(!faceGroups.length)list.textContent='No hay caras detectadas.';
  updateOpenSkinSummary();
}
function updateOpenSkinSummary(){
  $('#open-skin-field').hidden=Number($('#skin-size').value)<=0;
  $('#rim-field').hidden=Number($('#skin-size').value)<=0;
  const count=openSkinFaceIds.size;
  const selected=$('#skin-mode').value==='selected';
  $('#skin-faces-label').textContent=selected?'Caras con piel':'Caras sin piel';
  $('#skin-faces-help').textContent=selected?'La piel se conserva solo junto a estas caras. Elige al menos una y revisa las transiciones en la malla.':'El lattice llega hasta estas caras para crear aberturas. Puedes elegir varias regiones detectadas en Preparar.';
  $('#open-skin-summary').textContent=selected?(count?`${count} cara${count===1?'':'s'} con piel seleccionada.`:'Elige al menos una cara para generar con piel selectiva.'):(count?`${count} cara${count===1?'':'s'} sin piel. La profundidad de apertura sigue el espesor de piel; verifica el archivo exportado.`:'Ninguna cara abierta.');
}
function clearFaceOverlays(){
  for(const {mesh} of faceOverlayMeshes){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
  faceOverlayMeshes=[];needsDraw=true;
}
function refreshFaceOverlays(){
  clearFaceOverlays();
  for(const selector of ['#source-face-preview','#simulation-face-preview'])$(selector).hidden=true;
  if(!sourceMesh||!['prepare','simulate'].includes(step)||!faceGroups.length)return;
  const prefix=step==='prepare'?'source':'simulation';
  const positions=sourceMesh.geometry.getAttribute('position').array;
  for(const [role,color] of [['support',0xf4af39],['load',0xea5a45]]){
    const selected=$(`#${prefix}-${role}-face`).value;
    if(!selected)continue;
    const group=selectedFaceGroup(selected);if(!group)continue;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(extractFaceTriangles(positions,group.triangleIds),3));
    const material=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:step==='prepare'?.6:.35,depthWrite:false,depthTest:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=10;scene.add(mesh);faceOverlayMeshes.push({mesh,role,group});
  }
  $(`#${prefix}-face-preview`).hidden=faceOverlayMeshes.length===0;
  needsDraw=true;
}
function selectedFaceBoundary(supportSelector,loadSelector,senseSelector){
  const supportValue=$(supportSelector).value,loadValue=$(loadSelector).value;
  if(!supportValue&&!loadValue)return null;
  if(!supportValue||!loadValue)throw new Error('Selecciona ambas caras, o deja las dos en automático.');
  if(supportValue===loadValue)throw new Error('El apoyo y la carga requieren caras distintas.');
  const support=selectedFaceGroup(supportValue),load=selectedFaceGroup(loadValue);
  if(!support||!load)throw new Error('Las caras seleccionadas ya no están disponibles.');
  const loadIds=new Set(load.triangleIds);
  if(support.triangleIds.some(id=>loadIds.has(id)))throw new Error('El apoyo y la carga deben usar caras sin solapamiento.');
  const direction=load.centroid.map((v,i)=>v-support.centroid[i]),length=Math.hypot(...direction);
  if(length<1e-6)throw new Error('Las caras deben estar separadas para definir la carga.');
  const positions=sourceMesh.geometry.getAttribute('position').array;
  const sense=Number($(senseSelector).value);
  return {support:extractFaceTriangles(positions,support.triangleIds),load:extractFaceTriangles(positions,load.triangleIds),loadAreaMm2:load.areaMm2,direction:direction.map(v=>sense*v/length)};
}
$('#face-angle').addEventListener('input',e=>{$('#face-angle-value').textContent=`${e.target.value}°`;for(const selector of ['#source-support-face','#source-load-face','#simulation-support-face','#simulation-load-face'])$(selector).value='';openSkinFaceIds.clear();faceSets=[];clearFaceSetEditor();updateOpenSkinSummary();clearSourceAnalysis();clearSimulation();if(Number($('#solid-zone-depth').value)>0||Number($('#skin-size').value)>0)invalidate();scheduleFaces();});
function clearLattice(){
  if(manufacturingWorker){manufacturingWorker.terminate();manufacturingWorker=null;}
  if(thicknessWorker){thicknessWorker.terminate();thicknessWorker=null;}
  clearSimulation();
  if(latticeMesh){scene.remove(latticeMesh);latticeMesh.geometry.dispose();latticeMesh=null;}
  if(previewPoints){scene.remove(previewPoints);previewPoints.geometry.dispose();previewPoints.material.dispose();previewPoints=null;}
  previewMode='points';$('#view-mode').hidden=true;$('#view-mode').setAttribute('aria-pressed','true');
  needsDraw=true;
  generation=null;$('#lattice-result').hidden=true;$('#to-simulate').disabled=true;$('#top-export').disabled=true;$('#lattice-check').textContent='';$('#simulation-target').value='source';$('#simulation-target').querySelector('[value="lattice"]').disabled=true;updateMass();renderThicknessCheck();analyzePrintability();
}
function clearSimulation(){
  if(simulationWorker){simulationWorker.terminate();simulationWorker=null;}
  simulation=null;$('#simulation-result').hidden=true;$('#simulation-result').classList.remove('warning');$('#optimization-verification').hidden=true;$('#simulation-progress').hidden=true;$('#run-simulation').disabled=false;$('#simulate-check').textContent='';
}
function clearOptimization(){
  if(optimizationWorker){optimizationWorker.terminate();optimizationWorker=null;}
  optimization=null;$('#optimization-progress').hidden=true;$('#optimization-result').hidden=true;$('#optimization-result').classList.remove('warning');$('#optimize').disabled=false;$('#apply-optimization').disabled=true;
}
function clearSourceAnalysis(){
  if(sourceAnalysisWorker){sourceAnalysisWorker.terminate();sourceAnalysisWorker=null;}
  const wasGraded=$('#use-stress-grade').checked,wasCellGraded=$('#use-stress-cell').checked;
  sourceAnalysis=null;pendingGradeRestore=false;pendingCellGradeRestore=false;
  $('#source-analysis-progress').hidden=true;$('#source-analysis-result').hidden=true;$('#analyze-source').disabled=false;
  $('#use-stress-grade').checked=false;$('#use-stress-grade').disabled=true;$('#grade-min-field').hidden=true;
  $('#use-stress-cell').checked=false;$('#use-stress-cell').disabled=true;$('#cell-min-field').hidden=true;
  $('#grade-note').textContent='Primero analiza la pieza maciza en Preparar. El grosor del control superior será el máximo.';
  $('#cell-grade-note').textContent='Primero analiza la pieza maciza en Preparar. Se crean celdas menores donde el esfuerzo es mayor; es una aproximación.';
  if((wasGraded||wasCellGraded)&&sourceMesh)invalidate();
}
function fitCamera(){
  if(!bounds)return;
  const b=new THREE.Box3(new THREE.Vector3(...bounds.min),new THREE.Vector3(...bounds.max));
  const size=b.getSize(new THREE.Vector3()).length();
  controls.target.copy(b.getCenter(new THREE.Vector3()));
  camera.position.copy(controls.target).add(new THREE.Vector3(1,0.8,1).normalize().multiplyScalar(size*1.7));
  controls.update();
  needsDraw=true;
}
function showStep(next){
  if(next==='lattice'&&!sourceReport?.valid){toast('La pieza debe ser una malla cerrada y válida.');return;}
  if(next==='simulate'&&!sourceReport?.valid){toast('Carga una pieza válida antes de simular.');return;}
  if(next==='export'&&!latticeMesh){toast('Genera un lattice antes de exportar.');return;}
  if(next==='export'&&!generation?.report?.valid){toast('El lattice generado no pasó la validación.');return;}
  if(next==='export'&&!selectedManufacturingFits()){toast('Revisa el volumen de fabricación y el espesor nominal mínimo antes de exportar.');return;}
  if(next==='simulate'&&step==='lattice'&&generation?.report?.valid)$('#simulation-target').value='lattice';
  if(next==='simulate'){
    const solid=$('#simulation-target').value==='source';
    $('#simulation-target-note').textContent=solid?'Se calcula sobre la pieza maciza, antes de generar el lattice.':'Se calcula sobre la malla lattice generada.';
    $('#simulation-face-note').textContent=`Las caras se toman de la pieza original y se aproximan sobre los vóxeles ${solid?'de la pieza maciza':'del lattice'}.`;
    if(simulationMode==='elastic')$('#simulation-caveat').textContent=`La discretización altera el grosor y la conectividad ${solid?'de la pieza':'del lattice'}. Estos valores no sirven para certificarla ni sustituir un análisis de ingeniería convergente.`;
  }
  step=next;
  document.querySelectorAll('.rail-step').forEach(el=>el.classList.toggle('active',el.dataset.step===next));
  document.querySelectorAll('.panel').forEach(el=>el.classList.toggle('active',el.id===`${next}-panel`));
  const showSource=next==='prepare'||next==='simulate'&&$('#simulation-target').value==='source'||!latticeMesh;
  if(sourceMesh)sourceMesh.visible=showSource;
  updateLatticeVisibility(showSource);
  $('#sim-to-export').innerHTML=latticeMesh?'Continuar a exportar <span>→</span>':'Continuar a Lattice <span>→</span>';
  refreshFaceOverlays();
  needsDraw=true;
}

function createSample(id){
  const sample=createExample(id);
  baseName=sample.slug;
  setSource(sample.geometry,sample.name,sample.kind,'MUESTRA');
  updateQuality(prepareMesh(sourceMesh.geometry.getAttribute('position').array,{repair:false}).report);
  if(sample.cell){
    $('#cell-size').value=String(sample.cell);$('#cell-value').textContent=`${sample.cell} mm`;
    $('#wall-size').value=String(sample.wall);$('#wall-value').textContent=sample.wall.toFixed(2);
  }
  updateGenerationEstimate();
  updateBuildVolume();
  document.querySelectorAll('.sample').forEach(b=>b.classList.toggle('selected',b.dataset.sample===id));
  resetDesignHistory();
}
createSample('cube');
applyMaterial();

async function loadFile(file){
  if(!file)return;
  const format=/\.stl$/i.test(file.name)?'STL':/\.(step|stp)$/i.test(file.name)?'STEP':/\.3mf$/i.test(file.name)?'3MF':null;
  if(!format){toast('Selecciona un archivo STL, STEP o 3MF.');return;}
  if(file.size>25*1024*1024){toast('El archivo debe pesar menos de 25 MB en este prototipo.');return;}
  const thisLoad=++loadId,previousReport=sourceReport;
  if(conversionWorker){conversionWorker.terminate();conversionWorker=null;}
  if(inspectWorker){inspectWorker.terminate();inspectWorker=null;}
  updateQuality(null);toast(format==='STEP'?'Convirtiendo STEP con OpenCascade…':'Analizando y reparando la malla…');
  try{
    const buffer=await file.arrayBuffer();
    let input,incomingCadFaces=null,incomingBodies=null;
    if(format==='STL'){
      const geometry=new STLLoader().parse(buffer);
      input=new Float32Array(geometry.getAttribute('position').array);geometry.dispose();
    }else if(format==='3MF'){
      const unit=unitScale3MF(buffer),group=new ThreeMFLoader().parse(buffer);
      group.updateMatrixWorld(true);
      const chunks=[],bodyRanges=[];let length=0;
      group.traverse(object=>{
        if(!object.isMesh)return;
        let geometry=object.geometry.clone();geometry.applyMatrix4(object.matrixWorld);
        if(geometry.index){const expanded=geometry.toNonIndexed();geometry.dispose();geometry=expanded;}
        const array=geometry.getAttribute('position').array;
        const part=new Float32Array(array.length);
        for(let i=0;i<array.length;i++)part[i]=array[i]*unit;
        bodyRanges.push({name:object.name||`Cuerpo ${bodyRanges.length+1}`,first:length/9,last:(length+part.length)/9-1});
        chunks.push(part);length+=part.length;geometry.dispose();
      });
      if(!length)throw new Error('El archivo 3MF no contiene una malla.');
      input=new Float32Array(length);let offset=0;for(const part of chunks){input.set(part,offset);offset+=part.length;}
      incomingBodies=bodyRanges;
    }else{
      const converted=await new Promise((resolve,reject)=>{
        const cad=new Worker('/cad/step-worker.js');conversionWorker=cad;
        cad.onmessage=({data})=>{cad.terminate();if(conversionWorker===cad)conversionWorker=null;data.type==='done'?resolve(data):reject(new Error(data.message));};
        cad.onerror=e=>{cad.terminate();if(conversionWorker===cad)conversionWorker=null;reject(new Error(e.message||'No se pudo importar STEP.'));};
        cad.postMessage({buffer},[buffer]);
      });
      input=converted.positions;incomingCadFaces=converted.cadFaces;incomingBodies=converted.bodies;
    }
    if(thisLoad!==loadId)return;
    if(input.length/9>80000)throw new Error('La pieza supera el límite de 80.000 triángulos.');
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(input,3));geometry.center();
    input=new Float32Array(geometry.getAttribute('position').array);geometry.dispose();
    const expectedTriangles=input.length/9;
    inspectWorker=new Worker(new URL('./mesh-inspect-worker.js',import.meta.url),{type:'module'});
    inspectWorker.onmessage=({data:result})=>{
      if(thisLoad!==loadId)return;
      inspectWorker?.terminate();inspectWorker=null;
      if(result.type==='error'){updateQuality(previousReport);toast(result.message);return;}
      const repaired=new THREE.BufferGeometry();repaired.setAttribute('position',new THREE.BufferAttribute(result.positions,3));repaired.computeVertexNormals();
      baseName=file.name.replace(/\.(stl|step|stp|3mf)$/i,'').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,48)||'pieza';
      const preservedTopology=result.report.triangles===expectedTriangles&&result.report.removedDegenerate===0&&result.report.removedInvalid===0&&result.report.holesFilled===0;
      const faceRanges=preservedTopology?incomingCadFaces:null;
      const bodyRecords=preservedTopology&&incomingBodies?createBodyRecords(result.positions,incomingBodies,faceRanges||[]):null;
      setSource(repaired,file.name,'mesh',format,result.report,faceRanges,bodyRecords);
      document.querySelectorAll('.sample').forEach(b=>b.classList.remove('selected'));
      toast(result.report.valid?`${file.name}: malla lista para lattice.`:`${file.name}: malla abierta; consulta el diagnóstico.`);
    };
    inspectWorker.onerror=e=>{if(thisLoad!==loadId)return;inspectWorker?.terminate();inspectWorker=null;updateQuality(previousReport);toast(`Error al analizar: ${e.message}`)};
    inspectWorker.postMessage({positions:input},[input.buffer]);
  }catch(error){if(thisLoad!==loadId)return;updateQuality(previousReport);toast(`No se pudo abrir ${format}: ${error.message}`)}
}
$('#file-input').addEventListener('change',e=>{const file=e.target.files[0];e.target.value='';loadFile(file);});
const drop=$('#dropzone');
for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragover')});
for(const event of ['dragleave','drop'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('dragover')});
drop.addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));
document.querySelectorAll('.sample').forEach(el=>el.addEventListener('click',()=>createSample(el.dataset.sample)));
document.querySelectorAll('.rail-step').forEach(el=>el.addEventListener('click',()=>showStep(el.dataset.step)));
$('#to-lattice').addEventListener('click',()=>showStep('lattice'));
$('#to-source-simulate').addEventListener('click',()=>{$('#simulation-target').value='source';showStep('simulate');});
$('#back-prepare').addEventListener('click',()=>showStep('prepare'));
$('#to-simulate').addEventListener('click',()=>showStep('simulate'));
$('#back-to-lattice').addEventListener('click',()=>showStep(latticeMesh?'lattice':'prepare'));
$('#sim-to-export').addEventListener('click',()=>showStep(latticeMesh?'export':'lattice'));
$('#back-lattice').addEventListener('click',()=>showStep('simulate'));
$('#cell-size').addEventListener('input',e=>{$('#cell-value').textContent=`${e.target.value} mm`;if(Number($('#cell-min').value)>Number(e.target.value))$('#cell-min').value=e.target.value;invalidate()});
$('#wall-size').addEventListener('input',e=>{$('#wall-value').textContent=Number(e.target.value).toFixed(2);invalidate()});
$('#wall-zone-add').addEventListener('click',()=>{
  const candidate={type:$('#wall-zone-type').value,center:['#wall-zone-x','#wall-zone-y','#wall-zone-z'].map(selector=>Number($(selector).value)),size:Number($('#wall-zone-size').value),wall:Number($('#wall-zone-wall').value),blend:Number($('#wall-zone-blend').value)};
  if(['#wall-zone-x','#wall-zone-y','#wall-zone-z','#wall-zone-size','#wall-zone-wall','#wall-zone-blend'].some(selector=>$(selector).value.trim()==='')){toast('Completa las coordenadas y medidas de la zona.');return;}
  try{
    const next=wallZones.slice();if(editingWallZone===null)next.push(candidate);else next[editingWallZone]=candidate;
    wallZones=normalizeWallZones(next);editingWallZone=null;$('#wall-zone-add').textContent='Añadir zona';renderWallZones();invalidate();recordDesignHistory();
    toast('Zona local aplicada. Genera la malla para verificarla.');
  }catch(error){toast(error.message);}
});
$('#skin-size').addEventListener('input',e=>{$('#skin-value').textContent=`${Number(e.target.value).toLocaleString('es',{maximumFractionDigits:1})} mm`;updateOpenSkinSummary();invalidate()});
$('#skin-mode').addEventListener('change',()=>{openSkinFaceIds.clear();renderOpenSkinFaces();invalidate();});
$('#rim-width').addEventListener('change',invalidate);
$('#solid-zone-depth').addEventListener('input',e=>{$('#solid-zone-value').textContent=`${Number(e.target.value).toLocaleString('es',{maximumFractionDigits:1})} mm`;invalidate()});
function applyTpmsRecommendations(){
  const pattern=$('#pattern').value,form=$('#tpms-form').value;
  const minimum=pattern==='frd'?(form==='network'?.34:.30):pattern==='neovius'&&form==='network'?.34:0;
  if(minimum&&Number($('#wall-size').value)<minimum){$('#wall-size').value=String(minimum);$('#wall-value').textContent=minimum.toFixed(2);}
  updateGenerationEstimate();
  updateBuildVolume();
}
$('#pattern').addEventListener('change',invalidate);
$('#pattern').addEventListener('change',()=>{
  const pattern=$('#pattern').value,beams=['cubic','bcc','fcc','octa','octet'].includes(pattern),stochastic=STOCHASTIC_PATTERNS.includes(pattern);
  $('#voronoi-seed-field').hidden=!stochastic;
  $('#tpms-form-field').hidden=beams||pattern==='voronoi'||STOCHASTIC_BARS.includes(pattern);
  $('#pattern-hint').textContent=pattern==='voronoi'?'Espuma de celdas Voronoi irregulares y reproducibles.':pattern==='voronoi-bars'?'Barras alrededor de las aristas Voronoi; aproximación de campo, no aristas exactas.':pattern==='delaunay-bars'?'Barras entre sitios vecinos; aproximación local, no triangulación Delaunay exacta.':pattern==='spinodal'?'Campo de ondas oblicuas con semilla; aproximación procedural, no simulación de separación de fases.':beams?'Vigas cilíndricas periódicas; comprueba el diámetro mínimo de impresión.':'Superficies periódicas aproximadas; comprueba poros y espesor tras exportar.';
  if(stochastic){$('#use-stress-cell').checked=false;$('#cell-min-field').hidden=true;}
  $('#use-stress-cell').disabled=!sourceAnalysis||stochastic;
  if(bounds&&['iwp','frd'].includes(pattern)){const maxDim=Math.max(...bounds.max.map((v,i)=>v-bounds.min[i]));const limit=Math.round(maxDim/(pattern==='iwp'?4.5:5));const cell=$('#cell-size');cell.value=String(Math.max(Number(cell.min),Math.min(Number(cell.value),limit)));$('#cell-value').textContent=`${cell.value} mm`;if(pattern==='frd'&&Number($('#wall-size').value)<.30){$('#wall-size').value='.30';$('#wall-value').textContent='0.30';}}
});
$('#pattern').addEventListener('change',applyTpmsRecommendations);
$('#tpms-form').addEventListener('change',()=>{applyTpmsRecommendations();invalidate();});
let librarySuggestions=[];
$('#library-mode').addEventListener('change',()=>{
  const stiffness=$('#library-mode').value==='stiffness';
  $('#library-unit').textContent=stiffness?'(MPa)':'(%)';
  $('#library-target').value=stiffness?'500':'50';
  $('#library-target').max=stiffness?'1000000':'100';
  $('#library-results').replaceChildren();
});
$('#library-search').addEventListener('click',()=>{
  const mode=$('#library-mode').value,target=Number($('#library-target').value);
  const output=$('#library-results');output.replaceChildren();
  const material=MATERIALS[$('#material').value];
  if(!material||!Number.isFinite(target)||target<=0||mode==='density'&&target>100){output.textContent='Indica un objetivo positivo válido.';return;}
  if(Number($('#cell-size').min)>10||Number($('#cell-size').max)<10){output.textContent='La pieza no admite la celda de 10 mm usada en esta biblioteca. Ajusta la escala o usa la búsqueda paramétrica.';return;}
  librarySuggestions=libraryCandidates({mode,target,materialModulusGPa:material.E,minimumThickness:Number($('#min-wall').value)}).filter(row=>!bounds||!['iwp','frd'].includes(row.pattern)||Math.round(Math.max(...bounds.max.map((v,i)=>v-bounds.min[i]))/(row.pattern==='iwp'?4.5:5))>=10);
  if(!librarySuggestions.length){output.textContent='No hay una configuración calibrada que cumpla ese objetivo con el material y espesor mínimo actuales.';return;}
  const table=document.createElement('table');table.className='library-table';
  const head=document.createElement('thead');head.innerHTML='<tr><th>Celda</th><th>ρ</th><th>E* axial</th><th></th></tr>';table.append(head);
  const body=document.createElement('tbody');
  librarySuggestions.forEach((row,index)=>{
    const tr=document.createElement('tr'),name=$('#pattern').querySelector(`option[value="${row.pattern}"]`)?.textContent.split(' · ')[0]||row.pattern;
    for(const value of [`${name} · ${row.form==='beam'?'vigas':row.form==='sheet'?'lámina':'red'} · ${row.wall.toFixed(2)}`,`${row.densityPercent.toFixed(1)} %`,`${row.stiffnessMPa.toFixed(0)} MPa`]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
    const action=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Aplicar';button.dataset.index=String(index);action.append(button);tr.append(action);body.append(tr);
  });
  table.append(body);output.append(table);
  const best=librarySuggestions[0],note=document.createElement('small');
  note.textContent=`Primera sugerencia: rango por resolución ρ ${best.densityRangePercent.map(v=>v.toFixed(1)).join('–')} %; E* ${best.stiffnessRangeMPa.map(v=>v.toFixed(0)).join('–')} MPa. ${calibration.method}`;
  output.append(note);
});
$('#library-results').addEventListener('click',event=>{
  const button=event.target.closest('button[data-index]');if(!button)return;
  const row=librarySuggestions[Number(button.dataset.index)];if(!row)return;
  $('#pattern').value=row.pattern;$('#pattern').dispatchEvent(new Event('change'));
  if(row.form!=='beam'){$('#tpms-form').value=row.form;$('#tpms-form').dispatchEvent(new Event('change'));}
  $('#cell-size').value='10';$('#cell-size').dispatchEvent(new Event('input'));
  $('#wall-size').value=String(row.wall);$('#wall-size').dispatchEvent(new Event('input'));
  toast(`Sugerencia aplicada: ${row.pattern}, ${row.form}, grosor ${row.wall.toFixed(2)}. Genera y verifica la pieza.`);
  recordDesignHistory();
});
$('#voronoi-seed').addEventListener('change',invalidate);
$('#technology').addEventListener('change',setManufacturingChoices);
$('#machine').addEventListener('change',updateBuildVolume);
$('#material').addEventListener('change',applyMaterial);
$('#min-wall').addEventListener('input',()=>{updateManufacturingWarning();renderThicknessCheck();updateBuildVolume();});
$('#print-direction').addEventListener('change',()=>{if($('#equidistant-layers').checked||$('#conformal-cells').checked)invalidate();updateBuildVolume();analyzePrintability();});
for(const selector of ['#equidistant-layers','#conformal-cells'])$(selector).addEventListener('change',()=>{
  if(selector==='#conformal-cells'&&$('#conformal-cells').checked&&modelKind==='sphere'){$('#conformal-cells').checked=false;toast('La esfera tiene una silueta casi paralela al eje; la disposición conforme puede degenerar.');return;}
  if($(selector).checked)$(selector==='#equidistant-layers'?'#conformal-cells':'#equidistant-layers').checked=false;
  invalidate();updateGenerationEstimate();
});
$('#max-overhang').addEventListener('input',analyzePrintability);
for(const selector of ['#source-analysis-axis','#source-analysis-modulus','#source-analysis-force'])$(selector).addEventListener('change',clearSourceAnalysis);
for(const [sourceSelector,simulationSelector] of [['#source-support-face','#simulation-support-face'],['#source-load-face','#simulation-load-face']])$(sourceSelector).addEventListener('change',()=>{$(simulationSelector).value=$(sourceSelector).value;refreshFaceOverlays();clearSourceAnalysis();clearSimulation();if(Number($('#solid-zone-depth').value)>0)invalidate();});
$('#source-load-sense').addEventListener('change',()=>{$('#simulation-load-sense').value=$('#source-load-sense').value;clearSourceAnalysis();clearSimulation();});
for(const selector of ['#simulation-support-face','#simulation-load-face'])$(selector).addEventListener('change',()=>{refreshFaceOverlays();clearSimulation();});
$('#simulation-load-sense').addEventListener('change',clearSimulation);
$('#analyze-source').addEventListener('click',()=>{
  if(!sourceMesh||!sourceReport?.valid)return;
  const E=Number($('#source-analysis-modulus').value)*1000,force=Number($('#source-analysis-force').value),axis=Number($('#source-analysis-axis').value),restoreGrade=pendingGradeRestore,restoreCellGrade=pendingCellGradeRestore;
  if(!Number.isFinite(E)||E<10||E>1e6||!Number.isFinite(force)||force<=0||force>100000){toast('Revisa el módulo y la fuerza de la pieza maciza.');return;}
  let faceBoundary;
  try{faceBoundary=selectedFaceBoundary('#source-support-face','#source-load-face','#source-load-sense');}catch(error){toast(error.message);return;}
  clearSourceAnalysis();pendingGradeRestore=restoreGrade;pendingCellGradeRestore=restoreCellGrade;
  $('#source-analysis-progress').hidden=false;$('#source-analysis-progress').textContent='Muestreando pieza maciza…';$('#analyze-source').disabled=true;
  const positions=new Float32Array(sourceMesh.geometry.getAttribute('position').array),analysisBounds={min:[...bounds.min],max:[...bounds.max]};
  sourceAnalysisWorker=new Worker(new URL('./simulation-worker.js',import.meta.url),{type:'module'});
  const current=sourceAnalysisWorker;
  current.onmessage=({data})=>{
    if(sourceAnalysisWorker!==current)return;
    if(data.type==='progress'){$('#source-analysis-progress').textContent=data.value<60?`Muestreando pieza maciza… ${data.value}%`:'Resolviendo elasticidad…';return;}
    current.terminate();sourceAnalysisWorker=null;$('#source-analysis-progress').hidden=true;$('#analyze-source').disabled=false;
    if(data.type==='error'){pendingGradeRestore=false;pendingCellGradeRestore=false;toast(data.message);return;}
    if(!(data.result.stress95>0)){pendingGradeRestore=false;pendingCellGradeRestore=false;toast('No se obtuvo un campo de esfuerzos útil.');return;}
    sourceAnalysis={...data.result,bounds:analysisBounds,E,force,axis};
    $('#source-analysis-summary').textContent=`Esfuerzo P95 ${sourceAnalysis.stress95.toPrecision(3)} MPa · desplazamiento máx. ${sourceAnalysis.maxDisplacement.toExponential(2)} mm · ${sourceAnalysis.voxels} vóxeles${sourceAnalysis.faceBoundary?` · ${sourceAnalysis.supportCount} nodos fijos / ${sourceAnalysis.loadCount} cargados`:''}.`;
    $('#source-analysis-result').hidden=false;$('#use-stress-grade').disabled=false;$('#use-stress-cell').disabled=STOCHASTIC_PATTERNS.includes($('#pattern').value);
    $('#grade-note').textContent='Campo listo. El grosor aumenta donde el modelo macizo predice más esfuerzo.';
    $('#cell-grade-note').textContent='Campo listo. El tamaño disminuye donde el modelo macizo predice más esfuerzo.';
    if(pendingGradeRestore){$('#use-stress-grade').checked=true;$('#grade-min-field').hidden=false;pendingGradeRestore=false;invalidate();}
    if(pendingCellGradeRestore&&!STOCHASTIC_PATTERNS.includes($('#pattern').value)){$('#use-stress-cell').checked=true;$('#cell-min-field').hidden=false;invalidate();}
    pendingCellGradeRestore=false;
    toast('Análisis macizo listo para graduar el lattice.');
  };
  current.onerror=e=>{if(sourceAnalysisWorker!==current)return;current.terminate();sourceAnalysisWorker=null;$('#source-analysis-progress').hidden=true;$('#analyze-source').disabled=false;pendingGradeRestore=false;pendingCellGradeRestore=false;toast(`Error al analizar la pieza: ${e.message}`)};
  current.postMessage({positions,bounds:analysisBounds,mode:'elastic',E,force,nu:.3,axis,faceBoundary},[positions.buffer]);
});
$('#use-stress-grade').addEventListener('change',()=>{$('#grade-min-field').hidden=!$('#use-stress-grade').checked;invalidate();});
$('#grade-min').addEventListener('change',()=>{if($('#use-stress-grade').checked)invalidate();});
$('#use-stress-cell').addEventListener('change',()=>{$('#cell-min-field').hidden=!$('#use-stress-cell').checked;invalidate();});
$('#cell-min').addEventListener('change',()=>{if($('#use-stress-cell').checked)invalidate();});
function invalidate(){pendingOptimization=null;clearOptimization();if(worker){worker.terminate();worker=null;$('#progress').hidden=true;$('#generate').disabled=false;}if(latticeMesh)clearLattice();if(sourceMesh)sourceMesh.visible=true;$('#view-status').textContent='Ajustes pendientes de generar';}
document.querySelectorAll('#resolution button').forEach(el=>el.addEventListener('click',()=>{quality=el.dataset.quality;document.querySelectorAll('#resolution button').forEach(b=>b.classList.toggle('selected',b===el));updateGenerationEstimate();invalidate();recordDesignHistory()}));
for(const selector of ['#cell-size','#wall-size','#skin-size','#solid-zone-depth','#cell-min','#grade-min','#pattern','#use-stress-cell','#use-stress-grade','#equidistant-layers','#conformal-cells'])$(selector).addEventListener('input',updateGenerationEstimate);
for(const selector of ['#cell-size','#wall-size','#cell-min','#grade-min','#use-stress-cell','#use-stress-grade'])$(selector).addEventListener('input',updateBuildVolume);

for(const selector of ['#optimizer-axis','#optimizer-modulus','#optimizer-force','#optimizer-target'])$(selector).addEventListener('input',clearOptimization);
$('#optimize').addEventListener('click',()=>{
  if(!sourceMesh||!sourceReport?.valid)return;
  if(STOCHASTIC_PATTERNS.includes($('#pattern').value)){toast('La búsqueda paramétrica disponible cubre solo celdas TPMS y de vigas periódicas.');return;}
  if(Number($('#skin-size').value)>0||Number($('#solid-zone-depth').value)>0||wallZones.length||$('#use-stress-grade').checked||$('#use-stress-cell').checked){toast('La búsqueda paramétrica requiere piel y zonas macizas en 0 mm y parámetros uniformes; para usar estos ajustes, genera y simula manualmente.');return;}
  const E=Number($('#optimizer-modulus').value)*1000,force=Number($('#optimizer-force').value),target=Number($('#optimizer-target').value),axis=Number($('#optimizer-axis').value);
  if(!Number.isFinite(E)||E<10||E>1e6||!Number.isFinite(force)||force<=0||force>100000||!Number.isFinite(target)||target<=0||target>100){toast('Revisa material, fuerza y desplazamiento límite.');return;}
  clearOptimization();$('#optimization-progress').hidden=false;$('#optimization-progress-text').textContent='Preparando búsqueda…';$('#optimize').disabled=true;
  const base=Number($('#cell-size').value),min=Number($('#cell-size').min),max=Number($('#cell-size').max);
  const cells=[Math.round(base*.75),base,Math.round(base*1.25)].map(v=>Math.max(min,Math.min(max,v)));
  const sourcePositions=new Float32Array(sourceMesh.geometry.getAttribute('position').array);
  optimizationWorker=new Worker(new URL('./optimization-worker.js',import.meta.url),{type:'module'});
  const current=optimizationWorker;
  current.onmessage=({data})=>{
    if(optimizationWorker!==current)return;
    if(data.type==='progress'){$('#optimization-progress-text').textContent=data.value<36?`Muestreando diseños… ${data.value}%`:`Evaluando rigidez… ${data.value}%`;return;}
    current.terminate();optimizationWorker=null;$('#optimization-progress').hidden=true;$('#optimize').disabled=false;
    if(data.type==='error'){toast(data.message);return;}
    optimization={...data.result,E,force,axis};
    $('#optimization-result').hidden=false;$('#optimization-result').classList.toggle('warning',!optimization.feasible);
    $('#optimization-status').textContent=optimization.feasible?'Cumple en el modelo exploratorio':'Ningún diseño cumple el límite';
    $('#optimization-summary').textContent=`Celda ${optimization.cell} mm · grosor ${optimization.wall.toFixed(2)} · reducción estimada ${Math.round(optimization.reduction*100)} % · desplazamiento ${optimization.displacement.toExponential(2)} mm`;
    $('#optimization-detail').textContent=`${optimization.evaluated} de ${optimization.totalCandidates} combinaciones revisadas · límite ${target.toExponential(2)} mm${optimization.feasible?'':' · prueba un límite mayor o ajusta la carga'}.`;
    $('#apply-optimization').disabled=!optimization.feasible;
    toast(optimization.feasible?'Diseño encontrado. Puedes aplicarlo y generar la malla.':'Ninguna combinación cumplió el límite.');
  };
  current.onerror=e=>{if(optimizationWorker!==current)return;current.terminate();optimizationWorker=null;$('#optimization-progress').hidden=true;$('#optimize').disabled=false;toast(`Error al optimizar: ${e.message}`)};
  current.postMessage({sourcePositions,bounds,pattern:$('#pattern').value,form:$('#tpms-form').value,cells,walls:[.18,.24,.30,.36,.42],E,force,axis,target},[sourcePositions.buffer]);
});
$('#cancel-optimization').addEventListener('click',()=>{if(!optimizationWorker)return;clearOptimization();toast('Búsqueda cancelada.');});
$('#apply-optimization').addEventListener('click',()=>{
  if(!optimization?.feasible)return;
  const selected=optimization;
  $('#cell-size').value=String(selected.cell);$('#cell-value').textContent=`${selected.cell} mm`;
  $('#wall-size').value=String(selected.wall);$('#wall-value').textContent=selected.wall.toFixed(2);
  updateBuildVolume();
  $('#young-modulus').value=String(selected.E/1000);$('#applied-force').value=String(selected.force);$('#load-axis').value=String(selected.axis);
  clearSimulation();invalidate();pendingOptimization={target:selected.target,E:selected.E,force:selected.force,axis:selected.axis};$('#optimizer-details').open=false;$('#generate').click();
  recordDesignHistory();
});

$('#generate').addEventListener('click',()=>{
  if(!sourceMesh)return;
  if($('#conformal-cells').checked&&modelKind==='sphere'){toast('Desactiva las celdas conformes para esta esfera.');return;}
  if($('#conformal-cells').checked&&$('#equidistant-layers').checked){toast('Elige solo una disposición espacial.');return;}
  if(!selectedMachineFits()){toast('La pieza no cabe en el volumen nominal de la máquina elegida. Cambia orientación, escala o máquina.');return;}
  if(!selectedManufacturingFits()){toast('El espesor nominal de vigas o espuma está bajo el mínimo indicado. Aumenta celda o grosor.');return;}
  const seed=Number($('#voronoi-seed').value);
  if(STOCHASTIC_PATTERNS.includes($('#pattern').value)&&(!Number.isInteger(seed)||seed<0||seed>9999||$('#voronoi-seed').value==='')){toast('Elige una semilla entera entre 0 y 9999.');return;}
  const graded=$('#use-stress-grade').checked,minWall=Number($('#grade-min').value),maxWall=Number($('#wall-size').value);
  const cellGraded=$('#use-stress-cell').checked,minCell=Number($('#cell-min').value),maxCell=Number($('#cell-size').value);
  const solidDepth=Number($('#solid-zone-depth').value);
  const rim=Number($('#rim-width').value);
  if($('#rim-width').value.trim()===''||!Number.isFinite(rim)||rim<0||rim>4){toast('El ancho del marco debe estar entre 0 y 4 mm.');return;}
  if(rim>0&&(!openSkinFaceIds.size||Number($('#skin-size').value)<=0)){toast('El marco requiere piel activa y al menos una cara elegida.');return;}
  if(graded&&(!sourceAnalysis||!Number.isFinite(minWall)||minWall<.12||minWall>maxWall)){toast('Calcula el esfuerzo macizo y elige un grosor mínimo menor o igual al máximo.');return;}
  if(cellGraded&&(!sourceAnalysis||!Number.isFinite(minCell)||minCell<2||minCell>maxCell||STOCHASTIC_PATTERNS.includes($('#pattern').value))){toast('Calcula el esfuerzo macizo y elige un tamaño mínimo de celda válido.');return;}
  let faceBoundary=null;
  if(solidDepth>0){
    try{faceBoundary=selectedFaceBoundary('#source-support-face','#source-load-face','#source-load-sense');}catch(error){toast(error.message);return;}
    if(!faceBoundary){toast('Elige las caras de apoyo y carga en Preparar para añadir zonas macizas.');return;}
  }
  if(worker)worker.terminate();
  $('#progress').hidden=false;$('#progress-text').textContent='Muestreando el volumen…';$('#generate').disabled=true;
  clearLattice();
  const data={kind:modelKind,bounds,pattern:$('#pattern').value,form:$('#tpms-form').value,cell:Number($('#cell-size').value),wall:Number($('#wall-size').value),wallZones,skin:Number($('#skin-size').value),rim,quality,seed,layers:$('#equidistant-layers').checked,conformal:$('#conformal-cells').checked,printAxis:'XYZ'.indexOf($('#print-direction').value.slice(-1))};
  if(data.skin>0&&$('#skin-mode').value==='selected'&&!openSkinFaceIds.size){toast('Elige al menos una cara para aplicar la piel selectiva.');$('#progress').hidden=true;$('#generate').disabled=false;return;}
  if(data.skin>0&&openSkinFaceIds.size){
    const positions=sourceMesh.geometry.getAttribute('position').array,faces=[];
    for(const id of openSkinFaceIds){const group=faceGroups[Number(id)];if(!group){toast('Una cara sin piel ya no está disponible. Vuelve a elegirla.');$('#progress').hidden=true;$('#generate').disabled=false;return;}faces.push(extractFaceTriangles(positions,group.triangleIds));}
    data[$('#skin-mode').value==='selected'?'selectedSkin':'openSkin']={faces};
  }
  if(faceBoundary)data.solidZone={depth:solidDepth,faces:[faceBoundary.support,faceBoundary.load]};
  if(graded)data.grade={stress:sourceAnalysis.stress,dims:[sourceAnalysis.nx,sourceAnalysis.ny,sourceAnalysis.nz],bounds:sourceAnalysis.bounds,stress95:sourceAnalysis.stress95,minWall,maxWall};
  if(cellGraded)data.cellGrade={stress:sourceAnalysis.stress,dims:[sourceAnalysis.nx,sourceAnalysis.ny,sourceAnalysis.nz],bounds:sourceAnalysis.bounds,stress95:sourceAnalysis.stress95,minCell,maxCell};
  if(modelKind==='mesh')data.positions=new Float32Array(sourceMesh.geometry.getAttribute('position').array);
  worker=new Worker(new URL('./lattice-worker.js',import.meta.url),{type:'module'});
  const current=worker,started=performance.now();
  current.onmessage=({data:result})=>{
    if(worker!==current)return;
    if(result.type==='progress'){$('#progress-text').textContent=result.value>=90?'Validando cierre y aristas…':`Muestreando el volumen… ${result.value}%`;return;}
    $('#progress').hidden=true;$('#generate').disabled=false;current.terminate();worker=null;
    if(result.type==='error'){toast(result.message);return;}
    if(!result.positions.length){toast('No se pudo generar una superficie. Prueba una celda más pequeña o mayor grosor.');return;}
    const dense=!!renderer&&result.triangleCount>250000;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(result.positions,3));if(!dense)geometry.computeVertexNormals();
    latticeMesh=new THREE.Mesh(geometry,latticeMaterial);scene.add(latticeMesh);sourceMesh.visible=false;
    if(dense){previewPoints=createPointPreview(result.positions);scene.add(previewPoints);$('#view-mode').hidden=false;previewMode='points';}
    updateLatticeVisibility(false);
    needsDraw=true;
    generation=result;
    updateMass();
    updateManufacturingWarning();
    runThicknessCheck();
    analyzePrintability();
    $('#triangle-count').textContent=Math.round(result.triangleCount).toLocaleString('es');
    $('#reduction').textContent=`${Math.round(result.reduction*100)} %`;
    const separate=result.report.valid&&result.materialConnectivity?.components>1;
    $('#lattice-result').hidden=false;$('#lattice-result').classList.toggle('warning',!result.report.valid||separate);
    $('#result-status').textContent=!result.report.valid?'Lattice no validado':separate?'Lattice cerrado · revisar material':'Lattice validado';
    const elapsedSeconds=(performance.now()-started)/1000;
    $('#output-quality').textContent=(result.report.valid?`Malla cerrada · ${result.report.components} superficie${result.report.components===1?'':'s'} cerrada${result.report.components===1?'':'s'} · material: ${result.materialConnectivity?.components||'—'} componente${result.materialConnectivity?.components===1?'':'s'} en rejilla${separate?' (revisa las conexiones en el laminador)':''} · ${result.report.removedComponents} microfragmentos retirados${result.solidDepth?` · zonas macizas de ${result.solidDepth} mm`:''}${result.openSkinFaceCount?` · ${result.openSkinFaceCount} cara${result.openSkinFaceCount===1?'':'s'} sin piel`:''}${result.selectedSkinFaceCount?` · piel en ${result.selectedSkinFaceCount} cara${result.selectedSkinFaceCount===1?'':'s'}`:''}${result.rim?` · marco ${result.rim} mm`:''}${result.layers?' · capas equidistantes':''}${result.conformal?' · celdas conformes aproximadas':''}${result.triangleCount>500000?' · malla grande; la exportación puede tardar':''}`:`${result.report.boundaryEdges} bordes abiertos · ${result.report.nonManifoldEdges} aristas no manifold. Ajusta los parámetros.`)+` · cálculo ${elapsedSeconds<10?elapsedSeconds.toFixed(1):Math.round(elapsedSeconds)} s`;
    $('#to-simulate').disabled=!result.report.valid;$('#top-export').disabled=!result.report.valid;$('#lattice-check').textContent=result.report.valid?'✓':'!';$('#simulation-target').querySelector('[value="lattice"]').disabled=!result.report.valid;
    updateBuildVolume();
    if(!previewPoints)$('#view-status').textContent='Lattice generado';
    $('#export-name').textContent=`${baseName}-lattice.stl`;
    $('#export-detail').textContent=`${Math.round(result.triangleCount).toLocaleString('es')} triángulos · unidades en mm`;
    toast(!result.report.valid?'El lattice no pasó la validación; prueba otros ajustes.':separate?'Malla cerrada, pero el material tiene regiones separadas en la rejilla.':'Lattice validado. Puedes descargar el STL.');
    if(pendingOptimization){
      if(result.report.valid){showStep('simulate');document.querySelector('#simulation-modes [data-mode="elastic"]').click();$('#run-simulation').click();}
      else pendingOptimization=null;
    }
  };
  current.onerror=e=>{if(worker!==current)return;current.terminate();worker=null;$('#progress').hidden=true;$('#generate').disabled=false;toast(`Error al generar: ${e.message}`)};
  current.postMessage(data);
});
$('#cancel-generation').addEventListener('click',()=>{if(!worker)return;worker.terminate();worker=null;pendingOptimization=null;$('#progress').hidden=true;$('#generate').disabled=false;toast('Generación cancelada.');});

function drawSimulationMap(result){
  const canvas=$('#field-map'),context=canvas.getContext('2d'),{nx,ny,nz,occupancy}=result;
  const thermal=result.type==='thermal',flow=result.type==='flow',field=flow?result.pressure:thermal?result.temperatureRise:result.stress;
  const w=canvas.width,h=canvas.height,cell=Math.min((w-16)/nx,(h-16)/ny),left=(w-nx*cell)/2,top=(h-ny*cell)/2;
  context.clearRect(0,0,w,h);context.fillStyle='#f3f7f6';context.fillRect(0,0,w,h);
  const projected=new Float32Array(nx*ny),visible=new Uint8Array(nx*ny),samples=[];
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    let value=0,count=0;
    for(let z=0;z<nz;z++){const id=z*nx*ny+y*nx+x;if(occupancy[id]){count++;value=flow?value+field[id]:Math.max(value,field[id]);}}
    if(count){if(flow)value/=count;projected[y*nx+x]=value;visible[y*nx+x]=1;samples.push(value);}
  }
  samples.sort((a,b)=>a-b);
  const mapScale=flow?1:samples.length?samples[Math.floor((samples.length-1)*.95)]:1;
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    if(!visible[y*nx+x])continue;
    const value=projected[y*nx+x],t=Math.min(1,value/Math.max(mapScale,1e-9)),hue=(thermal||flow?205:175)*(1-t)+6*t;
    context.fillStyle=`hsl(${hue} 82% ${44+6*t}%)`;
    context.fillRect(left+x*cell,top+(ny-1-y)*cell,Math.ceil(cell-.4),Math.ceil(cell-.4));
  }
  context.strokeStyle='#a9bfba';context.strokeRect(left-.5,top-.5,nx*cell+1,ny*cell+1);
  $('#field-range').textContent=flow?'Proyección XY · promedio en Z':'Proyección XY · máximo en Z';
  $('#field-map-title').textContent=flow?'Presión normalizada':thermal?'Temperatura proyectada':'Esfuerzo proyectado';
  $('#field-legend-base').textContent=flow?'0 · salida':thermal?`${result.ambient.toLocaleString('es',{maximumFractionDigits:1})} °C`:'0 MPa';
  $('#field-legend-max').textContent=flow?'1 · entrada':thermal?`≥ ${(result.ambient+mapScale).toLocaleString('es',{maximumFractionDigits:1})} °C`:`≥ ${mapScale.toPrecision(3)} MPa`;
  const lowHue=thermal||flow?205:175;
  $('.stress-legend').style.backgroundImage=`linear-gradient(to right,hsl(${lowHue} 82% 44%),hsl(${Math.round((lowHue+6)/2)} 82% 47%),hsl(6 82% 50%))`;
  canvas.setAttribute('aria-label',flow?'Mapa de presión normalizada proyectado sobre XY':thermal?'Mapa de temperatura proyectado sobre XY':'Mapa de esfuerzo von Mises proyectado sobre XY');
}
function formatSmall(value,unit){return `${value<0.01?value.toExponential(2):value.toLocaleString('es',{maximumFractionDigits:3})} ${unit}`;}
function captureAnalysisCase(id,name){
  return {id,name,mode:simulationMode,target:$('#simulation-target').value,axis:Number($('#load-axis').value),supportFace:$('#simulation-support-face').value,loadFace:$('#simulation-load-face').value,loadSense:Number($('#simulation-load-sense').value),loadType:$('#load-type').value,loadValue:Number($('#applied-force').value),E:Number($('#young-modulus').value),conductivity:Number($('#thermal-conductivity').value),power:Number($('#heat-power').value),ambient:Number($('#ambient-temperature').value)};
}
function renderAnalysisCases(selected=$('#case-select').value){
  const select=$('#case-select');select.replaceChildren(new Option('Configuración actual',''));
  for(const item of analysisCases)select.add(new Option(`${item.name} · ${item.mode==='elastic'?'estructural':item.mode==='thermal'?'térmico':'flujo'}`,item.id));
  select.value=analysisCases.some(item=>item.id===selected)?selected:'';
  $('#case-count').textContent=String(analysisCases.length);
  $('#case-remove').disabled=!select.value;
}
$('#case-save').addEventListener('click',()=>{
  const name=$('#case-name').value.trim(),selected=$('#case-select').value;
  if(!name){toast('Escribe un nombre para el caso.');return;}
  if(!selected&&analysisCases.length>=16){toast('Máximo de 16 casos.');return;}
  const id=selected||`c${caseCounter++}`,item=captureAnalysisCase(id,name);
  try{analysisCases=normalizeAnalysisCases(analysisCases.filter(other=>other.id!==id).concat(item));}catch(error){toast(error.message);return;}
  renderAnalysisCases(id);toast(`Caso ${name} guardado.`);
});
$('#case-remove').addEventListener('click',()=>{
  const id=$('#case-select').value;if(!id)return;
  analysisCases=analysisCases.filter(item=>item.id!==id);renderAnalysisCases('');$('#case-name').value='';toast('Caso eliminado.');
});
$('#case-select').addEventListener('change',()=>{
  const item=analysisCases.find(entry=>entry.id===$('#case-select').value);
  $('#case-remove').disabled=!item;
  if(!item){$('#case-name').value='';return;}
  $('#case-name').value=item.name;
  if(item.target==='lattice'&&!latticeMesh){toast('Genera el lattice antes de ejecutar este caso. Se muestran sus ajustes sobre la pieza maciza.');$('#simulation-target').value='source';}
  else $('#simulation-target').value=item.target;
  $('#simulation-target').dispatchEvent(new Event('change'));
  $(`#simulation-modes [data-mode="${item.mode}"]`).click();
  $('#load-axis').value=String(item.axis);
  for(const [value,selector] of [[item.supportFace,'#simulation-support-face'],[item.loadFace,'#simulation-load-face']])$(selector).value=[...$(selector).options].some(option=>option.value===value)?value:'';
  $('#simulation-load-sense').value=String(item.loadSense);$('#load-type').value=item.loadType;updateLoadType();
  for(const [key,selector] of [['loadValue','#applied-force'],['E','#young-modulus'],['conductivity','#thermal-conductivity'],['power','#heat-power'],['ambient','#ambient-temperature']])$(selector).value=String(item[key]);
  refreshFaceOverlays();clearSimulation();
});
function updateLoadType(){
  const type=$('#load-type').value,input=$('#applied-force');
  $('#load-value-label').textContent=type==='pressure'?'Presión uniforme (MPa)':type==='moment'?'Momento (N·mm)':'Fuerza total (N)';
  $('#load-value-note').textContent=type==='pressure'?'Se multiplica por el área de la cara elegida; en modo automático se usa el área de la caja envolvente. La distribución nodal es aproximada.':type==='moment'?'Par de fuerzas con resultante cero alrededor de la dirección de carga. Requiere una cara cargada con área suficiente.':'Fuerza distribuida uniformemente entre los nodos de la cara cargada.';
  input.max=type==='pressure'?'1000':type==='moment'?'1000000':'100000';
  if(Number(input.value)>Number(input.max))input.value=input.max;
  clearSimulation();
}
$('#load-type').addEventListener('change',updateLoadType);
for(const selector of ['#load-axis','#young-modulus','#applied-force','#thermal-conductivity','#heat-power','#ambient-temperature'])$(selector).addEventListener('change',clearSimulation);
$('#simulation-target').addEventListener('change',()=>{
  if($('#simulation-target').value==='source'&&simulationMode==='flow')$('#simulation-modes [data-mode="elastic"]').click();
  else clearSimulation();
  showStep('simulate');
});
document.querySelectorAll('#simulation-modes button').forEach(button=>button.addEventListener('click',()=>{
  if(button.dataset.mode==='flow'&&$('#simulation-target').value==='source'){toast('Genera un lattice para analizar sus canales.');return;}
  if(simulationMode===button.dataset.mode)return;
  clearSimulation();simulationMode=button.dataset.mode;
  document.querySelectorAll('#simulation-modes button').forEach(item=>{const selected=item===button;item.classList.toggle('selected',selected);item.setAttribute('aria-pressed',String(selected));});
  const thermal=simulationMode==='thermal',flow=simulationMode==='flow';$('#elastic-fields').hidden=thermal||flow;$('#thermal-fields').hidden=!thermal;$('#flow-fields').hidden=!flow;$('#simulation-face-fields').hidden=thermal||flow;
  $('#simulation-intro').textContent=flow?'Explora qué canales vacíos conectan dos caras de la pieza y cuánto reducen el paso respecto a la pieza sin lattice.':thermal?'Conducción de calor en estado estacionario: temperatura fija en la cara mínima y potencia aplicada en la máxima.':'Ensayo elástico lineal sobre vóxeles de baja resolución. Elige dos caras detectadas o usa los extremos de un eje.';
  $('#simulation-caveat').textContent=flow?'Este índice usa una red de conductancias geométricas. No calcula velocidad, caudal real ni pérdidas viscosas; no es CFD. Los canales pequeños pueden desaparecer en la voxelización.':thermal?'Los vóxeles alteran las rutas de conducción. El modelo supone material uniforme y caras restantes aisladas; no incluye convección ni radiación. Comprueba el diseño con un análisis térmico convergente.':`La discretización altera el grosor y la conectividad ${$('#simulation-target').value==='source'?'de la pieza':'del lattice'}. Estos valores no sirven para certificarla ni sustituir un análisis de ingeniería convergente.`;
}));
$('#run-simulation').addEventListener('click',()=>{
  const target=$('#simulation-target').value;
  if(target==='lattice'&&(!latticeMesh||!generation?.report?.valid))return;
  if(target==='source'&&!sourceReport?.valid)return;
  const axis=Number($('#load-axis').value),mode=simulationMode;
  if(mode==='flow'&&target==='source'){toast('Genera un lattice para analizar sus canales.');return;}
  const E=Number($('#young-modulus').value)*1000,loadType=$('#load-type').value,loadValue=Number($('#applied-force').value);
  let faceBoundary=null;
  if(mode==='elastic')try{faceBoundary=selectedFaceBoundary('#simulation-support-face','#simulation-load-face','#simulation-load-sense');}catch(error){toast(error.message);return;}
  const dimensions=bounds.max.map((value,index)=>value-bounds.min[index]);
  const automaticArea=dimensions.filter((_,index)=>index!==axis).reduce((a,b)=>a*b,1);
  const force=loadType==='pressure'?loadValue*(faceBoundary?.loadAreaMm2||automaticArea):loadType==='force'?loadValue:0;
  const moment=loadType==='moment'?loadValue:0;
  const conductivity=Number($('#thermal-conductivity').value),power=Number($('#heat-power').value),ambient=Number($('#ambient-temperature').value);
  if(mode==='elastic'&&(!Number.isFinite(E)||E<10||E>1e6||!Number.isFinite(loadValue)||loadValue<=0||loadValue>Number($('#applied-force').max)||loadType==='moment'&&moment>1e6||loadType!=='moment'&&(!Number.isFinite(force)||force<=0||force>100000))){toast('Revisa el módulo elástico y la condición de carga.');return;}
  if(mode==='thermal'&&(!Number.isFinite(conductivity)||conductivity<.001||conductivity>1000||!Number.isFinite(power)||power<.001||power>10000||!Number.isFinite(ambient)||ambient< -273||ambient>1000)){toast('Revisa la conductividad, la potencia y la temperatura.');return;}
  clearSimulation();$('#simulation-progress').hidden=false;$('#simulation-progress-text').textContent=target==='source'?'Muestreando la pieza maciza…':'Muestreando el lattice…';$('#run-simulation').disabled=true;
  const geometry=(target==='source'?sourceMesh:latticeMesh).geometry,boundaryGeometry=mode==='flow'?sourceMesh.geometry:geometry;boundaryGeometry.computeBoundingBox();const box=boundaryGeometry.boundingBox;
  const positions=new Float32Array(geometry.getAttribute('position').array);
  const sourcePositions=mode==='flow'?new Float32Array(sourceMesh.geometry.getAttribute('position').array):null;
  simulationWorker=new Worker(new URL('./simulation-worker.js',import.meta.url),{type:'module'});
  const current=simulationWorker;
  current.onmessage=({data})=>{
    if(simulationWorker!==current)return;
    if(data.type==='progress'){$('#simulation-progress-text').textContent=data.value<(mode==='flow'?72:55)?`Muestreando la geometría… ${data.value}%`:mode==='flow'?'Comprobando rutas de paso…':mode==='thermal'?'Resolviendo conducción térmica…':'Resolviendo elasticidad lineal…';return;}
    current.terminate();simulationWorker=null;$('#simulation-progress').hidden=true;$('#run-simulation').disabled=false;
    if(data.type==='error'){toast(data.message);return;}
    simulation=data.result;
    if(mode==='flow'){
      $('#metric-one-label').textContent='Conductancia relativa';$('#metric-one').textContent=`${(simulation.relativeConductance*100).toLocaleString('es',{maximumFractionDigits:1})} %`;
      $('#metric-two-label').textContent='Canales conectados';$('#metric-two').textContent=`${(simulation.connectedFraction*100).toLocaleString('es',{maximumFractionDigits:1})} %`;
    }else if(mode==='thermal'){
      $('#metric-one-label').textContent='Temperatura máxima';$('#metric-one').textContent=`${simulation.maxTemperature.toLocaleString('es',{maximumFractionDigits:2})} °C`;
      $('#metric-two-label').textContent='Aumento máximo';$('#metric-two').textContent=`${simulation.maxRise.toLocaleString('es',{maximumFractionDigits:2})} °C`;
    }else{
      $('#metric-one-label').textContent='Desplazamiento máx.';$('#metric-one').textContent=formatSmall(simulation.maxDisplacement,'mm');
      $('#metric-two-label').textContent='Esfuerzo von Mises P95';$('#metric-two').textContent=formatSmall(simulation.stress95,'MPa');
    }
    $('#simulation-details').textContent=mode==='flow'?`${simulation.throughVoxels.toLocaleString('es')} de ${simulation.fluidVoxels.toLocaleString('es')} vóxeles de canal conectados · ${simulation.iterations} iteraciones · residuo ${simulation.residual.toExponential(1)}`:`${simulation.voxels.toLocaleString('es')} vóxeles sólidos · ${simulation.iterations} iteraciones · residuo ${simulation.residual.toExponential(1)}${mode==='thermal'?` · balance ${Math.round((1-simulation.heatBalanceError)*1000)/10} %`:''}${simulation.faceBoundary?` · ${simulation.supportCount} nodos fijos / ${simulation.loadCount} cargados`:''}${simulation.discardedVoxels?` · ${simulation.discardedVoxels} vóxeles aislados excluidos`:''}`;
    if(mode==='elastic')$('#simulation-details').textContent+=loadType==='moment'?` · momento ${moment.toLocaleString('es')} N·mm`:loadType==='pressure'?` · presión ${loadValue.toLocaleString('es')} MPa ≈ ${force.toLocaleString('es',{maximumFractionDigits:2})} N`:` · fuerza ${force.toLocaleString('es')} N`;
    const verify=target==='lattice'&&mode==='elastic'&&loadType==='force'&&!faceBoundary&&pendingOptimization&&E===pendingOptimization.E&&force===pendingOptimization.force&&axis===pendingOptimization.axis;
    const passed=verify&&simulation.maxDisplacement<=pendingOptimization.target;
    const verification=$('#optimization-verification');verification.hidden=!verify;
    if(verify){
      verification.classList.toggle('warning',!passed);
      verification.textContent=`${passed?'✓ Cumple':'! Supera'} el límite en la malla generada: ${simulation.maxDisplacement.toExponential(2)} mm frente a ${pendingOptimization.target.toExponential(2)} mm.`;
    }
    $('#simulation-result').classList.toggle('warning',(mode==='flow'&&simulation.throughVoxels===0)||(verify&&!passed));
    $('#simulation-result').hidden=false;$('#simulate-check').textContent='✓';drawSimulationMap(simulation);
    toast(verify?(passed?'La malla generada cumple el objetivo exploratorio.':'La malla generada supera el desplazamiento permitido.'):mode==='flow'&&simulation.throughVoxels===0?'No se detectó un canal continuo entre esas caras.':'Ensayo exploratorio completo.');
  };
  current.onerror=e=>{if(simulationWorker!==current)return;current.terminate();simulationWorker=null;$('#simulation-progress').hidden=true;$('#run-simulation').disabled=false;toast(`Error de simulación: ${e.message}`)};
  const message={positions,bounds:{min:box.min.toArray(),max:box.max.toArray()},mode,E,nu:.3,force,moment,loadType:loadType==='moment'?'moment':'force',conductivity,power,ambient,axis,faceBoundary};
  if(sourcePositions){message.sourcePositions=sourcePositions;current.postMessage(message,[positions.buffer,sourcePositions.buffer]);}
  else current.postMessage(message,[positions.buffer]);
});
$('#cancel-simulation').addEventListener('click',()=>{if(!simulationWorker)return;clearSimulation();toast('Cálculo cancelado.');});

function download(){
  if(!latticeMesh||!generation?.report?.valid||!selectedManufacturingFits())return;
  const data=new STLExporter().parse(latticeMesh,{binary:true});
  saveFile(new Blob([data],{type:'model/stl'}),`${baseName}-lattice.stl`);
  toast('STL descargado.');
}
function saveFile(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function download3MF(){
  if(!latticeMesh||!generation?.report?.valid||!selectedManufacturingFits())return;
  try{const data=create3MF(latticeMesh.geometry.getAttribute('position').array);saveFile(new Blob([data],{type:'model/3mf'}),`${baseName}-lattice.3mf`);toast('3MF descargado.');}
  catch(error){toast(`No se pudo exportar 3MF: ${error.message}`)}
}
$('#download').addEventListener('click',download);$('#top-export').addEventListener('click',download);
$('#download-3mf').addEventListener('click',download3MF);
$('#save-project').addEventListener('click',()=>{
  if(!sourceMesh||!sourceReport?.valid){toast('Carga una pieza válida antes de guardar el proyecto.');return;}
  try{
    const settings={sourceScale,technology:$('#technology').value,machine:$('#machine').value,material:$('#material').value,minWall:Number($('#min-wall').value),printDirection:$('#print-direction').value,maxOverhang:Number($('#max-overhang').value),pattern:$('#pattern').value,tpmsForm:$('#tpms-form').value,voronoiSeed:Number($('#voronoi-seed').value),cell:Number($('#cell-size').value),cellGradeEnabled:$('#use-stress-cell').checked,cellMin:Number($('#cell-min').value),wall:Number($('#wall-size').value),wallZones,skin:Number($('#skin-size').value),layers:$('#equidistant-layers').checked,conformal:$('#conformal-cells').checked,quality,gradeEnabled:$('#use-stress-grade').checked,gradeMin:Number($('#grade-min').value),sourceAxis:Number($('#source-analysis-axis').value),sourceE:Number($('#source-analysis-modulus').value),sourceForce:Number($('#source-analysis-force').value),axis:Number($('#load-axis').value),E:Number($('#young-modulus').value),force:Number($('#applied-force').value),loadType:$('#load-type').value,analysisCases,conductivity:Number($('#thermal-conductivity').value),power:Number($('#heat-power').value),ambient:Number($('#ambient-temperature').value)};
    Object.assign(settings,{cadFaces,faceAngle:Number($('#face-angle').value),faceSets,sourceSupportFace:$('#source-support-face').value,sourceLoadFace:$('#source-load-face').value,sourceLoadSense:Number($('#source-load-sense').value),simulationSupportFace:$('#simulation-support-face').value,simulationLoadFace:$('#simulation-load-face').value,simulationLoadSense:Number($('#simulation-load-sense').value),solidZoneDepth:Number($('#solid-zone-depth').value),skinMode:$('#skin-mode').value,rimWidth:Number($('#rim-width').value),openSkinFaces:[...openSkinFaceIds]});
    const project=createProject({positions:new Float32Array(sourceMesh.geometry.getAttribute('position').array),bodies:sourceBodies,name:$('#model-title').textContent,type:$('#project-type').textContent.split(' · ')[0],settings});
    saveFile(new Blob([JSON.stringify(project)],{type:'application/json'}),`${baseName}.lattice-lab.json`);toast('Proyecto descargado.');
  }catch(error){toast(`No se pudo guardar: ${error.message}`)}
});
$('#open-project').addEventListener('click',()=>$('#project-input').click());
$('#open-project-mobile').addEventListener('click',()=>$('#open-project').click());
$('#save-project-mobile').addEventListener('click',()=>$('#save-project').click());
$('#project-input').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  if(file.size>18*1024*1024){toast('El proyecto supera el límite de 18 MB.');return;}
  try{
    const loaded=readProject(JSON.parse(await file.text()));
    const s=loaded.settings;
    const prepared=prepareMesh(loaded.positions,{repair:false});
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(prepared.positions,3));geometry.computeVertexNormals();
    const savedFaces=loaded.bodies?assembleVisibleBodies(loaded.bodies).cadFaces:Array.isArray(s.cadFaces)&&s.cadFaces.length&&s.cadFaces.length<=10000&&s.cadFaces.every(face=>Number.isInteger(face.first)&&Number.isInteger(face.last)&&face.first>=0&&face.last>=face.first&&face.last<prepared.positions.length/9)?s.cadFaces:null;
    setSource(geometry,loaded.name,'mesh',loaded.type,prepared.report,savedFaces,loaded.bodies);
    baseName=loaded.name.replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,48)||'pieza';
    sourceScale=Number.isFinite(s.sourceScale)&&s.sourceScale>=.01&&s.sourceScale<=100?s.sourceScale:1;
    $('#source-scale').value=String(sourceScale);
    if(Number.isInteger(s.faceAngle)&&s.faceAngle>=5&&s.faceAngle<=80){$('#face-angle').value=String(s.faceAngle);$('#face-angle-value').textContent=`${s.faceAngle}°`;scheduleFaces();}
    if([-1,1].includes(s.sourceLoadSense))$('#source-load-sense').value=String(s.sourceLoadSense);
    if([-1,1].includes(s.simulationLoadSense))$('#simulation-load-sense').value=String(s.simulationLoadSense);
    const restoredTechnology=['fdm','sls','generic'].includes(s.technology)?s.technology:s.material==='formlabs_nylon12'?'sls':s.material==='prusament_pla'?'fdm':'generic';
    $('#technology').value=restoredTechnology;setManufacturingChoices();
    if(MACHINES[s.machine]?.technology===restoredTechnology)$('#machine').value=s.machine;
    if([...$('#material').options].some(option=>option.value===s.material))$('#material').value=s.material;
    applyMaterial();
    $('#min-wall').value=String(Number.isFinite(s.minWall)&&s.minWall>=.1&&s.minWall<=20?s.minWall:.8);
    $('#print-direction').value=['+X','-X','+Y','-Y','+Z','-Z'].includes(s.printDirection)?s.printDirection:'+Z';
    updateBuildVolume();
    $('#max-overhang').value=String(Number.isFinite(s.maxOverhang)&&s.maxOverhang>=0&&s.maxOverhang<=90?s.maxOverhang:45);
    if([...$('#pattern').options].some(o=>o.value===s.pattern)){$('#pattern').value=s.pattern;$('#pattern').dispatchEvent(new Event('change'));}
    $('#tpms-form').value=['sheet','network'].includes(s.tpmsForm)?s.tpmsForm:'sheet';
    $('#voronoi-seed').value=String(Number.isInteger(s.voronoiSeed)&&s.voronoiSeed>=0&&s.voronoiSeed<=9999?s.voronoiSeed:0);
    if(Number.isFinite(s.cell)){$('#cell-size').value=String(Math.max(Number($('#cell-size').min),Math.min(Number($('#cell-size').max),s.cell)));$('#cell-value').textContent=`${$('#cell-size').value} mm`;}
    $('#cell-min').value=String(Number.isFinite(s.cellMin)&&s.cellMin>=2&&s.cellMin<=Number($('#cell-size').value)?s.cellMin:Math.max(2,Math.round(Number($('#cell-size').value)*.7)));
    if(Number.isFinite(s.wall)){$('#wall-size').value=String(Math.max(.12,Math.min(.48,s.wall)));$('#wall-value').textContent=Number($('#wall-size').value).toFixed(2);}
    try{wallZones=normalizeWallZones(s.wallZones);renderWallZones();}catch(error){wallZones=[];toast(`Zonas locales omitidas: ${error.message}`);}
    $('#skin-size').value=String(Number.isFinite(s.skin)?Math.max(0,Math.min(4,s.skin)):0);$('#skin-value').textContent=`${Number($('#skin-size').value).toLocaleString('es',{maximumFractionDigits:1})} mm`;
    $('#skin-mode').value=s.skinMode==='selected'?'selected':'full';
    $('#rim-width').value=String(Number.isFinite(s.rimWidth)?Math.max(0,Math.min(4,s.rimWidth)):0);
    $('#equidistant-layers').checked=s.layers===true;$('#conformal-cells').checked=s.conformal===true&&!$('#equidistant-layers').checked;
    updateOpenSkinSummary();
    $('#solid-zone-depth').value=String(Number.isFinite(s.solidZoneDepth)?Math.max(0,Math.min(8,s.solidZoneDepth)):0);$('#solid-zone-value').textContent=`${Number($('#solid-zone-depth').value).toLocaleString('es',{maximumFractionDigits:1})} mm`;
    if(Number.isFinite(s.gradeMin)&&s.gradeMin>=.12&&s.gradeMin<=.48)$('#grade-min').value=String(s.gradeMin);
    if([0,1,2].includes(s.sourceAxis))$('#source-analysis-axis').value=String(s.sourceAxis);
    if(Number.isFinite(s.sourceE)&&s.sourceE>=.01&&s.sourceE<=1000)$('#source-analysis-modulus').value=String(s.sourceE);
    if(Number.isFinite(s.sourceForce)&&s.sourceForce>=.001&&s.sourceForce<=100000)$('#source-analysis-force').value=String(s.sourceForce);
    if(['draft','normal'].includes(s.quality)){quality=s.quality;document.querySelectorAll('#resolution button').forEach(b=>b.classList.toggle('selected',b.dataset.quality===quality));}
    updateGenerationEstimate();
    updateBuildVolume();
    if([0,1,2].includes(s.axis))$('#load-axis').value=String(s.axis);
    $('#load-type').value=['force','pressure','moment'].includes(s.loadType)?s.loadType:'force';updateLoadType();
    for(const [key,id,min,max] of [['E','young-modulus',.01,1000],['force','applied-force',.001,100000],['conductivity','thermal-conductivity',.001,1000],['power','heat-power',.001,10000],['ambient','ambient-temperature',-273,1000]])if(Number.isFinite(s[key])&&s[key]>=min&&s[key]<=max)$('#'+id).value=String(s[key]);
    $('#optimizer-axis').value=$('#load-axis').value;$('#optimizer-modulus').value=$('#young-modulus').value;$('#optimizer-force').value=$('#applied-force').value;
    setTimeout(()=>{
      try{faceSets=normalizeFaceSets(s.faceSets,faceGroups.length);}catch(error){faceSets=[];toast(`Grupos de caras omitidos: ${error.message}`);}
      faceSetCounter=faceSets.reduce((next,item)=>Math.max(next,Number(item.id.slice(1))+1),0);
      updateFaceSelectionOptions();renderFaceSetEditor();
      try{analysisCases=normalizeAnalysisCases(s.analysisCases);}catch(error){analysisCases=[];toast(`Casos omitidos: ${error.message}`);}
      caseCounter=analysisCases.reduce((next,item)=>Math.max(next,Number(item.id.slice(1))+1),0);renderAnalysisCases();
      openSkinFaceIds=new Set(Array.isArray(s.openSkinFaces)?s.openSkinFaces.filter(id=>typeof id==='string'&&/^\d+$/.test(id)&&Number(id)<Math.min(faceGroups.length,100)):[]);
      renderOpenSkinFaces();
      for(const [key,selector] of [['sourceSupportFace','#source-support-face'],['sourceLoadFace','#source-load-face'],['simulationSupportFace','#simulation-support-face'],['simulationLoadFace','#simulation-load-face']]){
        if(typeof s[key]==='string'&&[...$(selector).options].some(option=>option.value===s[key]))$(selector).value=s[key];
      }
      refreshFaceOverlays();
      if(s.gradeEnabled||s.cellGradeEnabled){pendingGradeRestore=!!s.gradeEnabled;pendingCellGradeRestore=!!s.cellGradeEnabled;$('#source-analysis-details').open=true;$('#analyze-source').click();}
      resetDesignHistory();
    },0);
    toast(prepared.report.valid?'Proyecto abierto. Genera el lattice con sus parámetros guardados.':'Proyecto abierto; la malla requiere reparación.');
  }catch(error){toast(`No se pudo abrir el proyecto: ${error.message}`)}
});
$('#fit-btn').addEventListener('click',fitCamera);$('#reset-btn').addEventListener('click',fitCamera);
$('#view-mode').addEventListener('click',()=>{
  if(!previewPoints)return;
  previewMode=previewMode==='points'?'mesh':'points';
  if(previewMode==='mesh'&&!latticeMesh.geometry.hasAttribute('normal'))latticeMesh.geometry.computeVertexNormals();
  $('#view-mode').setAttribute('aria-pressed',String(previewMode==='points'));
  updateLatticeVisibility(sourceMesh?.visible??false);
});
$('#wire-btn').addEventListener('click',()=>{sourceMaterial.wireframe=!sourceMaterial.wireframe;latticeMaterial.wireframe=sourceMaterial.wireframe;$('#wire-btn').style.background=sourceMaterial.wireframe?'#d8f3e9':'';needsDraw=true;});
$('#about-btn').addEventListener('click',()=>$('#about-modal').hidden=false);
$('#close-modal').addEventListener('click',()=>$('#about-modal').hidden=true);
$('#modal-ok').addEventListener('click',()=>$('#about-modal').hidden=true);
$('#about-modal').addEventListener('click',e=>{if(e.target.id==='about-modal')e.currentTarget.hidden=true});
const tourSteps=[
  {title:'Preparar',step:'prepare',copy:'Elige una pieza de ejemplo o importa STL, STEP o 3MF. Revisa que la malla esté cerrada y selecciona material, máquina y orientación.'},
  {title:'Ensayar la pieza maciza',step:'prepare',copy:'Abre «Analizar pieza maciza» para calcular un campo de esfuerzo exploratorio. Puedes elegir caras de apoyo y carga, y guardar grupos de caras.'},
  {title:'Diseñar el lattice',step:'lattice',copy:'Elige una familia de celdas o abre la biblioteca por objetivo. Ajusta celda, grosor, piel y zonas; pulsa «Generar lattice» y revisa cierre, grosor y tiempo.'},
  {title:'Simular y exportar',step:'simulate',copy:'Con la malla generada, ejecuta un caso estructural, térmico o de flujo. Después entra en Exportar y descarga STL o 3MF si pasa las comprobaciones.'},
];
let tourIndex=0;
function showTour(index){
  tourIndex=Math.max(0,Math.min(tourSteps.length-1,index));const current=tourSteps[tourIndex];
  $('#tour-card').hidden=false;$('#tour-progress').textContent=`GUÍA · ${tourIndex+1} DE ${tourSteps.length}`;
  $('#tour-title').textContent=current.title;$('#tour-copy').textContent=current.copy;
  $('#tour-back').disabled=tourIndex===0;$('#tour-next').textContent=tourIndex===tourSteps.length-1?'Terminar':'Siguiente →';
  if(sourceReport?.valid)showStep(current.step);
  $(current.step==='prepare'?'#prepare-panel':current.step==='lattice'?'#lattice-panel':'#simulate-panel').scrollTop=0;
}
$('#tour-open').addEventListener('click',()=>showTour(0));
$('#tour-close').addEventListener('click',()=>$('#tour-card').hidden=true);
$('#tour-back').addEventListener('click',()=>showTour(tourIndex-1));
$('#tour-next').addEventListener('click',()=>tourIndex===tourSteps.length-1?$('#tour-card').hidden=true:showTour(tourIndex+1));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#about-modal').hidden=true;$('#tour-card').hidden=true;}});
