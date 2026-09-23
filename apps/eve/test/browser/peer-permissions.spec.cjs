const {test,expect}=require('@playwright/test');
const {createHmac}=require('node:crypto');
const path=require('node:path');

test.beforeEach(async({context,page})=>{
  const now=Math.floor(Date.now()/1000);
  const payload=Buffer.from(JSON.stringify({exp:now+3600,iat:now,sub:'peer-ui-fixture',v:1})).toString('base64url');
  const signature=createHmac('sha256','local-ui-fixture-session-secret-only').update(payload).digest('base64url');
  await context.addCookies([{name:'myeve_session',value:payload+'.'+signature,url:'http://127.0.0.1:3073',httpOnly:true}]);
  await page.route('**/api/relay',route=>route.fulfill({json:{enabled:true,connection:{local_agent_id:'sofie',address:'relay://owner/sofie',status:'active',local_work_policy:{}},agents:[],knowledge:[],publications:[],grants:[],inbox:[],activity:[],receipts:[],artifacts:[],peers:[]}}));
});

for(const width of [1440,390])test(`peer policy owner review, save, reload, revoke and mobile layout at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  let relationships=[],writes=[];
  await page.route('**/api/relay/peer-permissions',async route=>{
    if(route.request().method()==='POST'){
      const command=route.request().postDataJSON();writes.push(command);
      relationships=[{...command,id:'permission',revision:command.expectedRevision+1,revokedAt:command.revoke?new Date().toISOString():null,status:command.revoke?'REVOKED':'ACTIVE',
        policies:command.policies.map(p=>({...p,effective:command.revoke?'DENY':p.policy,relayStatus:'ACTIVE',relayExpiresAt:new Date(Date.now()+3600000).toISOString(),reason:'PEER_PERMISSION_ACTIVE'}))}];
      await route.fulfill({json:{saved:true}});
    }else await route.fulfill({json:{relationships,discoveryStatus:'AVAILABLE',peers:[{address:'relay://atlas/research',name:'Atlas',messagingResource:'relay://atlas/research'}]}});
  });
  await page.goto('/manage/relay');
  const panel=page.getByRole('region',{name:'Peer permissions'});
  await expect(panel).toContainText('No peer relationships yet');
  await panel.getByRole('button',{name:'Add relationship',exact:true}).click();
  await expect(panel.getByRole('heading',{name:'New peer relationship'})).toBeFocused();
  await panel.getByLabel('Display name',{exact:true}).fill('Atlas');
  await panel.getByLabel('Exact Relay peer address').fill('relay://atlas/research');
  await panel.getByRole('button',{name:'Add scoped capability'}).click();
  await expect(panel.getByLabel('Exact resource',{exact:true})).toHaveCount(0);
  await expect(panel).toContainText('Messaging destination is bound to this exact peer relationship.');
  await panel.getByRole('combobox',{name:'MyEve policy',exact:true}).selectOption('REQUIRE_APPROVAL');
  await panel.getByRole('combobox',{name:'MyEve expiration',exact:true}).selectOption('never');
  await panel.getByRole('button',{name:'Review changes'}).click();
  expect(writes).toHaveLength(0);
  await expect(panel).toContainText('Relay authority may expire sooner');
  await expect(panel).toContainText('does not create or renew Relay grants');
  await panel.getByRole('button',{name:'Confirm policy',exact:true}).click();
  await expect(panel).toContainText('MyEve policy saved');
  expect(writes).toHaveLength(1);expect(writes[0].expiresAt).toBeNull();
  await page.reload();await expect(panel).toContainText('Atlas');await expect(panel).toContainText('Until revoked');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await panel.screenshot({path:path.resolve(__dirname,`../../../../../output/peer-permissions-${width}.png`)});
  await panel.getByRole('button',{name:'Revoke',exact:true}).click();expect(writes).toHaveLength(1);
  await panel.getByRole('button',{name:'Confirm revocation'}).click();
  await expect(panel).toContainText('Peer permission revoked');expect(writes).toHaveLength(2);
  expect(writes[1]).toMatchObject({permissionId:'permission',expectedRevision:1,revoke:true});
});

test('failed save keeps owner choices and displays the actual conflict',async({page})=>{
  await page.route('**/api/relay/peer-permissions',route=>route.request().method()==='POST'
    ?route.fulfill({status:409,json:{error:'Permissions changed in another session. Reload before saving.'}})
    :route.fulfill({json:{relationships:[],peers:[],discoveryStatus:'UNAVAILABLE'}}));
  await page.goto('/manage/relay');const panel=page.getByRole('region',{name:'Peer permissions'});
  await panel.getByRole('button',{name:'Add relationship'}).click();
  await panel.getByLabel('Display name',{exact:true}).fill('Offline peer');
  await panel.getByLabel('Exact Relay peer address').fill('relay://offline/peer');
  await panel.getByRole('button',{name:'Review changes'}).click();await panel.getByRole('button',{name:'Confirm policy'}).click();
  await expect(panel.getByRole('alert')).toContainText('Permissions changed');
  await expect(panel).toContainText('Offline peer');await expect(panel.getByRole('button',{name:'Confirm policy'})).toBeEnabled();
});

test('missing messaging authority gives a configuration error without asking for an internal resource',async({page})=>{
  let writes=0;
  await page.route('**/api/relay/peer-permissions',route=>{
    if(route.request().method()==='POST')writes++;
    return route.fulfill({json:{relationships:[],discoveryStatus:'AVAILABLE',peers:[{address:'relay://atlas/research',name:'Atlas',messagingResource:null}]}});
  });
  await page.goto('/manage/relay');
  const panel=page.getByRole('region',{name:'Peer permissions'});
  await panel.getByRole('button',{name:'Add relationship',exact:true}).click();
  await expect(panel.getByRole('heading',{name:'New peer relationship'})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(panel.getByLabel('Display name',{exact:true})).toBeFocused();
  await page.keyboard.type('Atlas');
  await panel.getByLabel('Exact Relay peer address').fill('relay://atlas/research');
  await panel.getByRole('button',{name:'Add scoped capability'}).click();
  await expect(panel.getByLabel('Exact resource',{exact:true})).toHaveCount(0);
  await panel.getByRole('button',{name:'Review changes'}).press('Enter');
  await expect(panel.getByRole('alert')).toContainText('Messaging is not configured');
  expect(writes).toBe(0);
});
