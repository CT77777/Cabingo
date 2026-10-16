import {createBoardingEvidence} from './boarding-ui.mjs?v=0.7.2';
import {createState,start,tick,interact,choose,closeDialog,pause,resume,dismissLesson,targets,counts,chapterReady,readEvents,actionInput,ackRecovery} from './preflight.mjs?v=recording-time-1';
import {retryCandidates,createRetry,retryPrompt,answerRetry,retryComparison} from './retry.mjs?v=0.7.3-retry-copy';
import {BOARDING_TUTORIAL,boardingEvidence,boardingCoach,inspectBoardingClue} from './boarding.mjs?v=0.7.2';
import {layoutLabels,crossedMilestones,coworkerPresentation,COWORKER_PHASE_LABELS} from './presentation.mjs?v=final-check-1';
import {createCabinAudio} from './audio.mjs?v=carefree-1';
import {summarizeResult,parseBest,selectBest,trainingFeedback} from './results.mjs?v=assessment-2';
import {CHAPTERS,DEFAULT_CHAPTER_ID,getChapter,formatChapterLabel} from './chapters/index.mjs?v=recording-time-1';
import {CAMPAIGN_STORAGE_KEY,parseCampaign,recordChapterResult,selectCampaignChapter,updateCharacterMemory,prepareCampaignSave} from './campaign.mjs?v=0.7.2';
import {joystickVector,countdownPresentation} from './interaction.mjs?v=0.7.2';
import {CODEX_STORAGE_KEY,parseCodex,awardChapterCards,canAwardChapterCards,newlyEarnedCards,prepareCodexSave} from './learning.mjs?v=0.7.2';
import {KNOWLEDGE} from './knowledge/index.mjs?v=final-check-1';

const $=id=>document.getElementById(id),canvas=$('sceneCanvas');
const resumeBlockedKeys=new Set(),keys=new Set(),touch=new Set(),held=new Set(),choiceBlockedKeys=new Set(),labelElements=new Map();
const motion=matchMedia('(prefers-reduced-motion: reduce)'),phone=matchMedia('(max-width: 700px)');
let state=null,view=null,ready=false,last=0,uiSignature='',dialogSignature='',panelPrevious='',lessonArmed=true,suppressInheritedLessonClick=false,suppressInheritedChoiceClick=false;
let joystickPointer=null,stick={x:0,y:0},missionBottom=null,hudObserver=null;
let actionPointer=null,suppressActionClick=false,pauseReason='manual',pauseReturn='playing',infoOpen=false,infoOriginPaused=false,suppressAwayClick=false;
let audioPrefs={muted:false,volume:.4,musicVolume:.35},best=null,resultRun=null,audioCursor=null,previousAction=null;
try{const p=JSON.parse(localStorage.getItem('cabin3d-audio-v1'));if(p&&typeof p.muted==='boolean'&&Number.isFinite(p.volume))audioPrefs={muted:p.muted,volume:Math.max(0,Math.min(1,p.volume)),musicVolume:Number.isFinite(p.musicVolume)?Math.max(0,Math.min(1,p.musicVolume)):.35};}catch{}
try{best=parseBest(localStorage.getItem('cabin3d-best-v1'));}catch{}
let campaign,chapterMenuSignature='',campaignStorageAvailable=true;
try{campaign=parseCampaign(localStorage.getItem(CAMPAIGN_STORAGE_KEY),{legacyBest:best,legacyCampaign:localStorage.getItem('cabin3d-campaign-v1')});}catch{campaign=parseCampaign(null,{legacyBest:best});campaignStorageAvailable=false;}
// Keep former scoring records for campaign migration without comparing rule sets.
const BEST_STORAGE_KEY='cabin3d-best-final-check-v1';
best=null;try{best=parseBest(localStorage.getItem(BEST_STORAGE_KEY));}catch{}
const codexExitKeys=new Set();
let codex, codexCanSave=true,codexOpen=false,codexReturn=null,learningAwardRun=null,newRewards=[],learningResultRun=null;
let retrySession=null,retryOrigin=null,retryInputBlocked=false;
const retryCompleted=new Map();
try{const raw=localStorage.getItem(CODEX_STORAGE_KEY);codex=parseCodex(raw);codexCanSave=prepareCodexSave(raw,codex).raw!==null;}catch{codex=parseCodex(null);codexCanSave=false;}
state=createState({chapterId:campaign.currentChapterId,characterMemory:campaign.characterMemory,handsOn:true,contextual:true,guidedBoarding:true,seed:Math.floor(Math.random()*1e9)});state.reducedMotion=motion.matches;

let lastAudibleVolume=audioPrefs.volume>0?audioPrefs.volume:.4;
try{const p=JSON.parse(localStorage.getItem('cabin3d-audio-v1'));if(Number.isFinite(p?.lastVolume)&&p.lastVolume>0&&p.lastVolume<=1)lastAudibleVolume=p.lastVolume;}catch{}
const audio=createCabinAudio({onMusicUnavailable:()=>{text('audioStatus','音樂暫不可用，音效仍可播放');$('musicSlider').disabled=true;},onUnavailable:()=>{text('audioStatus','音效不可用');$('muteButton').disabled=true;$('volumeSlider').disabled=true;$('musicSlider').disabled=true;$('pauseMuteButton').disabled=true;$('pauseVolumeSlider').disabled=true;}});
audio.setPreferences(audioPrefs);
function updateAudioControls(){
 const muted=audioPrefs.muted||audioPrefs.volume===0,level=muted?0:Math.round(audioPrefs.volume*100),label=muted?'取消靜音':'靜音';
 $('musicSlider').value=String(Math.round(audioPrefs.musicVolume*100));
 for(const [button,control,slider] of [['muteButton','volumeControl','volumeSlider'],['pauseMuteButton','pauseVolumeControl','pauseVolumeSlider']]){
  $(button).setAttribute('aria-pressed',String(muted));$(button).setAttribute('title',label);
  $(control).dataset.muted=String(muted);$(slider).value=String(level);$(slider).setAttribute('aria-valuetext',muted?'靜音':`${level}%`);$(slider).style.backgroundImage=`linear-gradient(to right,#a8dfcb ${level}%,#69828b ${level}%)`;
 }
}
function restoreSceneInput(){if(state.status==='playing'&&!state.dialog&&!state.lesson&&!state.recovery)focusScene();}
function saveAudio(){audioPrefs.lastVolume=lastAudibleVolume;audio.setPreferences(audioPrefs);try{localStorage.setItem('cabin3d-audio-v1',JSON.stringify(audioPrefs));}catch{}updateAudioControls();}
function unlockAudio(){audio.unlock().then(ok=>{if(ok){if(!$('musicSlider').disabled)text('audioStatus','音效已啟用');syncPresentation();}});}
function syncPresentation(){
 const finished=state.status==='finished',mode=state.status==='paused'||document.hidden||!ready?'paused':state.status==='briefing'?'silent':state.dialog||state.lesson||state.recovery?.ready?'reading':'playing';
 const batch=readEvents(state,audioCursor);
 const finishEvent=finished&&batch.events.some(e=>e.type==='finish');
 audio.setMode(finished?(finishEvent?'playing':'silent'):mode);
 if(audio.getStatus()==='locked'&&mode!=='paused')return;
 audioCursor=batch.cursor;
 for(const e of batch.events)if(['choice','mistake','demand','complete','finish','time-warning'].includes(e.type))audio.play({id:`${e.runId}:${e.seq}`,type:e.type==='time-warning'?'time-warning':e.type,detail:e.detail});
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

let rememberedLessons=[];try{const current=localStorage.getItem('cabin3d-lessons-v3');rememberedLessons=JSON.parse(current||localStorage.getItem('cabin3d-lessons-v2')||'[]');if(!Array.isArray(rememberedLessons))rememberedLessons=[];if(!current)rememberedLessons=rememberedLessons.filter(id=>!['serviceIntro','handoff','aisle'].includes(id));}catch{}state.lessonSeen=rememberedLessons.filter(x=>getChapter(state.chapterId).tutorial.includes(x));
const resetStick=()=>{joystickPointer=null;stick={x:0,y:0};$('joystickKnob').style.transform='translate(0px,0px)';};
const clearMovement=()=>{keys.clear();touch.clear();resetStick();};const releaseAll=()=>{actionPointer=null;clearMovement();held.clear();choiceBlockedKeys.clear();};
const clock=n=>`${String(Math.floor(Math.max(0,n)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,n)%60)).padStart(2,'0')}`;
const text=(id,value)=>{const e=$(id);if(e.textContent!==value)e.textContent=value;};
const hide=(id,value)=>{$(id).hidden=value;};
function screenInputToWorld(horizontal,vertical){return {x:-horizontal,z:vertical};}
function focusScene(){if(state.lesson){focusPanel('lessonCard');return;}canvas.focus({preventScroll:true});}
function focusPanel(id){if(id==='lessonCard'){$(state.lesson?.id==='serviceIntro'&&!$('demoWait').disabled?'demoWait':'lessonContinue').focus({preventScroll:true});return;}if(id==='decisionCard'){$('decisionTitle').focus({preventScroll:true});return;}if(id==='resultCard'){(!$('nextChapterButton').hidden?$('nextChapterButton'):$('replayButton')).focus({preventScroll:true});return;}$(id).querySelector('button')?.focus({preventScroll:true});}

function panelName(){if(!ready)return state.status==='briefing'?'brief':'error';if(state.status==='briefing')return 'brief';if(state.status==='paused')return 'pause';if(state.status==='finished')return 'result';if(state.recovery)return 'recovery';if(state.lesson)return 'lesson';if(state.dialog)return 'decision';return 'idle';}
function rememberLessons(){rememberedLessons=[...new Set([...rememberedLessons,...state.lessonSeen])];try{localStorage.setItem('cabin3d-lessons-v3',JSON.stringify(rememberedLessons));}catch{}}
function codexUnlockedCount(){return KNOWLEDGE.filter(c=>codex.unlockedIds.includes(c.id)).length;}
function captureLearning(){
 if(state.status==='finished'&&learningAwardRun!==state.runId){
  learningAwardRun=state.runId;newRewards=[];
  // Refresh the collection before comparing rewards, including cards earned in another tab.
  if(codexCanSave)try{const merged=prepareCodexSave(localStorage.getItem(CODEX_STORAGE_KEY),codex);codex=merged.codex;if(merged.raw===null)codexCanSave=false;}catch{codexCanSave=false;}
  const next=awardChapterCards(codex,state);newRewards=newlyEarnedCards(codex,next);codex=next;
  if(newRewards.length&&codexCanSave)try{const saved=prepareCodexSave(localStorage.getItem(CODEX_STORAGE_KEY),codex);codex=saved.codex;if(saved.raw===null)codexCanSave=false;else localStorage.setItem(CODEX_STORAGE_KEY,saved.raw);}catch{codexCanSave=false;}
 }
 text('codexCount',`${codexUnlockedCount()} / ${KNOWLEDGE.length}`);
}
function collectionFace(card,locked=false){
 const face=document.createElement('div');face.className='flight-card-face';
 const art=document.createElement('div'),img=document.createElement('img'),serial=document.createElement('span');art.className='flight-card-art';img.setAttribute('src',card.art+'?v=0.7.2');img.setAttribute('alt','');img.setAttribute('width','640');img.setAttribute('height','360');img.setAttribute('loading','lazy');serial.className='flight-card-number';serial.textContent=`NO. ${card.serial}`;art.append(img,serial);
 const copy=document.createElement('div'),kicker=document.createElement('small'),title=document.createElement('h3'),fact=document.createElement('p'),stamp=document.createElement('small');copy.className='flight-card-copy';kicker.className='flight-card-kicker';kicker.textContent=card.kicker;title.textContent=card.collectibleTitle;fact.textContent=locked?`在${card.chapters.map(id=>formatChapterLabel(getChapter(id))).join('或')}${card.unlockLabel}，正式通關後獲得。`:card.fact;stamp.className='flight-card-stamp';stamp.textContent=locked?'等待收藏':newRewards.some(c=>c.id===card.id)?'通關獎勵 · 已收藏':'飛行收藏 · 已收藏';copy.append(kicker,title,fact,stamp);face.append(art,copy);return face;
}
function renderCardRewards(){
 hide('cardRewards',!newRewards.length);$('resultCard').setAttribute('aria-describedby',newRewards.length?'rewardSummary cardRewardHint':'cardRewardHint');text('rewardSummary',`本次獲得 ${newRewards.length} 張收藏卡`);
 text('cardRewardHint',newRewards.length?'卡片已放進飛行收藏冊。':state.practice?'練習不發卡；完成任務並正式通關後，就能收藏。':canAwardChapterCards(state)?'這次完成任務的卡片都已收藏。':'完成任務並成功通關後，就能獲得收藏卡。');
 $('rewardCards').replaceChildren(...newRewards.map(card=>{
  const button=document.createElement('button'),img=document.createElement('img'),copy=document.createElement('span'),serial=document.createElement('small'),title=document.createElement('b');button.className='reward-card';img.setAttribute('src',card.art+'?v=0.7.2');img.setAttribute('alt','');img.setAttribute('width','640');img.setAttribute('height','360');serial.textContent=`NEW / ${card.serial}`;title.textContent=card.collectibleTitle;copy.append(serial,title);button.append(img,copy);button.addEventListener('click',()=>openCodex(button,card.id));return button;
 }));
}

function knowledgeContent(card){
 const content=document.createElement('div');content.className='knowledge-copy';
 const body=document.createElement('p'),badge=document.createElement('small'),origin=document.createElement('small');
 body.textContent=card.body;badge.className='knowledge-review';badge.textContent=card.reviewed?'已專業審閱':'待專業審閱';origin.textContent=`遇見章節：${card.chapters.map(id=>formatChapterLabel(getChapter(id))).join('、')}`;
 const note=document.createElement('p');note.className='source-note';note.textContent=card.sourceNote;
 content.append(body,badge,origin,note);
 for(const source of card.sources){const link=document.createElement('a');link.textContent=source.label;link.setAttribute('href',source.url);link.setAttribute('target','_blank');link.setAttribute('rel','noopener noreferrer');content.append(link);}
 return content;
}
function renderLearningResult(){
 if(learningResultRun===state.runId)return;learningResultRun=state.runId;retryCompleted.clear();renderCardRewards();renderRetryTasks();
 text('trainingScope',state.practice?'本次為不計分練習。以下依實際操作提供建議，並非正式考核結果。':'以下依本局操作提供練習建議，包含不計分教學；正式考核標準由訓練單位訂定。');
 const statusLabels={good:'做得好',improve:'需要改進',unobserved:'尚未評量'};
 $('trainingFeedbackList').replaceChildren(...trainingFeedback(state).map(item=>{
  const card=document.createElement('article'),heading=document.createElement('h4'),badge=document.createElement('span'),evidence=document.createElement('p');
  card.className='training-feedback-item';card.dataset.status=item.status;heading.textContent=item.title;badge.className='training-feedback-status';badge.textContent=statusLabels[item.status];heading.append(badge);evidence.className='training-feedback-evidence';evidence.textContent=item.evidence;card.append(heading,evidence);
  for(const [label,copy] of [['影響',item.impact],['下次怎麼練',item.advice]]){const line=document.createElement('p'),caption=document.createElement('strong'),body=document.createElement('span');caption.textContent=`${label}：`;body.textContent=copy;line.append(caption,body);card.append(line);}
  return card;
 }));

}
function renderRetryTasks(){
 const candidates=retryCandidates(state);
 text('retryPracticeHint',candidates.length?'從這局曾選錯的情境開始，不用整關重玩。這裡練的是同一道題。':'這局沒有選錯的題目；下次遇到錯題，就能在這裡直接重練。');
 $('retryTaskList').replaceChildren(...candidates.map(candidate=>{
  const button=document.createElement('button'),title=document.createElement('strong'),detail=document.createElement('small'),badge=document.createElement('span'),icon=document.createElement('span'),label=document.createElement('span');
  button.className='retry-task';title.textContent=`重練 · ${candidate.title}`;
  const mode={tutorial:'教學',practice:'不計分練習',formal:'正式挑戰'}[candidate.mode]||'本局';
  detail.textContent=`${mode}中曾選錯 ${candidate.previousIncorrect} 次`;
  badge.className='retry-complete';badge.hidden=true;icon.className='retry-complete-icon';icon.textContent='✓';icon.setAttribute('aria-hidden','true');label.textContent='已完成';badge.append(icon,label);
  button.append(title,detail,badge);updateRetryTask(button,retryCompleted.get(candidate.taskId));button.addEventListener('click',event=>openRetry(candidate.taskId,button,event));return button;
 }));
}
function updateRetryTask(button,incorrect){
 const complete=incorrect!==undefined;button.dataset.complete=String(complete);button.children[2].hidden=!complete;
 if(complete)button.children[1].textContent=`原題重練完成 · 這次選錯 ${incorrect} 次`;
}
function openRetry(taskId,trigger,event={}){
 if(!ready||state.status!=='finished'||codexOpen||retrySession||codexExitKeys.size)return;
 const candidate=retryCandidates(state).find(c=>c.taskId===taskId);if(!candidate)return;
 retrySession=createRetry(candidate);retryOrigin=trigger;retryInputBlocked=!event.detail;
 clearMovement();hide('retryOverlay',false);$('resultOverlay').inert=true;renderRetry();$('retryTitle').focus({preventScroll:true});
}
function renderRetry(){
 if(!retrySession)return;
 const session=retrySession,d=session.decision,comparison=retryComparison(session);
 text('retryTitle',retryPrompt(session));text('retryQuote',`旅客：「${d.quote}」`);text('retryContext',d.description);
 const evidence=session.boarding?boardingEvidence(d.task):[];
 hide('retryEvidence',!evidence.length);$('retryEvidence').replaceChildren(...createBoardingEvidence(document,evidence));
 hide('retryReference',!evidence.some(item=>item.kind==='pass'));
 hide('retryQuestion',session.complete);hide('retryComparison',!session.complete);hide('retryReturn',!session.complete);
 hide('retryFeedback',!session.feedback);text('retryFeedback',session.complete?`答對了。${session.feedback}`:`${session.feedback} 看清線索，再選一次。`);
 $('retryFeedback').dataset.correct=String(session.complete);
 if(comparison){text('retryBefore',comparison.before);text('retryAfter',comparison.after);text('retryComparisonNote',comparison.note);}
 // Keep the order stable while retrying, so feedback never moves a choice.
 if(!session.attempts)$('retryChoices').replaceChildren(...d.choices.map((choice,index)=>{
  const button=document.createElement('button'),number=document.createElement('b'),label=document.createElement('span');
  button.className='choice';number.textContent=String(index+1);label.textContent=choice.label;button.append(number,label);
  button.addEventListener('click',event=>selectRetry(index,event));return button;
 }));
}
function selectRetry(index,event={}){
 if(!retrySession||!event.detail&&retryInputBlocked||!answerRetry(retrySession,index))return;
 retryInputBlocked=true;renderRetry();
 if(retrySession.complete){retryCompleted.set(retrySession.taskId,retrySession.incorrect);$('retryComparisonTitle').focus({preventScroll:true});}
 else $('retryFeedback').focus({preventScroll:true});
}
function closeRetry(){
 if(!retrySession)return;
 for(const key of held)if(['Enter','NumpadEnter','Space'].includes(key))codexExitKeys.add(key);
 const trigger=retryOrigin,incorrect=retryCompleted.get(retrySession.taskId);
 retrySession=null;retryOrigin=null;hide('retryOverlay',true);$('resultOverlay').inert=false;clearMovement();
 if(trigger)updateRetryTask(trigger,incorrect);
 trigger?.focus({preventScroll:true});
}
$('closeRetry').addEventListener('click',event=>{if(event.detail||!retryInputBlocked)closeRetry();});
$('retryReturn').addEventListener('click',event=>{if(event.detail||!retryInputBlocked)closeRetry();});
$('retryAgain').addEventListener('click',event=>{
 if(!retrySession||!retrySession.complete||!event.detail&&retryInputBlocked)return;
 retrySession=createRetry(retrySession);retryInputBlocked=true;renderRetry();$('retryTitle').focus({preventScroll:true});
});
function handleRetryKey(event){
 const code=physical(event),wasHeld=held.has(code);held.add(code);
 if((event.repeat||wasHeld)&&['Escape','Tab','Enter','NumpadEnter','Space','Digit1','Digit2','Digit3','Numpad1','Numpad2','Numpad3'].includes(code)){event.preventDefault();return;}
 if(['Enter','NumpadEnter','Space'].includes(code)||/^(Digit|Numpad)[123]$/.test(code))retryInputBlocked=false;
 if(code==='Escape'){event.preventDefault();closeRetry();}
 else if(code==='Tab'){
  const controls=modalControls('retryOverlay'),index=controls.indexOf(document.activeElement);event.preventDefault();
  (controls[index<0?(event.shiftKey?controls.length-1:0):(index+(event.shiftKey?-1:1)+controls.length)%controls.length]||$('closeRetry')).focus();
 }else if(/^(Digit|Numpad)[123]$/.test(code)){event.preventDefault();selectRetry(Number(code.slice(-1))-1);}
}
function openCodex(trigger,selectedCardId=null){
 if(codexOpen||retrySession||codexExitKeys.size||!['briefing','finished'].includes(state.status))return;codexOpen=true;codexReturn=trigger;releaseAll();captureLearning();let selectedEntry=null;
 text('codexProgress',`已收藏 ${codexUnlockedCount()} / ${KNOWLEDGE.length}`);text('codexStorage',codexCanSave?'收藏保存在這個瀏覽器。':'目前僅在本次遊戲保留；既有或新版資料不會被覆寫。');
 $('codexContent').replaceChildren(...[...new Set(KNOWLEDGE.map(c=>c.category))].map(category=>{
  const group=document.createElement('section'),heading=document.createElement('h3'),shelf=document.createElement('div');heading.textContent=category;shelf.className='collection-grid';group.append(heading,shelf);
  for(const card of KNOWLEDGE.filter(c=>c.category===category)){
   const unlocked=codex.unlockedIds.includes(card.id),entry=document.createElement('article');entry.className=unlocked?'collection-card':'collection-card locked';entry.append(collectionFace(card,!unlocked));
   if(unlocked){const reference=document.createElement('details'),summary=document.createElement('summary'),sources=document.createElement('div');reference.className='card-reference';summary.textContent='小知識來源與任務解說';summary.setAttribute('aria-label',`${card.collectibleTitle}：小知識來源與任務解說`);sources.className='fact-sources';const label=document.createElement('small');label.textContent='小知識參考資料';sources.append(label);for(const source of card.factSources){const link=document.createElement('a');link.textContent=source.label;link.setAttribute('href',source.url);link.setAttribute('target','_blank');link.setAttribute('rel','noopener noreferrer');sources.append(link);}reference.append(summary,sources,knowledgeContent(card));entry.append(reference);}
   if(card.id===selectedCardId&&unlocked){selectedEntry=entry;entry.className+=' just-earned';}shelf.append(entry);
  }return group;
 }));
 hide('codexOverlay',false);$('resultOverlay').inert=true;$('gameSurface').inert=true;(selectedEntry?.querySelector('summary')||$('closeCodex')).focus({preventScroll:true});selectedEntry?.scrollIntoView({block:'start'});
}

function modalControls(id){return [...$(id).querySelectorAll('button,summary,a')].filter(el=>{
 if(el.disabled||!el.getClientRects().length)return false;
 // Closed details can retain layout rectangles for their skipped content.
 for(let p=el.parentNode;p&&p!==$(id);p=p.parentNode){if(p.hidden)return false;if(p.tagName==='DETAILS'&&!p.open&&p.querySelector('summary')!==el)return false;}
 return true;
});}
function codexControls(){return modalControls('codexOverlay');}
function closeCodex(){if(!codexOpen)return;for(const key of held)if(['Enter','NumpadEnter','Space'].includes(key))codexExitKeys.add(key);codexOpen=false;hide('codexOverlay',true);$('resultOverlay').inert=false;$('gameSurface').inert=state.status==='finished';releaseAll();codexReturn?.focus({preventScroll:true});codexReturn=null;}
$('codexButton').addEventListener('click',()=>openCodex($('codexButton')));$('resultCodexButton').addEventListener('click',()=>openCodex($('resultCodexButton')));$('closeCodex').addEventListener('click',closeCodex);
function saveCampaign(){if(!campaignStorageAvailable)return;try{const saved=prepareCampaignSave(localStorage.getItem(CAMPAIGN_STORAGE_KEY),campaign);campaign=saved.campaign;if(saved.raw===null){campaignStorageAvailable=false;return;}localStorage.setItem(CAMPAIGN_STORAGE_KEY,saved.raw);}catch{campaignStorageAvailable=false;}}
function selectChapter(id){
 if(codexOpen||!ready||state.status!=='briefing'||!getChapter(id)?.available||!campaign.unlockedChapterIds.includes(id))return false;
 if(id===campaign.currentChapterId)return true;
 campaign=selectCampaignChapter(campaign,id);saveCampaign();fresh(false,false);return true;
}
function renderChapterMenu(){
 const signature=JSON.stringify([ready,campaign,campaignStorageAvailable]);if(signature===chapterMenuSignature)return;chapterMenuSignature=signature;
 const current=getChapter(campaign.currentChapterId);text('chapterPickerSelection',`：${formatChapterLabel(current)}`);
 hide('chapterMenuHint',campaignStorageAvailable);
 $('chapterList').replaceChildren(...CHAPTERS.map(chapter=>{
  const unlocked=campaign.unlockedChapterIds.includes(chapter.id),available=chapter.available&&unlocked,b=document.createElement('button');
  b.className='chapter-option';b.dataset.chapter=chapter.id;b.disabled=!ready||!available;b.setAttribute('aria-pressed',String(chapter.id===current.id));
  const label=document.createElement('span'),detail=document.createElement('small');label.textContent=formatChapterLabel(chapter);
  detail.textContent=(chapter.id===current.id?'✓ 已選取 · ':'')+(!chapter.available?'製作中':!unlocked?'完成前章後解鎖':campaign.bestStars[chapter.id]?`最佳 ${'★'.repeat(campaign.bestStars[chapter.id])}${'☆'.repeat(3-campaign.bestStars[chapter.id])}`:'可遊玩');
  if(!available){const icon=document.createElement('img');icon.alt='';icon.setAttribute('aria-hidden','true');icon.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z" fill="none" stroke="#abc1bd" stroke-width="2"/></svg>');b.append(icon);}
  b.append(label,detail);b.addEventListener('click',()=>selectChapter(chapter.id));return b;
 }));
}
function fail(error){closeRetry();closeCodex();for(const id of ['resultOverlay','missionHud','lessonOverlay','recoveryOverlay','timeWarning','speechBubble'])hide(id,true);hide('aisleAlert',true);document.body.dataset.aisleAlert='false';text('aisleAlertTitle','');audio.dispose();ready=false;releaseAll();pause(state);hide('loading',true);hide('briefCard',true);hide('webglError',false);hide('decisionCard',true);hide('lessonCard',true);hide('pauseCard',true);hide('awayOverlay',true);$('gameSurface').inert=false;hide('resultCard',true);for(const id of ['startButton','practiceButton','interactButton','pauseButton','cameraButton','infoButton'])$(id).disabled=true;document.body.dataset.panel='error';text('sceneStatus','3D 顯示未能啟動');text('feedback','請使用支援 WebGL 2 的瀏覽器，確認圖形加速可用後重新載入。');console.error('Cabin 3D could not start:',error?.message||error);}
function renderChoices(){const d=state.dialog;if(!d)return;const hidePolicyHint=state.phase==='final-cabin-check'&&!state.practice&&state.tasks.some(t=>t.id===d.id&&t.kind==='service');text('decisionDescription',d.recoveryFeedback||(hidePolicyHint?'':d.description));$('decisionDescription').dataset.kind=d.recoveryFeedback?'warning':'normal';hide('decisionDescription',!d.recoveryFeedback&&(hidePolicyHint||!!state.boarding&&['guide','seat','bag','family'].includes(d.id)));const signature=state.decisionSerial+':'+d.id+':'+(state.boarding?.coach?.examined.join(',')||'');if(signature===dialogSignature)return;dialogSignature=signature;const task=state.tasks.find(t=>t.id===d.id);text('decisionTitle',d.title);$('choices').dataset.count=String(d.choices.length);const evidence=state.boarding?boardingEvidence(task):[];hide('evidenceCards',!evidence.length);$('evidenceCards').replaceChildren(...createBoardingEvidence(document,evidence,{interactive:d.id==='guide'&&!!state.boarding?.coach,examined:state.boarding?.coach?.examined||[],onInspect:inspectEvidence}));hide('flightReference',!evidence.some(e=>e.kind==='pass'));text('decisionQuote',`「${d.quote}」`);$('choices').replaceChildren(...d.choices.map((c,index)=>{const b=document.createElement('button');b.className='choice';b.disabled=d.id==='guide'&&!!state.boarding?.coach&&state.boarding.coach.examined.length<2;b.setAttribute('aria-disabled',String(b.disabled));b.dataset.choice=String(index);const n=document.createElement('b'),copy=document.createElement('span'),label=document.createElement('span'),tags=document.createElement('small');n.textContent=String(index+1);copy.className='choice-copy';label.textContent=c.label;tags.className='choice-tags';for(const t of c.tags){const tag=document.createElement('span');tag.textContent=t;tags.append(tag);}copy.append(label,tags);b.append(n,copy);b.addEventListener('click',event=>selectChoice(index,event));return b;}));}
function refresh(force=false){captureLearning();const c=counts(state),totalSafety=state.tasks.filter(t=>t.kind==='safety').length,totalService=state.tasks.filter(t=>t.kind==='service').length,panel=panelName(),signature=[state.boarding?.tutorialStep,state.boarding?.formal,state.boarding?.standing,state.boarding?.blockedStanding,state.boarding?.congestionTime.toFixed(1),state.boarding?.actors.filter(a=>['seated','exited'].includes(a.status)).length,ready,panel,pauseReason,infoOpen,state.near,state.dialog?.id,state.decisionSerial,state.dialog?.retrySerial,state.lesson?.id,state.feedback,state.feedbackKind,state.cameraMode,state.elapsed.toFixed(1),state.player.x.toFixed(1),state.player.z.toFixed(1),state.mistakes,state.safetyErrors,state.handoffTokens,state.handoffJob?.remaining.toFixed(1),state.recovery?.ready,state.action?.kind,Math.ceil(state.action?.time||0),...state.tasks.map(t=>[t.active,t.done,t.deferred,t.assigned,t.late,t.warned,t.patience].join(',')),c.hazards].join('|');if(!force&&signature===uiSignature)return;uiSignature=signature;document.body.dataset.panel=panel;document.body.dataset.decisionKind=state.tasks.find(t=>t.id===state.dialog?.id)?.kind||'none';syncPresentation();
 hide('briefCard',panel!=='brief');hide('decisionCard',panel!=='decision');hide('lessonCard',panel!=='lesson');hide('lessonOverlay',panel!=='lesson');hide('pauseCard',panel!=='pause'||pauseReason==='focus');hide('awayOverlay',panel!=='pause');hide('focusPauseCard',pauseReason!=='focus');$('awayOverlay').setAttribute('aria-labelledby',pauseReason==='focus'?'awayTitle':'pauseTitle');$('awayOverlay').setAttribute('aria-describedby',pauseReason==='focus'?'awayCopy':'pauseCopy');$('gameSurface').inert=codexOpen||panel==='pause'||panel==='recovery'||panel==='lesson'||panel==='result';hide('recoveryOverlay',panel!=='recovery');if(state.recovery){text('recoveryFoot',(state.practice||state.boarding&&!state.boarding.formal)?'教學與練習可安心重試，不記錄失誤。':'這段說明讀完再繼續，失誤紀錄會保留。');text('recoveryCopy',state.recovery.copy);text('recoveryCost',(state.practice||state.boarding&&!state.boarding.formal)?'教學與練習不扣分，可以重新選擇。':state.recovery.ready?'修正完成。這次失誤仍保留，閱讀期間倒數暫停。':'正在修正這次處理，計入 2 秒行動時間。');$('recoveryContinue').setAttribute('aria-disabled',String(!state.recovery.ready));$('recoveryProgress').value=state.action?.time||2;hide('recoveryProgress',state.recovery.ready);}hide('rulesPanel',!infoOpen);$('infoButton').setAttribute('aria-expanded',String(panel==='pause'&&infoOpen));text('pauseTitle',infoOpen?'巡艙說明':'巡艙暫停中');$('pauseInfoButton').setAttribute('aria-expanded',String(infoOpen));text('awayResumeButton',pauseReturn==='manual'?'返回暫停畫面':'繼續巡艙');hide('resultCard',panel!=='result');hide('resultOverlay',panel!=='result');hide('missionHud',!['idle','decision'].includes(panel));hide('idleCard',['decision','lesson','pause','result','recovery'].includes(panel));

 const chapter=getChapter(state.chapterId||DEFAULT_CHAPTER_ID);text('chapterLabel',`第 ${chapter.order} 章`);text('chapterTag',`${chapter.code} / ${String(chapter.order).padStart(2,'0')}`);text('briefChapter',formatChapterLabel(chapter));text('briefTitle',chapter.briefTitle);if(ready)text('startButton',state.boarding?'開始正式登機 →':'開始正式巡艙 →');text('briefDescription',chapter.briefDescription);text('briefTiming',`↑↓←→ / WASD 依螢幕方向移動\n${chapter.phase==='final-cabin-check'?'思考與執行持續倒數':'閱讀暫停倒數'} · ${chapter.duration} 秒行動時間`);if(panel==='brief')renderChapterMenu();
 text('modeLabel',state.practice?'不計時練習':chapter.phaseLabel);text('safetyCount',`${c.safety} / ${totalSafety}`);text('serviceCount',`${c.service} / ${totalService}`);text('serviceCountLabel',state.phase==='final-cabin-check'?'需求記錄':'服務');hide('handoffCount',chapter.handoffTokens===0);text('handoffs',`${state.handoffTokens} / ${chapter.handoffTokens}`);text('clock',state.boarding&&!state.boarding.formal?'教學':state.practice?'練習':clock(Math.ceil(state.duration-state.elapsed)));$('clock').classList.toggle('urgent',!state.practice&&state.duration-state.elapsed<=30);
 text('sceneStatus',panel==='brief'?'準備巡艙':panel==='pause'?'已暫停':panel==='decision'?(state.phase==='final-cabin-check'&&!state.practice?'判斷中 · 持續倒數':'閱讀不計時'):panel==='lesson'?'首次說明 · 不扣時':panel==='result'?'本輪講評':state.action?'處理中':state.cameraMode==='overview'?'全艙總覽 · 找任務與路線':'巡艙跟隨 · 看眼前物件');
 text('safetyScore',String(Math.round(state.safety)));text('comfortScore',String(Math.round(state.comfort)));text('mistakes',String(state.safetyErrors));hide('boardingTraffic',!state.boarding);if(state.boarding){const b=state.boarding,seated=b.actors.filter(a=>['seated','exited'].includes(a.status)).length;text('boardingTraffic',`入座／核對完成 ${seated}/${b.actors.length} · 走道 ${b.standing} 人${b.blockedStanding>3?` · 停滯 ${b.blockedStanding} 人 · 擁擠 ${b.congestionTime.toFixed(0)} 秒`:''}`);}text('chapterRules',state.boarding?'登機教學不倒數，完成四步後另計 90 秒。紅色先處理安全，綠色是服務，本章沒有交接。核對兩份登機證，所有旅客就座、走道淨空後回前方回報。走道超過 3 人停滯持續 8 秒會記安全事件；靠座位間的空隙禮讓通行。':'');hide('chapterRules',!state.boarding);hide('preflightRules',!!state.boarding);text('assessment',state.practice?'練習不倒數、不扣分；完成後可回選單正式巡艙。':state.safetyErrors>=2?'本輪需重試，仍可完成補救練習。':state.safetyErrors===1?'已有一次安全修正，完成後保留補救評價。':'紅色安全優先；可先回應綠色需求。');
 const warnings=state.tasks.filter(t=>t.active&&!t.done&&!t.assigned&&t.warned&&!t.late);
 const hazards=state.hazards.filter(h=>!h.done),nearestHazard=hazards.find(h=>h.id===state.action?.hazardId)||hazards.reduce((nearest,h)=>!nearest||Math.hypot(h.x-state.player.x,h.z-state.player.z)<Math.hypot(nearest.x-state.player.x,nearest.z-state.player.z)?h:nearest,null);
 const boardingCrowded=!!(state.boarding?.formal&&state.boarding.blockedStanding>3);
 const showAisleAlert=ready&&(!!nearestHazard||boardingCrowded)&&['playing','paused'].includes(state.status)&&!(panel==='pause'&&pauseReason==='focus');
 const timer=countdownPresentation(state);hide('timeWarning',!timer.visible||!(panel==='idle'||panel==='decision'&&state.phase==='final-cabin-check'&&!state.practice));$('timeWarning').dataset.level=timer.level;if(timer.visible){text('timeWarningTitle',timer.title);text('timeWarningCopy',timer.copy);}$('clock').classList.toggle('critical',!state.practice&&timer.seconds<=10);
 hide('aisleAlert',!showAisleAlert);document.body.dataset.aisleAlert=String(showAisleAlert);
 if(showAisleAlert&&boardingCrowded&&!nearestHazard){text('aisleAlertTitle','登機走道擁擠');text('aisleAlertDirection',state.status==='paused'?'已暫停 · 繼續後讓人流入座':`${state.tasks.find(t=>t.id==='seat')?.done?(state.tasks.every(t=>t.done)?'需求已處理，退回前方、讓旅客繼續入座。':'座位已核對，接著協助家長；完成後退回前方。'):'先核對紅色座位問題，再協助家長。'}靠座位間的空隙禮讓通行。${state.boarding.congestionLatched?'本次擁擠已記錄，勿再讓隊伍停住。':`持續 8 秒會記一次安全事件（目前 ${state.boarding.congestionTime.toFixed(0)} 秒）。`}`);}
 else if(showAisleAlert){
  text('aisleAlertTitle',`走道受阻 · ${hazards.length} 件待處理`);
  const dx=nearestHazard.x-state.player.x,dz=nearestHazard.z-state.player.z,close=Math.hypot(dx,dz)<=1.1,busy=!!(state.action||state.dialog||state.lesson);
  const near=state.status==='playing'&&state.near===nearestHazard.id&&!busy;
  const direction=Math.abs(dz)>=Math.abs(dx)?dz>=0?'↑ 往畫面上方':'↓ 往畫面下方':dx>=0?'← 往畫面左方':'→ 往畫面右方';
  const hint=state.status==='paused'?'巡艙已暫停 · 繼續後處理紅圈':state.action?.kind==='clear-hazard'&&state.action.hazardId===nearestHazard.id?'正在引導旅客回座，請稍候…':busy?'完成目前互動後前往紅圈':near?'已靠近紅圈 · 按空白鍵 或點互動，引導旅客回座':close?'紅圈就在附近 · 再靠近一點確認互動目標':`${direction}靠近紅圈 · ${locationText(nearestHazard)}`;
  text('aisleAlertDirection',hint);
 }else text('aisleAlertTitle','');
 hide('guidance',panel!=='idle'||showAisleAlert&&!state.action);
 text('objective',state.action?.kind==='clear-hazard'?'正在引導旅客回座…':chapterReady(state)?(state.phase==='final-cabin-check'?'安全檢查完成，回前方金色圈回報客艙安全。':'全部完成，回前方金色圈按空白鍵 回報。'):c.hazards?`走道事件 ${c.hazards} 件：靠近紅圈恢復走道。`:warnings.length?`${warnings.map(t=>t.title).join('、')} 等候快到期，請安排回應。`:'觀察眼前線索，再協助旅客。');
 text('feedback',state.action?.interaction?(state.action.interaction.steps[state.action.interaction.index].mode==='hold'?'按住 空白鍵／互動，進入綠色區域就放開。可重試，不扣判斷分。':'點按空白鍵／互動，完成眼前這一步。'):panel==='brief'?'選正式巡艙，或先不計時練習。':state.action?.kind==='correction'?state.action.choice.feedback:state.feedback);$('feedback').dataset.kind=state.action?.kind==='correction'?'warning':state.feedbackKind;
 if(state.boarding){text('idleTitle',state.boarding.formal?'讓人流順暢入座。':'跟著一步一步來。');if(!state.boarding.formal){text('objective',`登機教學 ${state.boarding.tutorialStep+1} / 4 · 不扣時`);if(!state.dialog&&!state.action)text('feedback',BOARDING_TUTORIAL[state.boarding.tutorialStep]);}else if(!chapterReady(state)&&state.tasks.every(t=>t.done))text('objective','處理完成，請禮讓走道，等旅客入座後回前方回報。');}else text('idleTitle','觀察，然後靠近。');
 const target=targets(state).find(t=>t.id===state.near&&(t.id!=='report'||chapterReady(state))),interaction=state.action?.interaction,step=interaction?.steps[interaction.index];text('interactLabel',step?(step.mode==='hold'?(interaction.held?'綠區放開':'按住操作'):'點按操作'):state.action?(state.action.kind==='correction'?'修正中…':'執行中…'):target?target.kind==='hazard'?'恢復走道':target.id==='report'?'回報巡艙':target.label:'進入圈內互動');hide('interactButton',state.action?.kind==='clear-hazard'||!target&&!state.action||panel!=='idle');$('interactButton').classList.toggle('near',!!target&&panel==='idle'&&!state.action);$('interactButton').disabled=!ready||state.status!=='playing'||!!state.dialog||!!state.lesson||state.contextual&&!!state.action;
 $('pauseButton').disabled=!ready||!['playing','paused'].includes(state.status);text('pauseButton',state.status==='paused'?'繼續巡艙':'暫停');$('infoButton').disabled=!ready||!['playing','paused'].includes(state.status);$('cameraButton').disabled=!ready;$('cameraButton').setAttribute('aria-pressed',String(state.cameraMode==='overview'));text('cameraButton',state.cameraMode==='overview'?'全艙總覽':'跟隨鏡頭');$('cameraButton').setAttribute('aria-label',state.cameraMode==='overview'?'全艙總覽':'跟隨鏡頭');
 hide('holdMeter',!interaction||step.mode!=='hold');hide('actionBox',!state.action||state.action?.kind==='clear-hazard'&&state.contextual);if(state.action){const names={task:'協助旅客',handoff:state.phase==='final-cabin-check'?'交接起飛後需求紀錄':'安排交接',wait:state.phase==='final-cabin-check'?'記錄起飛後需求':'說明等候',correction:'修正回饋', 'clear-hazard':'恢復走道'};text('actionLabel',interaction?`${interaction.index+1}/${interaction.steps.length} · ${step.label}${interaction.retry?' · 再試一次':''}`:state.contextual?(state.action.kind==='task'?(state.action.choice?.id==='check'?'正在確認收妥狀態':{guide:'正在指引長輩入座',seat:'正在核對登機證',family:'正在協助家長入座',bag:'正在收妥行李',belt:'正在協助扣好安全帶',tray:'正在收妥餐桌',water:'正在送水',blanket:'正在遞送毯子',question:'正在回覆旅客'}[state.action.taskId]):names[state.action.kind]||'正在處理'):`${names[state.action.kind]||'處理中'} · ${Math.ceil(state.action.duration-state.action.time)} 秒`);hide('holdMeter',!interaction||step.mode!=='hold');$('holdFill').style.width=`${Math.min(100,(interaction?.fill||0)/1.2*100)}%`;}
 const colleague=coworkerPresentation(state),delegatedTask=state.tasks.find(t=>t.id===colleague.taskId);
 hide('coworkerHandoff',!delegatedTask&&state.action?.kind!=='handoff');if(state.action?.kind==='handoff'){text('coworkerStatus','正在聯繫同事…');text('coworkerDetail','指向旅客並交代需求');$('coworkerProgress').value=0;}
 if(delegatedTask){text('coworkerStatus',`同事 · ${delegatedTask.deferred?'記錄需求':delegatedTask.id==='water'?'送水':'送毯子'} · ${COWORKER_PHASE_LABELS[colleague.phase]}`);text('coworkerDetail',`${locationText(delegatedTask)}${delegatedTask.deferred?' · 起飛後協助':state.handoffJob?' · 可繼續巡艙':' · 交接完成'}`);$('coworkerProgress').value=colleague.progress;}
 text('taskSummary',`${c.pending+c.hazards} 待辦`);const items=[...state.hazards.filter(h=>!h.done).map(h=>({...h,kind:'hazard',title:'恢復走道',active:true})),...state.tasks.filter(t=>t.active).sort((a,b)=>Number(a.done)-Number(b.done)||a.row-b.row)];$('taskList').replaceChildren(...items.map(t=>{const row=document.createElement('div');row.className=`task-row ${t.kind}${t.done?' done':''}${state.near===t.id?' near':''}`;const name=document.createElement('b'),meta=document.createElement('small'),time=document.createElement('span');name.textContent=`${t.kind==='safety'||t.kind==='hazard'?'安全':'服務'} · ${locationText(t)} ${t.title}`;meta.textContent=t.done?(t.deferred?(t.handoff?'同事已記錄 · 起飛後協助':'已記錄 · 起飛後協助'):t.handoff?'同事已完成':'已完成'):t.assigned?'同事處理中':t.kind==='hazard'?'靠近紅圈按空白鍵':t.warned&&!t.late?'等候即將到期':t.late?'旅客仍需要服務':'觀察現場再處理';time.textContent=t.done?'✓':t.assigned?`${Math.ceil(state.handoffJob?.remaining||0)}秒`:t.kind==='service'&&state.boarding&&!state.boarding.formal?'教學不計時':t.kind==='service'?`耐心 ${Math.max(0,Math.ceil(t.patience-state.elapsed+t.spawn))} 秒`:'!';row.append(name,meta,time);return row;}));
 if(panel==='decision')renderChoices();renderServiceDemo();renderBoardingCoach(panel);if(panel==='lesson'){text('lessonTitle',state.lesson.title);text('lessonCopy',state.lesson.id==='boardingReady'&&state.practice?'先處理安全，再照顧服務需求。有人通過時，橫移讓出走道。全部完成、旅客入座後，回前方回報。':state.lesson.copy);}
 if(panel==='result'){const summary=summarizeResult(state);const success=!!summary.record;$('resultCard').dataset.outcome=success?'success':state.practice?'practice':'retry';hide('resultCelebration',!success);text('resultEmblem',success?'✓':state.practice?'✦':'↻');text('resultKicker',success?'CHAPTER COMPLETE':state.practice?'PRACTICE COMPLETE':'NEXT FLIGHT');text('resultChapter',`第 ${chapter.order} 章 · ${chapter.title}`);text('resultStars',summary.stars===null?'不計星等':`${'★'.repeat(summary.stars)}${'☆'.repeat(3-summary.stars)} · ${summary.stars} / 3`);if(resultRun!==state.runId){resultRun=state.runId;const next=selectBest(best,summary.record);if(state.chapterId==='preflight'&&next!==best){best=next;try{localStorage.setItem(BEST_STORAGE_KEY,JSON.stringify(best));}catch{}}if(!state.practice&&summary.record){const elder=state.tasks.find(t=>t.characterId==='elder'&&t.done);if(elder&&state.chapterId==='boarding'&&state.endReason==='complete'&&summary.stars>=1)campaign=updateCharacterMemory(campaign,'elder',{helped:true,mistakes:(campaign.characterMemory.elder?.mistakes||0)+elder.mistakes});campaign=recordChapterResult(campaign,{chapterId:state.chapterId,complete:state.endReason==='complete',practice:state.practice,stars:summary.stars});saveCampaign();}}text('bestRecord',state.boarding?(campaign.bestStars.boarding?`本章最佳紀錄 · ${campaign.bestStars.boarding} 星`:'本章尚無正式紀錄'):best?`此瀏覽器最佳紀錄 · ${best.stars} 星 · 服務 ${Math.round(best.comfort)} · ${clock(best.elapsed)}`:'此瀏覽器尚無正式紀錄');text('resultTitle',success?(state.safetyErrors?'完成補救，準備下一段。':'這一程，完成了！'):summary.title);const next=CHAPTERS.find(c=>c.order===chapter.order+1);hide('nextChapterButton',state.practice||!summary.record||!next?.available||!campaign.unlockedChapterIds.includes(next.id));text('nextChapterButton',next?`下一章 · ${next.title} →`:'');$('replayButton').classList.toggle('primary',$('nextChapterButton').hidden);$('replayButton').classList.toggle('secondary',!$('nextChapterButton').hidden);text('resultCopy',state.practice?`練習沒有倒數或扣分。可以回選單挑戰第 ${chapter.order} 章「${chapter.title}」。`:state.grade==='incomplete'?(state.phase==='final-cabin-check'?'行動時間用完。安全檢查、走道淨空及客艙安全回報都需要完成。':'行動時間用完。檢查、服務、走道及回前方回報都需要完成。'):state.safetyErrors>=2?'本輪有至少兩次安全失誤；服務分數不能抵銷安全紀錄。':state.safetyErrors?'完成了補救，評價不會回到零失誤。':state.boarding?'旅客已就座、走道淨空，登機回報完成。':state.phase==='final-cabin-check'?'安全確認完成、走道淨空，客艙安全回報已送出。':'安全檢查與服務完成，巡艙回報已送出。');text('resultDetails',`檢查 ${c.safety}/${totalSafety} · ${state.phase==='final-cabin-check'?'需求已記錄':'服務'} ${c.service}/${totalService} · 安全失誤 ${state.safetyErrors} · 用時 ${clock(state.elapsed)}${c.hazards?` · 未清走道 ${c.hazards}`:''}`);}
 if(panel==='result')renderLearningResult();positionChecklist();
 if(panel!==panelPrevious||panel==='pause'&&pauseReason==='focus'&&document.activeElement!==$('awayResumeButton')){actionPointer=null;clearMovement();if(panel==='lesson'){lessonArmed=held.size===0;suppressInheritedLessonClick=held.has('Space')||held.has('Enter')||held.has('NumpadEnter');focusPanel('lessonCard');}else if(panel==='recovery')$('recoveryTitle').focus({preventScroll:true});else if(panel==='decision')focusPanel('decisionCard');else if(panel==='pause')$(pauseReason==='focus'?'awayResumeButton':'resumeButton').focus({preventScroll:true});else if(panel==='result')focusPanel('resultCard');else if(panel==='idle'&&panelPrevious&&panelPrevious!=='brief')focusScene();panelPrevious=panel;}
}
function begin(practice=false){if(codexOpen||!ready||state.status!=='briefing')return;unlockAudio();audio.reset(state.runId);state.practice=practice;start(state);releaseAll();refresh(true);if(state.lesson)focusPanel('lessonCard');else focusScene();}
function fresh(practice=state.practice,autostart=true){if(codexOpen||retrySession||!ready)return;newRewards=[];$('rewardCards').replaceChildren();pauseReason='manual';pauseReturn='playing';infoOpen=false;$('pauseOptions').open=false;suppressAwayClick=false;resumeBlockedKeys.clear();const camera=state.cameraMode;state=createState({chapterId:campaign.currentChapterId,characterMemory:campaign.characterMemory,handsOn:true,contextual:true,guidedBoarding:true,practice,seed:Math.floor(Math.random()*1e9)});state.cameraMode=camera;state.reducedMotion=motion.matches;state.lessonSeen=rememberedLessons.filter(x=>getChapter(state.chapterId).tutorial.includes(x));dialogSignature='';suppressInheritedChoiceClick=false;releaseAll();audio.reset(state.runId);audioCursor=null;previousAction=null;if(autostart){unlockAudio();start(state);}refresh(true);if(autostart){if(state.lesson)focusPanel('lessonCard');else focusScene();}}

function performInteraction(){if(state.recovery)return;if(!ready||state.near==='report'&&!chapterReady(state))return;if(state.action?.interaction){actionInput(state,state.action.interaction.held?'release':'press');refresh(true);return;}clearMovement();if(interact(state)&&state.dialog){choiceBlockedKeys.clear();suppressInheritedChoiceClick=held.has('Space');}refresh(true);}
function selectChoice(index,event={}){
 if(state.recovery)return;if(!ready||(event.code?choiceBlockedKeys.has(event.code):!event.detail&&suppressInheritedChoiceClick)||!choose(state,index))return;
 if(state.dialog?.recoveryFeedback){
  for(const code of held)if(/^(Digit|Numpad)[123]$/.test(code)||['Space','Enter','NumpadEnter'].includes(code))choiceBlockedKeys.add(code);
  suppressInheritedChoiceClick=held.has('Space')||held.has('Enter')||held.has('NumpadEnter');
 }else{choiceBlockedKeys.clear();suppressInheritedChoiceClick=false;}
 clearMovement();refresh(true);if(!state.lesson&&!state.dialog&&!state.recovery)focusScene();
}
function inspectEvidence(kind,event={}){
 if(!event.detail&&suppressInheritedChoiceClick)return;
 if(inspectBoardingClue(state,kind)){
  if(!event.detail)suppressInheritedChoiceClick=true;
  refresh(true);const unseen=['pass','map'].find(k=>!state.boarding.coach.examined.includes(k));const next=unseen?Array.from($('evidenceCards').children).find(n=>n.dataset.inspect===unseen):$('inspectionCue');next?.focus({preventScroll:true});
 }
}
function renderBoardingCoach(panel){
 const coach=boardingCoach(state);$('boardingCoach').dataset.step=coach?.step||'';document.body.dataset.coachStep=coach?.step||'';document.body.dataset.boardingTeaching=String(!!state.boarding?.coach&&!state.boarding.formal);
 hide('boardingCoach',!coach||panel!=='idle');hide('inspectionCue',!coach||panel!=='decision'||state.dialog?.id!=='guide');
 hide('boardingBrief',state.lesson?.id!=='boardingReady');hide('boardingWelcomeArt',state.lesson?.id!=='boardingWelcome');
 if(coach){text('coachStep',`${coach.progress} / 5`);text('coachTitle',coach.title);text('coachInput',coach.step==='move'?(phone.matches?'拖曳左下搖桿':'WASD ／ ↑ ↓ ← →'):coach.step==='bag'||coach.step==='walk'?'移動時，往座位間空隙讓路':'');text('coachSymbol',{move:'↑',interact:phone.matches?'☝':'Space',bag:'!',walk:'↑',watch:'✓'}[coach.step]||'⌕');text('inspectionCue',coach.title);if(panel==='idle'){hide('guidance',true);hide('idleCard',true);}}
}
let serviceDemo={wait:false,safety:false,handoff:false,run:null};
function renderServiceDemo(){
 const active=state.lesson?.id==='serviceIntro';hide('serviceDemo',!active);if(!active){text('lessonContinue','了解，繼續 →');text('lessonFoot',state.lesson?.id==='boardingReady'?'準備好再出發，按下開始才倒數。':'按下了解後繼續，這段說明不扣時間。');if(state.lesson?.id==='boardingReady'){text('lessonContinue',state.practice?'繼續登機練習 →':'開始登機 →');if(state.practice)text('lessonFoot','接下來保持不計時練習。');}return;}
 text('lessonFoot','可以略過示範；巡艙中可按 ⓘ 查看規則。');
 if(serviceDemo.run!==state.runId)serviceDemo={wait:false,safety:false,handoff:false,run:state.runId};
 $('demoPatience').value=serviceDemo.wait?20:5;$('demoWait').disabled=serviceDemo.wait;$('demoSafety').disabled=!serviceDemo.wait||serviceDemo.safety;$('demoHandoff').disabled=!serviceDemo.wait||serviceDemo.handoff;
 text('demoPassenger',serviceDemo.wait?'旅客：好的，起飛後再麻煩您。':'旅客：可以給我一杯水嗎？');
 const phase=serviceDemo.handoff?2:serviceDemo.safety?1:serviceDemo.wait?0:-1;
 ['demoContact','demoFetch','demoDeliver'].forEach((id,i)=>$(id).classList.toggle('active',i===phase));
 text('demoStatus',serviceDemo.handoff?'同事已記錄起飛後需求，不會現在取物或送達。':serviceDemo.safety?'已示範安全確認，記錄的需求留待起飛後協助。':serviceDemo.wait?'需求已記錄，耐心計時停止；現在繼續安全檢查。':'先說明目前的安全檢查階段，再記錄一般需求。');
 text('lessonContinue',serviceDemo.wait&&serviceDemo.safety&&serviceDemo.handoff?'了解，繼續 →':'略過示範，開始巡艙');
}
function focusNextDemo(e){if(!e.detail)suppressInheritedLessonClick=true;['demoSafety','demoHandoff','lessonContinue'].map($).find(b=>!b.disabled)?.focus();}
function demoAllowed(e){return ready&&state.status==='playing'&&state.lesson?.id==='serviceIntro'&&(e.detail||lessonArmed&&!suppressInheritedLessonClick);}
$('demoWait').addEventListener('click',e=>{if(!demoAllowed(e))return;serviceDemo.wait=true;renderServiceDemo();focusNextDemo(e);});
$('demoSafety').addEventListener('click',e=>{if(!demoAllowed(e)||!serviceDemo.wait)return;serviceDemo.safety=true;renderServiceDemo();focusNextDemo(e);});
$('demoHandoff').addEventListener('click',e=>{if(!demoAllowed(e)||!serviceDemo.wait||serviceDemo.handoff)return;serviceDemo.handoff=true;renderServiceDemo();focusNextDemo(e);});
function continueLesson(event={}){if(!ready||(!event.detail&&(!lessonArmed||suppressInheritedLessonClick)))return;if(dismissLesson(state)){rememberLessons();clearMovement();refresh(true);if(!state.dialog&&!state.recovery)focusScene();}}
function resumeAway(event={}){
 if(!ready||state.status!=='paused'||pauseReason!=='focus'||document.hidden||(!event.keyboard&&!event.detail&&suppressAwayClick))return;
 pauseReason='manual';suppressAwayClick=false;if(event.code)resumeBlockedKeys.add(event.code);releaseAll();if(event.code)held.add(event.code);if(pauseReturn!=='manual')resume(state);refresh(true);
 if(state.status==='paused')$('resumeButton').focus({preventScroll:true});else if(!state.dialog&&!state.lesson)focusScene();
}
function togglePause(){if(!ready)return;if(state.status==='paused'&&pauseReason==='focus'){resumeAway({keyboard:true});return;}if(state.status==='playing'){pause(state);pauseReason='manual';infoOpen=false;}else if(state.status==='paused'){resume(state);infoOpen=false;}else return;releaseAll();refresh(true);if(state.status==='playing'&&!state.lesson&&!state.dialog&&!state.recovery)focusScene();}
function toggleInfo(){if(!ready||!['playing','paused'].includes(state.status))return;
 if(infoOpen){infoOpen=false;if(!infoOriginPaused)resume(state);}else{infoOriginPaused=state.status==='paused';pause(state);pauseReason='manual';infoOpen=true;}
 releaseAll();refresh(true);if(state.status==='paused')$('resumeButton').focus({preventScroll:true});else if(!state.dialog&&!state.lesson)focusScene();
}
function toggleCamera(){if(!ready)return;state.cameraMode=state.cameraMode==='overview'?'follow':'overview';clearMovement();refresh(true);if(state.status==='playing'&&!state.dialog&&!state.lesson&&!state.recovery)focusScene();}
$('musicSlider').addEventListener('input',()=>{audioPrefs.musicVolume=Number($('musicSlider').value)/100;saveAudio();});
$('muteButton').addEventListener('click',()=>{if(audioPrefs.muted||audioPrefs.volume===0){audioPrefs.muted=false;if(audioPrefs.volume===0)audioPrefs.volume=lastAudibleVolume;}else{lastAudibleVolume=audioPrefs.volume;audioPrefs.muted=true;}saveAudio();restoreSceneInput();});$('volumeSlider').addEventListener('input',()=>{audioPrefs.volume=Math.max(0,Math.min(1,Number($('volumeSlider').value)/100));audioPrefs.muted=audioPrefs.volume===0;if(audioPrefs.volume>0)lastAudibleVolume=audioPrefs.volume;saveAudio();});updateAudioControls();
$('pauseMuteButton').addEventListener('click',()=>{if(audioPrefs.muted||audioPrefs.volume===0){audioPrefs.muted=false;if(audioPrefs.volume===0)audioPrefs.volume=lastAudibleVolume;}else{lastAudibleVolume=audioPrefs.volume;audioPrefs.muted=true;}saveAudio();});$('pauseVolumeSlider').addEventListener('input',()=>{audioPrefs.volume=Math.max(0,Math.min(1,Number($('pauseVolumeSlider').value)/100));audioPrefs.muted=audioPrefs.volume===0;if(audioPrefs.volume>0)lastAudibleVolume=audioPrefs.volume;saveAudio();});
$('awayResumeButton').addEventListener('click',resumeAway);$('infoButton').addEventListener('click',toggleInfo);$('pauseInfoButton').addEventListener('click',()=>{if(!ready||state.status!=='paused'||pauseReason==='focus')return;infoOpen=!infoOpen;infoOriginPaused=true;refresh(true);});
$('startButton').addEventListener('click',()=>begin(false));$('practiceButton').addEventListener('click',()=>begin(true));$('interactButton').addEventListener('pointerdown',e=>{
 suppressActionClick=false;if(!state.action?.interaction||actionPointer!==null)return;
 e.preventDefault();actionPointer=e.pointerId;suppressActionClick=true;$('interactButton').setPointerCapture(e.pointerId);actionInput(state,'press');refresh(true);
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('interactButton').addEventListener(type,e=>{
 if(e.pointerId!==actionPointer)return;actionPointer=null;actionInput(state,type==='pointerup'?'release':'cancel');refresh(true);
});
$('interactButton').addEventListener('click',e=>{if(suppressActionClick&&e.detail)return;suppressActionClick=false;performInteraction();});$('closeDecision').addEventListener('click',()=>{if(!ready)return;closeDialog(state);clearMovement();refresh(true);focusScene();});$('lessonContinue').addEventListener('click',continueLesson);$('pauseButton').addEventListener('click',togglePause);$('resumeButton').addEventListener('click',togglePause);$('restartButton').addEventListener('click',()=>fresh());$('replayButton').addEventListener('click',()=>fresh());for(const id of ['modeButton','resultMenuButton'])$(id).addEventListener('click',()=>fresh(false,false));$('cameraButton').addEventListener('click',toggleCamera);$('reloadButton').addEventListener('click',()=>location.reload());
const directionCodes={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
const fallbackCodes={w:'KeyW',s:'KeyS',a:'KeyA',d:'KeyD',' ':'Space',Spacebar:'Space',c:'KeyC','1':'Digit1','2':'Digit2','3':'Digit3',ArrowUp:'ArrowUp',ArrowDown:'ArrowDown',ArrowLeft:'ArrowLeft',ArrowRight:'ArrowRight',Escape:'Escape'};
function physical(e){return e.code&&e.code!=='Unidentified'?e.code:(fallbackCodes[e.key]||fallbackCodes[e.key?.toLowerCase()]||e.key||'');}
window.addEventListener('keydown',e=>{if(codexExitKeys.has(physical(e))){e.preventDefault();return;}if(retrySession){if(!e.metaKey&&!e.ctrlKey&&!e.altKey)handleRetryKey(e);return;}if(codexOpen){const code=physical(e);if(['Enter','NumpadEnter','Space'].includes(code)){if(e.repeat)e.preventDefault();else held.add(code);}if(code==='Escape'){e.preventDefault();if(!e.repeat)closeCodex();}else if(code==='Tab'){const controls=codexControls();const index=controls.indexOf(document.activeElement);e.preventDefault();(controls[index<0?(e.shiftKey?controls.length-1:0):(index+(e.shiftKey?-1:1)+controls.length)%controls.length]||$('closeCodex')).focus();}return;}if(!ready||e.metaKey||e.ctrlKey||e.altKey||((/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)||e.target?.isContentEditable)&&physical(e)!=='Escape'&&!(state.status==='paused'&&physical(e)==='Tab')))return;const code=physical(e),dir=directionCodes[code],wasHeld=held.has(code);if(resumeBlockedKeys.has(code)){if(e.repeat||wasHeld){e.preventDefault();return;}resumeBlockedKeys.delete(code);suppressAwayClick=['Space','Enter','NumpadEnter'].some(c=>resumeBlockedKeys.has(c));}held.add(code);if(state.status==='finished'){if(code==='Tab'){const controls=modalControls('resultCard'),index=controls.indexOf(document.activeElement);e.preventDefault();controls[index<0?(e.shiftKey?controls.length-1:0):(index+(e.shiftKey?-1:1)+controls.length)%controls.length]?.focus();}else if(code==='KeyC'||dir||(e.repeat||wasHeld)&&['Space','Enter','NumpadEnter'].includes(code))e.preventDefault();return;}if(state.status==='paused'&&pauseReason!=='focus'&&code==='Tab'){const controls=[...$('pauseCard').querySelectorAll('button,input,summary,a')].filter(el=>!el.disabled&&el.getClientRects().length);if(controls.length){const index=controls.indexOf(document.activeElement),next=index<0?(e.shiftKey?controls.length-1:0):(index+(e.shiftKey?-1:1)+controls.length)%controls.length;e.preventDefault();controls[next].focus();}return;}if(state.status==='paused'&&pauseReason==='focus'){if(['Enter','NumpadEnter','Space','Escape'].includes(code)){e.preventDefault();if(!e.repeat&&!wasHeld)resumeAway({keyboard:true,code});}else if(code==='Tab'){e.preventDefault();$('awayResumeButton').focus({preventScroll:true});}return;}if(state.dialog&&!e.repeat&&!wasHeld){choiceBlockedKeys.delete(code);if(['Space','Enter','NumpadEnter'].includes(code))suppressInheritedChoiceClick=false;}if(state.status==='playing'&&state.lesson&&code==='Tab'){e.preventDefault();const controls=(state.lesson.id==='serviceIntro'?['demoWait','demoSafety','demoHandoff','lessonContinue']:['lessonContinue']).map($).filter(b=>!b.disabled);const i=controls.indexOf(document.activeElement);controls[(i+(e.shiftKey?-1:1)+controls.length)%controls.length]?.focus();return;}if(state.status==='playing'&&state.lesson&&(e.repeat||wasHeld)&&['Enter','NumpadEnter'].includes(code)){e.preventDefault();return;}if(state.lesson&&!e.repeat&&!wasHeld&&['Space','Enter','NumpadEnter'].includes(code)&&lessonArmed)suppressInheritedLessonClick=false;if(state.recovery&&state.status==='playing'){if(code==='Escape'&&!e.repeat&&!wasHeld){e.preventDefault();togglePause();}else if(code==='Tab'){e.preventDefault();$('recoveryContinue').focus();}else if(['Enter','NumpadEnter','Space'].includes(code)){e.preventDefault();if(!e.repeat&&!wasHeld)continueRecovery();}return;}if(e.target?.tagName==='BUTTON'&&dir)return;if(dir&&state.status==='playing'&&!state.dialog&&!state.lesson){e.preventDefault();if(!state.action)keys.add(dir);return;}if((e.repeat||wasHeld)&&code==='Space'){e.preventDefault();return;}if(e.repeat||wasHeld)return;if(code==='Escape'&&['playing','paused'].includes(state.status)){e.preventDefault();togglePause();}else if(code==='Space'&&(!e.target||e.target===canvas||e.target===document.body||e.target===$('joystick'))&&state.status==='playing'&&!state.dialog&&!state.lesson){e.preventDefault();if(state.contextual&&state.action)return;if(state.action?.interaction){actionInput(state,'press');refresh(true);}else performInteraction();}else if(/^(Digit|Numpad)[123]$/.test(code)&&state.dialog&&state.status==='playing'&&!state.lesson){e.preventDefault();selectChoice(Number(code.slice(-1))-1,{code});}else if(code==='KeyC'){e.preventDefault();toggleCamera();}});
window.addEventListener('keyup',e=>{if(codexExitKeys.delete(physical(e))){e.preventDefault();held.delete(physical(e));return;}const code=physical(e),dir=directionCodes[code],blocked=resumeBlockedKeys.delete(code);if(blocked)e.preventDefault();suppressAwayClick=['Space','Enter','NumpadEnter'].some(c=>resumeBlockedKeys.has(c));held.delete(code);choiceBlockedKeys.delete(code);if(code==='Space'&&!blocked&&state.status==='playing'){actionInput(state,'release');refresh(true);}if(dir)keys.delete(dir);if(!held.size)lessonArmed=true;});
function loseFocus(){codexExitKeys.clear();
 if(!ready||!['playing','paused'].includes(state.status)){releaseAll();return;}
 if(pauseReason==='focus'&&state.status==='paused'){releaseAll();return;}
 for(const code of held)resumeBlockedKeys.add(code);suppressAwayClick=['Space','Enter','NumpadEnter'].some(code=>resumeBlockedKeys.has(code));pauseReturn=state.status==='paused'?'manual':'playing';
 pause(state);pauseReason='focus';releaseAll();refresh(true);
}
window.addEventListener('blur',loseFocus);document.addEventListener('visibilitychange',()=>{if(document.hidden)loseFocus();});
const joystick=$('joystick');
function moveStick(e){if(e.pointerId!==joystickPointer)return;const r=joystick.getBoundingClientRect();const q=joystickVector(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2,42);stick={x:q.x,y:q.y};$('joystickKnob').style.transform=`translate(${q.knobX}px,${q.knobY}px)`;}
joystick.addEventListener('pointerdown',e=>{if(!ready||state.status!=='playing'||state.dialog||state.lesson||state.action||state.recovery||joystickPointer!==null)return;e.preventDefault();joystickPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);moveStick(e);});
joystick.addEventListener('pointermove',moveStick);
for(const type of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(type,e=>{if(e.pointerId===joystickPointer)resetStick();});
function continueRecovery(){if(!ready||!state.recovery?.ready||state.status!=='playing')return;if(ackRecovery(state)){clearMovement();suppressInheritedChoiceClick=true;refresh(true);}}
$('recoveryContinue').addEventListener('click',e=>{if(!e.detail&&[...held].some(c=>['Space','Enter','NumpadEnter'].includes(c)))return;continueRecovery();});
motion.addEventListener?.('change',()=>{state.reducedMotion=motion.matches;});function fitTasks(){text('interactKey',phone.matches?'互動':'Space');if(phone.matches)$('taskDetails').open=false;else $('taskDetails').open=true;}phone.addEventListener?.('change',fitTasks);fitTasks();
window.addEventListener('pagehide',()=>{hudObserver?.disconnect();audio.dispose();releaseAll();view?.dispose();view=null;});window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
const iconPaths={alert:'M12 5v9m0 4v1',water:'M6 5h12l-2 15H8L6 5zm1 5h10',blanket:'M5 5h14v15H5V5zm3 0v15m8-15v15M5 10h14m-14 5h14',question:'M8 8a4 4 0 1 1 6 3c-2 1-2 2-2 4m0 3v1',report:'m5 12 4 4L19 6'};
function updateSpeech(anchor){
 const bubble=$('speechBubble'),quote=$('decisionQuote');
 if(!state.dialog||state.status!=='playing'||state.recovery){bubble.hidden=true;quote.classList.toggle('sr-only',false);return;}
 bubble.textContent=`「${state.dialog.quote}」`;
 const width=canvas.clientWidth||1280,height=canvas.clientHeight||800,card=$('decisionCard').getBoundingClientRect?.(),hud=$('missionHud').getBoundingClientRect?.(),r=bubble.getBoundingClientRect?.();
 const w=r?.width||260,h=r?.height||70,x=Math.max(12,Math.min(width-w-12,(anchor?.x||0)-w/2)),y=(anchor?.y||0)-h-22;
 const fits=anchor?.visible!==false&&Number.isFinite(anchor?.x)&&y>114&&y+h<height-12&&(!card?.height||y+h+12<card.top||x+w<card.left||x>card.right)&&(!hud?.height||y>hud.bottom+12||x+w<hud.left||x>hud.right);
 bubble.hidden=!fits;quote.classList.toggle('sr-only',!!fits);
 if(fits){bubble.style.left=`${x}px`;bubble.style.top=`${y}px`;bubble.style.setProperty?.('--tail-x',`${Math.max(15,Math.min(w-25,anchor.x-x))}px`);}
}
function updateLabels(labels){
 const root=$('targetLabels'),width=canvas.clientWidth||1280,height=canvas.clientHeight||800;
 const exclusions=['missionHud','speechBubble','timeWarning','controlDock','guidance','aisleAlert','decisionCard','lessonCard','pauseCard','resultCard','taskDetails','idleCard','sceneStatus'].map(id=>$(id)).filter(e=>!e.hidden).flatMap(e=>{const r=e.getBoundingClientRect?.();return r&&r.width&&r.height?[r]:[];});
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
function positionChecklist(){
 if(!phone.matches||$('missionHud').hidden)return;
 const rect=$('missionHud').getBoundingClientRect?.();
 if(rect?.height){const bottom=Math.ceil(rect.bottom);if(bottom!==missionBottom){missionBottom=bottom;document.body.style.setProperty('--mission-bottom',`${bottom}px`);}}
}
hudObserver=typeof ResizeObserver==='function'?new ResizeObserver(positionChecklist):null;
hudObserver?.observe($('missionHud'));window.addEventListener('resize',positionChecklist);
function frame(time){if(state.dialog&&![...held].some(c=>['Space','Enter','NumpadEnter'].includes(c)))suppressInheritedChoiceClick=false;const dt=Math.min(Math.max((time-last)/1000,0),.05);last=time;if(ready&&view){const wasAction=state.action,heldDir=d=>keys.has(d)||touch.has(d);tick(state,dt,screenInputToWorld(Number(heldDir('right'))-Number(heldDir('left'))+stick.x,Number(heldDir('up'))-Number(heldDir('down'))-stick.y));if(wasAction&&!state.action)clearMovement();state.renderTargets=targets(state).filter(t=>t.id!=='report'||chapterReady(state));try{const visual=view.render(state,dt);updateSpeech(visual?.speaker);updateLabels(visual?.labels||[]);}catch(error){fail(error);}if(ready){syncPresentation();if(state.action){$('recoveryProgress').value=state.action.time;$('actionBar').style.width=`${100*state.action.time/state.action.duration}%`;if(state.action.interaction)$('holdFill').style.width=`${Math.min(100,state.action.interaction.fill/1.2*100)}%`;}refresh();}}requestAnimationFrame(frame);}
async function boot(){try{const {createCabinView}=await import('./scene.js?v=final-check-1');view=createCabinView(canvas,{onContextLost:()=>fail(new Error('WebGL context lost'))});ready=true;hide('loading',true);$('startButton').disabled=false;$('practiceButton').disabled=false;text('startButton',state.boarding?'開始正式登機 →':'開始正式巡艙 →');refresh(true);requestAnimationFrame(frame);}catch(error){fail(error);}}

$('nextChapterButton').addEventListener('click',()=>{const next=CHAPTERS.find(c=>c.order===state.chapter+1);if(state.status!=='finished'||state.practice||!summarizeResult(state).record||!next?.available||!campaign.unlockedChapterIds.includes(next.id))return;campaign=selectCampaignChapter(campaign,next.id);saveCampaign();fresh(false,false);});
refresh(true);boot();
