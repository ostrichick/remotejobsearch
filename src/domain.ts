export const units = { hour:'시급', day:'일급', week:'주급', month:'월급', year:'연봉', project:'프로젝트당', task:'건당', audio_hour:'음성 1시간당', audio_minute:'음성 1분당' } as const;
export type Compensation = { min:number|null; max:number|null; currency:string|null; unit:keyof typeof units|null; note:string };
export type Profile = { skills:string[]; languages:string[]; experience:string[]; education:string[]; keywords:string[]; mode:'local'|'ai'; updatedAt?:string; preferences?:import('./preferences').Preferences; primaryRoleKeywords?:string[]; skillKeywords?:string[]; languageKeywords?:string[]; negativeKeywords?:string[] };
export type Job = { id:string; title:string; company:string; description:string; location:string; contract:string; compensation:Compensation; workMode:string; korea:'confirmed'|'excluded'|'unknown'; koreaEvidence:string; hours:string|null; source:string; sourceUrl:string; url:string; postedAt:string|null; fetchedAt:string; checkedAt:string; status:'open'|'unknown'|'closed'; kind:string; match:string[]; sourceStatus:string; platform:string|null; matchScore?:number; matchScoreLabel?:'high'|'medium'|'low'; scoreExplanation?:string; matchedEvidence?:string[]; missingEvidence?:string[]; scoreVersion?:string; scoreBasis?:'rules'|'ai'; scoreBreakdown?:{role:number;skills:number;language:number;experience:number;workCondition:number} };
export type SourceResult = {source:string;count:number;error?:string;cached:boolean;checkedAt:string|null};
export type SearchResult = {jobs:Job[];sources:SourceResult[];searchedAt:string;keywords:string[];preferences?:import('./preferences').Preferences};
export type Filters = {query:string;contract:string;unit:string;currency:string;minimum:string;includeUnknown:boolean;workMode:string;korea:string;days:string;sort:string};
export const defaultFilters:Filters={query:'',contract:'',unit:'',currency:'',minimum:'',includeUnknown:true,workMode:'',korea:'',days:'',sort:'match'};
export function filterJobs(jobs:Job[], f:Filters, now=Date.now()) {
  const comparable=!!f.currency&&!!f.unit;
  const validMinimum=f.minimum!==''&&Number.isFinite(Number(f.minimum))&&Number(f.minimum)>=0;
  return jobs.filter(j=>{
    const c=j.compensation, unknown=c.min===null&&c.max===null;
    if(f.query&&!`${j.title} ${j.company} ${j.description}`.toLowerCase().includes(f.query.toLowerCase()))return false;
    if(f.contract&&j.contract!==f.contract||f.workMode&&j.workMode!==f.workMode||f.korea&&j.korea!==f.korea)return false;
    if(unknown) { if(!f.includeUnknown)return false; }
    else {
      if(f.unit&&c.unit!==f.unit||f.currency&&c.currency!==f.currency)return false;
      if(comparable&&validMinimum&&(c.min===null||c.min<Number(f.minimum)))return false;
    }
    if(f.days&&(!j.postedAt||Date.parse(j.postedAt)<now-Number(f.days)*86400000))return false;
    return true;
  }).sort((a,b)=>{
    if(f.sort==='newest')return (Date.parse(b.postedAt??'')||0)-(Date.parse(a.postedAt??'')||0);
    if(f.sort==='pay'&&comparable)return (b.compensation.min??-1)-(a.compensation.min??-1);
    return b.match.length-a.match.length;
  });
}
