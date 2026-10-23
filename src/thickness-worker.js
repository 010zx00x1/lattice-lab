import {measureSurfaceThickness} from './thickness-sampling.js';
self.onmessage=({data})=>{
  try{self.postMessage({type:'done',result:measureSurfaceThickness(data.positions)});}
  catch(error){self.postMessage({type:'error',message:String(error.message||error)});}
};
