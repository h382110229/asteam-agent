import assert from 'node:assert/strict';
import test from 'node:test';
import {auditDeckGeometry} from '../geometry-qa.mjs';
const canvas={width:1280,height:720};
test('empty evidence must not pass',()=>assert.equal(auditDeckGeometry({}).ok,false));
test('fixed shell clipping must be checked',()=>{
 const r=auditDeckGeometry({canvas,slides:[{role:'body',elements:[{id:'shell',dynamic:false,rect:{x:0,y:0,w:1300,h:720}}]}]});
 assert.ok(r.issues.some(x=>x.code==='SLIDE_CLIPPING'));
});
test('omitting caller safe-zone cannot bypass body protection',()=>{
 const r=auditDeckGeometry({canvas,slides:[{role:'body',elements:[{rect:{x:0,y:0,w:500,h:100}}]}]});
 assert.ok(r.issues.some(x=>x.code==='SAFE_ZONE_VIOLATION'));
});
test('invalid rectangles cannot silently become zeros',()=>assert.equal(auditDeckGeometry({canvas,slides:[{role:'body',elements:[{rect:{x:'bad',y:0,w:20,h:20}}]}]}).ok,false));
