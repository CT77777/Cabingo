// Chapter1 rules only. No DOM, Three.js, real time or unseeded randomness.
export const BOARDING_TUTORIAL=Object.freeze([
 '用方向鍵／WASD，或左下搖桿，走近金框長輩。',
 '靠近長輩後按空白鍵，或點「互動」，打開對話。',
 '先側身讓長輩通過，再走近紅色行李。附近櫃子已滿，請找另一個空位。',
 '紅色是安全，綠色是服務。人流擋住前方時，先橫移到另一側，再往紅色座位標記走。'
]);
export function initBoarding(s){
 const actor=(id,row,side,{taskId=null,hold=false,spawn=0,elder=false}={})=>({id,row,side,taskId,elder,x:side==='left'?-.28:.28,z:.65,spawn,status:'pending',distance:0,hold});
 s.boarding={time:0,tutorialStep:0,formal:false,congestionTime:0,congestionLatched:false,congestionEvents:0,standing:2,blockedStanding:2,actors:[
  {...actor('elder',2,'right',{taskId:'guide',elder:true,hold:true}),z:3,status:'waiting'},
  {...actor('bag-owner',1,'left',{taskId:'bag',hold:true}),z:5,status:'waiting'},
  actor('seat-owner',3,'right',{taskId:'seat',hold:true,spawn:2}),
  actor('seat-misread',4,'right',{taskId:'seat',hold:true,spawn:5}),
  actor('parent',4,'left',{taskId:'family',hold:true,spawn:8}),
  actor('extra-a',5,'left',{spawn:14}),actor('extra-b',5,'right',{spawn:19})
 ]};
 for(const t of s.tasks){t.active=t.id==='guide';t.spawn=0;}
 const misread=s.boarding.actors.find(a=>a.id==='seat-misread'),variant=s.tasks.find(t=>t.id==='seat').variant;
 if(variant===1){misread.row=3;misread.side='left';misread.x=-.28;}
 if(variant===2){misread.row=-1;misread.departing=true;}
 s.feedback=BOARDING_TUTORIAL[0];
}
export function boardingTaskActor(s,id){return s.boarding?.actors.find(a=>a.taskId===id&&!['pending','seated','exited'].includes(a.status));}
export function boardingEvidence(t){
 if(t.id==='guide')return [{label:'長輩的登機證',value:'3C · 第 3 排，機艙右側'}];
 if(t.id==='seat')return [
  {label:'旅客甲 · 登機證',value:'今日 · 4C'},
  {label:'旅客乙 · 登機證',value:['今日 · 5C','今日 · 4B','明日 · 4C'][t.variant]},
  {label:'椅背標示',value:'第 4 排 · B 在機艙左側，C 在機艙右側'}
 ];
 return [];
}
export function boardingChoices(s,t){
 const mk=(id,label,good,feedback)=>({id,label,good,duration:1.5,tags:[],feedback});
 if(t.id==='guide')return {quote:'第一次搭飛機，3C 是往哪裡走呢？',description:'請看長輩手上的登機證，再對照椅背排號。',choices:[
  mk('guide','帶您到第 3 排，機艙右側',true,'已替長輩指路，長輩會沿走道入座。'),
  mk('left','帶您到第 3 排，機艙左側',false,'登機證是 3C，C 在機艙右側。'),
  mk('tour','先帶您逛到機尾，再回來找',false,'先對照 3C 的排數與側別，讓長輩直接入座。')
 ]};
 if(t.id==='seat'){
  const labels=['核對排數：乙的座位其實是 5C','核對側別：乙的座位其實是 4B','核對日期：乙持有明日的登機證'];
  return {quote:'我們都以為這裡是自己的位置。',description:'兩位都指向 4C；請比較兩張登機證的排數、側別與日期。',choices:labels.map((label,i)=>mk(['row','side','date'][i],label,i===t.variant,i===t.variant?(i===2?'已發現日期不符，旅客先回前門重新核對。':'已核對兩張登機證，旅客會移到各自的位置。'):'這個判斷與兩張登機證不一致。請重新核對可見的日期與座位。'))};
 }
 if(t.id==='family')return {quote:'我抱著孩子，這些東西有點拿不住。',description:'家長停在走道，手提袋擋在腳邊，座位旁有可用空間。',choices:[
  mk('assist','先協助收妥手提袋，再讓家長入座',true,'手提袋已收妥，家長正在入座。'),
  mk('sit','請家長先坐，手提袋暫留走道',false,'手提袋仍占用通道；需要先協助安置。'),
  mk('bag-seat','替手提袋找座位，讓家長繼續站著',false,'家長需要協助入座，行李也要收妥。')
 ]};
 return null;
}
export function boardingPassable(s,x,z,radius=.23){
 for(const a of s.boarding?.actors||[]){
  if(a.status==='pending'||['seated','exited'].includes(a.status))continue;
  const old=Math.hypot(s.player.x-a.x,s.player.z-a.z),next=Math.hypot(x-a.x,z-a.z);
  // If an actor stops nearby, the crew can always step away at normal speed.
  if(next<radius+.18&&next<old-1e-8)return false;
 }
 return true;
}
export function boardingTaskComplete(s,t){
 for(const a of s.boarding.actors)if(a.taskId===t.id){a.hold=false;if(a.status==='waiting')a.status='walking';}
 if(t.id==='guide'){s.tasks.find(t=>t.id==='bag').active=true;s.boarding.tutorialStep=2;}
 if(t.id==='bag'){s.boarding.tutorialStep=3;for(const t of s.tasks)if(['seat','family'].includes(t.id))t.active=true;}
}
export function boardingReady(s){return s.boarding.formal&&s.tasks.every(t=>t.done)&&s.boarding.actors.every(a=>['seated','exited'].includes(a.status));}
function overtakes(b,a,z){return b.actors.slice(0,b.actors.indexOf(a)).some(p=>!['pending','seated','exited'].includes(p.status)&&(p.hold||!p.departing&&p.z<=p.row*2+3+.01)&&a.z<=p.z+.05&&z>p.z-.6&&z>a.z+1e-8);}
function rowReserved(b,a,z,destinationZ){return b.actors.some(p=>{
   const rowZ=p.row*2+3,seatX=p.side==='left'?-1.25:1.25,otherDistance=Math.abs(p.z-rowZ),ownDistance=Math.abs(a.z-destinationZ);
   const first=otherDistance<ownDistance-1e-8||Math.abs(otherDistance-ownDistance)<1e-8&&b.actors.indexOf(p)<b.actors.indexOf(a);
   return p!==a&&first&&['walking','waiting'].includes(p.status)&&otherDistance<.85&&Math.abs(p.x-seatX)>.02&&Math.abs(z-rowZ)<.7&&Math.abs(z-rowZ)<Math.abs(a.z-rowZ)-1e-8;
  });}
export function tickBoarding(s,dt){
 const b=s.boarding;b.time+=dt;
 if(!b.formal){
  if(b.tutorialStep===0&&s.player.z>=1.95)b.tutorialStep=1;
  if(b.tutorialStep===3&&Math.hypot(s.player.x,s.player.z-9)<=1.1){b.formal=true;b.tutorialStep=4;for(const t of s.tasks)if(!t.done)t.spawn=s.elapsed;s.feedback='正式登機開始：核對登機證、協助家長，讓所有人就座後回前方回報。';}
  else s.feedback=BOARDING_TUTORIAL[b.tutorialStep];
 }
 const previous=b.actors.map(a=>[a.x,a.z]);
 for(const a of b.actors){
  if(a.status==='pending'){
   if(b.tutorialStep<2)continue;
   if(b.time<a.spawn||b.actors.filter(p=>p.status==='walking').length>=3)continue;
   if(b.actors.some(p=>p!==a&&!['pending','seated','exited'].includes(p.status)&&Math.hypot(a.x-p.x,a.z-p.z)<.65))continue;
   if(Math.hypot(a.x-s.player.x,a.z-s.player.z)<.47)continue;
   a.status='walking';
  }
  if(a.status!=='walking')continue;
  const waitingZ=a.taskId==='seat'?9-(a.id==='seat-misread'?.75:0):a.taskId==='family'?11:a.row*2+3;
  if(a.bypassX!==undefined&&Math.abs(a.z-s.player.z)>.75)delete a.bypassX;
  const destinationZ=a.hold?waitingZ:a.row*2+3,returning=destinationZ<a.z-.01;
  const opposingTraffic=b.actors.some(p=>p!==a&&!['seated','exited'].includes(p.status)&&!p.hold&&(!!p.departing||p.row*2+3<p.z-.01)!==returning);
  if(opposingTraffic&&a.bypassX!==undefined&&Math.sign(a.bypassX)!==(returning?1:-1))delete a.bypassX;
  // Keep opposite streams in different lanes; align before moving along z.
  // This also covers a misread seat one row behind, not only the exit route.
  const lane=a.bypassX??(returning?.28:-.28),alongAisle=Math.abs(a.z-destinationZ)>.01;
  const targetX=alongAisle?lane:a.hold?(a.id==='seat-owner'?.28:-.28):(a.side==='left'?-1.25:1.25);
  const targetZ=alongAisle&&Math.abs(a.x-lane)>.015?a.z:destinationZ;
  const dx=targetX-a.x,dz=targetZ-a.z,d=Math.hypot(dx,dz),step=Math.min(d,1.45*dt);
  const x=a.x+(d?dx/d*step:0),z=a.z+(d?dz/d*step:0);
  // A newer arrival cannot overtake an earlier arrival and then stop in front
  // of it. Lateral yielding around the crew must preserve boarding order.
  if(!returning&&overtakes(b,a,z)||rowReserved(b,a,z,destinationZ))continue;
  if(Math.hypot(x-s.player.x,z-s.player.z)<.47&&Math.hypot(x-s.player.x,z-s.player.z)<Math.hypot(a.x-s.player.x,a.z-s.player.z)){
   const preferred=returning?.52:-.52,blockedSide=Math.abs(s.player.x-preferred)<.47;
   if(blockedSide&&opposingTraffic)continue;
   a.bypassX=blockedSide?-preferred:preferred;
   const nextX=a.x+Math.sign(a.bypassX-a.x)*Math.min(Math.abs(a.bypassX-a.x),1.45*dt);
   if(Math.hypot(nextX-s.player.x,a.z-s.player.z)>=.47&&!b.actors.some(p=>p!==a&&!['pending','seated','exited'].includes(p.status)&&Math.hypot(nextX-p.x,a.z-p.z)<.45))a.x=nextX;
   else {const backZ=Math.max(.65,Math.min(13.5,a.z+Math.sign(a.z-s.player.z||1)*1.45*dt));if(!overtakes(b,a,backZ)&&!rowReserved(b,a,backZ,destinationZ)&&!b.actors.some(p=>p!==a&&!['pending','seated','exited'].includes(p.status)&&Math.hypot(a.x-p.x,backZ-p.z)<.45))a.z=backZ;}
   continue;
  }
  if(b.actors.some(p=>p!==a&&!['pending','seated','exited'].includes(p.status)&&Math.hypot(x-p.x,z-p.z)<.45&&Math.hypot(x-p.x,z-p.z)<Math.hypot(a.x-p.x,a.z-p.z)))continue;
  if(step>0)a.angle=Math.atan2(-dx,-dz);a.x=x;a.z=z;a.distance+=step;
  if(d<.015&&Math.abs(a.z-destinationZ)<.015){if(a.hold)a.status='waiting';else if(Math.abs(a.x-(a.side==='left'?-1.25:1.25))<.015)a.status=a.departing?'exited':'seated';}
 }
 b.standing=b.actors.filter(a=>a.status==='walking'||a.status==='waiting').length;
 if(!b.formal)return;
 b.actors.forEach((a,i)=>{const moved=Math.hypot(a.x-previous[i][0],a.z-previous[i][1])>.001;a.blockedFor=a.status==='walking'&&!moved?(a.blockedFor||0)+dt:0;});
 b.blockedStanding=b.actors.filter(a=>a.status==='waiting'&&a.hold||a.status==='walking'&&a.blockedFor>=1).length;
 const busy=b.blockedStanding>3;
 if(busy){b.congestionTime+=dt;if(b.congestionTime>=8&&!b.congestionLatched){b.congestionLatched=true;b.congestionEvents++;if(!s.practice){s.safetyErrors++;s.mistakes++;s.safety=Math.max(0,s.safety-20);}s.feedback='走道持續擁擠。先解開紅色座位問題，讓人流繼續前進。';s.feedbackKind='warning';}}
 else {b.congestionTime=0;b.congestionLatched=false;}
 for(const t of s.tasks)if(t.active&&!t.done&&t.kind==='service'&&!t.late&&s.elapsed-t.spawn>=40){t.late=true;if(!s.practice){s.comfort=Math.max(0,s.comfort-8);s.servicePenalty+=8;}s.feedback='家長已等候一段時間，請在安全問題處理後協助入座。';}
}
