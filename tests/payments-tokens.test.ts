import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { tokenUnits, tokens } from '../src/lib/tokens';
import { PLANS } from '../src/lib/plans';
import { validatePlan, effectiveTerms, planCatalog } from '../src/lib/plan-catalog';
import { applyPayment, createCheckout, verifyPayment, type PaymentOrder } from '../src/lib/payments';
import { amountKop, confirmationUrl, type YooPayment } from '../src/lib/yookassa';
import { withUsage } from '../src/lib/billing';
import { charge, refund, InsufficientFunds } from '../src/lib/wallet';
import { seal } from '../src/lib/crypto';
import { one, q } from '../src/lib/db';

describe('token and payment validation', () => {
  it('validates product tokens and RUB amounts without floating point parsing', () => {
    assert.equal(tokenUnits(260),26000); assert.match(tokens(125),/1,25 ток/);
    for(const n of [-1,NaN,Infinity,1e20]) assert.throws(()=>tokenUnits(n));
    assert.equal(amountKop('2990.00'),299000);
    for(const n of ['1e3','29.9','-1.00','Infinity']) assert.throws(()=>amountKop(n));
  });
  it('validates tariff limits and prevents repeated free grants', () => {
    assert.equal(validatePlan(PLANS.start,'start').tokens,260);
    for(const p of [{...PLANS.start,tokens:-2},{...PLANS.start,brands:-1},{...PLANS.start,capabilities:['fake']}]) assert.throws(()=>validatePlan(p,'start'));
    assert.throws(()=>validatePlan({...PLANS.free,unlimitedModels:['model-a']},'free'));
  });
  it('rejects untrusted checkout URLs',()=>{
    assert.equal(confirmationUrl('https://yoomoney.ru/checkout'),'https://yoomoney.ru/checkout');
    for(const u of ['https://yoomoney.ru.evil.test/x','javascript:alert(1)','http://yoomoney.ru','https://u:p@yoomoney.ru']) assert.throws(()=>confirmationUrl(u));
  });
});
describe('PostgreSQL payment and token accounting',()=>{
  let db:PGlite,org:string,user:string,previousPool:unknown;
  const payment=(o:PaymentOrder,patch:Partial<YooPayment>={}):YooPayment=>({id:o.provider_id!,status:'succeeded',paid:true,test:o.test_mode,amount:{value:(Number(o.amount_kop)/100).toFixed(2),currency:'RUB'},metadata:{order_id:o.id,org_id:o.org_id},recipient:{account_id:o.shop_id},...patch});
  async function order(test=false){return (await q<PaymentOrder>("insert into kz_payment_orders(org_id,user_id,request_key,provider_id,shop_id,test_mode,amount_kop,plan_key,terms,receipt_email,request_body) values($1,$2,$3,$4,'12345',$5,299000,'start',$6::jsonb,'t@example.org','{}') returning *",[org,user,randomUUID(),randomUUID(),test,JSON.stringify(validatePlan(PLANS.start,'start'))]))[0];}
  before(async()=>{
    db=await PGlite.create();
    await db.exec(`create table kz_users(id uuid primary key default gen_random_uuid());
      create table kz_orgs(id uuid primary key default gen_random_uuid(),plan text default 'free',balance_kop bigint not null default 0,unlimited boolean default false,unlimited_until timestamptz);
      create table kz_wallet_tx(id uuid primary key default gen_random_uuid(),org_id uuid references kz_orgs(id),amount_kop bigint not null,reason text not null,ref text,action text,bonus_part bigint default 0,credit_kind text,created_at timestamptz default now());
      create table kz_platform_settings(key text primary key,value jsonb,updated_at timestamptz default now());
      create table kz_ai_usage(org_id uuid,ref text,no_revenue text,created_at timestamptz default now());
      create table kz_price_overrides(key text,kop bigint);`);
    await db.exec(await readFile(new URL('../db/036_payments_tokens.sql',import.meta.url),'utf8'));
    let tail=Promise.resolve();
    const connect=async()=>{const prev=tail;let release!:()=>void;tail=new Promise<void>(r=>release=r);await prev;return {query:(sql:string,params:unknown[]=[])=>db.query(sql,params),release};};
    const g=globalThis as unknown as {_pool:unknown};previousPool=g._pool;
    g._pool={connect,async query(sql:string,params:unknown[]=[]){const c=await connect();try{return await c.query(sql,params);}finally{c.release();}}};
    org=(await one<{id:string}>('insert into kz_orgs default values returning id'))!.id;
    user=(await one<{id:string}>('insert into kz_users default values returning id'))!.id;
  });
  after(async()=>{(globalThis as unknown as {_pool:unknown})._pool=previousPool;await db.close();});
  it('credits once across concurrent repeated notifications',async()=>{
    const o=await order(),p=payment(o);await Promise.all([applyPayment(p),applyPayment(p),applyPayment(p)]);
    const r=(await one<{balance_kop:string;token_value_kop:string;n:string}>('select balance_kop,token_value_kop,(select count(*) from kz_wallet_tx where ref=$2) n from kz_orgs where id=$1',[org,o.id]))!;
    assert.equal(Number(r.balance_kop),26000);assert.equal(Number(r.token_value_kop),299000);assert.equal(Number(r.n),1);
  });
  it('rejects forged amount, tenant, store, test flag and provider ID',async()=>{
    const o=await order(),p=payment(o);
    for(const patch of [{amount:{value:'1.00',currency:'RUB'}},{metadata:{order_id:o.id,org_id:randomUUID()}},{recipient:{account_id:'other'}},{test:true},{id:randomUUID()}]){
      assert.throws(()=>verifyPayment(o,{...p,...patch}));await assert.rejects(()=>applyPayment({...p,...patch}));
    }
    assert.equal((await one<{credited_at:string|null}>('select credited_at from kz_payment_orders where id=$1',[o.id]))!.credited_at,null);
  });
  it('sandbox and canceled payments never grant live tokens',async()=>{
    const prev=await one('select balance_kop,plan,plan_until from kz_orgs where id=$1',[org]);
    const o=await order();await applyPayment(payment(o,{status:'canceled',paid:false}));
    await applyPayment(payment(await order(true)));
    assert.deepEqual(await one('select balance_kop,plan,plan_until from kz_orgs where id=$1',[org]),prev);
  });
  it('renewal extends the purchased period using jsonb equality',async()=>{
    const prev=(await one<{plan_until:string}>('select plan_until from kz_orgs where id=$1',[org]))!;
    await applyPayment(payment(await order()));
    const next=(await one<{plan_until:string}>('select plan_until from kz_orgs where id=$1',[org]))!;
    assert.equal(new Date(next.plan_until).getTime()-new Date(prev.plan_until).getTime(),30*86400000);
  });
  it('purchased terms survive catalog edits and expire to free',async()=>{
    const catalog=await planCatalog(),purchased=validatePlan({...PLANS.start,unlimitedModels:['cheap-model']},'start');
    const changed={...catalog,start:{...catalog.start,brands:50}};
    assert.equal(effectiveTerms(changed,{plan:'start',plan_until:new Date(Date.now()+10000),plan_terms:purchased}).brands,2);
    assert.equal(effectiveTerms(changed,{plan:'start',plan_until:'2000-01-01',plan_terms:purchased}).key,'free');
  });
  it('debits tokens, values revenue separately and refunds only once',async()=>{
    const prev=await one('select balance_kop,token_value_kop from kz_orgs where id=$1',[org]);
    await withUsage({orgId:org},async()=>{
      await charge(org,300,'Генерация: тест','material-a');
      assert.equal(Number((await one<{revenue_kop:string}>("select revenue_kop from kz_wallet_tx where org_id=$1 and amount_kop=-300 order by created_at desc limit 1",[org]))!.revenue_kop),-3450);
      await refund(org,300,'ошибка','material-a');await refund(org,300,'повтор','material-a');
    });
    assert.deepEqual(await one('select balance_kop,token_value_kop from kz_orgs where id=$1',[org]),prev);
  });
  it('unlimited applies only to an exact model in an active plan, without refund minting',async()=>{
    const terms=validatePlan({...PLANS.start,unlimitedModels:['cheap-model']},'start');
    await q("update kz_orgs set balance_kop=0,token_value_kop=0,plan_terms=$2::jsonb,plan_until=now()+interval '1 day' where id=$1",[org,JSON.stringify(terms)]);
    await withUsage({orgId:org},async()=>{
      await charge(org,300,'Генерация: безлимит','free-call','cheap-model');await refund(org,300,'ошибка','free-call');
      assert.equal(Number((await one<{balance_kop:string}>('select balance_kop from kz_orgs where id=$1',[org]))!.balance_kop),0);
      await assert.rejects(()=>charge(org,300,'Генерация: платная','paid-call','premium-model'),InsufficientFunds);
    });
    await q("update kz_orgs set plan_until=now()-interval '1 second' where id=$1",[org]);
    await assert.rejects(()=>charge(org,300,'Генерация: истёк срок','expired','cheap-model'),InsufficientFunds);
  });
  it('gift tokens are spent first and partial refunds restore the original value exactly',async()=>{
    const id=(await one<{id:string}>("insert into kz_orgs(balance_kop,token_value_kop) values(10000,100000) returning id"))!.id;
    await q("insert into kz_wallet_tx(org_id,amount_kop,reason,credit_kind,revenue_kop) values($1,2000,'gift','gift',0)",[id]);
    await withUsage({orgId:id},async()=>{
      await charge(id,3000,'Генерация: gift test','gift-call');
      const debit=(await one<{bonus_part:string;revenue_kop:string}>("select bonus_part,revenue_kop from kz_wallet_tx where org_id=$1 and amount_kop<0",[id]))!;
      assert.equal(Number(debit.bonus_part),2000);assert.equal(Number(debit.revenue_kop),-12500);
      await refund(id,1000,'частичный возврат','gift-call');await refund(id,2000,'остаток возврата','gift-call');
      assert.equal(Number((await one<{balance_kop:string}>('select balance_kop from kz_orgs where id=$1',[id]))!.balance_kop),10000);
      assert.equal(Number((await one<{token_value_kop:string}>('select token_value_kop from kz_orgs where id=$1',[id]))!.token_value_kop),100000);
    });
  });
  it('composite operations require every billed model to be unlimited',async()=>{
    const terms=validatePlan({...PLANS.start,unlimitedModels:['cheap-model']},'start');
    await q("update kz_orgs set balance_kop=0,token_value_kop=0,plan_terms=$2::jsonb,plan_until=now()+interval '1 day' where id=$1",[org,JSON.stringify(terms)]);
    await assert.rejects(()=>charge(org,300,'Генерация: mixed','mixed',['cheap-model','premium-image']),InsufficientFunds);
  });
  it('rerunning the bootstrap migration cannot revalue purchased token balances',async()=>{
    const before=await one('select token_value_kop,balance_kop from kz_orgs where id=$1',[org]);
    await db.exec(await readFile(new URL('../db/036_payments_tokens.sql',import.meta.url),'utf8'));
    assert.deepEqual(await one('select token_value_kop,balance_kop from kz_orgs where id=$1',[org]),before);
  });
  it('checkout retry reuses the exact stored body and idempotency key',async()=>{
    await q("insert into kz_platform_settings(key,value) values('yookassa',$1::jsonb)",[JSON.stringify({enabled:true,shopId:'12345',credentials:seal({secret:'test_secret'}),testMode:true,origin:'https://juicerai.ru',receipt:true,vatCode:1})]);
    const oldFetch=globalThis.fetch,requests:string[]=[],id=randomUUID(),key=randomUUID();
    globalThis.fetch=async(_input,init)=>{const body=JSON.parse(String(init?.body));requests.push(String(init?.body));assert.equal((init?.headers as Record<string,string>)['Idempotence-Key'],key);assert.equal(body.receipt.customer.email,'user@example.org');return new Response(JSON.stringify({id,status:'pending',paid:false,test:true,amount:body.amount,metadata:body.metadata,recipient:{account_id:'12345'},confirmation:{confirmation_url:'https://yoomoney.ru/checkout'}}),{status:200});};
    try{
      assert.equal((await createCheckout(org,user,'user@example.org','start',key)).url,'https://yoomoney.ru/checkout');
      assert.equal((await one<PaymentOrder>('select * from kz_payment_orders where request_key=$1',[key]))!.provider_id,id);
      await q('update kz_payment_orders set provider_id=null where request_key=$1',[key]);
      await createCheckout(org,user,'different@example.org','start',key);
      assert.equal(requests[0],requests[1]);assert.equal(Number((await one<{n:string}>('select count(*) n from kz_payment_orders where request_key=$1',[key]))!.n),1);
    }finally{globalThis.fetch=oldFetch;}
  });
});
