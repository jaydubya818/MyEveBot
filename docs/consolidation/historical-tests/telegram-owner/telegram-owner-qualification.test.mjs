import assert from "node:assert/strict";
import test,{after} from "node:test";
import telegram, {localTelegramQualificationChannel,sendQualifiedTelegramReply} from "../agent/channels/telegram.ts";
import {telegramHash} from "../lib/telegram-owner-receipts.ts";

const priorLocalFlag=process.env.MYEVE_TELEGRAM_LOCAL_QUALIFICATION;
process.env.MYEVE_TELEGRAM_LOCAL_QUALIFICATION="true";
after(()=>{if(priorLocalFlag===undefined)delete process.env.MYEVE_TELEGRAM_LOCAL_QUALIFICATION;
  else process.env.MYEVE_TELEGRAM_LOCAL_QUALIFICATION=priorLocalFlag;});

const environment={
  NODE_ENV:"test",MYEVE_TELEGRAM_LOCAL_QUALIFICATION:"true",MYEVE_OWNER_ID:"owner-a",
  TELEGRAM_BOT_TOKEN:"123456:fixture-bot",TELEGRAM_PROACTIVE_CHAT_ID:"12345678",
  TELEGRAM_ALLOWED_USER_IDS:"12345678",TELEGRAM_BOT_USERNAME:"sofie_fixture",
};
const credentials={botToken:"123456:fixture-bot",webhookSecretToken:"fixture-webhook-secret"};
const update=(fromId=12345678,chatId=12345678,chatType="private")=>({
  update_id:300,message:{message_id:44,chat:{id:chatId,type:chatType},from:{id:fromId,is_bot:false},text:"Hi Sofie"},
});

function memoryReceipts() {
  const rows=new Map();
  const identity=key=>[key.ownerId,key.botId,key.chatId,key.messageId].join(":");
  return {
    rows,
    async claimInbound(key){const id=identity(key),prior=rows.get(id);if(prior){if(prior.payloadHash!==key.payloadHash)throw Error("identity changed");return false;}rows.set(id,{...key,status:"DISPATCH_UNKNOWN"});return true;},
    async markTurnStarted(key){const row=rows.get(identity(key));if(row?.status==="DISPATCH_UNKNOWN")row.status="TURN_STARTED";},
    async claimReply(key,hash){const row=rows.get(identity(key));if(!row||!["DISPATCH_UNKNOWN","TURN_STARTED"].includes(row.status))return false;row.status="REPLY_UNKNOWN";row.replyTextHash=hash;return true;},
    async confirmReply(key,hash,messageId){const row=rows.get(identity(key));assert.equal(row.status,"REPLY_UNKNOWN");assert.equal(row.replyTextHash,hash);row.status="REPLIED";row.providerMessageId=messageId;},
  };
}

function localHarness(overrides={},receipts=memoryReceipts(),setup={}) {
  const botCalls=[],deliveries=[],remembered=[];
  const env={...environment,...overrides};
  const channel=localTelegramQualificationChannel({env,credentials,receipts,
    api:{fetch:async (url,init)=>{
      const method=String(url).split("/").at(-1),body=JSON.parse(init.body);
      botCalls.push({method,body});
      return Response.json({ok:true,result:method==="sendChatAction"?true:{message_id:88,chat:{id:12345678,type:"private"},text:body.text}});
    }},
    rememberChat:async chatId=>{if(setup.failRemember)throw Error("simulated pre-dispatch setup failure");remembered.push(chatId);},
  });
  async function webhook(body,secret=credentials.webhookSecretToken) {
    const background=[];
    const request=new Request("http://localhost/eve/v1/telegram",{method:"POST",
      headers:{"content-type":"application/json","x-telegram-bot-api-secret-token":secret},body:JSON.stringify(body)});
    const response=await channel.routes[0].handler(request,{
      from:()=>new Proxy({}, {get:(_target,key)=>typeof key==="symbol"?async(payload,options)=>{
        deliveries.push({payload,options});
        // Synthetic Sofie turn: the real model/provider is deliberately absent.
        const context=channel.adapter.createAdapterContext({state:options.state,session:{},ctx:{}});
        await sendQualifiedTelegramReply({auth:options.auth,text:"Hello from synthetic Sofie.",store:receipts,
          env,botToken:credentials.botToken,post:text=>context.telegram.post(text)});
      }:undefined}),
      waitUntil:promise=>background.push(promise),params:{},requestIp:"127.0.0.1",
    });
    await Promise.all(background);
    return response;
  }
  return {webhook,botCalls,deliveries,remembered,receipts};
}

test("local owner DM crosses the real Eve Telegram adapter to one synthetic Sofie dispatch and fake Bot API reply",async()=>{
  const h=localHarness();
  const response=await h.webhook(update());
  assert.equal(response.status,200);
  assert.equal(h.deliveries.length,1);
  assert.equal(h.deliveries[0].options.auth.principalId,"owner-a");
  assert.equal(h.deliveries[0].options.auth.authenticator,"telegram-webhook");
  assert.equal(h.deliveries[0].options.auth.attributes.owner,"true");
  assert.equal(h.deliveries[0].payload.message,"Hi Sofie");
  assert.deepEqual(h.remembered,["12345678"]);
  assert.deepEqual(h.botCalls.filter(call=>call.method==="sendMessage").map(call=>call.body),[
    {chat_id:"12345678",text:"Hello from synthetic Sofie."},
  ]);
});

test("bad webhook secret and unauthorized private/group chats cannot dispatch or reply",async()=>{
  const h=localHarness();
  assert.equal((await h.webhook(update(),"wrong-secret")).status,401);
  assert.equal((await h.webhook(update(11111111,11111111))).status,200);
  assert.equal((await h.webhook(update(12345678,87654321))).status,200);
  assert.equal((await h.webhook(update(12345678,12345678,"group"))).status,200);
  assert.equal(h.deliveries.length,0);
  assert.equal(h.botCalls.length,0);
  assert.equal(h.remembered.length,0);
  for(const overrides of [{MYEVE_OWNER_ID:"",SOFIE_OWNER_ID:""},{TELEGRAM_BOT_TOKEN:"different-bot"},{TELEGRAM_PROACTIVE_CHAT_ID:"87654321"}]){
    const changed=localHarness(overrides);
    await changed.webhook(update());
    assert.equal(changed.deliveries.length,0);
    assert.equal(changed.botCalls.length,0);
  }
});

test("duplicate delivery after adapter restart never dispatches a second turn; mounted route stays blocked",async()=>{
  const receipts=memoryReceipts(),first=localHarness({},receipts),second=localHarness({},receipts);
  await first.webhook(update());
  await second.webhook(update());
  assert.equal(first.deliveries.length+second.deliveries.length,1);
  assert.equal(first.botCalls.filter(call=>call.method==="sendMessage").length,1);
  assert.equal(second.botCalls.filter(call=>call.method==="sendMessage").length,0);
  assert.equal(telegram.receive,undefined);
  assert.equal((await telegram.routes[0].handler()).status,503);
});

test("failed pre-dispatch setup leaves no claim, so an exact retry may dispatch",async()=>{
  const receipts=memoryReceipts(),failed=localHarness({},receipts,{failRemember:true});
  await failed.webhook(update()).catch(()=>undefined);
  assert.equal(receipts.rows.size,0);
  assert.equal(failed.deliveries.length,0);
  const retry=localHarness({},receipts);
  assert.equal((await retry.webhook(update())).status,200);
  assert.equal(retry.deliveries.length,1);
});

test("local qualification cannot be accidentally constructed in a hosted runtime",()=>{
  assert.throws(()=>localTelegramQualificationChannel({env:{...environment,VERCEL_ENV:"preview"},credentials,
    api:{fetch:async()=>Response.json({ok:true})},rememberChat:async()=>{},receipts:memoryReceipts()}),/disabled/);
});

test("reply leaf independently rejects a disabled local gate and multi-message output before custody or provider write",async()=>{
  let claims=0,posts=0;
  const store={claimReply:async()=>{claims++;return true;}};
  const auth={authenticator:"telegram-webhook",principalId:"owner-a",attributes:{owner:"true",
    telegramBotId:"123456",telegramPayloadHash:telegramHash("payload"),chat_id:"12345678",
    message_id:"44",chat_type:"private",user_id:"12345678"}};
  const options={auth,text:"One reply",store,env:environment,botToken:credentials.botToken,
    post:async()=>{posts++;return {id:"88",chatId:"12345678",chatType:"private"};}};
  delete process.env.MYEVE_TELEGRAM_LOCAL_QUALIFICATION;
  try {await assert.rejects(sendQualifiedTelegramReply(options),/disabled/);} finally {
    process.env.MYEVE_TELEGRAM_LOCAL_QUALIFICATION="true";
  }
  await assert.rejects(sendQualifiedTelegramReply({...options,text:"x".repeat(4097)}),/bounded/);
  assert.equal(claims,0);
  assert.equal(posts,0);
});
