import {CHAPTERS,DEFAULT_CHAPTER_ID,getChapter} from './chapters/index.mjs?v=0.5.1';

export const CAMPAIGN_STORAGE_KEY='cabin3d-campaign-v1';
export const CHARACTER_IDS=Object.freeze(['elder','business','parent','student','regular','purser']);
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const validStars=value=>Number.isInteger(value)&&value>=1&&value<=3;

// M0 bridge: preflight stays open while chapter1 boarding is unfinished.
export function createCampaign(){
 return {version:1,currentChapterId:DEFAULT_CHAPTER_ID,unlockedChapterIds:['boarding',DEFAULT_CHAPTER_ID],bestStars:{},characterMemory:{}};
}
function normalize(value){
 const next=createCampaign();
 if(!object(value)||value.version!==1)return next;
 const unlocked=new Set(next.unlockedChapterIds);
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
export function parseCampaign(raw,{legacyBest=null}={}){
 let value=null;try{if(typeof raw==='string'&&raw.length<=50000)value=JSON.parse(raw);}catch{}
 let next=normalize(value);
 if(legacyBest?.version===1&&validStars(legacyBest.stars))next=recordChapterResult(next,{chapterId:'preflight',complete:true,stars:legacyBest.stars});
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
 const helped=typeof patch.helped==='boolean'?patch.helped:previous.helped;
 const mistakes=Number.isSafeInteger(patch.mistakes)&&patch.mistakes>=0?patch.mistakes:previous.mistakes;
 if(helped!==previous.helped||mistakes!==previous.mistakes)next.characterMemory[id]={helped,mistakes};
 return next;
}
