/**
 * Color Palette Studio — palette engine
 * Pure color math and palette generation; no DOM or browser UI dependencies.
 * Keep generation rules and documented edge cases in this module.
 */
export const DEFAULT_PALETTE = [
  ["BrandPrimary100","#F5F5F5"],["BrandPrimary200","#E6E6E6"],["BrandPrimary300","#D6D6D6"],
  ["BrandPrimary400","#A5A5A5"],["BrandPrimary500","#767676"],["BrandPrimary600","#575757"],
  ["BrandPrimary700","#434343"],["BrandPrimary800","#292929"],["BrandPrimary900","#1A1A1A"],
  ["BrandPrimary1000","#000000"]
];
export const SHADES = [100,200,300,400,500,600,700,800,900,1000];
const $ = id => document.getElementById(id);
let current = null;
let toastTimer;
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),1700)}
export function normalizeHex(value){let s=value.trim();if(!s.startsWith("#"))s="#"+s;if(!/^#[0-9a-fA-F]{6}$/.test(s))throw new Error("Enter a valid six-digit hex color, such as #6750A4.");return s.toUpperCase()}
/*
 * COLOR PALETTE STUDIO — ALGORITHM NOTES
 * --------------------------------------
 * Shade scale: BrandPrimary100 ... BrandPrimary1000; seed is always shade 600.
 *
 * Customization guide:
 * - DEFAULT_PALETTE: exact colors used for the low-brightness fallback.
 * - LOW_BRIGHTNESS_FALLBACK_THRESHOLD: seed brightness below this value uses
 *   the full default palette. Currently 20% (previous threshold 10% + 10 points).
 * - LIGHT_BRIGHTNESS_BY_SHADE / SATURATION_FACTOR_BY_SHADE: lighter-side curve.
 * - DARK_REDUCTION_MIN / DARK_REDUCTION_MAX and ramp start/end: darker curve.
 *
 * HSB/HSV brightness is the maximum RGB channel as a percentage. Final hex colors
 * use 8-bit RGB, so measured HSB can differ slightly from targets due to rounding.
 */
export const LOW_BRIGHTNESS_FALLBACK_THRESHOLD = 20;
export const DARK_REDUCTION_MIN = 40;
export const DARK_REDUCTION_MAX = 45;
export const DARK_REDUCTION_RAMP_START = 60;
export const DARK_REDUCTION_RAMP_END = 65;

export function hexToRgb(hex){const s=hex.replace("#","");return {r:parseInt(s.slice(0,2),16),g:parseInt(s.slice(2,4),16),b:parseInt(s.slice(4,6),16)}}
export function rgbToHsb(hex){
 const {r:rr,g:gg,b:bb}=hexToRgb(hex);const r=rr/255,g=gg/255,b=bb/255;
 const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;
 if(d!==0){if(max===r)h=60*(((g-b)/d)%6);else if(max===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4)}
 if(h<0)h+=360;
 return {h,s:max===0?0:d/max*100,b:max*100};
}
export function hsbToHex(h,s,v){
 s=Math.max(0,Math.min(100,s))/100;v=Math.max(0,Math.min(100,v))/100;
 const c=v*s,x=c*(1-Math.abs(((h/60)%2)-1)),m=v-c;let r=0,g=0,b=0;
 if(h<60){r=c;g=x}else if(h<120){r=x;g=c}else if(h<180){g=c;b=x}else if(h<240){g=x;b=c}else if(h<300){r=x;b=c}else{r=c;b=x}
 const byte=n=>Math.round((n+m)*255).toString(16).padStart(2,"0");
 return "#"+(byte(r)+byte(g)+byte(b)).toUpperCase();
}
export function generate(seed, threshold){
 const hsb=rgbToHsb(seed);
 const lowS=hsb.s < threshold;
 const lowB=hsb.b < LOW_BRIGHTNESS_FALLBACK_THRESHOLD;

 // Low-brightness edge case: use the entire approved default palette exactly.
 // The threshold is 20%, increased from 10% by 10 percentage points.
 // This applies regardless of saturation: a very dark seed leaves too little
 // useful range for generating the darker shades.
 if(lowB){
   return {colors:DEFAULT_PALETTE.map(([name,hex])=>({name,hex})),mode:"fallback",hsb,reason:`Seed brightness ${hsb.b.toFixed(1)}% is below ${LOW_BRIGHTNESS_FALLBACK_THRESHOLD}%. Exact default palette used.`};
 }

 const map={};
 map[600]=seed;

 // Lighter-side rules calibrated against both supplied reference palettes.
 // For darker seeds, shade 500 starts around 82% brightness; for already-bright
 // seeds, preserve their high brightness and ramp toward near-white.
 // Saturation tapers progressively toward shade 100, based on the reference profile.
 const highBrightness=hsb.b>72;
 const lightBrightnessByShade={500:82,400:87,300:92,200:96,100:99.6};
 const saturationFactorByShade={500:1.09,400:0.70,300:0.44,200:0.22,100:0.092};

 for(const shade of [500,400,300,200,100]){
   let bright=lightBrightnessByShade[shade];
   if(highBrightness){
     // Preserve the seed's high brightness while moving toward near-white.
     const highSeedRamp={500:hsb.b,400:hsb.b+(99.6-hsb.b)*0.25,300:hsb.b+(99.6-hsb.b)*0.5,200:hsb.b+(99.6-hsb.b)*0.75,100:99.6};
     bright=highSeedRamp[shade];
   }
   // Keep the seed hue. Shade 500 saturation is capped at the reference's
   // upper light-shade range; subsequent shades decrease progressively.
   const shade500Sat=Math.min(hsb.s*1.09,71);
   const satFactors={500:1,400:0.70,300:0.44,200:0.22,100:0.092};
   let sat=Math.min(100,shade500Sat*satFactors[shade]);

   if(lowS){
     // Low saturation only: preserve saturation and vary brightness only.
     sat=hsb.s;
   }else if(lowB){
     // Low brightness only: preserve brightness and adjust saturation only.
     bright=hsb.b;
   }
   map[shade]=hsbToHex(hsb.h,sat,bright);
 }
 // Darker shades: preserve hue and saturation, with four equal brightness steps.
 // Shade 1000 target is seed brightness minus a reduction:
 //   B <= 60%: subtract 40 points (55% -> 15%).
 //   B >= 65%: subtract 45 points (65% -> 20%).
 //   Between 60% and 65%, smoothly interpolate the reduction from 40 to 45.
 // The same total reduction is divided into four equal steps from 600 to 1000.
 const rampProgress=Math.max(0,Math.min(1,
   (hsb.b-DARK_REDUCTION_RAMP_START)/(DARK_REDUCTION_RAMP_END-DARK_REDUCTION_RAMP_START)
 ));
 const darkReduction=DARK_REDUCTION_MIN+
   (DARK_REDUCTION_MAX-DARK_REDUCTION_MIN)*rampProgress;
 const darkTarget=Math.max(0,hsb.b-darkReduction);
 const darkStep=(hsb.b-darkTarget)/4;
 for(const [index,shade] of [700,800,900,1000].entries()){
   const bright=hsb.b-darkStep*(index+1);
   map[shade]=hsbToHex(hsb.h,hsb.s,bright);
 }

 const reason=lowS
   ? `Low saturation (${hsb.s.toFixed(1)}%): lighter shades adjust brightness only.`
   : lowB
     ? `Low brightness (${hsb.b.toFixed(1)}%): lighter shades adjust saturation only.`
     : highBrightness
       ? "Lighter shades use the reference-calibrated curve; darker shades use four equal steps and a 40–45 point reduction."
       : "Lighter shades use the reference-calibrated curve; darker shades use four equal steps and a 40–45 point reduction.";
 return {colors:SHADES.map(n=>({name:"BrandPrimary"+n,hex:map[n]})),mode:"generated",hsb,reason};
}

