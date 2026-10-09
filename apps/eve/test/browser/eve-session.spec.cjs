const {test,expect}=require('@playwright/test');
// Opt-in: requires the isolated model/tool fixtures described in README.md.
test.skip(process.env.MYEVE_SESSION_FIXTURE !== '1','Requires the deterministic Eve session fixture');
async function start(page){const hydrated=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/threads'&&r.request().method()==='GET');await page.goto('/chat');await hydrated;await page.getByRole('button',{name:'New thread',exact:true}).click();}
async function send(page,text){await page.getByRole('textbox',{name:'Message Ava',exact:true}).fill(text);await page.getByRole('button',{name:'Send',exact:true}).click();}
test('durable chat creates a session, reloads, and sends a follow-up without duplicating replies',async({page})=>{
 const posts=[];page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.startsWith('/eve/v1/session'))posts.push(new URL(r.url()).pathname);});
 await start(page);await send(page,'fixture hello');
 await expect(page.getByText('Migration fixture reply.',{exact:true})).toHaveCount(1,{timeout:45000});
 await page.reload();await expect(page.getByText('Migration fixture reply.',{exact:true})).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Send',exact:true})).toBeVisible();
 await send(page,'fixture follow-up');
 await expect(page.getByText('Migration fixture reply.',{exact:true})).toHaveCount(2,{timeout:45000});
 expect(posts.filter(path=>path==='/eve/v1/session')).toHaveLength(1);
 expect(posts.filter(path=>/^\/eve\/v1\/session\/[^/]+$/.test(path))).toHaveLength(1);
});
test('structured question resumes after the owner answers',async({page})=>{
 await start(page);await send(page,'fixture question');
 await expect(page.getByText('Which fixture option?',{exact:true})).toBeVisible({timeout:45000});
 await page.getByRole('button',{name:'Alpha',exact:true}).click();
 await expect(page.getByText('Migration fixture reply.',{exact:true})).toHaveCount(1,{timeout:45000});
});
test('approval survives reload and resumes the same tool call',async({page})=>{
 await start(page);await send(page,'fixture approval');
 await expect(page.getByRole('button',{name:/approve|allow/i}).first()).toBeVisible({timeout:45000});
 await page.reload();
 await page.getByRole('button',{name:/approve|allow/i}).first().click();
 await expect(page.getByText('Migration fixture reply.',{exact:true})).toHaveCount(1,{timeout:45000});
});
test('cancel settles the running turn and permits another message',async({page})=>{
 const cancels=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/cancel'))cancels.push(r.url());});
 await start(page);await send(page,'fixture slow');
 await page.getByRole('button',{name:/stop/i}).click();
 await expect(page.getByRole('button',{name:'Send',exact:true})).toBeVisible({timeout:45000});
 await send(page,'fixture after cancellation');
 await expect(page.getByText('Migration fixture reply.',{exact:true})).toHaveCount(1,{timeout:45000});
 expect(cancels).toHaveLength(1);
});
