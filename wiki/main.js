"use strict";
<<<<<<< ours
const STORAGE_KEY="maybelle.wiki.editor.v3"; const BACKEND_MODE=location.protocol==="http:"||location.protocol==="https:"; const BACKEND_BASE_URL=BACKEND_MODE?location.origin:"";
let appData=createEmptyData(), currentView="home", selectedRootId=null, selectedEntryId=null, autosaveTimer=null, activeTextField=null;
const CANON_ROOTS=[
["А","Existence","Being, presence, reality"],["Б","Becoming","Change, emergence, transformation"],["В","Motion","Movement, travel, flow"],["Г","Space","Place, area, distance"],["Д","Structure","Shape, order, built form"],["Е","Knowledge","Knowing, learning, memory"],["Ё","Perception","Sensing, seeing, noticing"],["Ж","Person","Person, self, human actor"],["З","Life","Living things, vitality, growth"],["И","Relation","Connection, withness, between"],["Й","Identity","Sameness, name, selfhood"],["К","Object","Thing, item, material noun"],["Л","Language","Speech, writing, sign"],["М","Mind","Thought, feeling, intention"],["Н","Time","Time, day, sequence"],["О","State","Condition, quality of being"],["П","Purpose","Goal, use, function"],["Р","Action","Doing, making, event"],["С","Society","Community, culture, shared life"],["Т","Tool","Instrument, method, technology"],["У","Energy","Power, force, heat"],["Ф","Form","Appearance, body, pattern"],["Х","Opposition","Not, against, contrast"],["Ц","Quantity","Number, amount, measure"],["Ч","Choice","Decision, selection, possibility"],["Ш","Group","Collection, many-as-one"],["Щ","Comparison","Likeness, difference, degree"],["Ъ","Cause","Reason, source, because"],["Ы","Possession","Having, belonging, ownership"],["Ь","Property","Attribute, trait, modifier"],["Э","Light","Light, brightness, illumination"],["Ю","Direction","Toward, path, orientation"],["Я","Reference","This, that, pointing, context"]
];
const CANON_ENTRIES=[
{compound:"ЖИ",description:"Greeting / hello",literal_meaning:"Person + Relation",notes:"Standard Maybelle greeting."},
{compound:"НО",description:"Good morning / time-state phrase",literal_meaning:"Time + State",notes:"A greeting-like phrase for a favorable time state."},
{compound:"НЭ",description:"Day / daylight time",literal_meaning:"Time + Light",notes:"Derived from Time plus Light."},
{compound:"НХЭ",description:"Night / time without light",literal_meaning:"Time + Opposition + Light",notes:"Derived from Time plus Not/Opposition plus Light."}
];
function $(id){return document.getElementById(id)}
function uid(p){return crypto.randomUUID?`${p}-${crypto.randomUUID()}`:`${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}
function stableImportedId(prefix,item,index){if(item&&item.id!==undefined&&String(item.id).trim()!=="")return String(item.id);const s=JSON.stringify(item||{});let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return `${prefix}-import-${index+1}-${(h>>>0).toString(36)}`}
function repairDuplicateIdsInData(data){const sr=new Set();data.roots.forEach((r,i)=>{if(!r.id||sr.has(r.id))r.id=stableImportedId("root",{...r,id:"",_repair:i},i);sr.add(r.id)});const se=new Set();data.dictionary.forEach((e,i)=>{if(!e.id||se.has(e.id))e.id=stableImportedId("entry",{...e,id:"",_repair:i},i);se.add(e.id)});return data}
function repairDuplicateIds(){appData=repairDuplicateIdsInData(appData)}
function createEmptyData(){return{schema_version:3,updated_at:new Date().toISOString(),roots:[],dictionary:[],grammar_notes:""}}
function normalizeImportedData(raw){if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Wiki archive root must be an object");const roots=Array.isArray(raw.roots)?raw.roots:[], dict=Array.isArray(raw.dictionary)?raw.dictionary:(Array.isArray(raw.entries)?raw.entries:[]);const data={schema_version:3,imported_from_schema_version:Number(raw.schema_version||raw.schemaVersion||1),updated_at:raw.updated_at||raw.updatedAt||new Date().toISOString(),roots:roots.map((r,i)=>({id:stableImportedId("root",r,i),glyph:String(r?.glyph||""),root_name:String(r?.root_name||r?.rootName||""),description:String(r?.description||""),notes:String(r?.notes||""),canon:Boolean(r?.canon)})),dictionary:dict.map((e,i)=>({id:stableImportedId("entry",e,i),compound:String(e?.compound||e?.word||""),description:String(e?.description||e?.meaning||""),literal_meaning:String(e?.literal_meaning||e?.literalMeaning||""),notes:String(e?.notes||""),fields:e?.fields&&typeof e.fields==="object"&&!Array.isArray(e.fields)?e.fields:{},canon:Boolean(e?.canon)})),grammar_notes:String(raw.grammar_notes||raw.grammarNotes||"")};sortDictionary(data);return repairDuplicateIdsInData(data)}
function sortDictionary(data=appData){data.dictionary.sort((a,b)=>`${a.description||""}\0${a.compound||""}`.toLowerCase().localeCompare(`${b.description||""}\0${b.compound||""}`.toLowerCase()))}
function setStatus(msg,type=""){const s=$("status");s.className="status"+(type?" "+type:"");s.textContent=msg}
function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function isBackendMode(){return BACKEND_MODE}
function setBackendBanner(){const b=$("backendModeBanner");if(BACKEND_MODE){b.className="status success";b.textContent="Server mode: this wiki loads/saves through the Maybelle Python backend."}else{b.className="status warning";b.textContent="Standalone mode: this wiki saves to this browser only. Open through the Python host for server saving."}}
async function loadFromBackend(){const r=await fetch(`${BACKEND_BASE_URL}/api/wiki`,{cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw new Error(d.error||`Backend returned HTTP ${r.status}`);return normalizeImportedData(d)}
async function saveToBackend(show=true){syncEditorsToData();const r=await fetch(`${BACKEND_BASE_URL}/api/wiki`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(appData)});const d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw new Error(d.error||`Backend returned HTTP ${r.status}`);if(show)setStatus(`Saved wiki to server file (${d.path||"wiki file"}).`,"success");return d}
function autosave(){clearTimeout(autosaveTimer);autosaveTimer=setTimeout(async()=>{try{syncEditorsToData();if(BACKEND_MODE){await saveToBackend(false);setStatus("Maybelle wiki autosaved to server file.","success")}else{localStorage.setItem(STORAGE_KEY,JSON.stringify(appData));setStatus("Maybelle wiki autosaved locally.","success")}updateAllViewsSoft()}catch(e){console.error(e);setStatus(`Autosave failed: ${e.message||"unknown error"}`,"error")}},650)}
async function saveLocal(){try{syncEditorsToData();if(BACKEND_MODE)await saveToBackend(true);else{localStorage.setItem(STORAGE_KEY,JSON.stringify(appData));setStatus("Maybelle wiki saved locally.","success")}updateAllViewsSoft()}catch(e){console.error(e);setStatus(`Save failed: ${e.message||"unknown error"}`,"error")}}
async function loadLocal(){try{appData=BACKEND_MODE?await loadFromBackend():normalizeImportedData(JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}"));repairDuplicateIds();preserveSelections();renderEverything();setStatus(BACKEND_MODE?"Loaded wiki from server file.":"Loaded local wiki.","success")}catch(e){console.error(e);setStatus(`Could not load wiki: ${e.message||"unknown error"}`,"error")}}
function syncEditorsToData(){appData.updated_at=new Date().toISOString();appData.schema_version=3;let r=appData.roots.find(x=>x.id===selectedRootId);if(r&&!$("rootEditorFields").classList.contains("hidden")){r.glyph=$("rootGlyphInput").value.trim();r.root_name=$("rootNameInput").value.trim();r.description=$("rootDescriptionInput").value.trim();r.notes=$("rootNotesInput").value.trim()}let e=appData.dictionary.find(x=>x.id===selectedEntryId);if(e&&!$("entryEditorFields").classList.contains("hidden")){e.compound=$("entryCompoundInput").value.trim();e.description=$("entryDescriptionInput").value.trim();e.literal_meaning=$("entryLiteralInput").value.trim();e.notes=$("entryNotesInput").value.trim();e.fields=collectExtraFields()}appData.grammar_notes=$("grammarNotesInput").value;sortDictionary()}
function collectExtraFields(){const f={};document.querySelectorAll("#entryExtraFields .field-row").forEach(row=>{const k=row.querySelector(".fieldKey").value.trim(),v=row.querySelector(".fieldValue").value.trim();if(k)f[k]=v});return f}
function preserveSelections(){if(!appData.roots.some(r=>r.id===selectedRootId))selectedRootId=appData.roots[0]?.id||null;if(!appData.dictionary.some(e=>e.id===selectedEntryId))selectedEntryId=appData.dictionary[0]?.id||null}
function updateAllViewsSoft(){renderSidebarQuickLists();renderStats();renderRootTablePreview();renderJsonPreview();if(currentView==="roots")renderRootList();if(currentView==="dictionary")renderEntryList()}
function renderEverything(){sortDictionary();renderSidebarQuickLists();renderStats();renderRootTablePreview();renderRootList();renderEntryList();renderRootEditor();renderEntryEditor();$("grammarNotesInput").value=appData.grammar_notes||"";renderJsonPreview();switchView(currentView,false)}
function switchView(view,sync=true){const target=$(`${view}View`);if(!target)return;if(sync)syncEditorsToData();currentView=view;document.querySelectorAll(".view").forEach(x=>x.classList.add("hidden"));target.classList.remove("hidden");document.querySelectorAll(".nav-button").forEach(b=>b.classList.toggle("active",b.dataset.view===view));const t={home:["Main Page","A fluid local wiki for Maybelle."],roots:["Root Glyphs","Edit immutable and added root glyph meanings."],dictionary:["Dictionary","Create and expand Maybelle words."],grammar:["Grammar Notes","Track sentence rules, punctuation, accents, and usage."],threads:["Threads","Persistent named discussions through the Python host."],archive:["Archive","Save, import, export, and inspect JSON."]};$("viewTitle").textContent=t[view][0];$("viewSubtitle").textContent=t[view][1];if(view==="roots"){renderRootList();renderRootEditor()}if(view==="dictionary"){renderEntryList();renderEntryEditor()}if(view==="archive")renderJsonPreview();if(view==="threads"&&window.refreshThreadsStatus)window.refreshThreadsStatus()}
function renderStats(){$("rootCount").textContent=appData.roots.length;$("entryCount").textContent=appData.dictionary.length;$("fieldCount").textContent=appData.dictionary.reduce((n,e)=>n+Object.keys(e.fields||{}).length,0)}
function renderSidebarQuickLists(){const qr=$("quickRoots"),qe=$("quickEntries");qr.innerHTML="";qe.innerHTML="";appData.roots.slice(-8).reverse().forEach(r=>{const b=document.createElement("button");b.className="quick-link";b.innerHTML=`<span class="quick-glyph">${escapeHtml(r.glyph||"·")}</span><span class="quick-name">${escapeHtml(r.root_name||"Unnamed root")}</span>`;b.onclick=()=>{selectedRootId=r.id;switchView("roots")};qr.appendChild(b)});if(!appData.roots.length)qr.innerHTML='<div class="muted">No roots yet.</div>';appData.dictionary.slice(0,8).forEach(e=>{const b=document.createElement("button");b.className="quick-link";b.innerHTML=`<span class="quick-glyph">${escapeHtml(e.compound||"·")}</span><span class="quick-name">${escapeHtml(e.description||"Unnamed word")}</span>`;b.onclick=()=>{selectedEntryId=e.id;switchView("dictionary")};qe.appendChild(b)});if(!appData.dictionary.length)qe.innerHTML='<div class="muted">No words yet.</div>'}
function renderRootTablePreview(){const tb=$("rootTablePreview");tb.innerHTML="";if(!appData.roots.length){tb.innerHTML='<tr><td colspan="3" class="muted">No root glyphs have been added yet.</td></tr>';return}appData.roots.forEach(r=>{const tr=document.createElement("tr");tr.innerHTML=`<td style="font-size:22px;text-align:center">${escapeHtml(r.glyph)}${r.canon?'<span class="canon-pill">canon</span>':''}</td><td>${escapeHtml(r.root_name)}</td><td>${escapeHtml(r.description)}</td>`;tb.appendChild(tr)})}
function renderRootList(){const list=$("rootList"),q=$("rootSearch").value.trim().toLowerCase();list.innerHTML="";const roots=appData.roots.filter(r=>[r.glyph,r.root_name,r.description,r.notes].join(" ").toLowerCase().includes(q));if(!roots.length){list.innerHTML='<div class="empty-state">No matching roots.</div>';return}roots.forEach(r=>{const b=document.createElement("button");b.className="list-row"+(r.id===selectedRootId?" active":"");b.innerHTML=`<span class="list-glyph">${escapeHtml(r.glyph||"·")}</span><span><span class="list-title">${escapeHtml(r.root_name||"Unnamed root")}</span><span class="list-subtitle">${escapeHtml(r.description||"No description")}</span></span>`;b.onclick=()=>{syncEditorsToData();selectedRootId=r.id;renderRootList();renderRootEditor()};list.appendChild(b)})}
function renderEntryList(){sortDictionary();const list=$("entryList"),q=$("entrySearch").value.trim().toLowerCase();list.innerHTML="";const entries=appData.dictionary.filter(e=>[e.compound,e.description,e.literal_meaning,e.notes,JSON.stringify(e.fields||{})].join(" ").toLowerCase().includes(q));if(!entries.length){list.innerHTML='<div class="empty-state">No matching words.</div>';return}entries.forEach(e=>{const b=document.createElement("button");b.className="list-row"+(e.id===selectedEntryId?" active":"");b.innerHTML=`<span class="list-glyph">${escapeHtml(e.compound||"·")}</span><span><span class="list-title">${escapeHtml(e.description||"Unnamed word")}</span><span class="list-subtitle">${escapeHtml(e.literal_meaning||"No details")}</span></span>`;b.onclick=()=>{syncEditorsToData();selectedEntryId=e.id;renderEntryList();renderEntryEditor()};list.appendChild(b)})}
function renderRootEditor(){const r=appData.roots.find(x=>x.id===selectedRootId);if(!r){$("rootEmptyState").classList.remove("hidden");$("rootEditorFields").classList.add("hidden");$("rootEditorTitle").textContent="Root Editor";return}const locked=r.canon&&!$("unlockCanonRoots")?.checked;$("rootEmptyState").classList.add("hidden");$("rootEditorFields").classList.remove("hidden");$("rootEditorTitle").textContent=(r.glyph||r.root_name||"Root Editor")+(r.canon?" · canon":"");$("rootGlyphInput").value=r.glyph||"";$("rootNameInput").value=r.root_name||"";$("rootDescriptionInput").value=r.description||"";$("rootNotesInput").value=r.notes||"";["rootGlyphInput","rootNameInput","rootDescriptionInput"].forEach(id=>$(id).disabled=locked);$("deleteRootButton").disabled=locked;$("rootCanonNotice").classList.toggle("hidden",!r.canon);$("rootCanonNotice").textContent=locked?"Canon root: locked to preserve the stable Maybelle root table. Use Unlock canon root editing to change it.":"Canon root editing is unlocked."}
function rootBreakdown(compound){return Array.from(compound||"").filter(c=>c.trim()).map(c=>{const r=appData.roots.find(x=>x.glyph===c);return r?`<div><b>${escapeHtml(c)}</b> — ${escapeHtml(r.root_name)}: ${escapeHtml(r.description)}</div>`:`<div><b>${escapeHtml(c)}</b> — <span class="muted">unknown root</span></div>`}).join("")}
function renderEntryEditor(){const e=appData.dictionary.find(x=>x.id===selectedEntryId);if(!e){$("entryEmptyState").classList.remove("hidden");$("entryEditorFields").classList.add("hidden");$("entryEditorTitle").textContent="Word Editor";return}$("entryEmptyState").classList.add("hidden");$("entryEditorFields").classList.remove("hidden");$("entryEditorTitle").textContent=e.compound||e.description||"Word Editor";$("entryCompoundInput").value=e.compound||"";$("entryDescriptionInput").value=e.description||"";$("entryLiteralInput").value=e.literal_meaning||"";$("entryNotesInput").value=e.notes||"";$("entryExtraFields").innerHTML="";Object.entries(e.fields||{}).forEach(([k,v])=>addExtraFieldRow(k,v));$("entryBreakdown").querySelector(".box-body").innerHTML=rootBreakdown(e.compound)||'<span class="muted">No compound glyphs to analyze.</span>';renderEntryValidation(e);renderCompoundBuilder()}
function addRoot(){syncEditorsToData();const r={id:uid("root"),glyph:"",root_name:"",description:"",notes:""};appData.roots.push(r);selectedRootId=r.id;switchView("roots",false);autosave()}
function addEntry(){syncEditorsToData();const e={id:uid("entry"),compound:"",description:"",literal_meaning:"",notes:"",fields:{}};appData.dictionary.push(e);selectedEntryId=e.id;switchView("dictionary",false);renderEntryList();renderEntryEditor();autosave()}
async function deleteSelectedRoot(){if(!selectedRootId)return;const r=appData.roots.find(x=>x.id===selectedRootId);if(!r)return;if(r.canon&&!$("unlockCanonRoots")?.checked){setStatus("Canon roots are locked. Unlock canon root editing first.","warning");return}if(!await showConfirm({title:"Delete Root",message:`Delete root "${r.glyph||r.root_name||"unnamed"}"?`,confirmText:"Delete",danger:true}))return;appData.roots=appData.roots.filter(x=>x.id!==selectedRootId);selectedRootId=appData.roots[0]?.id||null;renderEverything();autosave()}
async function deleteSelectedEntry(){if(!selectedEntryId)return;const e=appData.dictionary.find(x=>x.id===selectedEntryId);if(!e)return;if(!await showConfirm({title:"Delete Word",message:`Delete word "${e.compound||e.description||"unnamed"}"?`,confirmText:"Delete",danger:true}))return;appData.dictionary=appData.dictionary.filter(x=>x.id!==selectedEntryId);selectedEntryId=appData.dictionary[0]?.id||null;renderEverything();autosave()}
function addExtraFieldRow(k="",v=""){const row=document.createElement("div");row.className="field-row";row.innerHTML='<input class="fieldKey" placeholder="Field name"><input class="fieldValue" placeholder="Field value"><button class="deleteFieldButton danger small">Delete</button>';row.querySelector(".fieldKey").value=k;row.querySelector(".fieldValue").value=v;row.querySelector(".deleteFieldButton").onclick=()=>{row.remove();autosave()};row.addEventListener("input",autosave);$("entryExtraFields").appendChild(row)}
function renderJsonPreview(){syncEditorsToData();$("jsonPreview").textContent=JSON.stringify(appData,null,2)}
async function emptyWiki(){if(!await showConfirm({title:"Empty Maybelle Wiki",message:"Empty the Maybelle wiki?",confirmText:"Empty Wiki",danger:true}))return;appData=createEmptyData();selectedRootId=null;selectedEntryId=null;if(BACKEND_MODE)await saveToBackend(false);else localStorage.setItem(STORAGE_KEY,JSON.stringify(appData));renderEverything();setStatus("Maybelle wiki emptied.","success")}
function downloadText(fn,text){const blob=new Blob([text],{type:"application/json;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=fn;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}
async function exportArchive(){syncEditorsToData();downloadText("maybelle_wiki_archive.json",JSON.stringify(appData,null,2));setStatus("Archive exported.","success")}
async function importArchive(){const f=$("importFile").files[0];if(!f){setStatus("Choose an archive first.","warning");return}try{appData=normalizeImportedData(JSON.parse(await f.text()));repairDuplicateIds();preserveSelections();if(BACKEND_MODE)await saveToBackend(false);else localStorage.setItem(STORAGE_KEY,JSON.stringify(appData));renderEverything();setStatus(`Imported schema v${appData.imported_from_schema_version||1} archive as schema v3.`,"success")}catch(e){console.error(e);setStatus(`Import failed: ${e.message||"unknown"}`,"error")}}
async function copyPlainJson(){syncEditorsToData();await navigator.clipboard.writeText(JSON.stringify(appData,null,2));setStatus("JSON copied.","success")}
function showConfirm(o={}){const m=$("confirmModal"),title=$("confirmModalTitle"),msg=$("confirmModalMessage"),ok=$("confirmOkButton"),cancel=$("confirmCancelButton");title.textContent=o.title||"Confirm";msg.textContent=o.message||"Are you sure?";ok.textContent=o.confirmText||"Confirm";ok.classList.toggle("danger",o.danger!==false);m.classList.add("open");return new Promise(res=>{function close(v){m.classList.remove("open");ok.onclick=cancel.onclick=null;res(v)}ok.onclick=()=>close(true);cancel.onclick=()=>close(false);m.onclick=e=>{if(e.target===m)close(false)}})}
function buildKeyboard(){const rows=["АБВГДЕЁЖЗИЙ","КЛМНОПРСТУФ","ХЦЧШЩЪЫЬЭЮЯ"];$("keyboardRows").innerHTML=rows.map(r=>`<div class="keyboard-row">${Array.from(r).map(c=>`<button class="key-button" data-key="${c}">${c}</button>`).join("")}</div>`).join("")+`<div class="keyboard-row"><button class="key-button wide" data-key=" ">Space</button><button class="key-button wide" data-action="delete">Delete</button><button class="key-button wide" data-key="〰">Question 〰</button></div>`}
function bindKeyboardEvents(){buildKeyboard();document.addEventListener("focusin",e=>{if(e.target.matches("input,textarea,[contenteditable='true']"))activeTextField=e.target});function insert(t){const f=activeTextField;if(!f)return;if(f.isContentEditable){document.execCommand("insertText",false,t);f.focus();return}const s=f.selectionStart??f.value.length,en=f.selectionEnd??f.value.length;f.value=f.value.slice(0,s)+t+f.value.slice(en);f.focus();f.setSelectionRange(s+t.length,s+t.length);f.dispatchEvent(new Event("input",{bubbles:true}))}$("keyboardToggle").onclick=()=>{$("cyrillicKeyboard").classList.toggle("open")};$("keyboardOpenTopButton").onclick=()=>$("cyrillicKeyboard").classList.add("open");$("closeKeyboardButton").onclick=()=>$("cyrillicKeyboard").classList.remove("open");$("cyrillicKeyboard").addEventListener("mousedown",e=>e.preventDefault());$("cyrillicKeyboard").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.key!==undefined)insert(b.dataset.key);if(b.dataset.action==="delete")document.execCommand("delete",false,null)})}

function seedMaybelleCanon(){
  syncEditorsToData();
  let rootsAdded=0, entriesAdded=0;
  for(const [glyph,root_name,description] of CANON_ROOTS){
    const existing=appData.roots.find(r=>r.glyph===glyph);
    if(existing){ existing.canon=true; continue; }
    appData.roots.push({id:uid("root"),glyph,root_name,description,notes:"",canon:true});
    rootsAdded++;
  }
  for(const entry of CANON_ENTRIES){
    const existing=appData.dictionary.find(e=>e.compound===entry.compound);
    if(existing){ existing.canon=true; continue; }
    appData.dictionary.push({id:uid("entry"),...entry,fields:{},canon:true});
    entriesAdded++;
  }
  sortDictionary(); preserveSelections(); renderEverything(); autosave();
  setStatus(`Seeded Maybelle canon: ${rootsAdded} roots and ${entriesAdded} words added. Existing records were not overwritten.`, "success");
}
function validateEntry(entry){
  const warnings=[]; if(!entry.description?.trim())warnings.push("Description is empty.");
  const duplicates=appData.dictionary.filter(e=>e.id!==entry.id&&e.compound&&e.compound===entry.compound); if(duplicates.length)warnings.push("Duplicate compound already exists.");
  for(const ch of Array.from(entry.compound||"")){
    if(ch==="〰") { if(!entry.compound.endsWith("〰")) warnings.push("Question marker 〰 should appear at the end."); continue; }
    if(!/[А-ЯЁ]/.test(ch)) warnings.push(`Non-Maybelle character: ${ch}`);
    else if(!appData.roots.some(r=>r.glyph===ch)) warnings.push(`Unknown root glyph: ${ch}`);
  }
  return warnings;
}
function renderEntryValidation(entry){
  const box=$("entryValidation").querySelector(".box-body"), warnings=validateEntry(entry);
  box.innerHTML=warnings.length?`<ul class="validation-list">${warnings.map(w=>`<li>${escapeHtml(w)}</li>`).join("")}</ul>`:'<span class="success">No validation warnings.</span>';
}
function renderCompoundBuilder(){
  const host=$("builderRoots"); if(!host)return;
  host.innerHTML=appData.roots.map(r=>`<button class="builder-root" data-builder-glyph="${escapeHtml(r.glyph)}"><b>${escapeHtml(r.glyph)}</b><span>${escapeHtml(r.root_name||"Root")}</span></button>`).join("")||'<span class="muted">Seed or add roots to build compounds.</span>';
  host.querySelectorAll("[data-builder-glyph]").forEach(b=>b.onclick=()=>{const input=$("entryCompoundInput");input.value+=b.dataset.builderGlyph;input.dispatchEvent(new Event("input",{bubbles:true}));input.focus();});
}
async function refreshBackups(){
  if(!BACKEND_MODE){$("backupBrowser").innerHTML='<div class="empty-state">Backup browser requires the Python host.</div>';return;}
  const r=await fetch(`${BACKEND_BASE_URL}/api/admin/backups`,{cache:"no-store"}); const d=await r.json(); if(!r.ok||d.ok===false)throw new Error(d.error||"Could not load backups");
  $("backupBrowser").innerHTML=`<h3>Backup Browser</h3><p class="muted">Pushes: ${d.state?.push_count||0}; pending backup rows: ${d.pending_pushes||0}</p>`+(d.backups||[]).map(b=>`<div class="backup-row"><button data-backup-name="${escapeHtml(b.name)}">View</button><span><b>${escapeHtml(b.name)}</b><br><small>${escapeHtml(b.created_at||"")} · pushes ${b.from_push||0}-${b.to_push||0} · ${b.change_count||0} changes</small></span></div>`).join("")||'<div class="empty-state">No backups yet.</div>';
  $("backupBrowser").querySelectorAll("[data-backup-name]").forEach(b=>b.onclick=()=>viewBackup(b.dataset.backupName));
}
async function viewBackup(name){
  const admin_pass=prompt("Admin password (leave blank if disabled):")||""; const r=await fetch(`${BACKEND_BASE_URL}/api/admin/backup/read`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,admin_pass})}); const d=await r.json(); if(!r.ok||d.ok===false)throw new Error(d.error||"Could not read backup");
  $("backupPreview").classList.remove("hidden"); $("backupPreview").textContent=JSON.stringify(d.backup,null,2);
}
async function forceBackup(){
  if(!BACKEND_MODE){setStatus("Manual backups require the Python host.","warning");return;}
  const admin_pass=prompt("Admin password (leave blank if disabled):")||""; const r=await fetch(`${BACKEND_BASE_URL}/api/admin/backup`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({admin_pass})}); const d=await r.json(); if(!r.ok||d.ok===false)throw new Error(d.error||"Backup failed"); setStatus(`Created backup: ${d.backup_path}`,"success"); await refreshBackups();
}

function bindEvents(){document.querySelectorAll(".nav-button").forEach(b=>b.onclick=()=>switchView(b.dataset.view));document.querySelectorAll("[data-view-jump]").forEach(b=>b.onclick=()=>switchView(b.dataset.viewJump));$("saveLocalButton").onclick=saveLocal;$("loadLocalButton").onclick=loadLocal;$("exportButton").onclick=exportArchive;$("importButton").onclick=importArchive;$("copyJsonButton").onclick=copyPlainJson;$("emptyWikiButton").onclick=emptyWiki;$("refreshPreviewButton").onclick=renderJsonPreview;["seedCanonHomeButton","seedCanonRootsButton","seedCanonArchiveButton"].forEach(id=>$(id).onclick=seedMaybelleCanon);$("unlockCanonRoots").onchange=renderRootEditor;$("forceBackupButton").onclick=()=>forceBackup().catch(e=>setStatus(e.message,"error"));$("refreshBackupsButton").onclick=()=>refreshBackups().catch(e=>setStatus(e.message,"error"));$("addRootButton").onclick=addRoot;$("homeAddRootButton").onclick=addRoot;$("deleteRootButton").onclick=deleteSelectedRoot;$("rootSearch").oninput=renderRootList;$("addEntryButton").onclick=addEntry;$("homeAddEntryButton").onclick=addEntry;$("deleteEntryButton").onclick=deleteSelectedEntry;$("entrySearch").oninput=renderEntryList;$("addExtraFieldButton").onclick=()=>{addExtraFieldRow();autosave()};["rootGlyphInput","rootNameInput","rootDescriptionInput","rootNotesInput","entryCompoundInput","entryDescriptionInput","entryLiteralInput","entryNotesInput","grammarNotesInput"].forEach(id=>$(id).addEventListener("input",()=>{autosave();if(id==="entryCompoundInput"){const e=appData.dictionary.find(x=>x.id===selectedEntryId);if(e){e.compound=$("entryCompoundInput").value.trim();renderEntryEditor()}}}));bindKeyboardEvents()}
async function boot(){bindEvents();setBackendBanner();if(window.initThreads)window.initThreads();try{if(BACKEND_MODE)appData=await loadFromBackend();else if(localStorage.getItem(STORAGE_KEY))appData=normalizeImportedData(JSON.parse(localStorage.getItem(STORAGE_KEY)));else appData=createEmptyData();repairDuplicateIds();setStatus(BACKEND_MODE?"Loaded wiki from server file.":"Loaded local wiki.","success")}catch(e){console.error(e);appData=createEmptyData();setStatus("Started empty after load failure.","warning")}preserveSelections();renderEverything();setBackendBanner()}
document.addEventListener("DOMContentLoaded",boot);
=======
const STORAGE_KEY = "maybelle.wiki.editor.v3";
const BACKEND_MODE =
  location.protocol === "http:" || location.protocol === "https:";
const BACKEND_BASE_URL = BACKEND_MODE ? location.origin : "";
let appData = createEmptyData(),
  currentView = "home",
  selectedRootId = null,
  selectedEntryId = null,
  autosaveTimer = null,
  activeTextField = null;
const CANON_ROOTS = [
  ["А", "Existence", "Being, presence, reality"],
  ["Б", "Becoming", "Change, emergence, transformation"],
  ["В", "Motion", "Movement, travel, flow"],
  ["Г", "Space", "Place, area, distance"],
  ["Д", "Structure", "Shape, order, built form"],
  ["Е", "Knowledge", "Knowing, learning, memory"],
  ["Ё", "Perception", "Sensing, seeing, noticing"],
  ["Ж", "Person", "Person, self, human actor"],
  ["З", "Life", "Living things, vitality, growth"],
  ["И", "Relation", "Connection, withness, between"],
  ["Й", "Identity", "Sameness, name, selfhood"],
  ["К", "Object", "Thing, item, material noun"],
  ["Л", "Language", "Speech, writing, sign"],
  ["М", "Mind", "Thought, feeling, intention"],
  ["Н", "Time", "Time, day, sequence"],
  ["О", "State", "Condition, quality of being"],
  ["П", "Purpose", "Goal, use, function"],
  ["Р", "Action", "Doing, making, event"],
  ["С", "Society", "Community, culture, shared life"],
  ["Т", "Tool", "Instrument, method, technology"],
  ["У", "Energy", "Power, force, heat"],
  ["Ф", "Form", "Appearance, body, pattern"],
  ["Х", "Opposition", "Not, against, contrast"],
  ["Ц", "Quantity", "Number, amount, measure"],
  ["Ч", "Choice", "Decision, selection, possibility"],
  ["Ш", "Group", "Collection, many-as-one"],
  ["Щ", "Comparison", "Likeness, difference, degree"],
  ["Ъ", "Cause", "Reason, source, because"],
  ["Ы", "Possession", "Having, belonging, ownership"],
  ["Ь", "Property", "Attribute, trait, modifier"],
  ["Э", "Light", "Light, brightness, illumination"],
  ["Ю", "Direction", "Toward, path, orientation"],
  ["Я", "Reference", "This, that, pointing, context"],
];
const CANON_ENTRIES = [
  {
    compound: "ЖИ",
    description: "Greeting / hello",
    literal_meaning: "Person + Relation",
    notes: "Standard Maybelle greeting.",
  },
  {
    compound: "НО",
    description: "Good morning / time-state phrase",
    literal_meaning: "Time + State",
    notes: "A greeting-like phrase for a favorable time state.",
  },
  {
    compound: "НЭ",
    description: "Day / daylight time",
    literal_meaning: "Time + Light",
    notes: "Derived from Time plus Light.",
  },
  {
    compound: "НХЭ",
    description: "Night / time without light",
    literal_meaning: "Time + Opposition + Light",
    notes: "Derived from Time plus Not/Opposition plus Light.",
  },
];
function $(id) {
  return document.getElementById(id);
}
function uid(p) {
  return crypto.randomUUID
    ? `${p}-${crypto.randomUUID()}`
    : `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function stableImportedId(prefix, item, index) {
  if (item && item.id !== undefined && String(item.id).trim() !== "")
    return String(item.id);
  const s = JSON.stringify(item || {});
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${prefix}-import-${index + 1}-${(h >>> 0).toString(36)}`;
}
function repairDuplicateIdsInData(data) {
  const sr = new Set();
  data.roots.forEach((r, i) => {
    if (!r.id || sr.has(r.id))
      r.id = stableImportedId("root", { ...r, id: "", _repair: i }, i);
    sr.add(r.id);
  });
  const se = new Set();
  data.dictionary.forEach((e, i) => {
    if (!e.id || se.has(e.id))
      e.id = stableImportedId("entry", { ...e, id: "", _repair: i }, i);
    se.add(e.id);
  });
  return data;
}
function repairDuplicateIds() {
  appData = repairDuplicateIdsInData(appData);
}
function createEmptyData() {
  return {
    schema_version: 3,
    updated_at: new Date().toISOString(),
    roots: [],
    dictionary: [],
    grammar_notes: "",
  };
}
function normalizeImportedData(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Wiki archive root must be an object");
  const roots = Array.isArray(raw.roots) ? raw.roots : [],
    dict = Array.isArray(raw.dictionary)
      ? raw.dictionary
      : Array.isArray(raw.entries)
        ? raw.entries
        : [];
  const data = {
    schema_version: 3,
    imported_from_schema_version: Number(
      raw.schema_version || raw.schemaVersion || 1,
    ),
    updated_at: raw.updated_at || raw.updatedAt || new Date().toISOString(),
    roots: roots.map((r, i) => ({
      id: stableImportedId("root", r, i),
      glyph: String(r?.glyph || ""),
      root_name: String(r?.root_name || r?.rootName || ""),
      description: String(r?.description || ""),
      notes: String(r?.notes || ""),
      canon: Boolean(r?.canon),
    })),
    dictionary: dict.map((e, i) => ({
      id: stableImportedId("entry", e, i),
      compound: String(e?.compound || e?.word || ""),
      description: String(e?.description || e?.meaning || ""),
      literal_meaning: String(e?.literal_meaning || e?.literalMeaning || ""),
      notes: String(e?.notes || ""),
      fields:
        e?.fields && typeof e.fields === "object" && !Array.isArray(e.fields)
          ? e.fields
          : {},
      canon: Boolean(e?.canon),
    })),
    grammar_notes: String(raw.grammar_notes || raw.grammarNotes || ""),
  };
  sortDictionary(data);
  return repairDuplicateIdsInData(data);
}
function sortDictionary(data = appData) {
  data.dictionary.sort((a, b) =>
    `${a.description || ""}\0${a.compound || ""}`
      .toLowerCase()
      .localeCompare(
        `${b.description || ""}\0${b.compound || ""}`.toLowerCase(),
      ),
  );
}
function setStatus(msg, type = "") {
  const s = $("status");
  s.className = "status" + (type ? " " + type : "");
  s.textContent = msg;
}
function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function isBackendMode() {
  return BACKEND_MODE;
}
function setBackendBanner() {
  const b = $("backendModeBanner");
  if (BACKEND_MODE) {
    b.className = "status success";
    b.textContent =
      "Server mode: this wiki loads/saves through the Maybelle Python backend.";
  } else {
    b.className = "status warning";
    b.textContent =
      "Standalone mode: this wiki saves to this browser only. Open through the Python host for server saving.";
  }
}
async function loadFromBackend() {
  const r = await fetch(`${BACKEND_BASE_URL}/api/wiki`, { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false)
    throw new Error(d.error || `Backend returned HTTP ${r.status}`);
  return normalizeImportedData(d);
}
async function saveToBackend(show = true) {
  syncEditorsToData();
  const r = await fetch(`${BACKEND_BASE_URL}/api/wiki`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(appData),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false)
    throw new Error(d.error || `Backend returned HTTP ${r.status}`);
  if (show)
    setStatus(
      `Saved wiki to server file (${d.path || "wiki file"}).`,
      "success",
    );
  return d;
}
function autosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    try {
      syncEditorsToData();
      if (BACKEND_MODE) {
        await saveToBackend(false);
        setStatus("Maybelle wiki autosaved to server file.", "success");
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
        setStatus("Maybelle wiki autosaved locally.", "success");
      }
      updateAllViewsSoft();
    } catch (e) {
      console.error(e);
      setStatus(`Autosave failed: ${e.message || "unknown error"}`, "error");
    }
  }, 650);
}
async function saveLocal() {
  try {
    syncEditorsToData();
    if (BACKEND_MODE) await saveToBackend(true);
    else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
      setStatus("Maybelle wiki saved locally.", "success");
    }
    updateAllViewsSoft();
  } catch (e) {
    console.error(e);
    setStatus(`Save failed: ${e.message || "unknown error"}`, "error");
  }
}
async function loadLocal() {
  try {
    appData = BACKEND_MODE
      ? await loadFromBackend()
      : normalizeImportedData(
          JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
        );
    repairDuplicateIds();
    preserveSelections();
    renderEverything();
    setStatus(
      BACKEND_MODE ? "Loaded wiki from server file." : "Loaded local wiki.",
      "success",
    );
  } catch (e) {
    console.error(e);
    setStatus(`Could not load wiki: ${e.message || "unknown error"}`, "error");
  }
}
function syncEditorsToData() {
  appData.updated_at = new Date().toISOString();
  appData.schema_version = 3;
  let r = appData.roots.find((x) => x.id === selectedRootId);
  if (r && !$("rootEditorFields").classList.contains("hidden")) {
    r.glyph = $("rootGlyphInput").value.trim();
    r.root_name = $("rootNameInput").value.trim();
    r.description = $("rootDescriptionInput").value.trim();
    r.notes = $("rootNotesInput").value.trim();
  }
  let e = appData.dictionary.find((x) => x.id === selectedEntryId);
  if (e && !$("entryEditorFields").classList.contains("hidden")) {
    e.compound = $("entryCompoundInput").value.trim();
    e.description = $("entryDescriptionInput").value.trim();
    e.literal_meaning = $("entryLiteralInput").value.trim();
    e.notes = $("entryNotesInput").value.trim();
    e.fields = collectExtraFields();
  }
  appData.grammar_notes = $("grammarNotesInput").value;
  sortDictionary();
}
function collectExtraFields() {
  const f = {};
  document.querySelectorAll("#entryExtraFields .field-row").forEach((row) => {
    const k = row.querySelector(".fieldKey").value.trim(),
      v = row.querySelector(".fieldValue").value.trim();
    if (k) f[k] = v;
  });
  return f;
}
function preserveSelections() {
  if (!appData.roots.some((r) => r.id === selectedRootId))
    selectedRootId = appData.roots[0]?.id || null;
  if (!appData.dictionary.some((e) => e.id === selectedEntryId))
    selectedEntryId = appData.dictionary[0]?.id || null;
}
function updateAllViewsSoft() {
  renderSidebarQuickLists();
  renderStats();
  renderRootTablePreview();
  renderJsonPreview();
  if (currentView === "roots") renderRootList();
  if (currentView === "dictionary") renderEntryList();
}
function renderEverything() {
  sortDictionary();
  renderSidebarQuickLists();
  renderStats();
  renderRootTablePreview();
  renderRootList();
  renderEntryList();
  renderRootEditor();
  renderEntryEditor();
  $("grammarNotesInput").value = appData.grammar_notes || "";
  renderJsonPreview();
  switchView(currentView, false);
}
function switchView(view, sync = true) {
  const target = $(`${view}View`);
  if (!target) return;
  if (sync) syncEditorsToData();
  currentView = view;
  document.querySelectorAll(".view").forEach((x) => x.classList.add("hidden"));
  target.classList.remove("hidden");
  document
    .querySelectorAll(".nav-button")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  const t = {
    home: ["Main Page", "A fluid local wiki for Maybelle."],
    roots: ["Root Glyphs", "Edit immutable and added root glyph meanings."],
    dictionary: ["Dictionary", "Create and expand Maybelle words."],
    grammar: [
      "Grammar Notes",
      "Track sentence rules, punctuation, accents, and usage.",
    ],
    threads: [
      "Threads",
      "Persistent named discussions through the Python host.",
    ],
    archive: ["Archive", "Save, import, export, and inspect JSON."],
  };
  $("viewTitle").textContent = t[view][0];
  $("viewSubtitle").textContent = t[view][1];
  if (view === "roots") {
    renderRootList();
    renderRootEditor();
  }
  if (view === "dictionary") {
    renderEntryList();
    renderEntryEditor();
  }
  if (view === "archive") renderJsonPreview();
  if (view === "threads" && window.refreshThreadsStatus)
    window.refreshThreadsStatus();
}
function renderStats() {
  $("rootCount").textContent = appData.roots.length;
  $("entryCount").textContent = appData.dictionary.length;
  $("fieldCount").textContent = appData.dictionary.reduce(
    (n, e) => n + Object.keys(e.fields || {}).length,
    0,
  );
}
function renderSidebarQuickLists() {
  const qr = $("quickRoots"),
    qe = $("quickEntries");
  qr.innerHTML = "";
  qe.innerHTML = "";
  appData.roots
    .slice(-8)
    .reverse()
    .forEach((r) => {
      const b = document.createElement("button");
      b.className = "quick-link";
      b.innerHTML = `<span class="quick-glyph">${escapeHtml(r.glyph || "·")}</span><span class="quick-name">${escapeHtml(r.root_name || "Unnamed root")}</span>`;
      b.onclick = () => {
        selectedRootId = r.id;
        switchView("roots");
      };
      qr.appendChild(b);
    });
  if (!appData.roots.length)
    qr.innerHTML = '<div class="muted">No roots yet.</div>';
  appData.dictionary.slice(0, 8).forEach((e) => {
    const b = document.createElement("button");
    b.className = "quick-link";
    b.innerHTML = `<span class="quick-glyph">${escapeHtml(e.compound || "·")}</span><span class="quick-name">${escapeHtml(e.description || "Unnamed word")}</span>`;
    b.onclick = () => {
      selectedEntryId = e.id;
      switchView("dictionary");
    };
    qe.appendChild(b);
  });
  if (!appData.dictionary.length)
    qe.innerHTML = '<div class="muted">No words yet.</div>';
}
function renderRootTablePreview() {
  const tb = $("rootTablePreview");
  tb.innerHTML = "";
  if (!appData.roots.length) {
    tb.innerHTML =
      '<tr><td colspan="3" class="muted">No root glyphs have been added yet.</td></tr>';
    return;
  }
  appData.roots.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td style="font-size:22px;text-align:center">${escapeHtml(r.glyph)}${r.canon ? '<span class="canon-pill">canon</span>' : ""}</td><td>${escapeHtml(r.root_name)}</td><td>${escapeHtml(r.description)}</td>`;
    tb.appendChild(tr);
  });
}
function renderRootList() {
  const list = $("rootList"),
    q = $("rootSearch").value.trim().toLowerCase();
  list.innerHTML = "";
  const roots = appData.roots.filter((r) =>
    [r.glyph, r.root_name, r.description, r.notes]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
  if (!roots.length) {
    list.innerHTML = '<div class="empty-state">No matching roots.</div>';
    return;
  }
  roots.forEach((r) => {
    const b = document.createElement("button");
    b.className = "list-row" + (r.id === selectedRootId ? " active" : "");
    b.innerHTML = `<span class="list-glyph">${escapeHtml(r.glyph || "·")}</span><span><span class="list-title">${escapeHtml(r.root_name || "Unnamed root")}</span><span class="list-subtitle">${escapeHtml(r.description || "No description")}</span></span>`;
    b.onclick = () => {
      syncEditorsToData();
      selectedRootId = r.id;
      renderRootList();
      renderRootEditor();
    };
    list.appendChild(b);
  });
}
function renderEntryList() {
  sortDictionary();
  const list = $("entryList"),
    q = $("entrySearch").value.trim().toLowerCase();
  list.innerHTML = "";
  const entries = appData.dictionary.filter((e) =>
    [
      e.compound,
      e.description,
      e.literal_meaning,
      e.notes,
      JSON.stringify(e.fields || {}),
    ]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
  if (!entries.length) {
    list.innerHTML = '<div class="empty-state">No matching words.</div>';
    return;
  }
  entries.forEach((e) => {
    const b = document.createElement("button");
    b.className = "list-row" + (e.id === selectedEntryId ? " active" : "");
    b.innerHTML = `<span class="list-glyph">${escapeHtml(e.compound || "·")}</span><span><span class="list-title">${escapeHtml(e.description || "Unnamed word")}</span><span class="list-subtitle">${escapeHtml(e.literal_meaning || "No details")}</span></span>`;
    b.onclick = () => {
      syncEditorsToData();
      selectedEntryId = e.id;
      renderEntryList();
      renderEntryEditor();
    };
    list.appendChild(b);
  });
}
function renderRootEditor() {
  const r = appData.roots.find((x) => x.id === selectedRootId);
  if (!r) {
    $("rootEmptyState").classList.remove("hidden");
    $("rootEditorFields").classList.add("hidden");
    $("rootEditorTitle").textContent = "Root Editor";
    ["rootGlyphInput", "rootNameInput", "rootDescriptionInput"].forEach(
      (id) => ($(id).disabled = false),
    );
    $("deleteRootButton").disabled = false;
    $("rootCanonNotice").classList.add("hidden");
    return;
  }
  const locked = r.canon && !$("unlockCanonRoots")?.checked;
  $("rootEmptyState").classList.add("hidden");
  $("rootEditorFields").classList.remove("hidden");
  $("rootEditorTitle").textContent =
    (r.glyph || r.root_name || "Root Editor") + (r.canon ? " · canon" : "");
  $("rootGlyphInput").value = r.glyph || "";
  $("rootNameInput").value = r.root_name || "";
  $("rootDescriptionInput").value = r.description || "";
  $("rootNotesInput").value = r.notes || "";
  ["rootGlyphInput", "rootNameInput", "rootDescriptionInput"].forEach(
    (id) => ($(id).disabled = locked),
  );
  $("deleteRootButton").disabled = locked;
  $("rootCanonNotice").classList.toggle("hidden", !r.canon);
  $("rootCanonNotice").textContent = locked
    ? "Canon root: locked to preserve the stable Maybelle root table. Use Unlock canon root editing to change it."
    : "Canon root editing is unlocked.";
}
function rootBreakdown(compound) {
  return Array.from(compound || "")
    .filter((c) => c.trim())
    .map((c) => {
      const r = appData.roots.find((x) => x.glyph === c);
      return r
        ? `<div><b>${escapeHtml(c)}</b> — ${escapeHtml(r.root_name)}: ${escapeHtml(r.description)}</div>`
        : `<div><b>${escapeHtml(c)}</b> — <span class="muted">unknown root</span></div>`;
    })
    .join("");
}
function renderEntryEditor() {
  const e = appData.dictionary.find((x) => x.id === selectedEntryId);
  if (!e) {
    $("entryEmptyState").classList.remove("hidden");
    $("entryEditorFields").classList.add("hidden");
    $("entryEditorTitle").textContent = "Word Editor";
    $("entryBreakdown").querySelector(".box-body").innerHTML =
      '<span class="muted">No compound glyphs to analyze.</span>';
    $("entryValidation").querySelector(".box-body").innerHTML =
      '<span class="muted">Select a word to validate.</span>';
    $("builderRoots").innerHTML =
      '<span class="muted">Select a word to build a compound.</span>';
    return;
  }
  $("entryEmptyState").classList.add("hidden");
  $("entryEditorFields").classList.remove("hidden");
  $("entryEditorTitle").textContent =
    e.compound || e.description || "Word Editor";
  $("entryCompoundInput").value = e.compound || "";
  $("entryDescriptionInput").value = e.description || "";
  $("entryLiteralInput").value = e.literal_meaning || "";
  $("entryNotesInput").value = e.notes || "";
  $("entryExtraFields").innerHTML = "";
  Object.entries(e.fields || {}).forEach(([k, v]) => addExtraFieldRow(k, v));
  $("entryBreakdown").querySelector(".box-body").innerHTML =
    rootBreakdown(e.compound) ||
    '<span class="muted">No compound glyphs to analyze.</span>';
  renderEntryValidation(e);
  renderCompoundBuilder();
}
function addRoot() {
  syncEditorsToData();
  const r = {
    id: uid("root"),
    glyph: "",
    root_name: "",
    description: "",
    notes: "",
  };
  appData.roots.push(r);
  selectedRootId = r.id;
  switchView("roots", false);
  autosave();
}
function addEntry() {
  syncEditorsToData();
  const e = {
    id: uid("entry"),
    compound: "",
    description: "",
    literal_meaning: "",
    notes: "",
    fields: {},
  };
  appData.dictionary.push(e);
  selectedEntryId = e.id;
  switchView("dictionary", false);
  renderEntryList();
  renderEntryEditor();
  autosave();
}
async function deleteSelectedRoot() {
  if (!selectedRootId) return;
  const r = appData.roots.find((x) => x.id === selectedRootId);
  if (!r) return;
  if (r.canon && !$("unlockCanonRoots")?.checked) {
    setStatus(
      "Canon roots are locked. Unlock canon root editing first.",
      "warning",
    );
    return;
  }
  if (
    !(await showConfirm({
      title: "Delete Root",
      message: `Delete root "${r.glyph || r.root_name || "unnamed"}"?`,
      confirmText: "Delete",
      danger: true,
    }))
  )
    return;
  appData.roots = appData.roots.filter((x) => x.id !== selectedRootId);
  selectedRootId = appData.roots[0]?.id || null;
  renderEverything();
  autosave();
}
async function deleteSelectedEntry() {
  if (!selectedEntryId) return;
  const e = appData.dictionary.find((x) => x.id === selectedEntryId);
  if (!e) return;
  if (
    !(await showConfirm({
      title: "Delete Word",
      message: `Delete word "${e.compound || e.description || "unnamed"}"?`,
      confirmText: "Delete",
      danger: true,
    }))
  )
    return;
  appData.dictionary = appData.dictionary.filter(
    (x) => x.id !== selectedEntryId,
  );
  selectedEntryId = appData.dictionary[0]?.id || null;
  renderEverything();
  autosave();
}
function addExtraFieldRow(k = "", v = "") {
  const row = document.createElement("div");
  row.className = "field-row";
  row.innerHTML =
    '<input class="fieldKey" placeholder="Field name"><input class="fieldValue" placeholder="Field value"><button class="deleteFieldButton danger small">Delete</button>';
  row.querySelector(".fieldKey").value = k;
  row.querySelector(".fieldValue").value = v;
  row.querySelector(".deleteFieldButton").onclick = () => {
    row.remove();
    autosave();
  };
  row.addEventListener("input", autosave);
  $("entryExtraFields").appendChild(row);
}
function renderJsonPreview() {
  syncEditorsToData();
  $("jsonPreview").textContent = JSON.stringify(appData, null, 2);
}
async function emptyWiki() {
  if (
    !(await showConfirm({
      title: "Empty Maybelle Wiki",
      message: "Empty the Maybelle wiki?",
      confirmText: "Empty Wiki",
      danger: true,
    }))
  )
    return;
  appData = createEmptyData();
  selectedRootId = null;
  selectedEntryId = null;
  if (BACKEND_MODE) await saveToBackend(false);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  renderEverything();
  setStatus("Maybelle wiki emptied.", "success");
}
function downloadText(fn, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fn;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
async function exportArchive() {
  syncEditorsToData();
  downloadText("maybelle_wiki_archive.json", JSON.stringify(appData, null, 2));
  setStatus("Archive exported.", "success");
}
async function importArchive() {
  const f = $("importFile").files[0];
  if (!f) {
    setStatus("Choose an archive first.", "warning");
    return;
  }
  try {
    appData = normalizeImportedData(JSON.parse(await f.text()));
    repairDuplicateIds();
    preserveSelections();
    if (BACKEND_MODE) await saveToBackend(false);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    renderEverything();
    setStatus(
      `Imported schema v${appData.imported_from_schema_version || 1} archive as schema v3.`,
      "success",
    );
  } catch (e) {
    console.error(e);
    setStatus(`Import failed: ${e.message || "unknown"}`, "error");
  }
}
async function copyPlainJson() {
  syncEditorsToData();
  await navigator.clipboard.writeText(JSON.stringify(appData, null, 2));
  setStatus("JSON copied.", "success");
}
function showConfirm(o = {}) {
  const m = $("confirmModal"),
    title = $("confirmModalTitle"),
    msg = $("confirmModalMessage"),
    ok = $("confirmOkButton"),
    cancel = $("confirmCancelButton");
  title.textContent = o.title || "Confirm";
  msg.textContent = o.message || "Are you sure?";
  ok.textContent = o.confirmText || "Confirm";
  ok.classList.toggle("danger", o.danger !== false);
  m.classList.add("open");
  return new Promise((res) => {
    function close(v) {
      m.classList.remove("open");
      ok.onclick = cancel.onclick = null;
      res(v);
    }
    ok.onclick = () => close(true);
    cancel.onclick = () => close(false);
    m.onclick = (e) => {
      if (e.target === m) close(false);
    };
  });
}
function buildKeyboard() {
  const rows = ["АБВГДЕЁЖЗИЙ", "КЛМНОПРСТУФ", "ХЦЧШЩЪЫЬЭЮЯ"];
  $("keyboardRows").innerHTML =
    rows
      .map(
        (r) =>
          `<div class="keyboard-row">${Array.from(r)
            .map(
              (c) => `<button class="key-button" data-key="${c}">${c}</button>`,
            )
            .join("")}</div>`,
      )
      .join("") +
    `<div class="keyboard-row"><button class="key-button wide" data-key=" ">Space</button><button class="key-button wide" data-action="delete">Delete</button><button class="key-button wide" data-key="〰">Question 〰</button></div>`;
}
function bindKeyboardEvents() {
  buildKeyboard();
  document.addEventListener("focusin", (e) => {
    if (e.target.matches("input,textarea,[contenteditable='true']"))
      activeTextField = e.target;
  });
  function insert(t) {
    const f = activeTextField;
    if (!f) return;
    if (f.isContentEditable) {
      document.execCommand("insertText", false, t);
      f.focus();
      return;
    }
    const s = f.selectionStart ?? f.value.length,
      en = f.selectionEnd ?? f.value.length;
    f.value = f.value.slice(0, s) + t + f.value.slice(en);
    f.focus();
    f.setSelectionRange(s + t.length, s + t.length);
    f.dispatchEvent(new Event("input", { bubbles: true }));
  }
  $("keyboardToggle").onclick = () => {
    $("cyrillicKeyboard").classList.toggle("open");
  };
  $("keyboardOpenTopButton").onclick = () =>
    $("cyrillicKeyboard").classList.add("open");
  $("closeKeyboardButton").onclick = () =>
    $("cyrillicKeyboard").classList.remove("open");
  $("cyrillicKeyboard").addEventListener("mousedown", (e) =>
    e.preventDefault(),
  );
  $("cyrillicKeyboard").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.key !== undefined) insert(b.dataset.key);
    if (b.dataset.action === "delete")
      document.execCommand("delete", false, null);
  });
}

function seedMaybelleCanon() {
  syncEditorsToData();
  let rootsAdded = 0,
    entriesAdded = 0;
  for (const [glyph, root_name, description] of CANON_ROOTS) {
    const existing = appData.roots.find((r) => r.glyph === glyph);
    if (existing) {
      existing.canon = true;
      continue;
    }
    appData.roots.push({
      id: uid("root"),
      glyph,
      root_name,
      description,
      notes: "",
      canon: true,
    });
    rootsAdded++;
  }
  for (const entry of CANON_ENTRIES) {
    const existing = appData.dictionary.find(
      (e) => e.compound === entry.compound,
    );
    if (existing) {
      existing.canon = true;
      continue;
    }
    appData.dictionary.push({
      id: uid("entry"),
      ...entry,
      fields: {},
      canon: true,
    });
    entriesAdded++;
  }
  sortDictionary();
  preserveSelections();
  renderEverything();
  autosave();
  setStatus(
    `Seeded Maybelle canon: ${rootsAdded} roots and ${entriesAdded} words added. Existing records were not overwritten.`,
    "success",
  );
}
function validateEntry(entry) {
  const warnings = [];
  if (!entry.description?.trim()) warnings.push("Description is empty.");
  const duplicates = appData.dictionary.filter(
    (e) => e.id !== entry.id && e.compound && e.compound === entry.compound,
  );
  if (duplicates.length) warnings.push("Duplicate compound already exists.");
  for (const ch of Array.from(entry.compound || "")) {
    if (ch === "〰") {
      if (!entry.compound.endsWith("〰"))
        warnings.push("Question marker 〰 should appear at the end.");
      continue;
    }
    if (!/[А-ЯЁ]/.test(ch)) warnings.push(`Non-Maybelle character: ${ch}`);
    else if (!appData.roots.some((r) => r.glyph === ch))
      warnings.push(`Unknown root glyph: ${ch}`);
  }
  return warnings;
}
function renderEntryValidation(entry) {
  const box = $("entryValidation").querySelector(".box-body"),
    warnings = validateEntry(entry);
  box.innerHTML = warnings.length
    ? `<ul class="validation-list">${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
    : '<span class="success">No validation warnings.</span>';
}
function renderCompoundBuilder() {
  const host = $("builderRoots");
  if (!host) return;
  host.innerHTML =
    appData.roots
      .map(
        (r) =>
          `<button class="builder-root" data-builder-glyph="${escapeHtml(r.glyph)}"><b>${escapeHtml(r.glyph)}</b><span>${escapeHtml(r.root_name || "Root")}</span></button>`,
      )
      .join("") ||
    '<span class="muted">Seed or add roots to build compounds.</span>';
  host.querySelectorAll("[data-builder-glyph]").forEach(
    (b) =>
      (b.onclick = () => {
        const input = $("entryCompoundInput");
        input.value += b.dataset.builderGlyph;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
      }),
  );
}
async function refreshBackups() {
  if (!BACKEND_MODE) {
    $("backupBrowser").innerHTML =
      '<div class="empty-state">Backup browser requires the Python host.</div>';
    return;
  }
  const r = await fetch(`${BACKEND_BASE_URL}/api/admin/backups`, {
    cache: "no-store",
  });
  const d = await r.json();
  if (!r.ok || d.ok === false)
    throw new Error(d.error || "Could not load backups");
  const backupRows = (d.backups || [])
    .map(
      (b) =>
        `<div class="backup-row"><button data-backup-name="${escapeHtml(b.name)}">View</button><span><b>${escapeHtml(b.name)}</b><br><small>${escapeHtml(b.created_at || "")} · pushes ${b.from_push || 0}-${b.to_push || 0} · ${b.change_count || 0} changes</small></span></div>`,
    )
    .join("");
  $("backupBrowser").innerHTML =
    `<h3>Backup Browser</h3><p class="muted">Pushes: ${d.state?.push_count || 0}; pending backup rows: ${d.pending_pushes || 0}</p>` +
    (backupRows || '<div class="empty-state">No backups yet.</div>');
  $("backupBrowser")
    .querySelectorAll("[data-backup-name]")
    .forEach((b) => (b.onclick = () => viewBackup(b.dataset.backupName)));
}
async function viewBackup(name) {
  const admin_pass = prompt("Admin password (leave blank if disabled):") || "";
  const r = await fetch(`${BACKEND_BASE_URL}/api/admin/backup/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, admin_pass }),
  });
  const d = await r.json();
  if (!r.ok || d.ok === false)
    throw new Error(d.error || "Could not read backup");
  $("backupPreview").classList.remove("hidden");
  $("backupPreview").textContent = JSON.stringify(d.backup, null, 2);
}
async function forceBackup() {
  if (!BACKEND_MODE) {
    setStatus("Manual backups require the Python host.", "warning");
    return;
  }
  const admin_pass = prompt("Admin password (leave blank if disabled):") || "";
  const r = await fetch(`${BACKEND_BASE_URL}/api/admin/backup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ admin_pass }),
  });
  const d = await r.json();
  if (!r.ok || d.ok === false) throw new Error(d.error || "Backup failed");
  setStatus(`Created backup: ${d.backup_path}`, "success");
  await refreshBackups();
}

function bindEvents() {
  document
    .querySelectorAll(".nav-button")
    .forEach((b) => (b.onclick = () => switchView(b.dataset.view)));
  document
    .querySelectorAll("[data-view-jump]")
    .forEach((b) => (b.onclick = () => switchView(b.dataset.viewJump)));
  $("saveLocalButton").onclick = saveLocal;
  $("loadLocalButton").onclick = loadLocal;
  $("exportButton").onclick = exportArchive;
  $("importButton").onclick = importArchive;
  $("copyJsonButton").onclick = copyPlainJson;
  $("emptyWikiButton").onclick = emptyWiki;
  $("refreshPreviewButton").onclick = renderJsonPreview;
  [
    "seedCanonHomeButton",
    "seedCanonRootsButton",
    "seedCanonArchiveButton",
  ].forEach((id) => ($(id).onclick = seedMaybelleCanon));
  $("unlockCanonRoots").onchange = renderRootEditor;
  $("forceBackupButton").onclick = () =>
    forceBackup().catch((e) => setStatus(e.message, "error"));
  $("refreshBackupsButton").onclick = () =>
    refreshBackups().catch((e) => setStatus(e.message, "error"));
  $("addRootButton").onclick = addRoot;
  $("homeAddRootButton").onclick = addRoot;
  $("deleteRootButton").onclick = deleteSelectedRoot;
  $("rootSearch").oninput = renderRootList;
  $("addEntryButton").onclick = addEntry;
  $("homeAddEntryButton").onclick = addEntry;
  $("deleteEntryButton").onclick = deleteSelectedEntry;
  $("entrySearch").oninput = renderEntryList;
  $("addExtraFieldButton").onclick = () => {
    addExtraFieldRow();
    autosave();
  };
  [
    "rootGlyphInput",
    "rootNameInput",
    "rootDescriptionInput",
    "rootNotesInput",
    "entryCompoundInput",
    "entryDescriptionInput",
    "entryLiteralInput",
    "entryNotesInput",
    "grammarNotesInput",
  ].forEach((id) =>
    $(id).addEventListener("input", () => {
      autosave();
      if (id === "entryCompoundInput") {
        const e = appData.dictionary.find((x) => x.id === selectedEntryId);
        if (e) {
          e.compound = $("entryCompoundInput").value.trim();
          renderEntryEditor();
        }
      }
    }),
  );
  bindKeyboardEvents();
}
async function boot() {
  bindEvents();
  setBackendBanner();
  if (window.initThreads) window.initThreads();
  try {
    if (BACKEND_MODE) appData = await loadFromBackend();
    else if (localStorage.getItem(STORAGE_KEY))
      appData = normalizeImportedData(
        JSON.parse(localStorage.getItem(STORAGE_KEY)),
      );
    else appData = createEmptyData();
    repairDuplicateIds();
    setStatus(
      BACKEND_MODE ? "Loaded wiki from server file." : "Loaded local wiki.",
      "success",
    );
  } catch (e) {
    console.error(e);
    appData = createEmptyData();
    setStatus("Started empty after load failure.", "warning");
  }
  preserveSelections();
  renderEverything();
  setBackendBanner();
}
document.addEventListener("DOMContentLoaded", boot);
>>>>>>> theirs
