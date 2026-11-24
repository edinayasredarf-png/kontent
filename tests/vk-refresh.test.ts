import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {seal,open} from "../src/lib/crypto";
import {vkChannelCredentials,vkPublishingCredentials} from "../src/lib/vk-channel-token";

test('VK rejects a cached key: reload actual connection, refresh before posting, sync rotating sibling grants and never borrow another brand access',async()=>{
 const db=await PGlite.create(),g=globalThis as typeof globalThis&{_pool?:unknown},previous=g._pool,oldFetch=globalThis.fetch,env={...process.env};
 const query=(sql:string,args:unknown[]=[])=>db.query(sql,args);let refreshes=0;const methods:string[]=[];
 try{
  await db.exec(await readFile(new URL('../db/adminer-schema.sql',import.meta.url),'utf8'));g._pool={query,connect:async()=>({query,release(){}})};
  process.env.VK_CLIENT_ID='54812872';process.env.VK_CLIENT_SECRET='test';process.env.APP_URL='https://juicer.test';
  globalThis.fetch=async(url,opts)=>{
   const data=new URLSearchParams(String(opts?.body));
   if(String(url).includes('/oauth2/auth')){refreshes++;assert.ok(data.get('state'));assert.ok(data.get('redirect_uri')?.endsWith('/api/oauth/vk/callback'));return new Response(JSON.stringify({access_token:'new-user',refresh_token:'rotated',expires_in:3600,state:data.get('state')}));}
   const method=String(url).split('/').pop()!;methods.push(method);assert.equal(method,'photos.getWallUploadServer');
   return new Response(JSON.stringify(data.get('access_token')==='new-user'?{response:{upload_url:'https://upload.example'}}:{error:{error_code:27,error_msg:'Group auth'}}));
  };
  const {rows:[org]}=await db.query<{id:string}>("insert into kz_orgs(name) values('Auth') returning id");
  const {rows:[brand]}=await db.query<{id:string}>("insert into kz_brands(org_id,name) values($1,'Brand') returning id",[org.id]);
  const {rows:[otherBrand]}=await db.query<{id:string}>("insert into kz_brands(org_id,name) values($1,'Other') returning id",[org.id]);
  const credentials={oauth:'vk',token:'rejected',photoToken:'rejected',target:'7',refreshToken:'old-refresh',deviceId:'same-device',expiresAt:String(Date.now()+3600000)};
  const add=async(b:string,c:Record<string,string>)=>(await db.query<{id:string}>("insert into kz_channels(org_id,brand_id,kind,title,credentials) values($1,$2,'vk','VK',$3::jsonb) returning id",[org.id,b,JSON.stringify(seal(c))])).rows[0].id;
  const id=await add(brand.id,credentials),sibling=await add(brand.id,{...credentials,target:'8'});
  const fresh=await vkPublishingCredentials(org.id,id,seal({token:'stale-group',target:'7'}),true);
  assert.equal(fresh.photoToken,'new-user');assert.equal(refreshes,1);assert.deepEqual(methods,['photos.getWallUploadServer','photos.getWallUploadServer']);
  const {rows:[s]}=await db.query<{credentials:unknown}>('select credentials from kz_channels where id=$1',[sibling]);assert.equal(open(s.credentials).refreshToken,'rotated');assert.equal(open(s.credentials).target,'8');
  await vkChannelCredentials(org.id,id,seal(credentials),{force:true,rejectedToken:'rejected'});assert.equal(refreshes,1);
  const legacy=await add(brand.id,{token:'group',target:'7'});assert.equal((await vkChannelCredentials(org.id,legacy,{})).photoToken,'new-user');
  const foreign=await add(otherBrand.id,{token:'other-group',target:'7'});assert.equal((await vkChannelCredentials(org.id,foreign,{})).token,'other-group');
  const {rows:[otherOrg]}=await db.query<{id:string}>("insert into kz_orgs(name) values('Other') returning id");await assert.rejects(vkChannelCredentials(otherOrg.id,id,seal(credentials)),/Канал VK удалён/);
 }finally{globalThis.fetch=oldFetch;g._pool=previous;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);await db.close();}
});
