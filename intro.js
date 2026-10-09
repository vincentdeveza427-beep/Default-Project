/* Science Drills - opening animation. Plays once per browser session; click / tap / any key skips it. */
(function () {
  var KEY = 'sd_intro_seen';
  try { if (sessionStorage.getItem(KEY)) return; } catch (e) {}
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try { sessionStorage.setItem(KEY, '1'); } catch (e) {}

  var css = '\
#sd-intro{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:#0a1424;overflow:hidden;\
  transition:opacity .7s ease,transform .7s cubic-bezier(.7,0,.3,1),visibility 0s .7s;cursor:pointer}\
#sd-intro.out{opacity:0;transform:scale(1.08);visibility:hidden;pointer-events:none}\
#sd-intro::before{content:"";position:absolute;inset:0;\
  background:radial-gradient(700px 420px at 50% 42%,rgba(90,169,255,.20),transparent 70%),radial-gradient(500px 300px at 60% 60%,rgba(40,224,197,.12),transparent 70%);\
  animation:sdiGlow 3s ease-in-out infinite alternate}\
#sd-intro .stars{position:absolute;inset:0;opacity:.5;\
  background:radial-gradient(2px 2px at 12% 22%,#fff,transparent),radial-gradient(1.5px 1.5px at 82% 18%,#fff,transparent),\
  radial-gradient(2px 2px at 70% 78%,#fff,transparent),radial-gradient(1.5px 1.5px at 24% 74%,#fff,transparent),\
  radial-gradient(1.5px 1.5px at 92% 52%,#fff,transparent),radial-gradient(2px 2px at 40% 10%,#fff,transparent);\
  animation:sdiTwinkle 2.4s ease-in-out infinite alternate}\
#sd-intro .stage{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:0 20px;text-align:center}\
#sd-intro svg{width:min(52vw,230px);height:auto;overflow:visible;animation:sdiIn .9s cubic-bezier(.2,1.2,.4,1) both}\
#sd-intro .orbit{fill:none;stroke:url(#sdiGrad);stroke-width:2.2;stroke-linecap:round;stroke-dasharray:420;stroke-dashoffset:420;\
  animation:sdiDraw 1.1s ease forwards}\
#sd-intro .o2{animation-delay:.15s}#sd-intro .o3{animation-delay:.3s}\
#sd-intro .nuc{transform-origin:100px 100px;animation:sdiPulse 1.3s ease-in-out infinite}\
#sd-intro h1{margin:14px 0 0;font:800 clamp(1.9rem,7vw,3.1rem)/1.1 Inter,"Segoe UI",system-ui,sans-serif;letter-spacing:-.02em;color:#e8f1fb;display:flex;flex-wrap:wrap;justify-content:center}\
#sd-intro h1 span{display:inline-block;opacity:0;transform:translateY(24px);animation:sdiRise .6s cubic-bezier(.2,.9,.3,1.2) forwards}\
#sd-intro h1 .acc{background:linear-gradient(135deg,#28e0c5,#5aa9ff);-webkit-background-clip:text;background-clip:text;color:transparent}\
#sd-intro .tag{color:#8ea5bf;font:600 .95rem Inter,"Segoe UI",system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;opacity:0;animation:sdiFade .7s 1.5s forwards}\
#sd-intro .bar{width:min(64vw,240px);height:6px;margin-top:22px;border-radius:999px;background:#0f2038;border:1px solid #1f3555;overflow:hidden;opacity:0;animation:sdiFade .4s 1.2s forwards}\
#sd-intro .bar i{display:block;height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#28e0c5,#5aa9ff);animation:sdiLoad 1.5s 1.3s cubic-bezier(.5,0,.2,1) forwards}\
#sd-intro .skip{position:absolute;bottom:22px;left:0;right:0;text-align:center;color:#8ea5bf;font:600 .75rem Inter,system-ui,sans-serif;letter-spacing:.1em;opacity:0;animation:sdiFade .6s 1s forwards}\
@keyframes sdiGlow{from{opacity:.6;transform:scale(1)}to{opacity:1;transform:scale(1.08)}}\
@keyframes sdiTwinkle{from{opacity:.25}to{opacity:.6}}\
@keyframes sdiIn{from{opacity:0;transform:scale(.4) rotate(-40deg)}to{opacity:1;transform:none}}\
@keyframes sdiDraw{to{stroke-dashoffset:0}}\
@keyframes sdiPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}\
@keyframes sdiRise{to{opacity:1;transform:none}}\
@keyframes sdiFade{to{opacity:1}}\
@keyframes sdiLoad{to{width:100%}}';

  var svg = '\
<svg viewBox="0 0 200 200" aria-hidden="true">\
<defs><linearGradient id="sdiGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#28e0c5"/><stop offset="1" stop-color="#5aa9ff"/></linearGradient>\
<radialGradient id="sdiNuc"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#28e0c5"/><stop offset="1" stop-color="#5aa9ff"/></radialGradient></defs>\
<g id="sdi-o1"><ellipse class="orbit o1" cx="100" cy="100" rx="86" ry="32"/></g>\
<g transform="rotate(60 100 100)"><ellipse class="orbit o2" cx="100" cy="100" rx="86" ry="32"/></g>\
<g transform="rotate(120 100 100)"><ellipse class="orbit o3" cx="100" cy="100" rx="86" ry="32"/></g>\
<circle class="nuc" cx="100" cy="100" r="13" fill="url(#sdiNuc)"/>\
<circle r="5.5" fill="#28e0c5"><animateMotion dur="2.2s" repeatCount="indefinite" path="M14,100 a86,32 0 1,0 172,0 a86,32 0 1,0 -172,0"/></circle>\
<g transform="rotate(60 100 100)"><circle r="5.5" fill="#5aa9ff"><animateMotion dur="2.8s" repeatCount="indefinite" path="M14,100 a86,32 0 1,0 172,0 a86,32 0 1,0 -172,0"/></circle></g>\
<g transform="rotate(120 100 100)"><circle r="5.5" fill="#ffc857"><animateMotion dur="2.5s" repeatCount="indefinite" path="M14,100 a86,32 0 1,0 172,0 a86,32 0 1,0 -172,0"/></circle></g>\
</svg>';

  function letters(text, start, cls) {
    return text.split('').map(function (c, i) {
      return '<span' + (cls ? ' class="' + cls + '"' : '') + ' style="animation-delay:' + (start + i * 0.045).toFixed(2) + 's">' + (c === ' ' ? '&nbsp;' : c) + '</span>';
    }).join('');
  }

  var style = document.createElement('style');
  style.textContent = css;
  var el = document.createElement('div');
  el.id = 'sd-intro';
  el.setAttribute('role', 'presentation');
  el.innerHTML = '<div class="stars"></div><div class="stage">' + svg +
    '<h1 aria-label="Science Drills">' + letters('Science ', 0.7) + letters('Drills', 0.7 + 8 * 0.045, 'acc') + '</h1>' +
    '<div class="tag">Study. Level up. Repeat.</div><div class="bar"><i></i></div></div>' +
    '<div class="skip">' + ((window.matchMedia && matchMedia('(pointer: coarse)').matches) ? 'TAP ANYWHERE TO SKIP' : 'CLICK ANYWHERE TO SKIP') + '</div>';

  var root = document.documentElement;
  root.appendChild(style);
  root.appendChild(el);
  var prevOverflow = root.style.overflow;
  root.style.overflow = 'hidden';

  var done = false;
  function finish() {
    if (done) return; done = true;
    el.classList.add('out');
    root.style.overflow = prevOverflow;
    document.removeEventListener('keydown', finish);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); if (style.parentNode) style.parentNode.removeChild(style); }, 900);
  }
  el.addEventListener('click', finish);
  document.addEventListener('keydown', finish);
  setTimeout(finish, 3300);
})();
