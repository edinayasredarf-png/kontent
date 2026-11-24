import {tx} from "./db";
import {open,seal} from "./crypto";
import {creds} from "./oauth";
import {randomBytes} from "node:crypto";
import {call as vkCall} from "./publishing/vk";
import {SITE} from "./site";

/** Reload under a lock even when the caller has cached credentials. A reconnect or another worker may have replaced them. */
export async function vkChannelCredentials(orgId:string,channelId:string,_encrypted:unknown,options:{force?:boolean;rejectedToken?:string}={}) {
 return tx(async run=>{
  // Serialize rotating credentials shared by several channels of this organization.
  await run("select id from kz_orgs where id=$1 for update",[orgId]);
  const rows=await run<{id:string;brand_id:string;credentials:unknown}>("select id,brand_id,credentials from kz_channels where org_id=$1 and kind='vk' for update",[orgId]);
  const row=rows.find(r=>r.id===channelId);if(!row)throw new Error("Канал VK удалён");
  let current=open(row.credentials);
  const target=(current.target??'').replace(/^-/,'');
  // Legacy duplicate rows can still be referenced by factories. Reuse only an
  // already-authorized connection to the same community within the same brand.
  const candidates=rows.filter(r=>r.brand_id===row.brand_id).map(r=>open(r.credentials)).filter(c=>c.oauth==='vk'&&c.photoToken&&(c.target??'').replace(/^-/,'')===target).sort((a,b)=>Number(b.expiresAt||0)-Number(a.expiresAt||0));
  if(current.oauth!=='vk'&&candidates[0]){
   current={...candidates[0],target:current.target};
   await run("update kz_channels set credentials=$3 where id=$1 and org_id=$2",[channelId,orgId,JSON.stringify(seal(current))]);
  }
  if(current.oauth!=='vk')return current;
  const alreadyReplaced=!!options.rejectedToken&&current.photoToken!==options.rejectedToken;
  if((!options.force||alreadyReplaced)&&current.photoToken&&Number(current.expiresAt)>Date.now()+300000)return current;
  const client=creds('vk');
  if(!current.refreshToken||!current.deviceId||!client)throw new Error("Не удалось продлить доступ VK автоматически. Подключите VK повторно в настройках канала.");
  const state=randomBytes(24).toString('hex');
  const response=await fetch(`${(process.env.VK_ID_BASE?.trim()||'https://id.vk.ru').replace(/\/+$/,'')}/oauth2/auth`,{
   method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(20000),
   body:new URLSearchParams({grant_type:'refresh_token',refresh_token:current.refreshToken,client_id:client.id,device_id:current.deviceId,redirect_uri:`${SITE}/api/oauth/vk/callback`,state}),
  });
  const token=await response.json() as {access_token?:string;refresh_token?:string;expires_in?:number;state?:string};
  if(!response.ok||!token.access_token||token.state&&token.state!==state)throw new Error("VK не разрешил продлить доступ автоматически. Подключите VK повторно: прежний доступ истёк или отозван.");
  const updated:Record<string,string>={...current,token:token.access_token,photoToken:token.access_token,refreshToken:token.refresh_token||current.refreshToken,expiresAt:String(Date.now()+Number(token.expires_in||3600)*1000)};
  // Update siblings that share the same rotating grant, retaining their target.
  for(const sibling of rows){
   const c=sibling.id===channelId?current:open(sibling.credentials);
   if(sibling.id!==channelId&&(c.oauth!=='vk'||c.refreshToken!==current.refreshToken||c.deviceId!==current.deviceId))continue;
   const value={...c,...updated,target:c.target};
   await run("update kz_channels set credentials=$3 where id=$1 and org_id=$2",[sibling.id,orgId,JSON.stringify(seal(value))]);
  }
  return updated;
 });
}
/** Repair rejected photo access before wall.post; never replay an uncertain publication. */
export async function vkPublishingCredentials(orgId:string,channelId:string,encrypted:unknown,withPhotos:boolean) {
 let value=await vkChannelCredentials(orgId,channelId,encrypted);
 if(!withPhotos||value.oauth!=='vk')return value;
 const verify=()=>vkCall(value.photoToken||value.token,'photos.getWallUploadServer',{group_id:value.target.replace(/^-/,'')});
 try{await verify();return value;}
 catch(error){
  if(!/код (5|27|28)\)/.test((error as Error).message))throw error;
  value=await vkChannelCredentials(orgId,channelId,encrypted,{force:true,rejectedToken:value.photoToken||value.token});
  try{await verify();return value;}
  catch{throw new Error("VK не подтвердил пользовательский доступ для фотографий после автоматического обновления. Подключите VK повторно, подтвердив права на фотографии и публикации.");}
 }
}
