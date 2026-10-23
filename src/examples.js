import * as THREE from 'three';

function hole(shape,x,y,radius){
  const path=new THREE.Path();path.absarc(x,y,radius,0,Math.PI*2,true);shape.holes.push(path);
}

function extrude(shape,depth){
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:false,curveSegments:24});
  geometry.center();geometry.computeVertexNormals();
  return geometry;
}

function hingeSupport(){
  const shape=new THREE.Shape();
  shape.moveTo(-56,-42);shape.lineTo(56,-42);shape.lineTo(56,42);shape.lineTo(35,42);
  shape.lineTo(35,-7);shape.lineTo(-35,-7);shape.lineTo(-35,42);shape.lineTo(-56,42);shape.closePath();
  hole(shape,-45,22,6);hole(shape,45,22,6);hole(shape,0,-26,7);
  return extrude(shape,18);
}

function angleBracket(){
  const shape=new THREE.Shape();
  shape.moveTo(-50,-41);shape.lineTo(50,-41);shape.lineTo(50,-18);
  shape.lineTo(-27,-18);shape.lineTo(-27,41);shape.lineTo(-50,41);shape.closePath();
  hole(shape,25,-29.5,5);hole(shape,-38.5,18,5);
  return extrude(shape,16);
}

function connectingRod(){
  const shape=new THREE.Shape();
  shape.moveTo(-50,-20);shape.lineTo(50,-20);shape.absarc(50,0,20,-Math.PI/2,Math.PI/2,false);
  shape.lineTo(-50,20);shape.absarc(-50,0,20,Math.PI/2,3*Math.PI/2,false);shape.closePath();
  hole(shape,-50,0,10);hole(shape,50,0,10);
  const slot=new THREE.Path();slot.absellipse(0,0,22,7,0,Math.PI*2,true);shape.holes.push(slot);
  return extrude(shape,14);
}

function rockerArm(){
  const shape=new THREE.Shape();
  shape.moveTo(-70,-9);shape.lineTo(-57,-30);shape.lineTo(-39,-30);shape.lineTo(-14,-4);
  shape.lineTo(23,-32);shape.lineTo(66,-28);shape.lineTo(75,-9);shape.lineTo(22,5);
  shape.lineTo(-12,39);shape.lineTo(-34,36);shape.closePath();
  hole(shape,-47,-8,6);hole(shape,-13,19,7);hole(shape,50,-13,6);
  return extrude(shape,16);
}

export const EXAMPLES={
  hinge:{name:'Soporte de bisagra',slug:'soporte-bisagra',kind:'mesh',cell:16,wall:.32,geometry:hingeSupport},
  bracket:{name:'Escuadra perforada',slug:'escuadra',kind:'mesh',cell:14,wall:.32,geometry:angleBracket},
  rod:{name:'Biela de enlace',slug:'biela',kind:'mesh',cell:14,wall:.32,geometry:connectingRod},
  rocker:{name:'Balancín',slug:'balancin',kind:'mesh',cell:16,wall:.32,geometry:rockerArm},
  cube:{name:'Cubo de prueba',slug:'cubo',kind:'cube',cell:10,wall:.26,geometry:()=>new THREE.BoxGeometry(40,40,40)},
  sphere:{name:'Esfera',slug:'esfera',kind:'sphere',cell:11,wall:.26,geometry:()=>new THREE.SphereGeometry(22,48,32)},
};

export function createExample(id){
  const example=EXAMPLES[id];
  if(!example)throw new Error(`Pieza de ejemplo desconocida: ${id}`);
  return {...example,geometry:example.geometry()};
}
