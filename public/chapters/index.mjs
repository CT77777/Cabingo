import {PREFLIGHT_CHAPTER} from './preflight.mjs?v=training-modes-2';

import {BOARDING_CHAPTER} from './boarding.mjs?v=training-modes-2';

export const DEFAULT_CHAPTER_ID='preflight';
const planned=(id,order,title,phase,duration)=>Object.freeze({
 id,order,title,phase,duration,epilogue:id==='disembark',available:false,handoffTokens:0,
 tasks:Object.freeze([]),lessons:Object.freeze({}),tutorial:Object.freeze([]),eventPhases:Object.freeze([])
});
export const CHAPTERS=Object.freeze([
 BOARDING_CHAPTER,
 PREFLIGHT_CHAPTER,
 planned('takeoff',3,'滑行與起飛','takeoff',60),
 planned('meal-service',4,'巡航餐飲服務','cruise',150),
 planned('turbulence',5,'亂流','cruise',150),
 planned('night-flight',6,'夜航','cruise',150),
 planned('descent',7,'下降前準備','descent',90),
 planned('landing',8,'不平靜的落地','landing',180),
 planned('disembark',9,'下機','arrival',0)
]);
export const getChapter=id=>CHAPTERS.find(chapter=>chapter.id===id)||null;

export const formatChapterLabel=chapter=>`${chapter.epilogue?'尾聲':`第 ${chapter.order} 章`} · ${chapter.title}`;
