import {createHash} from "node:crypto";
import {db} from "../agent/lib/receipts-db.ts";

type ReceiptStatus="DISPATCH_UNKNOWN"|"TURN_STARTED"|"REPLY_UNKNOWN"|"REPLIED";
export interface TelegramOwnerReceiptKey {
  ownerId:string;botId:string;chatId:string;messageId:string;payloadHash:string;
}
export interface TelegramOwnerReceipt extends TelegramOwnerReceiptKey {
  status:ReceiptStatus;replyTextHash:string|null;providerMessageId:string|null;
}
interface Database {query(sql:string,params:unknown[]):Promise<Record<string,unknown>[]>}
const numericId=/^[1-9]\d{0,18}$/;
const botIdPattern=/^\d{6,20}$/;
const hashPattern=/^sha256:[0-9a-f]{64}$/;
export const telegramHash=(value:unknown)=>`sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

function valid(key:TelegramOwnerReceiptKey) {
  if(!key.ownerId.trim()||!botIdPattern.test(key.botId)||!numericId.test(key.chatId)||
    !numericId.test(key.messageId)||!hashPattern.test(key.payloadHash))
    throw new Error("Exact owner Telegram receipt identity is required.");
}
function values(key:TelegramOwnerReceiptKey) {return [key.ownerId,key.botId,key.chatId,key.messageId,key.payloadHash];}

/** One durable ingress claim and one durable reply claim. A crash leaves UNKNOWN;
 * no retry interprets absence of a provider receipt as permission to resend. */
export class TelegramOwnerReceiptStore {
  constructor(private readonly database:Database=db() as unknown as Database) {}
  async get(key:TelegramOwnerReceiptKey):Promise<TelegramOwnerReceipt|null> {
    valid(key);
    const [row]=await this.database.query(`SELECT owner_id,bot_id,chat_id,message_id,payload_hash,status,reply_text_hash,provider_message_id
      FROM telegram_owner_inbound_receipts WHERE owner_id=$1 AND bot_id=$2 AND chat_id=$3 AND message_id=$4`,values(key).slice(0,4));
    if(!row)return null;
    return {ownerId:String(row.owner_id),botId:String(row.bot_id),chatId:String(row.chat_id),messageId:String(row.message_id),
      payloadHash:String(row.payload_hash),status:row.status as ReceiptStatus,
      replyTextHash:row.reply_text_hash===null?null:String(row.reply_text_hash),
      providerMessageId:row.provider_message_id===null?null:String(row.provider_message_id)};
  }
  async claimInbound(key:TelegramOwnerReceiptKey):Promise<boolean> {
    valid(key);
    const rows=await this.database.query(`INSERT INTO telegram_owner_inbound_receipts
      (owner_id,bot_id,chat_id,message_id,payload_hash,status)
      VALUES($1,$2,$3,$4,$5,'DISPATCH_UNKNOWN') ON CONFLICT DO NOTHING RETURNING message_id`,values(key));
    if(rows.length)return true;
    const previous=await this.get(key);
    if(!previous||previous.payloadHash!==key.payloadHash)throw new Error("Telegram message identity changed or receipt is unavailable.");
    return false;
  }
  async markTurnStarted(key:TelegramOwnerReceiptKey):Promise<void> {
    valid(key);
    await this.database.query(`UPDATE telegram_owner_inbound_receipts SET status='TURN_STARTED',updated_at=now()
      WHERE owner_id=$1 AND bot_id=$2 AND chat_id=$3 AND message_id=$4 AND payload_hash=$5 AND status='DISPATCH_UNKNOWN'`,values(key));
  }
  async claimReply(key:TelegramOwnerReceiptKey,replyTextHash:string):Promise<boolean> {
    valid(key);if(!hashPattern.test(replyTextHash))throw new Error("Exact reply hash required.");
    const rows=await this.database.query(`UPDATE telegram_owner_inbound_receipts
      SET status='REPLY_UNKNOWN',reply_text_hash=$6,updated_at=now()
      WHERE owner_id=$1 AND bot_id=$2 AND chat_id=$3 AND message_id=$4 AND payload_hash=$5
        AND status IN ('DISPATCH_UNKNOWN','TURN_STARTED') RETURNING message_id`,[...values(key),replyTextHash]);
    if(rows.length)return true;
    const previous=await this.get(key);
    if(!previous||previous.payloadHash!==key.payloadHash||
      (previous.replyTextHash!==null&&previous.replyTextHash!==replyTextHash))
      throw new Error("Telegram reply binding changed or receipt is unavailable.");
    return false;
  }
  async confirmReply(key:TelegramOwnerReceiptKey,replyTextHash:string,providerMessageId:string):Promise<void> {
    valid(key);
    if(!hashPattern.test(replyTextHash)||!numericId.test(providerMessageId))throw new Error("Exact Telegram provider reply receipt required.");
    const rows=await this.database.query(`UPDATE telegram_owner_inbound_receipts
      SET status='REPLIED',provider_message_id=$7,updated_at=now()
      WHERE owner_id=$1 AND bot_id=$2 AND chat_id=$3 AND message_id=$4 AND payload_hash=$5
        AND status='REPLY_UNKNOWN' AND reply_text_hash=$6 RETURNING message_id`,[...values(key),replyTextHash,providerMessageId]);
    if(!rows.length)throw new Error("Telegram reply is unknown or already confirmed; reconcile before another send.");
  }
}
