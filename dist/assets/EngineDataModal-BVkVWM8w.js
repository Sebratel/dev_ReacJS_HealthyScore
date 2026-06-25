import{c as l,r as h,j as e,d as j}from"./index-BkiD-Nll.js";import{X as N,S as M}from"./ContractFilters-C6xKUA4F.js";/**
 * @license lucide-react v0.395.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const D=l("ChevronDown",[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]]);/**
 * @license lucide-react v0.395.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const V=l("ChevronUp",[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]]);/**
 * @license lucide-react v0.395.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=l("Database",[["ellipse",{cx:"12",cy:"5",rx:"9",ry:"3",key:"msslwz"}],["path",{d:"M3 5V19A9 3 0 0 0 21 19V5",key:"1wlel7"}],["path",{d:"M3 12A9 3 0 0 0 21 12",key:"mv7ke4"}]]);/**
 * @license lucide-react v0.395.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const L=l("Download",[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["polyline",{points:"7 10 12 15 17 10",key:"2ggqvy"}],["line",{x1:"12",x2:"12",y1:"15",y2:"3",key:"1vk2je"}]]);/**
 * @license lucide-react v0.395.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const H=l("Hand",[["path",{d:"M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2",key:"1fvzgz"}],["path",{d:"M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2",key:"1kc0my"}],["path",{d:"M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8",key:"10h0bg"}],["path",{d:"M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",key:"1s1gnw"}]]);/**
 * @license lucide-react v0.395.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const q=l("RotateCcw",[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}]]);/**
 * @license lucide-react v0.395.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $=l("ShieldAlert",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"M12 8v4",key:"1got3b"}],["path",{d:"M12 16h.01",key:"1drbdi"}]]);/**
 * @license lucide-react v0.395.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const A=l("SlidersHorizontal",[["line",{x1:"21",x2:"14",y1:"4",y2:"4",key:"obuewd"}],["line",{x1:"10",x2:"3",y1:"4",y2:"4",key:"1q6298"}],["line",{x1:"21",x2:"12",y1:"12",y2:"12",key:"1iu8h1"}],["line",{x1:"8",x2:"3",y1:"12",y2:"12",key:"ntss68"}],["line",{x1:"21",x2:"16",y1:"20",y2:"20",key:"14d8ph"}],["line",{x1:"12",x2:"3",y1:"20",y2:"20",key:"m0wm8r"}],["line",{x1:"14",x2:"14",y1:"2",y2:"6",key:"14e1ph"}],["line",{x1:"8",x2:"8",y1:"10",y2:"14",key:"1i6ji0"}],["line",{x1:"16",x2:"16",y1:"18",y2:"22",key:"1lctlv"}]]);/**
 * @license lucide-react v0.395.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=l("Table2",[["path",{d:"M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18",key:"gugj83"}]]),b=50;function z(o,x){const p=s=>{const n=String(s??"");return/[",\n;]/.test(n)?`"${n.replace(/"/g,'""')}"`:n},m=o.map(s=>p(s.label)).join(";"),i=x.map(s=>o.map(n=>p(n.value(s))).join(";")).join(`
`);return`${m}
${i}`}function U({open:o,onClose:x,title:p,subtitle:m,columns:i,rows:s,aggregates:n}){const[y,k]=h.useState(""),[d,u]=h.useState(0);h.useEffect(()=>{if(!o)return;const t=a=>{a.key==="Escape"&&x()};return window.addEventListener("keydown",t),()=>window.removeEventListener("keydown",t)},[o,x]),h.useEffect(()=>{u(0)},[y,o]);const c=h.useMemo(()=>{const t=y.trim().toLowerCase();return t?s.filter(a=>i.some(r=>String(r.value(a)).toLowerCase().includes(t))):s},[y,s,i]),v=Math.max(1,Math.ceil(c.length/b)),f=c.slice(d*b,(d+1)*b),w=()=>{const t=z(i,c),a=new Blob([`\uFEFF${t}`],{type:"text/csv;charset=utf-8;"}),r=URL.createObjectURL(a),g=document.createElement("a");g.href=r,g.download=`${p.toLowerCase().replace(/[^a-z0-9]+/g,"-")}-dados.csv`,g.click(),URL.revokeObjectURL(r)};return o?e.jsxs("div",{className:"fixed inset-0 z-50 flex items-center justify-center p-4",children:[e.jsx("div",{className:"absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in",onClick:x}),e.jsxs("div",{className:"relative w-full max-w-5xl max-h-[88vh] flex flex-col bg-app-surface border border-app-border rounded-2xl shadow-2xl animate-slide-up",children:[e.jsxs("div",{className:"flex items-start justify-between px-5 py-4 border-b border-app-border shrink-0",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("div",{className:"w-8 h-8 rounded-lg bg-gradient-to-br from-brand-blue to-brand-violet flex items-center justify-center",children:e.jsx(S,{size:15,className:"text-white"})}),e.jsxs("div",{children:[e.jsx("h2",{className:"text-sm font-bold text-white",children:p}),e.jsx("p",{className:"text-[11px] text-gray-500",children:m??"Dados que alimentam esta tela"})]})]}),e.jsx("button",{onClick:x,className:"text-gray-500 hover:text-gray-200 transition-colors p-1",children:e.jsx(N,{size:18})})]}),e.jsxs("div",{className:"flex items-center justify-between gap-3 px-5 py-3 border-b border-app-border shrink-0 flex-wrap",children:[e.jsxs("div",{className:"relative flex items-center",children:[e.jsx(M,{size:13,className:"absolute left-2.5 text-gray-500 pointer-events-none"}),e.jsx("input",{value:y,onChange:t=>k(t.target.value),placeholder:"Buscar nas linhas...",className:"pl-8 pr-3 h-8 w-64 text-xs bg-app-card border border-app-border rounded-lg text-gray-300 placeholder-gray-600 focus:outline-none focus:border-brand-blue/50 transition-all"})]}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsxs("span",{className:"text-[11px] text-gray-500 font-mono",children:[c.length.toLocaleString("pt-BR")," linhas"]}),e.jsxs("button",{onClick:w,className:"flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-brand-blue/15 text-brand-blue border border-brand-blue/30 hover:bg-brand-blue/25 transition-all font-medium",children:[e.jsx(L,{size:12}),"Exportar CSV"]})]})]}),e.jsxs("div",{className:"flex-1 overflow-auto scrollbar-thin",children:[n&&n.length>0&&e.jsx("div",{className:"px-5 py-4 border-b border-app-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4",children:n.map(t=>e.jsxs("div",{className:"rounded-xl bg-app-card border border-app-border p-3",children:[e.jsxs("div",{className:"flex items-center gap-1.5 mb-2",children:[e.jsx(C,{size:11,className:"text-brand-cyan"}),e.jsx("span",{className:"text-[10px] font-semibold text-gray-300 uppercase tracking-wider",children:t.title})]}),e.jsx("div",{className:"space-y-1 max-h-40 overflow-y-auto scrollbar-thin",children:t.entries.map((a,r)=>e.jsxs("div",{className:"flex items-center justify-between gap-2 text-[11px]",children:[e.jsx("span",{className:"text-gray-400 truncate",children:a.label}),e.jsx("span",{className:"font-mono text-gray-300 shrink-0",children:typeof a.value=="number"?a.value.toLocaleString("pt-BR"):a.value})]},r))})]},t.title))}),e.jsxs("table",{className:"w-full text-sm",children:[e.jsx("thead",{className:"sticky top-0 z-10",children:e.jsx("tr",{className:"bg-app-surface border-b border-app-border",children:i.map(t=>e.jsx("th",{className:j("px-3 py-2 text-[10px] text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap",t.align==="right"?"text-right":"text-left"),children:t.label},t.key))})}),e.jsxs("tbody",{children:[f.map((t,a)=>e.jsx("tr",{className:"border-b border-app-border/60 hover:bg-app-card/60 transition-colors",children:i.map(r=>e.jsx("td",{className:j("px-3 py-2 text-xs whitespace-nowrap",r.align==="right"?"text-right font-mono text-gray-300":"text-gray-300"),children:r.value(t)},r.key))},a)),f.length===0&&e.jsx("tr",{children:e.jsx("td",{colSpan:i.length,className:"px-3 py-8 text-center text-xs text-gray-500",children:"Nenhuma linha encontrada."})})]})]})]}),e.jsxs("div",{className:"flex items-center justify-between px-5 py-3 border-t border-app-border shrink-0",children:[e.jsxs("span",{className:"text-[10px] text-gray-500",children:[c.length===0?"0":`${d*b+1}–${Math.min((d+1)*b,c.length)}`," de ",c.length.toLocaleString("pt-BR")]}),e.jsxs("div",{className:"flex gap-1.5",children:[e.jsx("button",{disabled:d===0,onClick:()=>u(t=>t-1),className:"text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-400 disabled:opacity-30 hover:border-app-borderLight transition-all",children:"Anterior"}),e.jsxs("span",{className:"text-[10px] text-gray-500 px-1 py-1 font-mono",children:[d+1,"/",v]}),e.jsx("button",{disabled:d>=v-1,onClick:()=>u(t=>t+1),className:"text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-400 disabled:opacity-30 hover:border-app-borderLight transition-all",children:"Próxima"})]})]})]})]}):null}export{V as C,C as D,U as E,H,q as R,A as S,S as T,D as a,$ as b};
