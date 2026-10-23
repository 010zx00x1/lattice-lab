// A bounded point preview for browsers without WebGL. It never changes the
// original mesh used for validation, simulation, or export.
export function sampleSurface(positions,maxSamples=40000){
  const triangles=Math.floor(positions.length/9),count=Math.min(triangles,maxSamples);
  const samples=new Float32Array(count*6);
  for(let s=0;s<count;s++){
    // Stratified sampling avoids traversing every triangle on each camera move.
    const bucketStart=Math.floor(s*triangles/count);
    const bucketEnd=Math.floor((s+1)*triangles/count);
    const t=bucketStart+((Math.imul(s+1,1103515245)>>>0)%(bucketEnd-bucketStart));
    const i=t*9,x0=positions[i],y0=positions[i+1],z0=positions[i+2];
    const ax=positions[i+3]-x0,ay=positions[i+4]-y0,az=positions[i+5]-z0;
    const bx=positions[i+6]-x0,by=positions[i+7]-y0,bz=positions[i+8]-z0;
    let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
    const length=Math.hypot(nx,ny,nz)||1;nx/=length;ny/=length;nz/=length;
    const o=s*6;
    samples[o]=(x0+positions[i+3]+positions[i+6])/3;
    samples[o+1]=(y0+positions[i+4]+positions[i+7])/3;
    samples[o+2]=(z0+positions[i+5]+positions[i+8])/3;
    samples[o+3]=nx;samples[o+4]=ny;samples[o+5]=nz;
  }
  return samples;
}

export function sampleTriangles(positions,maxSamples=80000){
  const triangles=Math.floor(positions.length/9),count=Math.min(triangles,maxSamples);
  const samples=new Float32Array(count*12);
  for(let s=0;s<count;s++){
    const bucketStart=Math.floor(s*triangles/count);
    const bucketEnd=Math.floor((s+1)*triangles/count);
    const t=bucketStart+((Math.imul(s+1,1103515245)>>>0)%(bucketEnd-bucketStart));
    const i=t*9,o=s*12;
    for(let j=0;j<9;j++)samples[o+j]=positions[i+j];
    const ax=positions[i+3]-positions[i],ay=positions[i+4]-positions[i+1],az=positions[i+5]-positions[i+2];
    const bx=positions[i+6]-positions[i],by=positions[i+7]-positions[i+1],bz=positions[i+8]-positions[i+2];
    let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
    const length=Math.hypot(nx,ny,nz)||1;
    samples[o+9]=nx/length;samples[o+10]=ny/length;samples[o+11]=nz/length;
  }
  return samples;
}

export function rasterizeSamples(samples,matrix,width,height,pixels,depth,{generated=false,radius=1}={}){
  if(pixels.length!==width*height*4||depth.length!==width*height)throw new Error('Tamaño de vista incompatible.');
  pixels.fill(0);depth.fill(Infinity);
  for(let i=0;i<samples.length;i+=6){
    const x=samples[i],y=samples[i+1],z=samples[i+2];
    const w=matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15];
    if(w<=0)continue;
    const px=(matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12])/w;
    const py=(matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13])/w;
    const pz=(matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14])/w;
    if(px< -1||px>1||py< -1||py>1||pz< -1||pz>1)continue;
    const sx=Math.round((px+1)*width*.5),sy=Math.round((1-py)*height*.5);
    const light=Math.max(.25,Math.min(1,.55+(samples[i+3]*.4+samples[i+4]*.8+samples[i+5]*.7)*.32));
    const red=Math.round(generated?9+25*light:91+80*light);
    const green=Math.round(generated?101+93*light:131+72*light);
    const blue=Math.round(generated?88+69*light:131+64*light);
    for(let dy= -radius;dy<=radius;dy++){
      const row=sy+dy;if(row<0||row>=height)continue;
      for(let dx= -radius;dx<=radius;dx++){
        const col=sx+dx;if(col<0||col>=width)continue;
        const at=row*width+col;if(pz>=depth[at])continue;
        depth[at]=pz;
        const o=at*4;pixels[o]=red;pixels[o+1]=green;pixels[o+2]=blue;pixels[o+3]=255;
      }
    }
  }
}
