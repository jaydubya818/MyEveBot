import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {Client,Pool} from "pg";
import {localTelegramQualificationChannel,sendQualifiedTelegramReply} from "../agent/channels/telegram.ts";
import {TelegramOwnerReceiptStore,telegramHash} from "../lib/telegram-owner-receipts.ts";
import {loadMigrations,runMigrations} from "../scripts/migration-runner.ts";

const url=new URL(process.env.TELEGRAM_TEST_ADMIN_URL??"postgresql://postgres@127.0.0.1:55471/postgres");
assert.equal(url.hostname,"127.0.0.1");
assert.equal(url.port,"55471");
assert.equal(url.pathname,"/postgres");
const priorFlag=process.env.MYEVE_TELEGRAM_LOCAL_QUALIFICATION;
process.env.MYEVE_TELEGRAM_LOCAL_QUALIFICATION="true";
const admin=new Client({connectionString:url.href});
await admin.connect();
const name=`telegram_receipts_${randomBytes(8).toString("hex")}`;
let pool;
try {
  await admin.query(`CREATE DATABASE ${name}`);
  url.pathname=`/${name}`;
  pool=new Pool({connectionString:url.href});
  const migrationClient=await pool.connect();
  try {
    await runMigrations({query:async(sql,params)=>(await migrationClient.query(sql,params)).rows,
      transaction:async statements=>{
        await migrationClient.query("BEGIN");
        try {for(const statement of statements)await migrationClient.query(statement.sql,statement.params);
          await migrationClient.query("COMMIT");}
        catch(error){await migrationClient.query("ROLLBACK");throw error;}
      }},await loadMigrations());
  } finally {migrationClient.release();}

  const database={query:async(sql,params)=>(await pool.query(sql,params)).rows};
  const env={NODE_ENV:"test",MYEVE_TELEGRAM_LOCAL_QUALIFICATION:"true",MYEVE_OWNER_ID:"owner-a",
    TELEGRAM_BOT_TOKEN:"123456:fixture-bot",TELEGRAM_PROACTIVE_CHAT_ID:"12345678",
    TELEGRAM_ALLOWED_USER_IDS:"12345678",TELEGRAM_BOT_USERNAME:"sofie_fixture"};
  const credentials={botToken:env.TELEGRAM_BOT_TOKEN,webhookSecretToken:"fixture-secret"};
  const update=(messageId,text="Hi Sofie")=>({update_id:messageId+100,message:{message_id:messageId,
    chat:{id:12345678,type:"private"},from:{id:12345678,is_bot:false},text}});
  const deliveries=[],providerWrites=[],remembered=[];
  let providerFails=false;
  const api={fetch:async(url,init)=>{
    const method=String(url).split("/").at(-1),body=JSON.parse(init.body);
    if(method==="sendMessage"){
      providerWrites.push(body);
      if(providerFails)throw Error("simulated provider timeout after possible send");
      return Response.json({ok:true,result:{message_id:88,chat:{id:12345678,type:"private"},text:body.text}});
    }
    return Response.json({ok:true,result:true});
  }};
  const newChannel=()=>{
    const receipts=new TelegramOwnerReceiptStore(database);
    return {receipts,channel:localTelegramQualificationChannel({env,credentials,api,receipts,
      rememberChat:async chatId=>{remembered.push(chatId);}})};
  };
  async function webhook(instance,message) {
    const background=[];
    const request=new Request("http://localhost/eve/v1/telegram",{method:"POST",headers:{
      "content-type":"application/json","x-telegram-bot-api-secret-token":credentials.webhookSecretToken},
      body:JSON.stringify(message)});
    const response=await instance.channel.routes[0].handler(request,{
      from:()=>new Proxy({}, {get:(_target,key)=>typeof key==="symbol"?async(payload,options)=>{
        deliveries.push({payload,options});
        const context=instance.channel.adapter.createAdapterContext({state:options.state,session:{},ctx:{}});
        await sendQualifiedTelegramReply({auth:options.auth,text:"One synthetic Sofie reply",store:instance.receipts,
          env,botToken:credentials.botToken,post:text=>context.telegram.post(text)});
      }:undefined}),
      waitUntil:promise=>background.push(promise),params:{},requestIp:"127.0.0.1",
    });
    await Promise.all(background);
    return response;
  }

  // A new adapter and store share only PostgreSQL, as after a worker restart.
  const first=newChannel(),restarted=newChannel();
  assert.equal((await webhook(first,update(44))).status,200);
  assert.equal((await webhook(restarted,update(44))).status,200);
  assert.equal(deliveries.length,1);
  assert.equal(providerWrites.length,1);
  assert.deepEqual(remembered,["12345678","12345678"]);
  const auth=deliveries[0].options.auth;
  const key={ownerId:"owner-a",botId:"123456",chatId:"12345678",messageId:"44",
    payloadHash:auth.attributes.telegramPayloadHash};
  assert.equal((await restarted.receipts.get(key)).status,"REPLIED");
  assert.equal((await restarted.receipts.get(key)).providerMessageId,"88");
  await assert.rejects(restarted.receipts.claimInbound({...key,payloadHash:telegramHash("different body")}),
    /identity changed/);
  assert.equal(await restarted.receipts.claimInbound({...key,ownerId:"owner-b"}),true);

  // An inbound claim makes a possibly-dispatched turn explicit. Restart does
  // not infer that it is safe to dispatch a second turn.
  const unknown={...key,messageId:"45",payloadHash:telegramHash("new inbound")};
  assert.equal(await first.receipts.claimInbound(unknown),true);
  assert.equal((await new TelegramOwnerReceiptStore(database).get(unknown)).status,"DISPATCH_UNKNOWN");
  assert.equal(await restarted.receipts.claimInbound(unknown),false);
  assert.equal(await restarted.receipts.claimReply(unknown,telegramHash("reply")),true);
  assert.equal((await new TelegramOwnerReceiptStore(database).get(unknown)).status,"REPLY_UNKNOWN");
  assert.equal(await first.receipts.claimReply(unknown,telegramHash("reply")),false);
  await assert.rejects(first.receipts.claimReply(unknown,telegramHash("changed reply")),/binding changed/);

  // Timeout may occur after Telegram accepted the send. Keep the one durable
  // attempt UNKNOWN and suppress a second provider write on duplicate ingress.
  providerFails=true;
  await webhook(first,update(46));
  providerFails=false;
  const dispatchCount=deliveries.length,writeCount=providerWrites.length;
  assert.equal((await webhook(restarted,update(46))).status,200);
  assert.equal(deliveries.length,dispatchCount);
  assert.equal(providerWrites.length,writeCount);
  const failedAuth=deliveries.at(-1).options.auth;
  const failedKey={ownerId:"owner-a",botId:"123456",chatId:"12345678",messageId:"46",
    payloadHash:failedAuth.attributes.telegramPayloadHash};
  assert.equal((await restarted.receipts.get(failedKey)).status,"REPLY_UNKNOWN");
  assert.equal((await restarted.receipts.get(failedKey)).providerMessageId,null);
  console.log("Telegram owner PostgreSQL qualification: 49 migrations, restart, exact claim, duplicate suppression, ambiguous reply custody passed");
} finally {
  await pool?.end();
  url.pathname="/postgres";
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
  if(priorFlag===undefined)delete process.env.MYEVE_TELEGRAM_LOCAL_QUALIFICATION;
  else process.env.MYEVE_TELEGRAM_LOCAL_QUALIFICATION=priorFlag;
}
