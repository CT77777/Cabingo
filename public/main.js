import {createState,start,tick,interact,choose,closeDialog,pause,resume,dismissLesson,targets,counts,chapterReady,readEvents,actionInput} from './preflight.mjs?v=0.4.0';
import {layoutLabels,crossedMilestones} from './presentation.mjs?v=0.4.0';
import {createCabinAudio} from './audio.mjs?v=0.4.0';
import {summarizeResult,parseBest,selectBest} from './results.mjs?v=0.4.0';
const $=id=>document.getElementById(id),canvas=$('sceneCanvas');
const keys=new Set(),touch=new Set(),held=new Set(),choiceBlockedKeys=new Set(),labelElements=new Map();
const motion=matchMedia('(prefers-reduced-motion: reduce)'),phone=matchMedia('(max-width: 700px)');
let state=createState({handsOn:true,seed:Math.floor(Math.random()*1e9)}),view=null,ready=false,last=0,uiSignature='',dialogSignature='',panelPrevious='',lessonArmed=true,suppressInheritedLessonClick=false,suppressInheritedChoiceClick=false;
state.reducedMotion=motion.matches;
let actionPointer=null,suppressActionClick=false;
let audioPrefs={muted:false,volume:.4,musicVolume:.35},best=null,resultRun=null,audioCursor=null,previousAction=null;
try{const p=JSON.parse(localStorage.getItem('cabin3d-audio-v1'));if(p&&typeof p.muted==='boolean'&&Number.isFinite(p.volume))audioPrefs={muted:p.muted,volume:Math.max(0,Math.min(1,p.volume)),musicVolume:Number.isFinite(p.musicVolume)?Math.max(0,Math.min(1,p.musicVolume)):.35};}catch{}
try{best=parseBest(localStorage.getItem('cabin3d-best-v1'));}catch{}
const audio=createCabinAudio({onMusicUnavailable:()=>{text('audioStatus','音樂暫不可用，音效仍可播放');$('musicSlider').disabled=true;},onUnavailable:()=>{text('audioStatus','音效不可用');$('muteButton').disabled=true;$('volumeSlider').disabled=true;$('musicSlider').disabled=true;}});
audio.setPreferences(audioPrefs);
function updateAudioControls(){$('musicSlider').value=String(Math.round(audioPrefs.musicVolume*100));text('muteButton',audioPrefs.muted?'已靜音':'聲音');$('muteButton').setAttribute('aria-pressed',String(audioPrefs.muted));$('volumeSlider').value=String(Math.round(audioPrefs.volume*100));}
function saveAudio(){audio.setPreferences(audioPrefs);try{localStorage.setItem('cabin3d-audio-v1',JSON.stringify(audioPrefs));}catch{}updateAudioControls();}
function unlockAudio(){audio.unlock().then(ok=>{if(ok){if(!$('musicSlider').disabled)text('audioStatus','音效已啟用');syncPresentation();}});}
function syncPresentation(){
 const finished=state.status==='finished',mode=state.status==='paused'||document.hidden||!ready?'paused':state.status==='briefing'?'silent':state.dialog||state.lesson?'reading':'playing';
 const batch=readEvents(state,audioCursor);
 const finishEvent=finished&&batch.events.some(e=>e.type==='finish');
 audio.setMode(finished?(finishEvent?'playing':'silent'):mode);
 if(audio.getStatus()==='locked'&&mode!=='paused')return;
 audioCursor=batch.cursor;
 for(const e of batch.events)if(['choice','mistake','demand','complete','finish'].includes(e.type))audio.play({id:`${e.runId}:${e.seq}`,type:e.type,detail:e.detail});
 const a=state.action;
 if(a&&a.kind==='task'){
   const from=previousAction?.id===a.id?previousAction.progress:0,progress=a.time/a.duration;
   for(const e of crossedMilestones({actionId:a.id,taskId:a.taskId,choiceId:a.choice.id,from,to:progress}))audio.play({...e,id:`${state.runId}:${e.id}`});
 }
 if(previousAction&&!a&&state.status==='playing'&&state.tasks.find(t=>t.id===previousAction.taskId)?.done){
   for(const e of crossedMilestones({actionId:previousAction.id,taskId:previousAction.taskId,choiceId:previousAction.choiceId,from:previousAction.progress,to:1}))audio.play({...e,id:`${state.runId}:${e.id}`});
 }
 previousAction=a&&a.kind==='task'?{id:a.id,taskId:a.taskId,choiceId:a.choice.id,progress:a.time/a.duration}:null;
 if(finished)audio.setMode('silent');
}
function locationText(t){if(t.taskId)t=state.tasks.find(x=>x.id===t.taskId)||t;const segment=t.row<2?'前段':t.row<4?'中段':'後段';return `${segment} · ${t.side==='right'?'機艙右':'機艙左'}側`;}

let rememberedLessons=[];try{rememberedLessons=JSON.parse(localStorage.getItem('cabin3d-lessons-v2')||'[]');if(!Array.isArray(rememberedLessons))rememberedLessons=[];}catch{}state.lessonSeen=rememberedLessons.filter(x=>['aisle','handoff','correction'].includes(x));
const clearMovement=()=>{keys.clear();touch.clear();};const releaseAll=()=>{actionPointer=null;clearMovement();held.clear();choiceBlockedKeys.clear();};
const clock=n=>`${String(Math.floor(Math.max(0,n)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,n)%60)).padStart(2,'0')}`;
const text=(id,value)=>{const e=$(id);if(e.textContent!==value)e.textContent=value;};
const hide=(id,value)=>{$(id).hidden=value;};
function screenInputToWorld(horizontal,vertical){return {x:-horizontal,z:vertical};}
function focusScene(){canvas.focus({preventScroll:true});}
function focusPanel(id){$(id).querySelector('button')?.focus({preventScroll:true});}
function panelName(){if(!ready)return state.status==='briefing'?'brief':'error';if(state.status==='briefing')return 'brief';if(state.status==='paused')return 'pause';if(state.status==='finished')return 'result';if(state.lesson)return 'lesson';if(state.dialog)return 'decision';return 'idle';}
function rememberLessons(){rememberedLessons=[...state.lessonSeen];try{localStorage.setItem('cabin3d-lessons-v2',JSON.stringify(rememberedLessons));}catch{}}
function fail(error){audio.dispose();ready=false;releaseAll();pause(state);hide('loading',true);hide('briefCard',true);hide('webglError',false);hide('decisionCard',true);hide('lessonCard',true);hide('pauseCard',true);hide('resultCard',true);for(const id of ['startButton','practiceButton','interactButton','pauseButton','cameraButton'])$(id).disabled=true;document.body.dataset.panel='error';text('sceneStatus','3D 顯示未能啟動');text('feedback','請使用支援 WebGL 2 的瀏覽器，確認圖形加速可用後重新載入。');console.error('Cabin 3D could not start:',error?.message||error);}
function renderChoices(){const d=state.dialog;if(!d)return;text('decisionDescription',d.recoveryFeedback||d.description);$('decisionDescription').dataset.kind=d.recoveryFeedback?'warning':'normal';const signature=state.decisionSerial+':'+d.id;if(signature===dialogSignature)return;dialogSignature=signature;const task=state.tasks.find(t=>t.id===d.id);text('decisionTag',`${task?locationText(task):''} · ${task?.kind==='safety'?'安全檢查':'旅客需求'}`);text('handoffHint',d.handoffHint||'');hide('handoffHint',!d.handoffHint);text('decisionTitle',d.title);text('decisionQuote',`「${d.quote}」`);$('choices').replaceChildren(...d.choices.map((c,index)=>{const b=document.createElement('button');b.className='choice';b.dataset.choice=String(index);const n=document.createElement('b'),copy=document.createElement('span'),label=document.createElement('span'),tags=document.createElement('small');n.textContent=String(index+1);copy.className='choice-copy';label.textContent=c.label;tags.className='choice-tags';for(const t of c.tags){const tag=document.createElement('span');tag.textContent=t;tags.append(tag);}copy.append(label,tags);b.append(n,copy);b.addEventListener('click',event=>selectChoice(index,event));return b;}));}
function refresh(force=false){const c=counts(state),panel=panelName(),signature=[ready,panel,state.near,state.dialog?.id,state.decisionSerial,state.dialog?.retrySerial,state.lesson?.id,state.feedback,state.feedbackKind,state.cameraMode,state.elapsed.toFixed(1),state.mistakes,state.safetyErrors,state.handoffTokens,state.handoffJob?.remaining.toFixed(1),state.action?.kind,Math.ceil(state.action?.time||0),...state.tasks.map(t=>[t.active,t.done,t.assigned,t.late,t.warned,t.patience].join(',')),c.hazards].join('|');if(!force&&signature===uiSignature)return;uiSignature=signature;document.body.dataset.panel=panel;document.body.dataset.decisionKind=state.tasks.find(t=>t.id===state.dialog?.id)?.kind||'none';syncPresentation();
 hide('briefCard',panel!=='brief');hide('decisionCard',panel!=='decision');hide('lessonCard',panel!=='lesson');hide('pauseCard',panel!=='pause');hide('resultCard',panel!=='result');hide('idleCard',['decision','lesson','pause','result'].includes(panel));
 text('modeLabel',state.practice?'不計時練習':'起飛前 · 3D');text('safetyCount',`${c.safety} / 3`);text('serviceCount',`${c.service} / 3`);text('handoffs',`${state.handoffTokens} / 1`);text('clock',state.practice?'練習':clock(Math.ceil(state.duration-state.elapsed)));$('clock').classList.toggle('urgent',!state.practice&&state.duration-state.elapsed<=30);
 text('sceneStatus',panel==='brief'?'準備巡艙':panel==='pause'?'已暫停':panel==='decision'?'閱讀不計時':panel==='lesson'?'首次說明 · 不扣時':panel==='result'?'本輪講評':state.action?'處理中':state.cameraMode==='overview'?'全艙總覽 · 找任務與路線':'巡艙跟隨 · 看眼前物件');
 text('safetyScore',String(Math.round(state.safety)));text('comfortScore',String(Math.round(state.comfort)));text('mistakes',String(state.safetyErrors));text('assessment',state.practice?'練習不倒數、不扣分；完成後可回選單正式巡艙。':state.safetyErrors>=2?'本輪需重試，仍可完成補救練習。':state.safetyErrors===1?'已有一次安全修正，完成後保留補救評價。':'紅色安全優先；可先回應綠色需求。');
 const warnings=state.tasks.filter(t=>t.active&&!t.done&&!t.assigned&&t.warned&&!t.late);
 text('objective',chapterReady(state)?'全部完成，回前方金色圈按 E 回報。':c.hazards?`走道事件 ${c.hazards} 件：靠近紅圈恢復走道。`:warnings.length?`${warnings.map(t=>t.title).join('、')} 等候快到期，請安排回應。`:`檢查 ${c.safety}/3 · 服務 ${c.service}/3 · 完成後回前方回報`);
 text('feedback',state.action?.interaction?(state.action.interaction.steps[state.action.interaction.index].mode==='hold'?'按住 E／互動，進入綠色區域就放開。可重試，不扣判斷分。':'點按 E／互動，完成眼前這一步。'):panel==='brief'?'選正式巡艙，或先不計時練習。':state.action?.kind==='correction'?state.action.choice.feedback:state.feedback);$('feedback').dataset.kind=state.action?.kind==='correction'?'warning':state.feedbackKind;
 const target=targets(state).find(t=>t.id===state.near),interaction=state.action?.interaction,step=interaction?.steps[interaction.index];text('interactLabel',step?(step.mode==='hold'?(interaction.held?'綠區放開':'按住操作'):'點按操作'):state.action?'修正中…':target?target.kind==='hazard'?'恢復走道':target.id==='report'?'回報巡艙':target.label:'進入圈內互動');$('interactButton').classList.toggle('near',!!target&&panel==='idle'&&!state.action);$('interactButton').disabled=!ready||state.status!=='playing'||!!state.dialog||!!state.lesson;
 $('pauseButton').disabled=!ready||!['playing','paused'].includes(state.status);text('pauseButton',state.status==='paused'?'繼續巡艙':'暫停 / 規則');$('cameraButton').disabled=!ready;$('cameraButton').setAttribute('aria-pressed',String(state.cameraMode==='overview'));text('cameraButton',state.cameraMode==='overview'?'全艙總覽':'巡艙鏡頭');
 hide('holdMeter',!interaction||step.mode!=='hold');hide('actionBox',!state.action);if(state.action){const names={task:'協助旅客',handoff:'安排交接',wait:'說明等候',correction:'修正回饋', 'clear-hazard':'恢復走道'};text('actionLabel',interaction?`${interaction.index+1}/${interaction.steps.length} · ${step.label}${interaction.retry?' · 再試一次':''}`:`${names[state.action.kind]||'處理中'} · ${Math.ceil(state.action.duration-state.action.time)} 秒`);hide('holdMeter',!interaction||step.mode!=='hold');$('holdFill').style.width=`${Math.min(100,(interaction?.fill||0)/1.2*100)}%`;}
 text('taskSummary',`${c.pending+c.hazards} 待辦`);const items=[...state.hazards.filter(h=>!h.done).map(h=>({...h,kind:'hazard',title:'恢復走道',active:true})),...state.tasks.filter(t=>t.active).sort((a,b)=>Number(a.done)-Number(b.done)||a.row-b.row)];$('taskList').replaceChildren(...items.map(t=>{const row=document.createElement('div');row.className=`task-row ${t.kind}${t.done?' done':''}${state.near===t.id?' near':''}`;const name=document.createElement('b'),meta=document.createElement('small'),time=document.createElement('span');name.textContent=`${t.kind==='safety'||t.kind==='hazard'?'安全':'服務'} · ${locationText(t)} ${t.title}`;meta.textContent=t.done?(t.handoff?'同事已完成':'已完成'):t.assigned?'同事處理中':t.kind==='hazard'?'靠近紅圈按 E':t.warned&&!t.late?'等候即將到期':t.late?'旅客仍需要服務':'觀察現場再處理';time.textContent=t.done?'✓':t.assigned?`${Math.ceil(state.handoffJob?.remaining||0)}秒`:t.kind==='service'?`${Math.max(0,Math.ceil(t.patience-state.elapsed+t.spawn))}秒`:'!';row.append(name,meta,time);return row;}));
 if(panel==='decision')renderChoices();if(panel==='lesson'){text('lessonTitle',state.lesson.title);text('lessonCopy',state.lesson.copy);}
 if(panel==='result'){const summary=summarizeResult(state);text('resultStars',summary.stars===null?'不計星等':`${'★'.repeat(summary.stars)}${'☆'.repeat(3-summary.stars)} · ${summary.stars} / 3`);text('resultAdvice',summary.advice);if(resultRun!==state.runId){resultRun=state.runId;const next=selectBest(best,summary.record);if(next!==best){best=next;try{localStorage.setItem('cabin3d-best-v1',JSON.stringify(best));}catch{}}}text('bestRecord',best?`此瀏覽器最佳紀錄 · ${best.stars} 星 · 服務 ${Math.round(best.comfort)} · ${clock(best.elapsed)}`:'此瀏覽器尚無正式紀錄');text('resultTitle',summary.title);text('resultCopy',state.practice?'練習沒有倒數或扣分。可以回選單挑戰正式第一章。':state.grade==='incomplete'?'行動時間用完。檢查、服務、走道及回前方回報都需要完成。':state.safetyErrors>=2?'本輪有至少兩次安全失誤；服務分數不能抵銷安全紀錄。':state.safetyErrors?'完成了補救，評價不會回到零失誤。':'你依可見情境完成檢查與服務，並回報巡艙。');text('resultDetails',`檢查 ${c.safety}/3 · 服務 ${c.service}/3 · 未清走道 ${c.hazards}\n安全 ${Math.round(state.safety)} · 服務 ${Math.round(state.comfort)}\n安全失誤 ${state.safetyErrors} · 服務修正 ${state.mistakes-state.safetyErrors}\n行動 ${clock(state.elapsed)} · 回報${state.endReason==='complete'?'完成':'未完成'}`);}
 if(panel!==panelPrevious){actionPointer=null;clearMovement();if(panel==='lesson'){lessonArmed=held.size===0;suppressInheritedLessonClick=held.has('Space')||held.has('Enter')||held.has('NumpadEnter');focusPanel('lessonCard');}else if(panel==='decision')focusPanel('decisionCard');else if(panel==='pause')$('resumeButton').focus({preventScroll:true});else if(panel==='result')focusPanel('resultCard');else if(panel==='idle'&&panelPrevious&&panelPrevious!=='brief')focusScene();panelPrevious=panel;}
}
function begin(practice=false){if(!ready||state.status!=='briefing')return;unlockAudio();audio.reset(state.runId);state.practice=practice;start(state);releaseAll();refresh(true);focusScene();}
function fresh(practice=state.practice,autostart=true){if(!ready)return;const camera=state.cameraMode;state=createState({handsOn:true,practice,seed:Math.floor(Math.random()*1e9)});state.cameraMode=camera;state.reducedMotion=motion.matches;state.lessonSeen=[...rememberedLessons];dialogSignature='';suppressInheritedChoiceClick=false;releaseAll();audio.reset(state.runId);audioCursor=null;previousAction=null;if(autostart){unlockAudio();start(state);}refresh(true);if(autostart)focusScene();}
function performInteraction(){if(!ready)return;if(state.action?.interaction){actionInput(state,state.action.interaction.held?'release':'press');refresh(true);return;}clearMovement();if(interact(state)&&state.dialog){choiceBlockedKeys.clear();suppressInheritedChoiceClick=false;}refresh(true);}
function selectChoice(index,event={}){
 if(!ready||(event.code?choiceBlockedKeys.has(event.code):!event.detail&&suppressInheritedChoiceClick)||!choose(state,index))return;
 if(state.practice&&state.dialog?.recoveryFeedback){
  for(const code of held)if(/^(Digit|Numpad)[123]$/.test(code)||['Space','Enter','NumpadEnter'].includes(code))choiceBlockedKeys.add(code);
  suppressInheritedChoiceClick=held.has('Space')||held.has('Enter')||held.has('NumpadEnter');
 }else{choiceBlockedKeys.clear();suppressInheritedChoiceClick=false;}
 clearMovement();refresh(true);if(!state.lesson&&!state.dialog)focusScene();
}
function continueLesson(event={}){if(!ready||(!event.detail&&(!lessonArmed||suppressInheritedLessonClick)))return;if(dismissLesson(state)){rememberLessons();clearMovement();refresh(true);focusScene();}}
function togglePause(){if(!ready)return;if(state.status==='playing')pause(state);else if(state.status==='paused')resume(state);else return;releaseAll();refresh(true);if(state.status==='playing'&&!state.lesson&&!state.dialog)focusScene();}
function toggleCamera(){if(!ready)return;state.cameraMode=state.cameraMode==='overview'?'follow':'overview';clearMovement();refresh(true);}
$('musicSlider').addEventListener('input',()=>{audioPrefs.musicVolume=Number($('musicSlider').value)/100;saveAudio();});
$('muteButton').addEventListener('click',()=>{audioPrefs.muted=!audioPrefs.muted;saveAudio();});$('volumeSlider').addEventListener('input',()=>{audioPrefs.volume=Number($('volumeSlider').value)/100;saveAudio();});updateAudioControls();
$('startButton').addEventListener('click',()=>begin(false));$('practiceButton').addEventListener('click',()=>begin(true));$('interactButton').addEventListener('pointerdown',e=>{
 suppressActionClick=false;if(!state.action?.interaction||actionPointer!==null)return;
 e.preventDefault();actionPointer=e.pointerId;suppressActionClick=true;$('interactButton').setPointerCapture(e.pointerId);actionInput(state,'press');refresh(true);
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('interactButton').addEventListener(type,e=>{
 if(e.pointerId!==actionPointer)return;actionPointer=null;actionInput(state,type==='pointerup'?'release':'cancel');refresh(true);
});
$('interactButton').addEventListener('click',e=>{if(suppressActionClick&&e.detail)return;suppressActionClick=false;performInteraction();});$('closeDecision').addEventListener('click',()=>{if(!ready)return;closeDialog(state);clearMovement();refresh(true);focusScene();});$('lessonContinue').addEventListener('click',continueLesson);$('pauseButton').addEventListener('click',togglePause);$('resumeButton').addEventListener('click',togglePause);$('restartButton').addEventListener('click',()=>fresh());$('replayButton').addEventListener('click',()=>fresh());for(const id of ['modeButton','resultMenuButton'])$(id).addEventListener('click',()=>fresh(false,false));$('cameraButton').addEventListener('click',toggleCamera);$('reloadButton').addEventListener('click',()=>location.reload());
const directionCodes={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
const fallbackCodes={w:'KeyW',s:'KeyS',a:'KeyA',d:'KeyD',e:'KeyE',c:'KeyC','1':'Digit1','2':'Digit2','3':'Digit3',ArrowUp:'ArrowUp',ArrowDown:'ArrowDown',ArrowLeft:'ArrowLeft',ArrowRight:'ArrowRight',Escape:'Escape'};
function physical(e){return e.code&&e.code!=='Unidentified'?e.code:(fallbackCodes[e.key]||fallbackCodes[e.key?.toLowerCase()]||e.key||'');}
window.addEventListener('keydown',e=>{if(!ready||e.metaKey||e.ctrlKey||e.altKey||((/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)||e.target?.isContentEditable)&&physical(e)!=='Escape'))return;const code=physical(e),dir=directionCodes[code],wasHeld=held.has(code);held.add(code);if(state.dialog&&!e.repeat&&!wasHeld){choiceBlockedKeys.delete(code);if(['Space','Enter','NumpadEnter'].includes(code))suppressInheritedChoiceClick=false;}if(state.lesson&&!e.repeat&&['Space','Enter','NumpadEnter'].includes(code)&&lessonArmed)suppressInheritedLessonClick=false;if(e.target?.tagName==='BUTTON'&&dir)return;if(dir&&state.status==='playing'&&!state.dialog&&!state.lesson){e.preventDefault();if(!state.action)keys.add(dir);return;}if(e.repeat||wasHeld)return;if(code==='Escape'&&['playing','paused'].includes(state.status)){e.preventDefault();togglePause();}else if(code==='KeyE'&&state.status==='playing'&&!state.dialog&&!state.lesson){e.preventDefault();if(state.action?.interaction){actionInput(state,'press');refresh(true);}else performInteraction();}else if(/^(Digit|Numpad)[123]$/.test(code)&&state.dialog&&state.status==='playing'&&!state.lesson){e.preventDefault();selectChoice(Number(code.slice(-1))-1,{code});}else if(code==='KeyC'){e.preventDefault();toggleCamera();}});
window.addEventListener('keyup',e=>{const code=physical(e),dir=directionCodes[code];held.delete(code);choiceBlockedKeys.delete(code);if(code==='KeyE'){actionInput(state,'release');refresh(true);}if(dir)keys.delete(dir);if(!held.size)lessonArmed=true;});
function loseFocus(){releaseAll();if(!ready)return;if(pause(state))refresh(true);}
window.addEventListener('blur',loseFocus);document.addEventListener('visibilitychange',()=>{if(document.hidden)loseFocus();});
for(const b of document.querySelectorAll('[data-dir]')){b.addEventListener('pointerdown',e=>{if(!ready||state.status!=='playing'||state.dialog||state.lesson||state.action)return;e.preventDefault();b.setPointerCapture(e.pointerId);touch.add(b.dataset.dir);});for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,()=>touch.delete(b.dataset.dir));}
motion.addEventListener?.('change',()=>{state.reducedMotion=motion.matches;});function fitTasks(){text('interactKey',phone.matches?'互動':'E');if(phone.matches)$('taskDetails').open=false;else $('taskDetails').open=true;}phone.addEventListener?.('change',fitTasks);fitTasks();
window.addEventListener('pagehide',()=>{audio.dispose();releaseAll();view?.dispose();view=null;});window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
const iconPaths={alert:'M12 5v9m0 4v1',water:'M6 5h12l-2 15H8L6 5zm1 5h10',blanket:'M5 5h14v15H5V5zm3 0v15m8-15v15M5 10h14m-14 5h14',question:'M8 8a4 4 0 1 1 6 3c-2 1-2 2-2 4m0 3v1',report:'m5 12 4 4L19 6'};
function updateLabels(labels){
 const root=$('targetLabels'),width=canvas.clientWidth||1280,height=canvas.clientHeight||800;
 const exclusions=['controlDock','guidance','decisionCard','lessonCard','pauseCard','resultCard','taskDetails','idleCard','sceneStatus'].map(id=>$(id)).filter(e=>!e.hidden).flatMap(e=>{const r=e.getBoundingClientRect?.();return r&&r.width&&r.height?[r]:[];});
 // Header/flight strip: fixed reserved band, independent of label projection.
 exclusions.push({left:0,top:0,right:width,bottom:phone.matches?100:112});
 const prepared=labels.map(l=>{
  const expanded=l.near||l.kind==='detail',copy=expanded?l.text:'';
  let e=labelElements.get(l.id);if(!e){e=document.createElement('span');labelElements.set(l.id,e);root.append(e);}
  e.hidden=false;e.className=`target-label ${l.kind||''}${l.near?' near':''}${expanded?' expanded':' compact'}`;
  const signature=`${l.kind}|${l.icon}|${copy}`;
  if(e.dataset.content!==signature){
    const children=[];
    if(l.kind!=='detail'){
      const icon=document.createElement('img');icon.className='target-icon';icon.alt='';icon.setAttribute('aria-hidden','true');
      const path=iconPaths[l.icon]||iconPaths.alert;
      icon.src=`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="'+path+'" fill="none" stroke="#214b46" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>')}`;
      children.push(icon);
    }
    const label=document.createElement('span');label.className='target-copy';label.textContent=copy;children.push(label);
    e.replaceChildren(...children);e.dataset.content=signature;
  }
  e.setAttribute('aria-label',l.text);e.style.left=`${l.x}px`;e.style.top=`${l.y}px`;
  return {...l,width:expanded?Math.max(72,copy.length*12+44):30,height:32};
 });
 // Complete all DOM writes before reading sizes, avoiding one forced layout per label.
 for(const l of prepared){const rect=labelElements.get(l.id).getBoundingClientRect?.();if(rect?.width){l.width=rect.width;l.height=rect.height;}}
 const active=new Set();for(const l of layoutLabels(prepared,{width,height,exclusions})){
  const e=labelElements.get(l.id);e.hidden=!l.visible;if(l.visible)active.add(l.id);
 }for(const [id,e] of labelElements)if(!active.has(id))e.hidden=true;
}
function frame(time){const dt=Math.min(Math.max((time-last)/1000,0),.05);last=time;if(ready&&view){const wasAction=state.action,heldDir=d=>keys.has(d)||touch.has(d);tick(state,dt,screenInputToWorld(Number(heldDir('right'))-Number(heldDir('left')),Number(heldDir('up'))-Number(heldDir('down'))));if(wasAction&&!state.action)clearMovement();state.renderTargets=targets(state);try{const visual=view.render(state,dt);updateLabels(visual?.labels||[]);}catch(error){fail(error);}if(ready){syncPresentation();if(state.action){$('actionBar').style.width=`${100*state.action.time/state.action.duration}%`;if(state.action.interaction)$('holdFill').style.width=`${Math.min(100,state.action.interaction.fill/1.2*100)}%`;}refresh();}}requestAnimationFrame(frame);}
async function boot(){try{const {createCabinView}=await import('./scene.js?v=0.4.0');view=createCabinView(canvas,{onContextLost:()=>fail(new Error('WebGL context lost'))});ready=true;hide('loading',true);$('startButton').disabled=false;$('practiceButton').disabled=false;text('startButton','開始正式巡艙 →');refresh(true);requestAnimationFrame(frame);}catch(error){fail(error);}}
refresh(true);boot();
