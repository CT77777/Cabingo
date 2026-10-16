import {summarizeResult} from './results.mjs?v=final-check-1';
import {KNOWLEDGE,cardsForTask} from './knowledge/index.mjs?v=final-check-1';
export const CODEX_STORAGE_KEY='cabin3d-codex-v1';
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
// Content can grow without a schema bump: retain bounded, well-formed unknown IDs.
// Only the current registry is displayed, so unknown content cannot inject UI.
const normalize=value=>{const ids=new Set((Array.isArray(value?.unlockedIds)?value.unlockedIds:[]).filter(id=>typeof id==='string'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)).slice(0,512));const known=KNOWLEDGE.filter(c=>ids.has(c.id)).map(c=>c.id);return {version:1,unlockedIds:[...known,...[...ids].filter(id=>!known.includes(id)).sort()].slice(0,256)};};
export function parseCodex(raw){try{const v=JSON.parse(raw);return object(v)&&v.version===1?normalize(v):normalize(null);}catch{return normalize(null);}}
export function canAwardChapterCards(state){return state.status==='finished'&&!state.practice&&state.endReason==='complete'&&!!summarizeResult(state).record;}
export function awardChapterCards(codex,state){
 const next=normalize(codex);
 if(!canAwardChapterCards(state))return next;
 return normalize({unlockedIds:[...next.unlockedIds,...(state.tasks||[]).filter(t=>t.done).flatMap(t=>cardsForTask(state.chapterId,t.id).map(c=>c.id))]});
}
export function newlyEarnedCards(before,after){return KNOWLEDGE.filter(c=>after.unlockedIds.includes(c.id)&&!before.unlockedIds.includes(c.id));}

export function prepareCodexSave(raw,codex){let value;try{value=JSON.parse(raw);}catch{}
 const next=normalize(codex);if(object(value)&&Number.isInteger(value.version)&&value.version>1)return {codex:next,raw:null};
 const merged=normalize({unlockedIds:[...next.unlockedIds,...parseCodex(raw).unlockedIds]});return {codex:merged,raw:JSON.stringify(merged)};
}
export function resultJudgments(state){return (state.judgments||[]).map(j=>({...j,done:!!state.tasks.find(t=>t.id===j.taskId)?.done,cards:cardsForTask(state.chapterId,j.taskId,j.variant)})).sort((a,b)=>Number(b.incorrect>0)-Number(a.incorrect>0));}
