// Only best records are persisted, separately for each chapter/question version.
export const ASSESSMENT_STORAGE_KEY='cabingo-assessment-best-v1';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const key=r=>`${r.chapterId}:${r.questionVersion}`;
function valid(r){
 if(!object(r)||!['boarding','preflight'].includes(r.chapterId)||!Number.isInteger(r.questionVersion)||r.questionVersion<1||r.questionVersion>9999)return false;
 if(!Number.isInteger(r.total)||r.total<1||r.total>64||!Number.isInteger(r.incorrect)||r.incorrect<0||r.incorrect>=r.total||r.safetyErrors!==0)return false;
 if(!Number.isFinite(r.elapsed)||r.elapsed<0||r.elapsed>(r.chapterId==='boarding'?90:100))return false;
 if(r.questionVersion===2&&r.total!==(r.chapterId==='boarding'?5:6))return false;
 return r.stars===(r.incorrect===0?3:r.incorrect===1?2:1);
}
function clean(r){return {chapterId:r.chapterId,questionVersion:r.questionVersion,total:r.total,stars:r.stars,incorrect:r.incorrect,safetyErrors:0,elapsed:r.elapsed};}
export function parseAssessmentBest(raw){
 const next={version:1,records:{}};let value;try{value=JSON.parse(raw);}catch{return next;}
 if(!object(value)||value.version!==1||!object(value.records))return next;
 for(const [id,r] of Object.entries(value.records).slice(0,64))if(valid(r)&&id===key(r))next.records[id]=clean(r);
 return next;
}
export function selectAssessmentBest(previous,candidate){
 if(!valid(candidate))return previous;
 if(!previous)return clean(candidate);
 if(key(previous)!==key(candidate)||previous.total!==candidate.total)return previous;
 const a=[candidate.stars,-candidate.incorrect,-candidate.elapsed],b=[previous.stars,-previous.incorrect,-previous.elapsed];
 for(let i=0;i<a.length;i++){if(a[i]>b[i])return clean(candidate);if(a[i]<b[i])return previous;}
 return previous;
}
export function prepareAssessmentSave(raw,candidate){
 let source;try{source=JSON.parse(raw);}catch{}
 const data=parseAssessmentBest(raw);
 if(object(source)&&Number.isInteger(source.version)&&source.version>1)return {data,raw:null,updated:false,writable:false};
 if(!valid(candidate))return {data,raw:null,updated:false,writable:true};
 const id=key(candidate),previous=data.records[id],best=selectAssessmentBest(previous,candidate);
 const updated=best!==previous;
 if(updated)data.records[id]=best;
 return {data,raw:updated?JSON.stringify(data):null,updated,writable:true};
}
