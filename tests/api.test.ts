import {test} from 'node:test';import assert from 'node:assert/strict';
import {getPlatformProxy} from 'wrangler';import {api} from '../server/worker';import type {Env} from '../server/env';
test('real local D1/R2: identity separation, save persistence, deletion, auth and CSRF',async()=>{
 const platform=await getPlatformProxy<Env>({configPath:'wrangler.jsonc'}),env=platform.env;
 const a='test-a-'+crypto.randomUUID(),b='test-b-'+crypto.randomUUID();
 async function call(uid:string,path:string,method='GET',body?:unknown,origin='https://test.local'){
  return api(new Request('https://test.local/api/'+path,{method,headers:{'oai-authenticated-user-id':uid,'Origin':origin,'X-RoleScout':'1','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),env);
 }
 try{
  assert.equal((await api(new Request('https://test.local/api/profile'),env)).status,401);
  const p={skills:['Python'],languages:['English'],experience:['2024 engineer'],education:[],keywords:['Python'],mode:'local'};
  assert.equal((await call(a,'profile','PUT',p,'https://evil.test')).status,403);
  assert.equal((await call(a,'profile','PUT',p)).status,200);
  assert.deepEqual((await (await call(a,'profile')).json() as any).skills,['Python']);
  assert.equal(await(await call(b,'profile')).json(),null);
  assert.equal((await call(b,'saved','POST',{id:'foreign'})).status,404);
  await env.DB.prepare('INSERT INTO searches(user_id,data,updated_at) VALUES(?,?,?)').bind(a,JSON.stringify({jobs:[{id:'owned',title:'Owned test job'}]}),new Date().toISOString()).run();
  assert.equal((await call(a,'saved','POST',{id:'owned'})).status,200);
  assert.equal((await(await call(a,'saved')).json() as any[]).length,1);
  assert.equal((await(await call(b,'saved')).json() as any[]).length,0);
  await env.FILES.put('tests/'+a,'test file');
  await env.DB.prepare('INSERT INTO resumes(user_id,object_key,filename,updated_at) VALUES(?,?,?,?)').bind(a,'tests/'+a,'test.txt',new Date().toISOString()).run();
  assert.equal(await(await call(b,'resume')).json(),null);
  await call(b,'data','DELETE');assert.ok(await env.FILES.get('tests/'+a));
  await call(a,'data','DELETE');assert.equal(await env.FILES.get('tests/'+a),null);
  assert.equal(await(await call(a,'profile')).json(),null);assert.equal((await(await call(a,'saved')).json() as any[]).length,0);
 }finally{await call(a,'data','DELETE');await call(b,'data','DELETE');await platform.dispose();}
});
