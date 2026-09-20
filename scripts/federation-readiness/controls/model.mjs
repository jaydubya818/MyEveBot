/** Qualification-only direct Claude API adapter. Price evidence must be reviewed
 * for the exact test window. Not a provider account-wide billing cap.
 * Full 200K context at $1/MTok + 800 output at $5/MTok = $0.204,
 * below the durable $0.25 reservation even without estimating input tokens.
 * No cache writes, tools, thinking, attachments, batch, retries or model aliases. */
export function haikuQualificationModel({authority,credential,pricingReviewedUntil,request=fetch,clock=Date.now}) {
 if(typeof credential!=='string'||!credential||!Number.isFinite(pricingReviewedUntil)||pricingReviewedUntil<=clock()||pricingReviewedUntil>clock()+3600000)throw Error('MODEL_PRICE_REVIEW_REQUIRED');
 let key=credential;
 return {
  verifiedLiabilityReference:'claude_haiku_4_5_20251001_standard_204000_microusd',
  disable(){key='';return true;},
  async invoke(input,signal,operation){
   if(!key||clock()>=pricingReviewedUntil||typeof input!=='string'||Buffer.byteLength(input)>16000)throw Error('MODEL_INPUT_DENIED');
   // Reservation is made by Controller.modelCall before entering this function.
   if(typeof operation!=='string')throw Error('MODEL_OPERATION_REQUIRED');
   await authority.http(operation+'_provider');
   const response=await request('https://api.anthropic.com/v1/messages',{method:'POST',redirect:'error',signal,headers:{'content-type':'application/json','anthropic-version':'2023-06-01','x-api-key':key},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:800,stream:false,service_tier:'standard_only',messages:[{role:'user',content:input}]})});
   const chunks=[];let bytes=0;for await(const chunk of response.body??[]){bytes+=chunk.length;if(bytes>131072)throw Error('MODEL_RESPONSE_TOO_LARGE');chunks.push(Buffer.from(chunk));}
   await authority.complete(operation+'_provider');
   if(!response.ok)throw Error('MODEL_PROVIDER_DENIED');
   const result=JSON.parse(Buffer.concat(chunks).toString()),usage=result.usage;
   if(result.model!=='claude-haiku-4-5-20251001'||!usage||!Number.isSafeInteger(usage.input_tokens)||usage.input_tokens<0||usage.input_tokens>200000||!Number.isSafeInteger(usage.output_tokens)||usage.output_tokens<0||usage.output_tokens>800||usage.cache_creation_input_tokens>0||usage.cache_read_input_tokens>0||!Array.isArray(result.content)||result.content.some(x=>x.type!=='text'||typeof x.text!=='string'))throw Error('MODEL_USAGE_UNCONFIRMED');
   return {text:result.content.map(x=>x.text).join(''),actualMicrousd:usage.input_tokens+5*usage.output_tokens};
  },
 };
}
