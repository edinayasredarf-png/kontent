import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { containsFloatingTarget, registerFloatingLayer } from "../src/lib/floating-layer";

test("nested picker belongs to its source panel without treating unrelated overlays as inside", () => {
 const {document}=parseHTML('<html><body><section id="panel"><select id="owner"></select></section><section id="other"></section><div id="layer"><button id="option">Select</button></div></body></html>');
 const el=(id:string)=>document.getElementById(id)! as unknown as HTMLElement;
 const unbind=registerFloatingLayer(el('layer'),el('owner'));
 assert.equal(containsFloatingTarget(el('panel'),el('option')),true);
 assert.equal(containsFloatingTarget(el('other'),el('option')),false);
 assert.equal(containsFloatingTarget(el('panel'),el('owner')),true);
 assert.equal(containsFloatingTarget(el('panel'),document.body as unknown as Node),false);
 unbind();assert.equal(containsFloatingTarget(el('panel'),el('option')),false);
});
test("recursive floating layers, detached panels and ownership cycles are safe", () => {
 const {document}=parseHTML('<html><body><section id="panel"><select id="owner"></select></section><div id="one"><input id="nested"></div><div id="two"><button id="value"></button></div></body></html>');
 const el=(id:string)=>document.getElementById(id)! as unknown as HTMLElement;
 const panel=el('panel'), owner=el('owner'), nested=el('nested'), one=el('one'), two=el('two'), value=el('value');
 const clear1=registerFloatingLayer(one,owner),clear2=registerFloatingLayer(two,nested);
 assert.equal(containsFloatingTarget(panel,value),true);
 owner.remove();assert.equal(containsFloatingTarget(panel,value),false);
 registerFloatingLayer(one,value);
 assert.equal(containsFloatingTarget(panel,value),false);
 assert.equal(containsFloatingTarget(null,value),false);
 clear1();clear2();
});
