import type {Job, Profile} from '../src/domain';

export const SCORE_VERSION='rules-v1';
export type ScoreBreakdown={role:number;skills:number;language:number;experience:number;workCondition:number};
export type MatchScore={matchScore:number;matchScoreLabel:'high'|'medium'|'low';scoreExplanation:string;matchedEvidence:string[];missingEvidence:string[];scoreVersion:string;scoreBasis:'rules';scoreBreakdown:ScoreBreakdown};

const roleTerms=['ai annotation','data annotation','data annotator','annotator','ai evaluation','evaluator','language qa','linguistic qa','linguistic quality','transcription','speech data','voice data','translation','localization','korean language specialist','data labeling','quality rater','search evaluator','content evaluator'];
const stop=new Set(['ai','data','language','quality','qa','remote','work','the','and','or']);
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const has=(text:string,term:string)=>new RegExp(`(^|[^a-z0-9])${escape(term.toLowerCase())}([^a-z0-9]|$)`,'i').test(text.toLowerCase());
const words=(items:string[])=>items.flatMap(x=>x.toLowerCase().split(/[^a-z0-9가-힣]+/).filter(w=>w.length>=3&&!stop.has(w)));

function roleKeywords(profile:Profile){
 const custom=profile.primaryRoleKeywords?.length?profile.primaryRoleKeywords:profile.keywords.filter(k=>roleTerms.some(t=>k.toLowerCase().includes(t)||t.includes(k.toLowerCase())));
 return [...new Set([...custom,...roleTerms.filter(t=>profile.keywords.some(k=>t.includes(k.toLowerCase())||k.toLowerCase().includes(t)||k.toLowerCase().startsWith('annotat')&&t.includes('annotat')||k.toLowerCase().startsWith('evaluat')&&t.includes('evaluat')))])];
}
export function scoreJob(profile:Profile,job:Job):MatchScore {
 const title=(job.title+' '+job.company).toLowerCase(), body=job.description.toLowerCase(), all=title+' '+body;
 const roles=roleKeywords(profile), skills=profile.skillKeywords?.length?profile.skillKeywords:profile.skills, langs=profile.languageKeywords?.length?profile.languageKeywords:profile.languages;
 const matchedEvidence:string[]=[];const missingEvidence:string[]=[];
 const roleHits=roles.filter(k=>has(title,k));
 const roleBodyHits=roles.filter(k=>!roleHits.includes(k)&&has(body.slice(0,5000),k));
 const role=roles.length?(roleHits.length?30:roleBodyHits.length?14:0):0;
 roleHits.forEach(k=>matchedEvidence.push(`직무: ${k}`));roleBodyHits.forEach(k=>matchedEvidence.push(`업무: ${k}`));if(!role)missingEvidence.push('제목·직무 분류에 핵심 직무 일치 없음');
 const skillHits=skills.filter(k=>has(all,k));
 const skillsScore=skills.length?Math.round(30*Math.min(1,skillHits.length/Math.min(4,skills.length))):0;
 skillHits.slice(0,8).forEach(k=>matchedEvidence.push(`기술: ${k}`));if(!skillHits.length)missingEvidence.push('명시된 기술·업무 키워드 일치 없음');
 const langHits=langs.filter(k=>has(all,k));
 const language=langs.length?(langHits.length?15:0):0;
 langHits.forEach(k=>matchedEvidence.push(`언어: ${k}`));if(langs.length&&!langHits.length)missingEvidence.push('명시된 언어 일치 없음');
 const experienceText=profile.experience.join(' ').toLowerCase();
 const expHits=words(profile.experience).filter(w=>w.length>3&&has(all,w)).slice(0,5);
 const typeHits=['annotat','evaluat','transcri','linguist','qa','localiz','translat','speech','voice'].filter(x=>experienceText.includes(x)&&all.includes(x));
 const experience=experienceText?(expHits.length||typeHits.length?15:0):0;
 if(expHits.length||typeHits.length)matchedEvidence.push('경력 유형 일치');else if(experienceText)missingEvidence.push('경력·업무 유형의 직접 일치 없음');
 let workCondition=0;
 if(job.workMode==='원격'&&/remote|원격/i.test(job.workMode+' '+job.description))workCondition+=5;
 if(job.korea==='confirmed')workCondition+=5;
 if(job.workMode!=='원격')missingEvidence.push('원격 근무 명시 없음');
 if(job.korea!=='confirmed')missingEvidence.push('한국 근무 가능 명시 없음');
 const rawScore=Math.round(role+skillsScore+language+experience+workCondition);
 // A skill-only mention is insufficient for a high relevance result.
 const score=Math.max(0,Math.min(100,role===0?Math.min(44,rawScore):rawScore));
 const matchScoreLabel=score>=70?'high':score>=45?'medium':'low';
 return {matchScore:score,matchScoreLabel,scoreExplanation:`직무 ${role}/30 · 기술 ${skillsScore}/30 · 언어 ${language}/15 · 경력 ${experience}/15 · 근무조건 ${workCondition}/10`,matchedEvidence,missingEvidence,scoreVersion:SCORE_VERSION,scoreBasis:'rules',scoreBreakdown:{role,skills:skillsScore,language,experience,workCondition}};
}
