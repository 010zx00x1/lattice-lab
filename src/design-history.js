export class DesignHistory{
  constructor(limit=50){this.limit=limit;this.states=[];this.index=-1;}
  reset(state){this.states=[structuredClone(state)];this.index=0;}
  push(state){
    const next=structuredClone(state);
    if(this.index>=0&&JSON.stringify(this.states[this.index])===JSON.stringify(next))return false;
    this.states=this.states.slice(0,this.index+1);this.states.push(next);
    if(this.states.length>this.limit){this.states.shift();}else this.index++;
    return true;
  }
  undo(){if(this.index<=0)return null;return structuredClone(this.states[--this.index]);}
  redo(){if(this.index>=this.states.length-1)return null;return structuredClone(this.states[++this.index]);}
  get canUndo(){return this.index>0;}
  get canRedo(){return this.index>=0&&this.index<this.states.length-1;}
}
