import assert from 'node:assert/strict';

export function validateMobileConversationLayout(layout) {
  assert.ok(layout.messages.top>=layout.navigation.bottom,'Mobile navigation must reserve space above scrollable messages');
  for(const name of ['navigation','attachment']) {
    const control=layout[name];
    assert.ok(control.width>=24&&control.height>=24,`${name} must retain a usable touch target`);
    assert.ok(control.unobscured,`${name} must not be covered by another control or development chrome`);
  }
  return layout;
}

/** Checks actual visible hit targets, including after a long Result has scrolled. */
export async function checkMobileConversationLayout(page) {
  const main=page.getByRole('main'),navigation=main.getByRole('button',{name:'Open threads',exact:true});
  const snapshot=async locator=>locator.evaluate(element=>{
    const r=element.getBoundingClientRect();
    const points=[[.25,.25],[.75,.25],[.25,.75],[.75,.75],[.5,.5]];
    return {top:r.top,bottom:r.bottom,width:r.width,height:r.height,
      unobscured:points.every(([x,y])=>element.contains(document.elementFromPoint(r.left+r.width*x,r.top+r.height*y)))};
  });
  const messages=main.getByRole('region',{name:'Messages',exact:true});
  return validateMobileConversationLayout({navigation:await snapshot(navigation),
    attachment:await snapshot(main.getByRole('button',{name:'Attach files',exact:true})),
    messages:await snapshot(messages)});
}
