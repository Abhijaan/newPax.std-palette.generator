/**
 * Color Palette Studio — application/UI controller
 * Owns DOM events, preview state, rendering, copy/download interactions.
 * Palette math is in palette-engine.js; file serialization is in palette-exporters.js.
 */

import { generate, normalizeHex, hexToRgb, rgbToHsb } from "./palette-engine.js";
import { paletteObject, xmlExport, kotlinExport, swiftExport, assetContents } from "./palette-exporters.js";
import { downloadElementScreenshot } from "./preview-screenshots.js";

/** Small UI state and DOM helpers. */
const $ = id => document.getElementById(id);
let current = null;
let toastTimer;
function toast(message) {
  const element = $("toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 1700);
}

function readableText(hex){const {r,g,b}=hexToRgb(hex);const linear=[r,g,b].map(x=>{x/=255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4)});const lum=.2126*linear[0]+.7152*linear[1]+.0722*linear[2];return lum>.42?"#161616":"#FFFFFF"}
function render(){
 if(!current)return;
 $("palette").innerHTML="";
 current.colors.forEach(({name,hex})=>{
  const shade=name.replace("BrandPrimary","");
  const card=document.createElement("div");card.className="swatch";card.title="Copy "+hex;card.style.cursor="pointer";card.addEventListener("click",()=>copy(hex));
  const color=document.createElement("div");color.className="swatchcolor";color.style.background=hex;color.title="Copy "+hex;color.tabIndex=0;color.setAttribute("role","button");color.setAttribute("aria-label",`Copy ${name} ${hex}`);
  color.addEventListener("click",()=>copy(hex));color.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();copy(hex)}});
  const meta=document.createElement("div");meta.className="swatchmeta";
  const nm=document.createElement("div");nm.className="swatchname";nm.textContent=name;
  const hx=document.createElement("div");hx.className="swatchhex";hx.textContent=hex;
  const values=rgbToHsb(hex);
  const hsbLine=document.createElement("div");hsbLine.className="swatchhsb";
  hsbLine.textContent=`H ${values.h.toFixed(1)}° · S ${values.s.toFixed(1)}% · B ${values.b.toFixed(1)}%`;
  meta.append(nm,hx,hsbLine);if(shade==="600"){const tag=document.createElement("div");tag.className="seedtag";tag.textContent=current.mode==="fallback"?"Default 600":"SEED";meta.append(tag)}
  card.append(color,meta);$("palette").append(card);
 });
 const get=n=>current.colors.find(c=>c.name==="BrandPrimary"+n).hex;
 const primary=get(600),c100=get(100),c200=get(200),c800=get(800),c900=get(900),c1000=get(1000);
 const phone=$("phonePreview"), lightMode=phone.dataset.mode!=="dark";
 const onPrimary=normalizeHex($(lightMode?"onPrimaryLightHex":"onPrimaryDarkHex").value);
 phone.style.setProperty("--mock-primary",primary);phone.style.setProperty("--on-primary",onPrimary);phone.style.setProperty("--promo-end",c800);
 if(lightMode){
  phone.style.setProperty("--mock-bg",c100);phone.style.setProperty("--mock-text","#242424");phone.style.setProperty("--mock-surface","#FFFFFF");phone.style.setProperty("--mock-input","#E8E8E8");phone.style.setProperty("--mock-muted","#777777");phone.style.setProperty("--mock-outline",c200);phone.style.setProperty("--map-bg","#F2F3F3");phone.style.setProperty("--map-road","#FFFFFF");phone.style.setProperty("--map-road2","#D6D9DC");phone.style.setProperty("--map-water","#7AAAB5");phone.style.setProperty("--route",primary);
 }else{
  phone.style.setProperty("--mock-bg",c1000);phone.style.setProperty("--mock-text","#F4F4F4");phone.style.setProperty("--mock-surface","#202020");phone.style.setProperty("--mock-input","#454545");phone.style.setProperty("--mock-muted","#BBBBBB");phone.style.setProperty("--mock-outline",c900);phone.style.setProperty("--map-bg","#383B43");phone.style.setProperty("--map-road","#252830");phone.style.setProperty("--map-road2","#555A64");phone.style.setProperty("--map-water","#4C6676");phone.style.setProperty("--route",primary);
 }
 $("lightModeBtn").classList.toggle("active",lightMode);$("darkModeBtn").classList.toggle("active",!lightMode);
 $("lightModeBtn").setAttribute("aria-pressed",String(lightMode));$("darkModeBtn").setAttribute("aria-pressed",String(!lightMode));
 const h=current.hsb;
 $("status").innerHTML=`<strong>${current.mode==="fallback"?"Default palette selected":"Custom palette generated"}</strong><br>HSB: H ${h.h.toFixed(1)}° · S ${h.s.toFixed(1)}% · B ${h.b.toFixed(1)}%<br>${current.reason}`;
}
function generateFromInput(){
 try{
  const hex=normalizeHex($("seedHex").value);$("seedHex").value=hex;$("seedPicker").value=hex;
  current=generate(hex,Number($("threshold").value));render();
 }catch(e){$("seedHex").setAttribute("aria-invalid","true");toast(e.message)}
}
async function copy(text){try{await navigator.clipboard.writeText(text);toast("Copied "+text)}catch{const ta=document.createElement("textarea");ta.value=text;document.body.append(ta);ta.select();document.execCommand("copy");ta.remove();toast("Copied "+text)}}
function download(filename,content,type="text/plain;charset=utf-8"){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function downloadIosAssets(){
 // Emit each Xcode colorset JSON individually; browser download is one file at a time.
 // ZIP support is intentionally deferred rather than shipping a hidden dependency.
 const data=current.colors.map(c=>({name:c.name,contents:assetContents(c.hex)}));
 data.forEach((c,i)=>setTimeout(()=>download(`${c.name}.colorset-Contents.json`,c.contents,"application/json"),i*120));
 toast("Downloading 10 Asset Catalog JSON files. Place each JSON in its matching .colorset folder.");
}
document.querySelectorAll("[data-export]").forEach(btn=>btn.addEventListener("click",()=>{
 if(!current)return;
 const kind=btn.dataset.export;
 if(kind==="json")download("brand-primary-palette.json",JSON.stringify(paletteObject(current, $("seedHex").value),null,2)+"\\n","application/json");
 if(kind==="xml")download("colors.xml",xmlExport(current),"application/xml");
 if(kind==="kotlin")download("BrandPrimary.kt",kotlinExport(current),"text/plain");
 if(kind==="swift")download("BrandPrimary.swift",swiftExport(current),"text/plain");
 if(kind==="ios")downloadIosAssets();
}));
function bindColorPair(pickerId,hexId){
 const picker=$(pickerId),input=$(hexId);
 picker.addEventListener("input",()=>{input.value=picker.value.toUpperCase();render()});
 input.addEventListener("change",()=>{try{const v=normalizeHex(input.value);input.value=v;picker.value=v;input.removeAttribute("aria-invalid");render()}catch(e){input.setAttribute("aria-invalid","true");toast("Enter a valid 6-digit HEX color")}});
}
bindColorPair("onPrimaryLightPicker","onPrimaryLightHex");
bindColorPair("onPrimaryDarkPicker","onPrimaryDarkHex");
$("lightModeBtn").addEventListener("click",()=>{$("phonePreview").dataset.mode="light";render()});
$("darkModeBtn").addEventListener("click",()=>{$("phonePreview").dataset.mode="dark";render()});
document.querySelectorAll(".screen-toggle [data-screen]").forEach(btn=>btn.addEventListener("click",()=>{
 const screen=btn.dataset.screen;
 $("phonePreview").dataset.screen=screen;
 document.querySelectorAll(".screen-toggle [data-screen]").forEach(b=>{
   const selected=b.dataset.screen===screen;
   b.classList.toggle("active",selected);
   b.setAttribute("aria-pressed",String(selected));
 });
}));
$("generateBtn").addEventListener("click",generateFromInput);
$("seedPicker").addEventListener("input",e=>{$("seedHex").value=e.target.value.toUpperCase();generateFromInput()});
$("seedHex").addEventListener("keydown",e=>{if(e.key==="Enter")generateFromInput()});
$("seedHex").addEventListener("input",()=>{$("seedHex").removeAttribute("aria-invalid")});
$("threshold").addEventListener("change",generateFromInput);
$("resetBtn").addEventListener("click",()=>{$("seedHex").value="#6750A4";$("seedPicker").value="#6750A4";$("threshold").value="20";generateFromInput()});
$("copyAllBtn").addEventListener("click",()=>copy(current.colors.map(c=>`${c.name}: ${c.hex}`).join("\n")));
$("downloadHomePreviewScreenshot")?.addEventListener("click", async () => {
 try { await downloadElementScreenshot($("phonePreview"), "blueline-home-preview.png"); toast("Home preview screenshot downloaded"); }
 catch (error) { toast(error.message || "Could not capture the preview"); }
});
generateFromInput();
