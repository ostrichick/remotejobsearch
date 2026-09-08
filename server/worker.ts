import type { Env } from './env';
import { extractProfile,validateProfile } from './profile';
import { search } from './jobs';
import { trust } from './trust';
import type { Job, SearchResult } from '../src/domain';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
async function getData(env:Env,table:'profiles'|'searches',uid:string){const r=await env.DB.prepare(`SELECT data FROM ${table} WHERE user_id=?`).bind(uid).first<{data:string}>();return r?JSON.parse(r.data):null;}
async function limit(env:Env,uid:string,action:string,max:number){const key=`${new Date().toISOString().slice(0,10)}:${uid}:${action}`;const r=await env.DB.prepare('INSERT INTO limits(key,count) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key).first<{count:number}>();if((r?.count??0)>max)throw new Error('오늘의 사용 한도에 도달했습니다. 내일 다시 시도하세요.');}
export async function api(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url),uid=request.headers.get('oai-authenticated-user-id');
 // Identity headers are injected by Sites dispatch, stripped/replaced there; never accept identity in a body or query.
 if(!uid)return json({error:'로그인이 필요합니다.'},401);
 if(!['GET','HEAD'].includes(request.method)&& (request.headers.get('Origin')!==url.origin||request.headers.get('X-RoleScout')!=='1'))return json({error:'허용되지 않은 요청입니다.'},403);
 try{
  if(url.pathname==='/api/me')return json({email:request.headers.get('oai-authenticated-user-email'),analysisMode:'local',aiEnabled:false});
  if(url.pathname==='/api/trust')return json(trust);
  if(url.pathname==='/api/profile'&&request.method==='GET')return json(await getData(env,'profiles',uid));
  if(url.pathname==='/api/profile'&&request.method==='PUT'){
   const profile=validateProfile(await readJson(request));profile.updatedAt=new Date().toISOString();
   await env.DB.prepare('INSERT INTO profiles(user_id,data,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(uid,JSON.stringify(profile),profile.updatedAt).run();return json(profile);
  }
  if(url.pathname==='/api/analyze'&&request.method==='POST'){
   await limit(env,uid,'analyze',30);
   if(Number(request.headers.get('content-length')??0)>6_000_000)return json({error:'최대 파일 크기는 5MB입니다.'},413);
   const form=await request.formData(),text=String(form.get('text')??'');
   if(text.length<40||text.length>60000)return json({error:'읽을 수 있는 텍스트가 부족하거나 너무 깁니다. 스캔 PDF는 OCR 후 텍스트로 붙여넣으세요 (40~60,000자).'},422);
   const profile=extractProfile(text);profile.updatedAt=new Date().toISOString();
   const file=form.get('file');
   if(file instanceof File){
    if(file.size>5_000_000||! /\.(pdf|docx)$/i.test(file.name))return json({error:'5MB 이하 PDF 또는 DOCX만 지원합니다.'},400);
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(/\.pdf$/i.test(file.name)?new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-':bytes[0]!==80||bytes[1]!==75)return json({error:'파일 내용과 확장자가 일치하지 않습니다.'},400);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(uid)))).map(b=>b.toString(16).padStart(2,'0')).join('');
    const key=`resumes/${hash}/current`;
    await env.FILES.put(key,bytes,{httpMetadata:{contentType:'application/octet-stream'}});
    await env.DB.prepare('INSERT INTO resumes(user_id,object_key,filename,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET object_key=excluded.object_key,filename=excluded.filename,updated_at=excluded.updated_at').bind(uid,key,file.name.slice(0,200),profile.updatedAt).run();
   }
   await env.DB.prepare('INSERT INTO profiles(user_id,data,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(uid,JSON.stringify(profile),profile.updatedAt).run();return json(profile);
  }
  if(url.pathname==='/api/resume'&&request.method==='GET'){
   const row=await env.DB.prepare('SELECT filename,updated_at FROM resumes WHERE user_id=?').bind(uid).first();return json(row);
  }
  if(url.pathname==='/api/resume'&&request.method==='DELETE'){
   const row=await env.DB.prepare('SELECT object_key FROM resumes WHERE user_id=?').bind(uid).first<{object_key:string}>();
   if(row)await env.FILES.delete(row.object_key);
   await env.DB.prepare('DELETE FROM resumes WHERE user_id=?').bind(uid).run();return json({ok:true});
  }
  if(url.pathname==='/api/data'&&request.method==='DELETE'){
   const row=await env.DB.prepare('SELECT object_key FROM resumes WHERE user_id=?').bind(uid).first<{object_key:string}>();if(row)await env.FILES.delete(row.object_key);
   await env.DB.batch(['profiles','resumes','searches','saved'].map(t=>env.DB.prepare(`DELETE FROM ${t} WHERE user_id=?`).bind(uid)));return json({ok:true});
  }
  if(url.pathname==='/api/search'&&request.method==='GET')return json(await getData(env,'searches',uid));
  if(url.pathname==='/api/search'&&request.method==='POST'){
   const profile=await getData(env,'profiles',uid);if(!profile)return json({error:'먼저 프로필을 저장하세요.'},400);
   const previous=await getData(env,'searches',uid) as SearchResult|null;
   if(previous&&Date.now()-Date.parse(previous.searchedAt)<60000&&JSON.stringify(previous.keywords)===JSON.stringify(profile.keywords))return json(previous);
   await limit(env,uid,'search',50);
   const result=await search(profile,env);
   if(result.sources.every(s=>s.error))return json({error:'모든 출처 조회가 실패했습니다. 기존 결과는 유지됩니다.',sources:result.sources},502);
   await env.DB.prepare('INSERT INTO searches(user_id,data,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(uid,JSON.stringify(result),result.searchedAt).run();return json(result);
  }
  if(url.pathname==='/api/saved'&&request.method==='GET'){
   const r=await env.DB.prepare('SELECT data FROM saved WHERE user_id=? ORDER BY created_at DESC').bind(uid).all<{data:string}>();return json(r.results.map(v=>JSON.parse(v.data)));
  }
  if(url.pathname==='/api/saved'&&['POST','DELETE'].includes(request.method)){
   const body=await readJson(request),id=body.id;if(typeof id!=='string'||id.length>200)return json({error:'공고 ID 오류'},400);
   if(request.method==='DELETE'){await env.DB.prepare('DELETE FROM saved WHERE user_id=? AND job_id=?').bind(uid,id).run();return json({ok:true});}
   const result=await getData(env,'searches',uid) as SearchResult|null,job=result?.jobs.find((j:Job)=>j.id===id);if(!job)return json({error:'본인의 검색 결과에 없는 공고입니다.'},404);
   await env.DB.prepare('INSERT INTO saved(user_id,job_id,data,created_at) VALUES(?,?,?,?) ON CONFLICT(user_id,job_id) DO UPDATE SET data=excluded.data').bind(uid,id,JSON.stringify(job),new Date().toISOString()).run();return json({ok:true});
  }
  return json({error:'요청을 찾을 수 없습니다.'},404);
 }catch(e){return json({error:e instanceof Error&&/프로필|한도|키워드|길이|형식/.test(e.message)?e.message:'요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.'},400);}
}
async function readJson(request:Request){const text=await request.text();if(text.length>100000)throw new Error('요청 길이 초과');return JSON.parse(text);}
export default {async fetch(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url);
 if(url.pathname.startsWith('/api/'))return api(request,env);
 if(url.pathname.startsWith('/.openai')||url.pathname.startsWith('/server'))return new Response('Not found',{status:404});
 const res=await env.ASSETS.fetch(request);return res;
}};
