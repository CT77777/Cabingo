// Deterministic presentation math. This module never changes gameplay state.
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:0));
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
export function passengerPose({style=0,phase=0,time=0,selected=false,reaction=null,mood='neutral',reducedMotion=false}={}) {
  const t=reducedMotion?0:time+phase, idle=reducedMotion?0:1;
  const weight=reaction?clamp(1-reaction.age/1.4):0;
  const happy=weight>0&&['correct','complete'].includes(reaction?.type),wrong=!reducedMotion&&weight>0&&reaction?.type==='mistake', nod=!reducedMotion&&happy;
  return {bodyY:Math.sin(t*1.6)*.012*idle,
    headX:(style===2?.12:0)+Math.sin(t*.7)*.035*idle+(nod?Math.sin(reaction.age*11)*.18*weight:0),
    headY:(selected?0:(style===1?.38:Math.sin(t*.45)*.10)*idle)+(wrong?Math.sin(reaction.age*14)*.28*weight:0),
    eyeScaleY:!reducedMotion&&t%4.7>4.54?.12:1,
    leftArmX:style===2?-.35:Math.sin(t*.7)*.04*idle,
    rightArmX:happy&&!reducedMotion?-.7*weight:style===3?-.28:Math.sin(t*.7+1)*.04*idle,
    browAngle:wrong?weight*.3:mood==='waiting'?.22:mood==='curious'?-.12:0,smile:happy?Math.max(.8,weight):mood==='happy'?.8:0,mouthY:mood==='waiting'?-.105:-.09,mouthScale:mood==='curious'?1.5:1,eyeScaleX:mood==='waiting'?.75:1};
}
export function actionPose({taskId,choiceId,progress=0,reducedMotion=false}={}) {
  const p=clamp(progress), gesture=reducedMotion?0:Math.sin(Math.PI*smooth(p));
  const check=choiceId==='check', speaking=['wait','handoff','ask','unknown','estimate'].includes(choiceId);
  return {bodyPitch:taskId==='bag'&&!check&&!reducedMotion?-.18*Math.sin(p*Math.PI*2):0,
    leftArmX:check?-.35*gesture:taskId==='bag'?-1.3*gesture:-.65*gesture,
    rightArmX:check?-.4*gesture:taskId==='bag'?-1.7*gesture:-(speaking?.75:1.25)*gesture,
    transfer:check||speaking?0:smooth((p-.12)/.7),gaze:gesture};
}
export function decisionPose({player,task,aspect=1.6}) {
  const side=task.side==='right'?1:-1, z=task.z;
  // High shoulder angle keeps hands, floor evidence and bins in the upper scene.
  const wide=task.id==='bag', k=Math.max(1,.95/Math.max(.35,aspect));
  return {position:[-(wide&&aspect>=.8?4.4*k:.8),(wide?5.8:4.5)*k,z-(wide?6:4.5)*k],
    target:[wide?0:side*.3,wide?1.45:1.55,z-(wide?1.6:1.2)],fov:wide?55:48};
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

export const COWORKER_PHASE_LABELS=Object.freeze({idle:'待命',calling:'聯繫同事',acknowledging:'收到，正在取物',preparing:'從前艙取物',walking:'前往旅客',serving:'正在交付',complete:'已送達',returning:'已送達 · 返回工作位'});

// One shared timeline drives the colleague, prop transfer and handoff HUD.
export function coworkerPresentation(state={}) {
  const tasks=state.tasks||[],job=state.handoffJob;
  const task=job?tasks.find(t=>t.id===job.taskId):tasks.find(t=>t.handoff&&t.done);
  const home={x:.53,z:.7};
  if(!task)return {...home,phase:'idle',progress:0,taskId:null,carrying:false,transfer:0,walking:false};
  const active=!!job,p=active?clamp((12-job.remaining)/12):1,age=active?0:Math.max(0,(state.elapsed||0)-(task.completedAt||0));
  const side=task.side==='right'?1:-1,dest={x:side*.53,z:task.z-.6};
  let phase,x=home.x,z=home.z,walking=false,carrying=false,transfer=0;
  if(active&&p<1/6){phase='preparing';const q=smooth(p*6);x=home.x+(GALLEY_SUPPLY.x-home.x)*Math.sin(q*Math.PI);carrying=p>.07;}
  else if(active&&p<2/3){phase='walking';const q=smooth((p-1/6)/.5);z=home.z+(dest.z-home.z)*q;walking=true;carrying=true;}
  else if(active){phase='serving';const q=smooth((p-2/3)*3);x=home.x+(dest.x-home.x)*q;z=dest.z;transfer=smooth((p-.86)/.14);carrying=true;}
  else if(age<2){phase='complete';x=dest.x;z=dest.z;}
  else if(age<8){phase='returning';const q=smooth((age-2)/6);x=dest.x+(home.x-dest.x)*q;z=dest.z+(home.z-dest.z)*q;walking=true;}
  else phase='complete';
  const facing=Math.atan2(side*1.25-x,.6),angle=phase==='preparing'?Math.PI/2*(1-smooth((p-.12)/(.1666666667-.12))):phase==='serving'?facing*smooth((p-2/3)/.08):phase==='complete'&&z>.8?facing:phase==='returning'?Math.PI:0;
  return {pickup:active?clamp((p-.07)/(1/6-.07)):1,x,z,angle,carryX:x+Math.sin(angle)*.38,carryZ:z+Math.cos(angle)*.38,settled:!active&&age>=8,phase,progress:p,taskId:task.id,carrying,transfer,walking,remaining:active?Math.ceil(job.remaining):0,side};
}

export const GALLEY_SUPPLY=Object.freeze({x:.82,y:1.12,z:.7});
export function serviceItemPose({source,hand,dest,progress=0}={}){
 const p=clamp(progress),mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
 const phase=p<.2?'opening':p<.5?'retrieving':p<.7?'turning':'offering';
 const item=p<.2?{...source}:p<.5?mix(source,hand,smooth((p-.2)/.3)):p<.7?{...hand}:mix(hand,dest,smooth((p-.7)/.3));
 return {phase,item,open:p<.2?smooth(p/.2):p<.5?1:1-smooth((p-.5)/.2)};
}

// The cart stays within reach behind the crew; rendering and pickup share this anchor.
export function trolleyPresentation(player={}){
 const x=Number.isFinite(player.x)?player.x:0,z=Number.isFinite(player.z)?player.z:1.5,angle=Number.isFinite(player.angle)?player.angle:0;
 const edge=z>2&&z<14?.54:2.5;
 return {x:Math.max(-edge,Math.min(edge,x-Math.sin(angle)*.43)),z:Math.max(.5,Math.min(15.3,z-Math.cos(angle)*.43)),angle};
}
