import {test} from 'node:test';import assert from 'node:assert/strict';
import {filterJobs,defaultFilters,type Job} from '../src/domain';
import {compensation,koreaStatus} from '../server/jobs';
const base={id:'1',title:'QA',company:'Example',description:'',contract:'계약직',workMode:'원격',korea:'unknown',match:[],postedAt:'2026-09-01',compensation:{min:22,max:30,currency:'USD',unit:'hour',note:''}} as Job;
test('same unit and currency, null and upper-only do not become minimum',()=>{
 const jobs=[base,{...base,id:'krw',compensation:{...base.compensation,min:18000,currency:'KRW'}},{...base,id:'upper',compensation:{...base.compensation,min:null}},{...base,id:'unknown',compensation:{min:null,max:null,currency:null,unit:null,note:''}},{...base,id:'audio',compensation:{...base.compensation,unit:'audio_hour' as const}}];
 assert.deepEqual(filterJobs(jobs,{...defaultFilters,unit:'hour',currency:'USD',minimum:'20',includeUnknown:false}).map(j=>j.id),['1']);
 assert.deepEqual(filterJobs(jobs,{...defaultFilters,unit:'hour',currency:'USD',minimum:'20',includeUnknown:true}).map(j=>j.id),['1','unknown']);
});
test('latest uses dates, unknown dates last',()=>{assert.deepEqual(filterJobs([base,{...base,id:'2',postedAt:null},{...base,id:'3',postedAt:'2026-09-08'}],{...defaultFilters,sort:'newest'}).map(j=>j.id),['3','1','2']);});
test('piecework estimate not hourly salary; audio hour separate',()=>{assert.equal(compensation('Paid per job – approximately $11.5 per hour').min,null);assert.equal(compensation('USD 30 per audio hour').unit,'audio_hour');assert.equal(compensation('Up to USD 40 per hour').min,null);});
test('remote alone does not establish Korea eligibility',()=>{assert.equal(koreaStatus('Remote','Remote work').korea,'unknown');assert.equal(koreaStatus('South Korea','').korea,'confirmed');assert.equal(koreaStatus('Remote','US-only').korea,'excluded');});
