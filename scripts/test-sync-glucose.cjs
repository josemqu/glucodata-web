const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function setup({env={},sessions=[],failPatient=null}={}) {
 const settings={SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'service',GLUCO_SYNC_SECRET:'cron',...env};
 const writes=[],updates=[],pages=[];
 let handler,clients=0;
 const database={from:table=>{
  if(table==='glucose_measurements')return {upsert:async(rows,options)=>{writes.push({rows,options});return {};}};
  assert.equal(table,'user_provider_sessions');
  const query={
   select:()=>query,order:()=>query,limit:()=>query,gt:(_field,value)=>{query.after=value;return query;},
   then:resolve=>{pages.push(query.after);return Promise.resolve({data:sessions.filter(s=>!query.after || s.user_id>query.after).slice(0,100)}).then(resolve);},
   update:row=>({eq:(field,value)=>({eq:async(secondField,secondValue)=>{updates.push({row,field,value,secondField,secondValue});return {};}})})
  };return query;
 }};
 const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../supabase/functions/sync-glucose/index.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mocks={
  'jsr:@supabase/functions-js/edge-runtime.d.ts':{},
  'https://esm.sh/@supabase/supabase-js@2.39.7':{createClient:()=>{clients++;return database;}},
  '../_shared/sync-auth.ts':{SYNC_SECRET_SHA256:require('node:crypto').createHash('sha256').update('deployed-cron').digest('hex')},
  '../_shared/librelink.ts':{LibreLinkUpClient:class{
   constructor(_email,_password,region,token,userId){Object.assign(this,{region,token,userId});}
   async getConnections(){return [{patientId:failPatient===this.userId?'revoked':'shared'}];}
   async getGlucose(){return {measurement:null,graph:[{time:Date.now()-600000,value:120,trend:3,isHigh:false,isLow:false,unit:'mg/dL'}]};}
   getSession(){return {token:this.token,region:this.region};}
  }}
 };
 vm.compileFunction(source,['require','exports','Deno'])(name=>{assert.ok(name in mocks,name);return mocks[name];},{},{env:{get:key=>settings[key]},serve:fn=>{handler=fn;}});
 return {run:token=>handler(new Request('https://test.invalid',{headers:token?{authorization:`Bearer ${token}`}:{}})),writes,updates,pages,get clients(){return clients;}};
}
const session=id=>({user_id:id,librelink_user_id:id,patient_id:'shared',token:`token-${id}`,region:'test'});

test('sync rejects missing and incorrect bearer before touching storage',async()=>{
 const state=setup();
 assert.equal((await state.run()).status,401);
 assert.equal((await state.run('wrong')).status,401);
 assert.equal(state.clients,0);
});
test('missing service configuration fails closed, including Bearer undefined',async()=>{
 const state=setup({env:{SUPABASE_SERVICE_ROLE_KEY:undefined}});
 assert.equal((await state.run('undefined')).status,503);
 assert.equal(state.clients,0);
});
test('paused imports never read sessions or write clinical data',async()=>{
 const state=setup({env:{GLUCO_IMPORTS_PAUSED:'true'},sessions:[session('a')]});
 const result=await state.run('cron');
 assert.equal(result.status,200);
 assert.equal((await result.json()).paused,true);
 assert.equal(state.clients,0);
 assert.equal((await state.run('wrong')).status,401);
});
test('provider failures do not block other accounts, and writes keep their owner',async()=>{
 const state=setup({sessions:[session('a'),session('b')],failPatient:'a'});
 const result=await state.run('cron');
 assert.equal(result.status,207);
 assert.deepEqual(await result.json(),{success:false,completed:1,failed:1});
 assert.equal(state.writes.length,1);
 assert.equal(state.writes[0].rows[0].user_id,'b');
 assert.equal(state.writes[0].rows[0].patient_id,'shared');
 assert.equal(state.writes[0].options.onConflict,'user_id,patient_id,timestamp');
 assert.equal(state.updates[0].secondField,'token');
 assert.equal(state.updates[0].secondValue,'token-b');
});
test('keyset pagination processes every account exactly once',async()=>{
 const sessions=Array.from({length:101},(_,i)=>session(String(i).padStart(3,'0')));
 const state=setup({sessions});
 const result=await state.run('service');
 assert.equal(result.status,200);
 assert.equal((await result.json()).completed,101);
 assert.deepEqual(state.pages,[undefined,'099']);
 assert.equal(new Set(state.writes.map(w=>w.rows[0].user_id)).size,101);
});

test('dedicated cron digest authorizes without shared service credentials',async()=>{
 const state=setup();
 assert.equal((await state.run('deployed-cron')).status,200);
 assert.equal((await state.run('wrong-deployed-cron')).status,401);
});
