const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
function load(relative, mocks) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',relative),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.compileFunction(source,['require','module','exports'])(name => name in mocks ? mocks[name] : require(name),module,module.exports);
  return module.exports;
}
function setup({cookie={}, user=null, identity=null, refresh=null, providerFails=false}={}) {
  const values=new Map(Object.entries(cookie)); const clients=[]; const revoked=[];
  const jar={get:key=>values.has(key)?{value:values.get(key)}:undefined,set:(key,value,options)=>values.set(key,{value,options}),delete:key=>values.delete(key)};
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='anon-test';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service-test';
  const mocks={
    'next/headers':{cookies:async()=>jar},
    '@/lib/librelink':{LibreLinkUpClient:class {async login(){if(providerFails)throw new Error('Provider denied');throw new Error('Unexpected provider call');}}},
    '@supabase/supabase-js':{createClient:(url,key,options)=>{
      const client={url,key,options,auth:{getUser:async()=>({data:{user}}),refreshSession:async()=>refresh??{error:new Error('expired'),data:{}},admin:{signOut:async(token,scope)=>{revoked.push([token,scope]);return {}; }}},from:table=>{
        assert.equal(table,'app_users');
        return {select:()=>({eq:()=>({single:async()=>({data:identity,error:identity?null:new Error('not linked')})})})};
      }};
      clients.push(client);return client;
    }}
  };
  return {auth:load('src/lib/server/user-auth.ts',mocks),values,clients,revoked};
}
test('legacy browser markers cannot establish internal identity',async()=>{
 const {auth,clients}=setup();
 await assert.rejects(auth.requireUser(),error=>error.status===401);
 assert.equal(clients.length,1);
});
test('verified identity queries use the user JWT, never service role',async()=>{
 const {auth,clients}=setup({cookie:{gluco_access:'signed-access'},user:{id:'a'},identity:{id:'a'}});
 const context=await auth.requireUser();
 assert.equal(context.userId,'a');
 assert.equal(context.database.key,'anon-test');
 assert.equal(context.database.options.global.headers.Authorization,'Bearer signed-access');
 assert.equal(clients.some(client=>client.key==='service-test'),false);
});
test('valid Supabase user without provider mapping is rejected',async()=>{
 const {auth}=setup({cookie:{gluco_access:'signed-access'},user:{id:'unlinked'}});
 await assert.rejects(auth.requireUser(),error=>error.status===403);
});
test('expired access and rejected refresh do not downgrade to anon data access',async()=>{
 const {auth}=setup({cookie:{gluco_access:'expired',gluco_refresh:'invalid'}});
 await assert.rejects(auth.requireUser(),error=>error.status===401);
});
test('refresh stores protected cookies and uses renewed JWT',async()=>{
 const {auth,values}=setup({cookie:{gluco_access:'expired',gluco_refresh:'old'},identity:{id:'a'},refresh:{data:{user:{id:'a'},session:{access_token:'new-access',refresh_token:'new-refresh'}}}});
 const context=await auth.requireUser();
 assert.equal(context.accessToken,'new-access');
 assert.equal(values.get('gluco_access').options.httpOnly,true);
 assert.equal(values.get('gluco_refresh').options.sameSite,'lax');
});
test('invalid LibreLink credentials cannot create internal accounts',async()=>{
 const {auth,clients}=setup({providerFails:true});
 await assert.rejects(auth.loginUser('test@example.invalid','wrong'),/Provider denied/);
 assert.equal(clients.length,0);
});
test('logout revokes the internal refresh session and clears cookies',async()=>{
 const {auth,values,revoked}=setup({cookie:{gluco_access:'access',gluco_refresh:'refresh'},user:{id:'a'}});
 await auth.logoutUser();
 assert.deepEqual(revoked,[['access','local']]);
 assert.equal(values.has('gluco_access'),false);assert.equal(values.has('gluco_refresh'),false);
});
test('integration access requires a token mapping and stores only its digest',async()=>{
 let digest;
 const database = { from: () => ({ select: () => ({ eq: (key, value) => {
   assert.equal(key, 'token_hash'); digest = value;
   return { maybeSingle: async () => ({ data: { user_id: 'a', patient_id: 'p' } }) };
 } }) }) };
 const auth=load('src/lib/server/integration-auth.ts',{'@/lib/server/user-auth':{adminDatabase:()=>database}});
 assert.equal(await auth.integrationContext(new Request('https://test.invalid')),null);
 const result=await auth.integrationContext(new Request('https://test.invalid',{headers:{authorization:'Bearer secret-token'}}));
 assert.equal(result.userId,'a');assert.equal(result.patientId,'p');assert.match(digest,/^[a-f0-9]{64}$/);assert.notEqual(digest,'secret-token');
});

test('logout with expired access revokes the renewed session', async () => {
 const {auth,values,revoked}=setup({cookie:{gluco_access:'expired',gluco_refresh:'refresh'},refresh:{data:{session:{access_token:'renewed'}}}});
 await auth.logoutUser();
 assert.deepEqual(revoked,[['renewed','local']]);
 assert.equal(values.has('gluco_refresh'),false);
});
test('logout clears local cookies even when refresh is rejected', async () => {
 const {auth,values}=setup({cookie:{gluco_access:'expired',gluco_refresh:'invalid'}});
 await assert.rejects(auth.logoutUser(),/revocar/);
 assert.equal(values.has('gluco_access'),false);
 assert.equal(values.has('gluco_refresh'),false);
});

function loginSetup() {
 const cookie=new Map(), users=new Map(), identities=new Map(), sessions=new Map(), links=new Set();
 const created=[], removed=[], queries=[];
 const jar={get:key=>cookie.has(key)?{value:cookie.get(key)}:undefined,set:(key,value)=>cookie.set(key,value),delete:key=>cookie.delete(key)};
 let sequence=0, connections=[{patientId:'shared-patient'}];
 const auth=load('src/lib/server/user-auth.ts',{
  'next/headers':{cookies:async()=>jar},
  '@/lib/librelink':{LibreLinkUpClient:class {
   constructor(email,password,region,token,userId){ Object.assign(this,{email,password,region,token,userId}); }
   async login(){ assert.equal(this.password,'valid');this.userId=this.email;this.token=`provider-${this.email}`; }
   async getConnections(){return connections;}
   getSession(){return {userId:this.userId,token:this.token,region:'test'};}
  }},
  '@supabase/supabase-js':{createClient:(_url,key,options)=>({
   auth:{
    getUser:async token=>({data:{user:users.get(token.replace('access-',''))??null}}),
    verifyOtp:async({token_hash,type})=>{
     assert.equal(type,'email');const user=users.get(token_hash);
     return {data:{user,session:{access_token:`access-${user.id}`,refresh_token:`refresh-${user.id}`}}};
    },
    admin:{
     createUser:async data=>{const user={id:`internal-${++sequence}`,email:data.email};users.set(user.id,user);created.push(data);return {data:{user}};},
     deleteUser:async id=>{removed.push(id);users.delete(id);return {};},
     getUserById:async id=>({data:{user:users.get(id)}}),
     generateLink:async({type,email})=>{assert.equal(type,'magiclink');const user=[...users.values()].find(u=>u.email===email);return {data:{properties:{hashed_token:user.id}}};},
    }
   },
   from:table=>{
    const filters={};
    const query={
     select:()=>query,
     eq:(field,value)=>{filters[field]=value;return query;},
     maybeSingle:async()=>({data:identities.get(filters.librelink_user_id)??null}),
     single:async()=>{
      queries.push({table,key,authorization:options.global?.headers.Authorization});
      if(table==='app_users')return {data:[...identities.values()].find(u=>u.id===filters.id)};
      if(table==='user_provider_sessions')return {data:sessions.get(filters.user_id)};
      throw new Error(`Unexpected table: ${table}`);
     },
     insert:async row=>{assert.equal(table,'app_users');identities.set(row.librelink_user_id,row);return {};},
     upsert:async row=>{
      if(table==='user_patients')links.add(`${row.user_id}:${row.patient_id}`);
      else if(table==='user_provider_sessions')sessions.set(row.user_id,row);
      else throw new Error(`Unexpected write: ${table}`);
      return {};
     },
    };return query;
   }
  })}
 });
 return {auth,created,removed,identities,sessions,links,queries,setConnections:value=>connections=value};
}
test('successful provider login creates private identity and reuses it on subsequent logins', async()=>{
 const state=loginSetup();
 const first=await state.auth.loginUser('account-a','valid');
 const second=await state.auth.loginUser('account-a','valid');
 assert.equal(first.userId,second.userId);
 assert.equal(state.created.length,1);
 assert.match(state.created[0].email,/@identity\.glucodata\.invalid$/);
 assert.equal(state.created[0].password,undefined);
 assert.ok(state.links.has(`${first.userId}:shared-patient`));
 assert.equal(state.sessions.get(first.userId).librelink_user_id,'account-a');
 assert.ok(state.queries.filter(q=>q.table==='app_users').every(q=>q.key==='anon-test' && q.authorization===`Bearer access-${first.userId}`));
});
test('explicit credentials switch account even with another valid internal session',async()=>{
 const state=loginSetup();
 const a=await state.auth.loginUser('account-a','valid');
 const b=await state.auth.libreContext('account-b','valid');
 assert.notEqual(a.userId,b.userId);
 assert.equal(b.patientId,'shared-patient');
 assert.equal(state.sessions.size,2);
 assert.equal((await state.auth.requireUser()).userId,b.userId);
 assert.equal(state.sessions.get(a.userId).token,'provider-account-a');
 assert.equal(state.sessions.get(b.userId).token,'provider-account-b');
});
test('revoked provider patient access is rejected without choosing a different patient',async()=>{
 const state=loginSetup();
 await state.auth.loginUser('account-a','valid');
 state.setConnections([{patientId:'different-patient'}]);
 await assert.rejects(state.auth.libreContext(),error=>error.status===403);
});
test('provider account without connected patients cannot create an internal identity',async()=>{
 const state=loginSetup();state.setConnections([]);
 await assert.rejects(state.auth.loginUser('account-a','valid'),error=>error.status===403);
 assert.equal(state.created.length,0);
});
