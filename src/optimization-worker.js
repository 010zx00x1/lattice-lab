import {optimizeLattice} from './optimize-lattice.js';

self.onmessage=({data})=>{
  try{
    const result=optimizeLattice({...data,onProgress:value=>self.postMessage({type:'progress',value})});
    self.postMessage({type:'done',result});
  }catch(error){self.postMessage({type:'error',message:String(error.message||error)});}
};
