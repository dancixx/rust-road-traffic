function w(){}function H(t,n){for(const e in n)t[e]=n[e];return t}function B(t){return t()}function T(){return Object.create(null)}function p(t){t.forEach(B)}function L(t){return typeof t=="function"}function ct(t,n){return t!=t?n==n:t!==n||t&&typeof t=="object"||typeof t=="function"}let g;function lt(t,n){return g||(g=document.createElement("a")),g.href=n,t===g.href}function I(t){return Object.keys(t).length===0}function G(t,...n){if(t==null)return w;const e=t.subscribe(...n);return e.unsubscribe?()=>e.unsubscribe():e}function st(t,n,e){t.$$.on_destroy.push(G(n,e))}function ot(t,n,e,i){if(t){const r=O(t,n,e,i);return t[0](r)}}function O(t,n,e,i){return t[1]&&i?H(e.ctx.slice(),t[1](i(n))):e.ctx}function at(t,n,e,i){if(t[2]&&i){const r=t[2](i(e));if(n.dirty===void 0)return r;if(typeof r=="object"){const o=[],u=Math.max(n.dirty.length,r.length);for(let s=0;s<u;s+=1)o[s]=n.dirty[s]|r[s];return o}return n.dirty|r}return n.dirty}function ft(t,n,e,i,r,o){if(r){const u=O(n,e,i,o);t.p(u,r)}}function _t(t){if(t.ctx.length>32){const n=[],e=t.ctx.length/32;for(let i=0;i<e;i++)n[i]=-1;return n}return-1}function dt(t,n,e){return t.set(e),n}let v=!1;function J(){v=!0}function K(){v=!1}function Q(t,n,e,i){for(;t<n;){const r=t+(n-t>>1);e(r)<=i?t=r+1:n=r}return t}function R(t){if(t.hydrate_init)return;t.hydrate_init=!0;let n=t.childNodes;if(t.nodeName==="HEAD"){const c=[];for(let l=0;l<n.length;l++){const f=n[l];f.claim_order!==void 0&&c.push(f)}n=c}const e=new Int32Array(n.length+1),i=new Int32Array(n.length);e[0]=-1;let r=0;for(let c=0;c<n.length;c++){const l=n[c].claim_order,f=(r>0&&n[e[r]].claim_order<=l?r+1:Q(1,r,y=>n[e[y]].claim_order,l))-1;i[c]=e[f]+1;const a=f+1;e[a]=c,r=Math.max(a,r)}const o=[],u=[];let s=n.length-1;for(let c=e[r]+1;c!=0;c=i[c-1]){for(o.push(n[c-1]);s>=c;s--)u.push(n[s]);s--}for(;s>=0;s--)u.push(n[s]);o.reverse(),u.sort((c,l)=>c.claim_order-l.claim_order);for(let c=0,l=0;c<u.length;c++){for(;l<o.length&&u[c].claim_order>=o[l].claim_order;)l++;const f=l<o.length?o[l]:null;t.insertBefore(u[c],f)}}function W(t,n){if(v){for(R(t),(t.actual_end_child===void 0||t.actual_end_child!==null&&t.actual_end_child.parentNode!==t)&&(t.actual_end_child=t.firstChild);t.actual_end_child!==null&&t.actual_end_child.claim_order===void 0;)t.actual_end_child=t.actual_end_child.nextSibling;n!==t.actual_end_child?(n.claim_order!==void 0||n.parentNode!==t)&&t.insertBefore(n,t.actual_end_child):t.actual_end_child=n.nextSibling}else(n.parentNode!==t||n.nextSibling!==null)&&t.appendChild(n)}function ht(t,n,e){v&&!e?W(t,n):(n.parentNode!==t||n.nextSibling!=e)&&t.insertBefore(n,e||null)}function U(t){t.parentNode&&t.parentNode.removeChild(t)}function mt(t,n){for(let e=0;e<t.length;e+=1)t[e]&&t[e].d(n)}function V(t){return document.createElement(t)}function S(t){return document.createTextNode(t)}function pt(){return S(" ")}function yt(){return S("")}function gt(t,n,e,i){return t.addEventListener(n,e,i),()=>t.removeEventListener(n,e,i)}function xt(t,n,e){e==null?t.removeAttribute(n):t.getAttribute(n)!==e&&t.setAttribute(n,e)}function bt(t){return t===""?null:+t}function X(t){return Array.from(t.childNodes)}function Y(t){t.claim_info===void 0&&(t.claim_info={last_index:0,total_claimed:0})}function P(t,n,e,i,r=!1){Y(t);const o=(()=>{for(let u=t.claim_info.last_index;u<t.length;u++){const s=t[u];if(n(s)){const c=e(s);return c===void 0?t.splice(u,1):t[u]=c,r||(t.claim_info.last_index=u),s}}for(let u=t.claim_info.last_index-1;u>=0;u--){const s=t[u];if(n(s)){const c=e(s);return c===void 0?t.splice(u,1):t[u]=c,r?c===void 0&&t.claim_info.last_index--:t.claim_info.last_index=u,s}}return i()})();return o.claim_order=t.claim_info.total_claimed,t.claim_info.total_claimed+=1,o}function Z(t,n,e,i){return P(t,r=>r.nodeName===n,r=>{const o=[];for(let u=0;u<r.attributes.length;u++){const s=r.attributes[u];e[s.name]||o.push(s.name)}o.forEach(u=>r.removeAttribute(u))},()=>i(n))}function $t(t,n,e){return Z(t,n,e,V)}function tt(t,n){return P(t,e=>e.nodeType===3,e=>{const i=""+n;if(e.data.startsWith(i)){if(e.data.length!==i.length)return e.splitText(i.length)}else e.data=i},()=>S(n),!0)}function wt(t){return tt(t," ")}function vt(t,n){n=""+n,t.wholeText!==n&&(t.data=n)}function Et(t,n){t.value=n==null?"":n}function Nt(t,n,e,i){e===null?t.style.removeProperty(n):t.style.setProperty(n,e,i?"important":"")}function At(t,n){return new t(n)}let m;function h(t){m=t}function j(){if(!m)throw new Error("Function called outside component initialization");return m}function St(t){j().$$.on_mount.push(t)}function jt(t){j().$$.after_update.push(t)}function Ct(t){j().$$.on_destroy.push(t)}const d=[],k=[],b=[],q=[],D=Promise.resolve();let N=!1;function z(){N||(N=!0,D.then(F))}function Mt(){return z(),D}function A(t){b.push(t)}const E=new Set;let x=0;function F(){const t=m;do{for(;x<d.length;){const n=d[x];x++,h(n),nt(n.$$)}for(h(null),d.length=0,x=0;k.length;)k.pop()();for(let n=0;n<b.length;n+=1){const e=b[n];E.has(e)||(E.add(e),e())}b.length=0}while(d.length);for(;q.length;)q.pop()();N=!1,E.clear(),h(t)}function nt(t){if(t.fragment!==null){t.update(),p(t.before_update);const n=t.dirty;t.dirty=[-1],t.fragment&&t.fragment.p(t.ctx,n),t.after_update.forEach(A)}}const $=new Set;let _;function Tt(){_={r:0,c:[],p:_}}function kt(){_.r||p(_.c),_=_.p}function et(t,n){t&&t.i&&($.delete(t),t.i(n))}function qt(t,n,e,i){if(t&&t.o){if($.has(t))return;$.add(t),_.c.push(()=>{$.delete(t),i&&(e&&t.d(1),i())}),t.o(n)}else i&&i()}function Bt(t){t&&t.c()}function Lt(t,n){t&&t.l(n)}function it(t,n,e,i){const{fragment:r,after_update:o}=t.$$;r&&r.m(n,e),i||A(()=>{const u=t.$$.on_mount.map(B).filter(L);t.$$.on_destroy?t.$$.on_destroy.push(...u):p(u),t.$$.on_mount=[]}),o.forEach(A)}function rt(t,n){const e=t.$$;e.fragment!==null&&(p(e.on_destroy),e.fragment&&e.fragment.d(n),e.on_destroy=e.fragment=null,e.ctx=[])}function ut(t,n){t.$$.dirty[0]===-1&&(d.push(t),z(),t.$$.dirty.fill(0)),t.$$.dirty[n/31|0]|=1<<n%31}function Ot(t,n,e,i,r,o,u,s=[-1]){const c=m;h(t);const l=t.$$={fragment:null,ctx:[],props:o,update:w,not_equal:r,bound:T(),on_mount:[],on_destroy:[],on_disconnect:[],before_update:[],after_update:[],context:new Map(n.context||(c?c.$$.context:[])),callbacks:T(),dirty:s,skip_bound:!1,root:n.target||c.$$.root};u&&u(l.root);let f=!1;if(l.ctx=e?e(t,n.props||{},(a,y,...C)=>{const M=C.length?C[0]:y;return l.ctx&&r(l.ctx[a],l.ctx[a]=M)&&(!l.skip_bound&&l.bound[a]&&l.bound[a](M),f&&ut(t,a)),y}):[],l.update(),f=!0,p(l.before_update),l.fragment=i?i(l.ctx):!1,n.target){if(n.hydrate){J();const a=X(n.target);l.fragment&&l.fragment.l(a),a.forEach(U)}else l.fragment&&l.fragment.c();n.intro&&et(t.$$.fragment),it(t,n.target,n.anchor,n.customElement),K(),F()}h(c)}class Pt{$destroy(){rt(this,1),this.$destroy=w}$on(n,e){if(!L(e))return w;const i=this.$$.callbacks[n]||(this.$$.callbacks[n]=[]);return i.push(e),()=>{const r=i.indexOf(e);r!==-1&&i.splice(r,1)}}$set(n){this.$$set&&!I(n)&&(this.$$.skip_bound=!0,this.$$set(n),this.$$.skip_bound=!1)}}export{Mt as A,w as B,G as C,p as D,L as E,ot as F,ft as G,_t as H,at as I,W as J,st as K,Ct as L,k as M,lt as N,gt as O,Et as P,bt as Q,dt as R,Pt as S,mt as T,pt as a,ht as b,wt as c,kt as d,yt as e,et as f,Tt as g,U as h,Ot as i,jt as j,V as k,$t as l,X as m,xt as n,St as o,Nt as p,S as q,tt as r,ct as s,qt as t,vt as u,At as v,Bt as w,Lt as x,it as y,rt as z};
