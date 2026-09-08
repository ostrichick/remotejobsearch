import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePreferences,matchesPreferences,emptyPreferences} from '../src/preferences';
import type {Job} from '../src/domain';
test('natural conditions require review, preserve negation and location distinction',()=>{
 const p=parsePreferences('한국에서 가능한 원격근무, 주 20시간 이하').value;
 assert.equal(p.remote,true);assert.equal(p.korea,true);assert.equal(p.maxWeeklyHours,'20');
 assert.equal(parsePreferences('원격 말고 서울').value.remote,false);
 assert.equal(parsePreferences('서울 재택').value.location,'Seoul');
});
test('unknown hours and minimum-only hours cannot satisfy maximum',()=>{
 const p={...emptyPreferences,maxWeeklyHours:'20'};
 const job={hours:'Hours: 5-20 hours per week'} as Job;
 assert.equal(matchesPreferences(job,p),true);
 assert.equal(matchesPreferences({...job,hours:'minimum 15 hours per week'},p),false);
 assert.equal(matchesPreferences({...job,hours:null},p),false);
 assert.equal(matchesPreferences({...job,hours:'10-30 hours per week'},p),false);
});
