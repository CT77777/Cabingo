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
console.log('PASS poses, reduced motion, milestone selection, label collision and camera contracts');
