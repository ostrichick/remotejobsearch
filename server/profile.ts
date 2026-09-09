import type { Profile } from '../src/domain';
import {validatePreferences} from '../src/preferences';
const terms=['Korean','English','Spanish','Chinese','Japanese','French','German','Portuguese','Arabic','한국어','영어','스페인어'];
const skills=['annotation','evaluation','transcription','linguistic','localization','translation','teaching','tutor','assessment','QA','data analysis','Python','SQL','JavaScript','TypeScript','React','Java','AWS','Excel','Google Workspace','marketing','accounting','finance','sales','design','customer service','nursing','project management','HR','recruiting','교육','번역','전사','회계','영업','마케팅','디자인','간호','인사'];
export function extractProfile(text:string):Profile {
  const lines=text.split(/\n/).map(s=>s.trim()).filter(Boolean);
  const found=skills.filter(s=>new RegExp(`(^|[^a-z])${s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}([^a-z]|$)`,'i').test(text));
  const language=terms.filter(s=>text.toLowerCase().includes(s.toLowerCase()));
  return {skills:found,languages:language,experience:lines.filter(s=>/\b(19|20)\d{2}\b/.test(s)&&!/@|linkedin|bachelor|degree|university|학사|대학교/i.test(s)).slice(0,20),education:lines.filter(s=>/bachelor|degree|university|학사|대학교|master|doctor/i.test(s)).slice(0,10),keywords:found.slice(0,12),mode:'local'};
}
export function validateProfile(value:unknown):Profile {
  if(!value||typeof value!=='object')throw new Error('프로필 형식이 올바르지 않습니다.');
  const v=value as Record<string,unknown>, out={} as Profile;
  for(const k of ['skills','languages','experience','education','keywords'] as const){
    if(!Array.isArray(v[k])||v[k].length>40||v[k].some((x:unknown)=>typeof x!=='string'||x.length>1500))throw new Error('프로필 항목 길이나 형식을 확인하세요.');
    out[k]=(v[k] as string[]).map(x=>x.trim()).filter(Boolean);
  }
  out.preferences=validatePreferences(v.preferences);
  for(const k of ['primaryRoleKeywords','skillKeywords','languageKeywords','negativeKeywords'] as const){
    if(v[k]!==undefined&&(!Array.isArray(v[k])||(v[k] as unknown[]).length>30||(v[k] as unknown[]).some(x=>typeof x!=='string'||String(x).length>150)))throw new Error('검색 키워드 분류를 확인하세요.');
    (out as any)[k]=Array.isArray(v[k])?(v[k] as string[]).map(x=>x.trim()).filter(Boolean):[];
  }
  out.mode=v.mode==='ai'?'ai':'local';return out;
}
