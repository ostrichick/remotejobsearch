import type { Compensation, Job, Profile, SearchResult, SourceResult } from '../src/domain';
import type { Env } from './env';
import {matchesPreferences} from '../src/preferences';
import {scoreJob,SCORE_VERSION} from './relevance';
export const sources=[
 {id:'welo',name:'Welo Global · Lever',company:'Welo Global',type:'lever',url:'https://api.lever.co/v0/postings/weloglobal?mode=json'},
 {id:'coupang',name:'Coupang · Greenhouse',company:'Coupang',type:'greenhouse',url:'https://boards-api.greenhouse.io/v1/boards/coupang/jobs?content=true'},
 {id:'mercor',name:'Mercor · Ashby',company:'Mercor',type:'ashby',url:'https://api.ashbyhq.com/posting-api/job-board/mercor?includeCompensation=true'}
] as const;
export function plain(s:unknown):string {return String(s??'').replace(/<\/(?:p|div|li|h\d)>|<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").slice(0,30000);}
export function compensation(text:string):Compensation {
 const empty:Compensation={min:null,max:null,currency:null,unit:null,note:''};
 const line=text.split('\n').find(l=>/(?:USD|KRW|EUR|GBP|\$|₩|€|£)\s*[\d,.]+/.test(l));
 if(!line)return empty;
 const currency=/USD|US\$/.test(line)?'USD':/KRW|₩/.test(line)?'KRW':/EUR|€/.test(line)?'EUR':/GBP|£/.test(line)?'GBP':null;
 const unit=/audio.{0,12}hour|per finished hour/i.test(line)?'audio_hour':/audio.{0,12}minute/i.test(line)?'audio_minute':/per (?:task|job)|paid by.{0,5}task|건당/i.test(line)?'task':/hour|시급/i.test(line)?'hour':/daily|per day|일급/i.test(line)?'day':/week|주급/i.test(line)?'week':/month|월급/i.test(line)?'month':/year|annual|연봉/i.test(line)?'year':/project|프로젝트/i.test(line)?'project':null;
 if(/approximately|estimated|up to.*daily/i.test(line)||unit==='task'&&/hour/i.test(line))return {...empty,currency,unit,note:line.trim()};
 const match=line.match(/(?:USD|KRW|EUR|GBP|\$|₩|€|£)\s*([\d,]+(?:\.\d+)?)(?:\s*[-–—]\s*(?:USD|KRW|EUR|GBP|\$|₩|€|£)?\s*([\d,]+(?:\.\d+)?))?/);
 if(!match)return empty;
 const n=Number(match[1].replaceAll(',','')),upper=match[2]?Number(match[2].replaceAll(',','')):n;
 return {min:/up to|maximum|최대/i.test(line)?null:n,max:/starting|from|최소/i.test(line)&&!match[2]?null:upper,currency,unit,note:line.trim()};
}
export function koreaStatus(location:string, description:string):Pick<Job,'korea'|'koreaEvidence'> {
 const explicit=description.match(/[^\n.]*(?:not (?:available|eligible).{0,25}(?:Korea)|excluding.{0,20}Korea|(?:US|United States)[ -]only)[^\n.]*/i);
 if(explicit)return {korea:'excluded',koreaEvidence:explicit[0]};
 if(/south korea|republic of korea|seoul|대한민국|서울|\bKorea\b/i.test(location))return {korea:'confirmed',koreaEvidence:`공고 근무지: ${location}. 별도 근무 자격은 원문 확인.`};
 const sentence=description.match(/[^\n.]*(?:resident.{0,15}Korea|based in Korea|한국 거주)[^\n.]*/i);
 if(sentence)return {korea:'confirmed',koreaEvidence:sentence[0]};
 return {korea:'unknown',koreaEvidence:'한국 거주자의 근무·계약 가능 여부를 명시적으로 확인하지 못했습니다.'};
}
type Raw=Record<string,any>;
export function normalize(raw:Raw,source:typeof sources[number],time:string):Job {
 const location=source.type==='lever'?(raw.categories?.allLocations??[raw.categories?.location]).join(' / '):source.type==='greenhouse'?raw.location?.name:raw.location;
 const description=plain(source.type==='lever'?[raw.descriptionPlain,...(raw.lists??[]).map((l:Raw)=>l.text+'\n'+l.content)].join('\n'):source.type==='greenhouse'?raw.content:raw.descriptionPlain??raw.descriptionHtml);
 const title=String(raw.text??raw.title??'');
 const contractRaw=source.type==='lever'?raw.categories?.commitment:raw.employmentType??'';
 const ct=contractRaw+' '+description;
 const contract=/freelance|independent contractor|프리랜서/i.test(ct)?'프리랜서':/contract|계약직/i.test(ct)?'계약직':/full.?time|정규직/i.test(ct)?'정규직':/part.?time|파트타임/i.test(ct)?'파트타임':'미기재';
 const workMode=/remote/i.test(raw.workplaceType??'')||raw.isRemote===true?'원격':/hybrid/i.test(raw.workplaceType??'')?'하이브리드':/onsite|on.?site/i.test(raw.workplaceType??'')?'출근':/remote|원격/i.test(location+' '+description)?'원격 언급':'미기재';
 let pay=compensation(description);
 if(raw.salaryRange){const s=raw.salaryRange;pay={min:typeof s.min==='number'?s.min:null,max:typeof s.max==='number'?s.max:null,currency:s.currency??null,unit:/hour/i.test(s.interval)?'hour':/year/i.test(s.interval)?'year':null,note:'공개 ATS 구조화 보수'};}
 const url=String(raw.hostedUrl??raw.absolute_url??raw.jobUrl??'');
 const date=raw.publishedAt??(raw.createdAt?new Date(raw.createdAt).toISOString():null);
 return {id:`${source.id}:${raw.id}`,title,company:source.company,description,location:String(location??'미기재'),contract,compensation:pay,workMode,...koreaStatus(location??'',description),hours:description.split('\n').find(l=>/\d.{0,35}hours.{0,15}week|주\s*\d+\s*시간|\b(?:KST|UTC|CET)\b/i.test(l))?.slice(0,500)??null,source:source.name,sourceUrl:source.url,url,postedAt:date,fetchedAt:time,checkedAt:time,status:'open',kind:/not an active job|talent (?:community|network|pool)|인재풀|general application/i.test(description+' '+title)?'인재풀':/sign up to.{0,30}platform/i.test(description)?'플랫폼 가입 모집':'개별 공고',match:[],sourceStatus:'공개 ATS 원문 조회 · 고용주 별도 교차검증 미완료',platform:source.id==='welo'?'welo':source.id==='mercor'?'mercor':null};
}
export async function fetchSource(source:typeof sources[number],env:Env):Promise<{jobs:Job[];report:SourceResult}> {
 const row=await env.DB.prepare('SELECT data, updated_at FROM source_cache WHERE source=?').bind(source.id).first<{data:string;updated_at:string}>();
 if(row&&Date.now()-Date.parse(row.updated_at)<900000)return {jobs:JSON.parse(row.data),report:{source:source.name,count:0,cached:true,checkedAt:row.updated_at}};
 const r=await fetch(source.url,{signal:AbortSignal.timeout(25000),headers:{Accept:'application/json'}});
 if(!r.ok)throw new Error(`출처 HTTP ${r.status}`);
 const text=await r.text();if(text.length>20_000_000)throw new Error('공고 응답 크기 초과');
 const json=JSON.parse(text),raw:Raw[]=Array.isArray(json)?json:json.jobs;
 if(!Array.isArray(raw))throw new Error('출처 형식 변경');
 const time=new Date().toISOString();
 const jobs=raw.filter(r=>r.isListed!==false).map(r=>normalize(r,source,time)).filter(j=>j.url.startsWith('https://')&&(j.korea==='confirmed'||/원격/.test(j.workMode)));
 await env.DB.prepare('INSERT INTO source_cache(source,data,updated_at) VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(source.id,JSON.stringify(jobs),time).run();
 return {jobs,report:{source:source.name,count:0,cached:false,checkedAt:time}};
}
export async function search(profile:Profile,env:Env):Promise<SearchResult> {
 const keywords=profile.keywords.map(k=>k.trim()).filter(k=>k.length>=2&&!/@|https?:|\d{7}/.test(k)).slice(0,20);
 if(!keywords.length)throw new Error('검색 키워드를 하나 이상 입력하세요.');
 const result=await Promise.allSettled(sources.map(s=>fetchSource(s,env)));
 const reports:SourceResult[]=[],jobs:Job[]=[],seen=new Set<string>();
 result.forEach((v,i)=>{
   if(v.status==='rejected'){reports.push({source:sources[i].name,count:0,error:v.reason instanceof Error?v.reason.message:'수집 실패',cached:false,checkedAt:null});return;}
   let count=0;
   for(const job of v.value.jobs){
    if(!matchesPreferences(job,profile.preferences))continue;
    const namedLanguages=['Korean','English','Spanish','Arabic','French','German','Portuguese','Japanese','Chinese','Farsi','Malayalam','Hindi','Italian','Dutch','Russian','Thai','Vietnamese','Turkish','Indonesian'];
    const required=namedLanguages.filter(l=>new RegExp(`\\b${l}\\b`,'i').test(job.title));
    if(required.length&&!required.some(l=>profile.languages.some(p=>p.toLowerCase().includes(l.toLowerCase()))))continue;
    const scored=scoreJob(profile,job);
    const text=(job.title+' '+job.description).toLowerCase();
    if((profile.negativeKeywords??[]).some(k=>new RegExp(`(^|[^a-z0-9])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}([^a-z0-9]|$)`,'i').test(text)))continue;
    const match=keywords.filter(k=>new RegExp(`(^|[^a-z0-9])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}([^a-z0-9]|$)`,'i').test(text));
    if(!match.length||scored.matchScore<25)continue;
    count++;const canonical=new URL(job.url);canonical.search='';
    if(!seen.has(canonical.href)){jobs.push({...job,match:scored.matchedEvidence.length?scored.matchedEvidence:match,...scored});seen.add(canonical.href);}
   }
   reports.push({...v.value.report,count});
 });
 return {jobs:jobs.sort((a,b)=>(b.matchScore??0)-(a.matchScore??0)||(Date.parse(b.postedAt??'')||0)-(Date.parse(a.postedAt??'')||0)).slice(0,150),sources:reports,searchedAt:new Date().toISOString(),keywords,preferences:profile.preferences};
}
