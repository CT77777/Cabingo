import assert from 'node:assert/strict';
import {createCampaign,parseCampaign,recordChapterResult,selectCampaignChapter,updateCharacterMemory,CAMPAIGN_STORAGE_KEY} from '../public/campaign.mjs';
assert.equal(CAMPAIGN_STORAGE_KEY,'cabin3d-campaign-v1');
const base=createCampaign();assert.equal(base.currentChapterId,'preflight');assert.deepEqual(base.unlockedChapterIds,['boarding','preflight']);assert.deepEqual(base.characterMemory,{});
for(const raw of [undefined,null,'bad','null','[]','3','true','{}','{"version":2}','{"version":1,"unlockedChapterIds":"all","bestStars":[],"characterMemory":[]}'])assert.deepEqual(parseCampaign(raw),base);
const legacy=parseCampaign(null,{legacyBest:{version:1,stars:3}});assert.equal(legacy.bestStars.preflight,3);assert(legacy.unlockedChapterIds.includes('takeoff'));
for(const stars of [0,-1,4,NaN,'3'])assert.deepEqual(parseCampaign(null,{legacyBest:{version:1,stars}}),base);
const won=recordChapterResult(base,{chapterId:'preflight',complete:true,practice:false,stars:2});assert.equal(won.bestStars.preflight,2);assert(won.unlockedChapterIds.includes('takeoff'));assert.deepEqual(base,createCampaign());
assert.equal(recordChapterResult(won,{chapterId:'preflight',complete:true,stars:1}).bestStars.preflight,2);
assert.equal(recordChapterResult(won,{chapterId:'preflight',complete:true,stars:3}).bestStars.preflight,3);
for(const attempt of [{complete:false,stars:3},{complete:true,practice:true,stars:3},{complete:true,stars:0},{complete:true,stars:9},{chapterId:'boarding',complete:true,stars:3},{chapterId:'unknown',complete:true,stars:3}])assert.deepEqual(recordChapterResult(base,{chapterId:'preflight',...attempt}),base);
assert.deepEqual(selectCampaignChapter(won,'takeoff'),won);assert.deepEqual(selectCampaignChapter(won,'unknown'),won);assert.equal(selectCampaignChapter(won,'preflight').currentChapterId,'preflight');
const memory=updateCharacterMemory(won,'elder',{helped:true,mistakes:1});assert.deepEqual(memory.characterMemory.elder,{helped:true,mistakes:1});assert.deepEqual(won.characterMemory,{});assert.deepEqual(parseCampaign(JSON.stringify(memory)),memory);
assert.deepEqual(updateCharacterMemory(memory,'__proto__',{helped:true}),memory);assert.deepEqual(updateCharacterMemory(memory,'elder',{helped:'yes',mistakes:-1}),memory);
const untrusted=JSON.stringify({version:1,currentChapterId:'landing',unlockedChapterIds:['landing','unknown'],bestStars:{preflight:2,landing:9,__proto__:3},characterMemory:{elder:{helped:true,mistakes:2,role:'admin'},unknown:{helped:true},constructor:{helped:true}}});
const clean=parseCampaign(untrusted);assert.equal(clean.currentChapterId,'preflight');assert(!clean.unlockedChapterIds.includes('unknown'));assert.equal(clean.bestStars.preflight,2);assert.equal(clean.bestStars.landing,undefined);assert.deepEqual(clean.characterMemory,{elder:{helped:true,mistakes:2}});assert.equal({}.helped,undefined);
const original=JSON.stringify(memory);recordChapterResult(memory,{chapterId:'preflight',complete:true,stars:3});selectCampaignChapter(memory,'preflight');assert.equal(JSON.stringify(memory),original);

assert.deepEqual(parseCampaign(JSON.stringify(legacy),{legacyBest:{version:1,stars:3}}),legacy);

assert.deepEqual(parseCampaign(JSON.stringify({version:1,bestStars:{landing:3}})),base);
console.log('PASS campaign codec, legacy migration, formal unlocks, best stars, fixed character memory and mutation guards');
