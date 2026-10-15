// Deterministic presentation math. This module never changes gameplay state.
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:0));
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
export function passengerPose({style=0,phase=0,time=0,selected=false,reaction=null,reducedMotion=false}={}) {
  const t=reducedMotion?0:time+phase, idle=reducedMotion?0:1;
  const weight=reaction?clamp(1-reaction.age/1.4):0;
  const wrong=reaction?.type==='mistake', nod=reaction?.type==='complete';
  return {bodyY:Math.sin(t*1.6)*.012*idle,
    headX:(style===2?.12:0)+Math.sin(t*.7)*.035*idle+(nod?Math.sin(reaction.age*11)*.18*weight:0),
    headY:selected?0:(style===1?.38:Math.sin(t*.45)*.10)*idle+(wrong?Math.sin(reaction.age*14)*.28*weight:0),
    eyeScaleY:!reducedMotion&&t%4.7>4.54?.12:1,
    leftArmX:style===2?-.35:Math.sin(t*.7)*.04*idle,
    rightArmX:style===3?-.28:Math.sin(t*.7+1)*.04*idle,
    browAngle:wrong?weight*.3:0,smile:nod?weight:0};
}
export function actionPose({taskId,choiceId,progress=0,reducedMotion=false}={}) {
  const p=clamp(progress), gesture=reducedMotion?0:Math.sin(Math.PI*smooth(p));
  const check=choiceId==='check', speaking=['wait','handoff','ask','unknown','estimate'].includes(choiceId);
  return {bodyPitch:taskId==='bag'&&!check?-.18*Math.sin(p*Math.PI*2):0,
    leftArmX:check?-.35*gesture:taskId==='bag'?-1.3*gesture:-.65*gesture,
    rightArmX:check?-.4*gesture:taskId==='bag'?-1.7*gesture:-(speaking?.75:1.25)*gesture,
    transfer:check||speaking?0:smooth((p-.12)/.7),gaze:gesture};
}
export function decisionPose({player,task,aspect=1.6}) {
  const side=task.side==='right'?1:-1, z=task.z;
  // High shoulder angle keeps hands, floor evidence and bins in the upper scene.
  const wide=task.id==='bag', k=Math.max(1,.95/Math.max(.35,aspect));
  return {position:[-side*(wide?1.2:.8),(wide?5.8:4.5)*k,z-(wide?6:4.5)*k],
    target:[wide?0:side*.3,wide?1.7:1.55,z-(wide?1.6:1.2)],fov:wide?55:48};
}
function overlaps(a,b){return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}
export function layoutLabels(labels,{width,height,exclusions=[]}) {
  const occupied=[...exclusions];
  return [...labels].sort((a,b)=>Number(!!b.selected)-Number(!!a.selected)||Number(!!b.near)-Number(!!a.near)||(a.distance||0)-(b.distance||0)).map(l=>{
    const box={left:l.x-l.width/2-4,right:l.x+l.width/2+4,top:l.y-l.height-4,bottom:l.y+4};
    const visible=l.visible!==false&&box.left>=0&&box.right<=width&&box.top>=0&&box.bottom<=height&&!occupied.some(b=>overlaps(box,b));
    if(visible)occupied.push(box);return {...l,visible};
  });
}
export function crossedMilestones({actionId,taskId,choiceId,from,to}) {
  if(['check','wait','handoff','ask','unknown','estimate'].includes(choiceId))return [];
  const threshold=taskId==='belt'?.78:taskId==='water'?.75:taskId==='bag'||taskId==='tray'?.95:null;
  return threshold!==null&&from<threshold&&to>=threshold?[{id:`${actionId}:${taskId}`,type:taskId==='water'?'cup':taskId==='belt'?'buckle':'close'}]:[];
}
