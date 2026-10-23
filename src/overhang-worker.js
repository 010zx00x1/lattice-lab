import {analyzeOverhang} from './overhang.js';
self.onmessage=({data})=>{
  try{self.postMessage({type:'done',result:analyzeOverhang(data.positions,data.direction,data.maxAngle)});}
  catch(error){self.postMessage({type:'error',message:String(error.message||error)});}
};
