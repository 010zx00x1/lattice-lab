import {assembleVisibleBodies} from './source-bodies.js';
const FORMAT='lattice-lab-project';
const MAX_TRIANGLES=80000;

function encodeBytes(bytes){
  let result='';
  for(let i=0;i<bytes.length;i+=24576)result+=btoa(String.fromCharCode(...bytes.subarray(i,i+24576)));
  return result;
}
function decodeBytes(text){
  if(typeof text!=='string'||text.length>MAX_TRIANGLES*9*4*4/3+10000)throw new Error('Geometría de proyecto demasiado grande.');
  const raw=atob(text),bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes;
}

function validatePositions(positions){
  if(!(positions instanceof Float32Array)||positions.length%9||positions.length===0||positions.length/9>MAX_TRIANGLES)throw new Error('Geometría de proyecto no válida.');
  if(!Array.from(positions).every(Number.isFinite))throw new Error('La geometría contiene valores no finitos.');
}
function unpackPositions(encoded){
  const bytes=decodeBytes(encoded);
  if(!bytes.length||bytes.byteLength%36||bytes.byteLength/36>MAX_TRIANGLES)throw new Error('La malla del proyecto no es válida.');
  const positions=new Float32Array(bytes.buffer);
  validatePositions(positions);
  return positions;
}
export function createProject({positions,name,type,settings,bodies=null}){
  validatePositions(positions);
  const shared={format:FORMAT,name:String(name||'Pieza').slice(0,120),type:String(type||'STL').slice(0,20),settings};
  if(Array.isArray(bodies)&&bodies.length>1){
    if(bodies.reduce((sum,body)=>sum+body.positions.length/9,0)>MAX_TRIANGLES)throw new Error('Demasiados triángulos en los cuerpos del proyecto.');
    const assembled=assembleVisibleBodies(bodies);
    if(assembled.positions.length!==positions.length||assembled.positions.some((value,index)=>value!==positions[index]))throw new Error('Los cuerpos no coinciden con la pieza activa.');
    return {...shared,version:2,bodies:bodies.map(body=>{
      validatePositions(body.positions);
      return {name:String(body.name||'Cuerpo').slice(0,80),visible:!!body.visible,faces:body.faces||[],positions:encodeBytes(new Uint8Array(body.positions.buffer,body.positions.byteOffset,body.positions.byteLength))};
    })};
  }
  return {format:FORMAT,version:1,name:String(name||'Pieza').slice(0,120),type:String(type||'STL').slice(0,20),positions:encodeBytes(new Uint8Array(positions.buffer,positions.byteOffset,positions.byteLength)),settings};
}

export function readProject(project){
  if(!project||project.format!==FORMAT||![1,2].includes(project.version))throw new Error('Formato de proyecto no compatible.');
  if(!project.settings||typeof project.settings!=='object'||Array.isArray(project.settings))throw new Error('Faltan los parámetros del proyecto.');
  let positions,bodies=null;
  if(project.version===1)positions=unpackPositions(project.positions);
  else{
    if(!Array.isArray(project.bodies)||project.bodies.length<2||project.bodies.length>1000)throw new Error('Lista de cuerpos del proyecto no válida.');
    bodies=project.bodies.map((body,index)=>{
      const part=unpackPositions(body.positions),faces=Array.isArray(body.faces)?body.faces:[];
      if(faces.length>10000||faces.some(face=>!Number.isInteger(face.first)||!Number.isInteger(face.last)||face.first<0||face.last<face.first||face.last>=part.length/9))throw new Error('Caras CAD del proyecto no válidas.');
      return {name:String(body.name||`Cuerpo ${index+1}`).slice(0,80),visible:body.visible!==false,faces,positions:part};
    });
    if(bodies.reduce((sum,body)=>sum+body.positions.length/9,0)>MAX_TRIANGLES)throw new Error('Demasiados triángulos en el proyecto.');
    positions=assembleVisibleBodies(bodies).positions;
  }
  return {positions,bodies,name:String(project.name||'Pieza').slice(0,120),type:String(project.type||'STL').slice(0,20),settings:project.settings};
}
