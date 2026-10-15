import assert from 'node:assert/strict';
import {passengerPose,actionPose,decisionPose,layoutLabels,crossedMilestones} from '../public/presentation.mjs';
const a=passengerPose({time:1,style:0,phase:0}),b=passengerPose({time:1,style:0,phase:2});assert.notEqual(a.bodyY,b.bodyY);
assert.deepEqual(passengerPose({time:1,reducedMotion:true}),passengerPose({time:5,reducedMotion:true}));
assert.equal(actionPose({taskId:'bag',choiceId:'check',progress:.4}).transfer,0);
assert(actionPose({taskId:'water',choiceId:'serve',progress:.5}).transfer>0);
assert.equal(crossedMilestones({actionId:1,taskId:'belt',choiceId:'attention',from:.7,to:.8}).length,1);
assert.equal(crossedMilestones({actionId:1,taskId:'belt',choiceId:'check',from:0,to:1}).length,0);
assert.equal(crossedMilestones({actionId:1,taskId:'water',choiceId:'wait',from:0,to:1}).length,0);
const labels=[{id:'a',x:100,y:100,width:32,height:32,selected:true},{id:'b',x:105,y:105,width:32,height:32}];
const result=layoutLabels(labels,{width:390,height:844,exclusions:[]});assert.equal(result[0].visible,true);assert.equal(result[1].visible,false);assert.equal(labels[0].visible,undefined);
assert.equal(layoutLabels(labels,{width:390,height:844,exclusions:[{left:0,right:200,top:0,bottom:200}]}).filter(x=>x.visible).length,0);
for(const side of ['left','right'])for(const id of ['bag','belt','tray']){const p=decisionPose({player:{x:0,z:6},task:{id,z:7,side,variant:1},aspect:390/844});assert(p.position.every(Number.isFinite));}
assert.equal(passengerPose({time:1,reducedMotion:true,reaction:{type:'complete',age:.2}}).headX,passengerPose({time:1,reducedMotion:true,reaction:{type:'complete',age:.4}}).headX,'reduced motion has no head nod');
assert.equal(actionPose({taskId:'bag',choiceId:'stow',progress:.2,reducedMotion:true}).bodyPitch,actionPose({taskId:'bag',choiceId:'stow',progress:.4,reducedMotion:true}).bodyPitch,'reduced motion has no bag bob');
console.log('PASS poses, reduced motion, milestone selection, label collision and camera contracts');

assert.equal(decisionPose({player:{z:6},task:{id:'bag',z:7,side:'left'}}).position[0],decisionPose({player:{z:6},task:{id:'bag',z:7,side:'right'}}).position[0],'consistent closeup entry side');

const {coworkerPresentation}=await import('../public/presentation.mjs');
for(const side of ['left','right'])for(const id of ['water','blanket']){
 const task={id,z:13,side,done:false,assigned:true};
 const s={tasks:[task],elapsed:0,handoffJob:{taskId:id,remaining:12}};
 const before=JSON.stringify(s);assert.equal(coworkerPresentation(s).phase,'preparing');assert.equal(JSON.stringify(s),before);
 s.handoffJob.remaining=7;const walking=coworkerPresentation(s);assert.equal(walking.phase,'walking');assert(walking.z>.7&&walking.z<12.4);
 s.handoffJob.remaining=1;const serving=coworkerPresentation(s);assert.equal(serving.phase,'serving');assert(serving.transfer>0&&serving.transfer<1);
 const paused={...s,status:'paused'};assert.deepEqual(coworkerPresentation(paused),coworkerPresentation(s));
 task.done=true;task.handoff=true;task.completedAt=12;s.handoffJob=null;s.elapsed=12;assert.equal(coworkerPresentation(s).phase,'complete');
 s.elapsed=16;assert.equal(coworkerPresentation(s).phase,'returning');s.elapsed=21;assert.equal(coworkerPresentation(s).phase,'complete');assert.equal(coworkerPresentation(s).z,.7);assert(coworkerPresentation(s).settled);
}
assert.equal(coworkerPresentation({tasks:[]}).phase,'idle');
console.log('PASS colleague preparation, travel, delivery, return, paused and reset timeline');
