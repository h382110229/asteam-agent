import assert from 'node:assert/strict';
import test from 'node:test';
import {auditDeckGeometry,formatRevisionFeedback,revisionAllowed} from '../geometry-qa.mjs';
const shell={kind:'shell',src:'eccom/assets/shells/body.png',loaded:true,opacity:1,filter:'none',clipPath:'none',blendMode:'normal',rect:{x:0,y:0,w:1280,h:720}};
const title={slot:'title',text:'标题',rect:{x:145.8027,y:12.204,w:988.3955,h:114.9495},fontSize:48,fontFamily:'Microsoft YaHei',letterSpacing:8,color:'rgb(64, 64, 64)',fontWeight:'700',textAlign:'center'};
const page={slot:'page-number',text:'4',rect:{x:867.7639,y:676.9475,w:44.0843,h:38.3333},fontSize:12,fontFamily:'Arial',letterSpacing:0,color:'rgb(4, 179, 132)',fontWeight:'400',textAlign:'center'};
const deck=(elements=[])=>({canvas:{width:1280,height:720},slides:[{role:'body',elements:[shell,title,page,...elements]}]});
test('real chrome slots pass separately from body safe area',()=>assert.equal(auditDeckGeometry(deck([{rect:{x:100,y:180,w:900,h:400}}])).ok,true));
test('detect all four geometry failure types',()=>{
 const result=auditDeckGeometry(deck([{id:'bad',rect:{x:10,y:640,w:300,h:106},textMetrics:{scrollWidth:310,clientWidth:300,scrollHeight:110,clientHeight:106}}]));
 assert.equal(result.ok,false);
 for(const code of ['SAFE_ZONE_VIOLATION','PROTECTED_ZONE_COLLISION','TEXT_OVERFLOW','SLIDE_CLIPPING'])assert.ok(result.issues.some(i=>i.code===code));
 const feedback=formatRevisionFeedback(result,1);assert.match(feedback,/Slide 1/);assert.match(feedback,/Do not modify the ECCOM shell/);
 assert.equal(revisionAllowed(0),true);assert.equal(revisionAllowed(1),true);assert.equal(revisionAllowed(2),false);
});
test('caller cannot expand role bounds',()=>{const d=deck([{rect:{x:10,y:180,w:100,h:50}}]);d.slides[0].safeZone={minX:0,maxX:1280,minY:0,maxY:720};assert.equal(auditDeckGeometry(d).ok,false);});
test('wrong title style fails even without clipping',()=>{const d=deck();d.slides[0].elements=[shell,{...title,color:'rgb(0, 0, 0)'},page];assert.ok(auditDeckGeometry(d).issues.some(i=>i.code==='SLOT_STYLE_MISMATCH'));});
test('missing or stale shell cannot pass',()=>{const d=deck();d.slides[0].elements=[{...shell,src:'other.png'},title,page];assert.equal(auditDeckGeometry(d).ok,false);});
