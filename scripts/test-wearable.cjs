const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks) {
 const module = { exports: {} };
 const source = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.compileFunction(source,['require','module','exports'])(n=>mocks[n]??require(n),module,module.exports);
 return module.exports;
}
const body = { id:'ba97c8e2-661e-4cbc-9845-d803823188d8', occurred_at:'2026-10-28T15:32:00.000Z', name:'Personal rapid', insulin_type:'rapid', units:3 };
test('wearable HTTP rejects unauthenticated requests before writing',async()=>{
 let writes=0;
 const {POST}=load('src/app/api/wear/events/route.ts',{'@/lib/server/wear-auth':{wearContext:async()=>null},'@/lib/wear-events':{recordWearDose:async()=>{writes++;}}});
 const response=await POST(new Request('https://gluco.test/api/wear/events',{method:'POST',body:JSON.stringify(body)}));
 assert.equal(response.status,401);assert.equal(writes,0);
});
test('wearable HTTP binds account from token and preserves original time',async()=>{
 let received;
 const {POST}=load('src/app/api/wear/events/route.ts',{'@/lib/server/wear-auth':{wearContext:async()=>({userId:'owner',patientId:'patient',database:{}})},'@/lib/wear-events':{recordWearDose:async(context,input)=>{received={context,input};return {id:input.id};}}});
 const response=await POST(new Request('https://gluco.test/api/wear/events',{method:'POST',body:JSON.stringify({...body,user_id:'attacker'})}));
 assert.equal(response.status,200);assert.equal(received.context.userId,'owner');assert.equal(received.input.occurred_at,body.occurred_at);
});
test('recording rejects fractional units and preserves replay identity and timestamp',async()=>{
 let args;
 const {recordWearDose}=load('src/lib/wear-events.ts',{});
 const context={userId:'owner',patientId:'patient',database:{rpc:async(name,input)=>{args={name,input};return {data:body.id,error:null};}}};
 await assert.rejects(recordWearDose(context,{...body,units:0.5}));
 await recordWearDose(context,body);
 assert.equal(args.name,'record_wear_dose');assert.equal(args.input.p_id,body.id);assert.equal(args.input.p_occurred_at,body.occurred_at);assert.equal(args.input.p_user_id,'owner');
});
test('only native wearable writes bypass cookie origin checks',()=>{
 const {NextRequest}=require('next/server');
 const {proxy}=load('src/proxy.ts',{});
 const native={method:'POST',headers:{authorization:'Bearer gw_wear_'+'a'.repeat(64)}};
 assert.equal(proxy(new NextRequest('https://gluco.test/api/wear/events',native)).status,200);
 assert.equal(proxy(new NextRequest('https://gluco.test/api/events',native)).status,403);
 assert.equal(proxy(new NextRequest('https://gluco.test/api/wear/token',native)).status,403);
 assert.equal(proxy(new NextRequest('https://gluco.test/api/wear/events',{method:'POST'})).status,403);
 assert.equal(proxy(new NextRequest('https://gluco.test/api/wear/events',{...native,headers:{...native.headers,origin:'https://evil.test'}})).status,403);
});
