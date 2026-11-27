import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateMobileConversationLayout} from './browser/mobile-conversation-layout.mjs';
import {disableFixtureDevIndicator} from './browser/enterprise-visual-overlay.mjs';

const valid=()=>({navigation:{top:8,bottom:52,width:44,height:44,unobscured:true},
  messages:{top:60},attachment:{width:32,height:32,unobscured:true}});
test('mobile layout rejects navigation overlapping the scrolled conversation',()=>{
  assert.equal(validateMobileConversationLayout(valid()).messages.top,60);
  const overlap=valid();overlap.messages.top=0;
  assert.throws(()=>validateMobileConversationLayout(overlap),/reserve space/);
});
test('mobile layout rejects obscured or undersized interactive targets',()=>{
  for(const key of ['navigation','attachment']) {
    const blocked=valid();blocked[key].unobscured=false;
    assert.throws(()=>validateMobileConversationLayout(blocked),/must not be covered/);
    const small=valid();small[key].width=20;
    assert.throws(()=>validateMobileConversationLayout(small),/touch target/);
  }
});
test('fixture config disables only development indicator and fails on ambiguous config',()=>{
  const source='const nextConfig: NextConfig = {\n  serverExternalPackages: ["native"],\n};\nexport default withEve(nextConfig);';
  const transformed=disableFixtureDevIndicator(source);
  assert.equal(transformed.replace('\n  devIndicators: false, // Fixture chrome only; errors remain visible.',''),source);
  assert.throws(()=>disableFixtureDevIndicator(source+source),/Exactly one/);
  assert.throws(()=>disableFixtureDevIndicator(transformed),/Existing indicator/);
});
