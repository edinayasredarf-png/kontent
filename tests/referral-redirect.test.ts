import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {NextRequest} from 'next/server';
import {GET as referral} from '../src/app/r/[code]/route';
import {GET as startLogin} from '../src/app/api/oauth/[provider]/start/route';
import {GET as callback} from '../src/app/api/oauth/[provider]/callback/route';
import {SITE} from '../src/lib/site';
import {createAccount} from '../src/lib/auth';

test('referral redirects from container origin to public registration and preserves an HTTP-only 30-day code',async()=>{
 const req=new NextRequest('https://0.0.0.0:3000/r/abc234',{headers:{host:'0.0.0.0:3000','x-forwarded-host':'untrusted.example'}});
 const res=await referral(req,{params:Promise.resolve({code:'abc234'})});
 assert.equal(res.headers.get('location'),new URL('/register',SITE).href);
 assert.equal(res.headers.get('cache-control'),'no-store');
 const cookie=res.cookies.get('lt_ref');assert.equal(cookie?.value,'abc234');
 const header=res.headers.get('set-cookie')??'';assert.match(header,/HttpOnly/i);assert.match(header,/SameSite=lax/i);assert.match(header,/Max-Age=2592000/i);assert.match(header,/Path=\//i);
 const invalid=await referral(req,{params:Promise.resolve({code:'invalid%0d%0a'})});assert.equal(invalid.cookies.get('lt_ref'),undefined);
});
test('authorization error redirects also ignore the internal container hostname',async()=>{
 const req=new NextRequest('http://0.0.0.0:3000/api/oauth/unknown/callback');
 for(const handler of [startLogin,callback]){
  const res=await handler(req,{params:Promise.resolve({provider:'unknown'})});assert.equal(new URL(res.headers.get('location')!).origin,new URL(SITE).origin);assert.equal(new URL(res.headers.get('location')!).pathname,'/login');
 }
});
test('the code saved by referral navigation binds a new account and records exactly one signup',async()=>{
 const db=await PGlite.create();
 try{
  await db.exec(await readFile(new URL('../db/adminer-schema.sql',import.meta.url),'utf8'));
  const {rows:[inviter]}=await db.query<{id:string}>("insert into kz_users(email,name,password_hash,ref_code) values('inviter@example.test','Inviter','hash','abc234') returning id");
  const res=await referral(new NextRequest('http://0.0.0.0:3000/r/abc234'),{params:Promise.resolve({code:'abc234'})});
  const run=(async(sql:string,args:unknown[]=[])=> (await db.query(sql,args)).rows) as Parameters<typeof createAccount>[0];
  const session=await createAccount(run,'new@example.test','New','password hash','New organization',{refCode:res.cookies.get('lt_ref')?.value,consent:true});
  const {rows:[user]}=await db.query<{referred_by:string}>('select referred_by from kz_users where id=$1',[session.uid]);assert.equal(user.referred_by,inviter.id);
  const events=await db.query<{referrer_id:string;referred_id:string;kind:string}>("select referrer_id,referred_id,kind from kz_referral_events where referred_id=$1",[session.uid]);assert.equal(events.rows.length,1);assert.equal(events.rows[0].referrer_id,inviter.id);assert.equal(events.rows[0].kind,'signup');
 }finally{await db.close();}
});
