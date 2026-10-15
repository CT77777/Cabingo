import {CHAPTERS,DEFAULT_CHAPTER_ID,getChapter} from './chapters/index.mjs?v=0.7.1';

export const CAMPAIGN_STORAGE_KEY='cabin3d-campaign-v2';
export const CHARACTER_IDS=Object.freeze(['elder','business','parent','student','regular','purser']);
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const validStars=value=>Number.isInteger(value)&&value>=1&&value<=3;

// Fresh players begin at boarding; M0/v1 players keep their previous access.
export function createCampaign(){
 return {version:2,currentChapterId:'boarding',unlockedChapterIds:['boarding'],bestStars:{},characterMemory:{}};
}
function normalize(value){
 const next=createCampaign();
 if(!object(value)||![1,2].includes(value.version))return next;
 const unlocked=new Set(next.unlockedChapterIds);
 if(value.version===1)unlocked.add('preflight');
 if(Array.isArray(value.unlockedChapterIds))for(const chapter of CHAPTERS)if(value.unlockedChapterIds.includes(chapter.id))unlocked.add(chapter.id);
 if(object(value.bestStars))for(const chapter of CHAPTERS)if(chapter.available&&validStars(value.bestStars[chapter.id])){
  next.bestStars[chapter.id]=value.bestStars[chapter.id];unlocked.add(chapter.id);
  const following=CHAPTERS.find(c=>c.order===chapter.order+1);if(following)unlocked.add(following.id);
 }
 next.unlockedChapterIds=CHAPTERS.filter(c=>unlocked.has(c.id)).map(c=>c.id);
 if(getChapter(value.currentChapterId)?.available&&unlocked.has(value.currentChapterId))next.currentChapterId=value.currentChapterId;
 if(object(value.characterMemory))for(const id of CHARACTER_IDS){
  const record=value.characterMemory[id];
  if(object(record)&&typeof record.helped==='boolean'&&Number.isSafeInteger(record.mistakes)&&record.mistakes>=0)next.characterMemory[id]={helped:record.helped,mistakes:record.mistakes};
 }
 return next;
}
export function parseCampaign(raw,{legacyBest=null,legacyCampaign=null}={}){
 let value=null;try{const source=raw??legacyCampaign;if(typeof source==='string'&&source.length<=50000)value=JSON.parse(source);}catch{}
 let next=normalize(value);
 if(legacyBest?.version===1&&validStars(legacyBest.stars)){if(!next.unlockedChapterIds.includes('preflight'))next.unlockedChapterIds.push('preflight');next=recordChapterResult(next,{chapterId:'preflight',complete:true,stars:legacyBest.stars});}
 return next;
}
export function selectCampaignChapter(campaign,id){
 const next=normalize(campaign);
 if(getChapter(id)?.available&&next.unlockedChapterIds.includes(id))next.currentChapterId=id;
 return next;
}
export function recordChapterResult(campaign,{chapterId,complete,practice=false,stars}={}){
 const next=normalize(campaign),chapter=getChapter(chapterId);
 if(!chapter?.available||!next.unlockedChapterIds.includes(chapterId)||complete!==true||practice||!validStars(stars))return next;
 next.bestStars[chapterId]=Math.max(next.bestStars[chapterId]||0,stars);
 const following=CHAPTERS.find(c=>c.order===chapter.order+1);
 if(following&&!next.unlockedChapterIds.includes(following.id))next.unlockedChapterIds=CHAPTERS.filter(c=>c.id===following.id||next.unlockedChapterIds.includes(c.id)).map(c=>c.id);
 return next;
}
export function updateCharacterMemory(campaign,id,patch){
 const next=normalize(campaign);
 if(!CHARACTER_IDS.includes(id)||!object(patch))return next;
 const previous=next.characterMemory[id]||{helped:false,mistakes:0};
 const helped=previous.helped||patch.helped===true;
 const mistakes=Number.isSafeInteger(patch.mistakes)&&patch.mistakes>=0?Math.max(previous.mistakes,patch.mistakes):previous.mistakes;
 if(helped!==previous.helped||mistakes!==previous.mistakes)next.characterMemory[id]={helped,mistakes};
 return next;
}

// Re-read before writing: preserve stronger records earned by another tab.
export function prepareCampaignSave(raw,campaign){
 let stored;try{stored=typeof raw==='string'?JSON.parse(raw):null;}catch{}
 if(object(stored)&&Number.isInteger(stored.version)&&stored.version>2)return {campaign:normalize(campaign),raw:null};
 const latest=parseCampaign(raw),next=normalize(campaign);
 for(const chapter of CHAPTERS){const stars=latest.bestStars[chapter.id];if(stars)next.bestStars[chapter.id]=Math.max(next.bestStars[chapter.id]||0,stars);}
 next.unlockedChapterIds=CHAPTERS.filter(c=>next.unlockedChapterIds.includes(c.id)||latest.unlockedChapterIds.includes(c.id)).map(c=>c.id);
 for(const id of CHARACTER_IDS)if(latest.characterMemory[id]){
  const a=next.characterMemory[id]||{helped:false,mistakes:0},b=latest.characterMemory[id];
  next.characterMemory[id]={helped:a.helped||b.helped,mistakes:Math.max(a.mistakes,b.mistakes)};
 }
 return {campaign:next,raw:JSON.stringify(next)};
}
