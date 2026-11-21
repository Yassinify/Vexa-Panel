/*
 * The day/night toggle styles below are adapted from "interactive-day-night-toggle"
 * (https://github.com/HamzehGhoreyshi/interactive-day-night-toggle), used under the MIT License:
 *
 * MIT License
 *
 * Copyright (c) 2026 Hamzeh
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// Theme toggle (topbar). Every part is sized in cqw (1cqw = 1% of the button width), so the
// whole toggle scales from --tt-size. The look follows the theme on <html>: data-theme="dark"
// is night, anything else is day, so no state class is needed. The markup is built by
// themeToggleMarkup() in client/shell.js and uses the class names below. Differences from the
// reference: no large bezel and no shooting star (too small to see at this size), colors are
// toggle-local variables, the twinkle and cloud drift only run while they are visible, and the
// halo ripple plays only after the first click (.tt-touched, set by toggleTheme()).
export const THEME_TOGGLE_CSS = `
.theme-toggle {
  --tt-size: 64px;
  /* Sky, sun, moon and cloud colors (the reference palette). */
  --tt-sky-day: #3a77b6;
  --tt-sky-night: #1c1e27;
  --tt-sun: #f3c22f;
  --tt-moon-hi: #e4e5e8;
  --tt-moon-lo: #a9abb2;
  --tt-crater: #8e96ac;
  --tt-cloud-1: #a9c8e7;
  --tt-cloud-2: #d2e4f5;
  --tt-cloud-3: #f1f7fc;
  --tt-star: #ffffff;
  --tt-ease-out: cubic-bezier(.22, 1, .36, 1);
  --tt-ease-in: cubic-bezier(.55, 0, .75, .2);
  position: relative; flex: none;
  width: var(--tt-size); aspect-ratio: 530 / 243;
  container-type: inline-size;
  padding: 0; border: 0; border-radius: 999px; background: none; cursor: pointer; outline: none;
  transition: transform 350ms var(--spring-soft);
}
.theme-toggle:hover { transform: translateY(-1px); }
.theme-toggle:active { transform: scale(.96); transition-duration: 120ms; }
.theme-toggle:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
@media (max-width: 760px) {
  .theme-toggle { --tt-size: 56px; }
}

/* The slot: clips every layer, with a 1px ring instead of the reference's raised bezel. */
.tt-pill {
  position: absolute; inset: 0; border-radius: inherit; overflow: hidden; isolation: isolate;
  background: var(--tt-sky-day);
  box-shadow: 0 0 0 1px var(--color-border);
}
/* Inner shadow over every layer: the slot looks pressed in. */
.tt-pill::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 10;
  box-shadow:
    inset 0 1.6cqw 2.4cqw rgba(0, 0, 0, .32),
    inset 0 .3cqw .5cqw rgba(0, 0, 0, .25),
    inset 0 -.6cqw 1.2cqw rgba(255, 255, 255, .25);
}
.tt-layer { position: absolute; inset: 0; display: block; pointer-events: none; }
.tt-sky-night { background: var(--tt-sky-night); opacity: 0; transition: opacity 700ms var(--tt-ease-out); }
:root[data-theme="dark"] .tt-sky-night { opacity: 1; }

/* --- Stars: sink away in the day, drop in with a spring at night (--i staggers, --t sets the twinkle speed) --- */
.tt-stars { width: 100%; height: 100%; }
.tt-star {
  transform-box: fill-box; transform-origin: center;
  opacity: 0; transform: translateY(-6px) scale(.2) rotate(-90deg);
  transition: transform 450ms var(--tt-ease-in), opacity 300ms var(--tt-ease-in);
  transition-delay: calc(var(--i) * 15ms);
}
:root[data-theme="dark"] .tt-star {
  opacity: 1; transform: none;
  transition: transform 1000ms var(--spring-bouncy), opacity 500ms var(--tt-ease-out);
  transition-delay: calc(250ms + var(--i) * 45ms);
}
.tt-star > * { fill: var(--tt-star); transform-box: fill-box; transform-origin: center; }
:root[data-theme="dark"] .tt-star > * {
  animation: tt-twinkle var(--t, 3s) ease-in-out infinite;
  animation-delay: calc(var(--i) * -0.37s);
}
@keyframes tt-twinkle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: .3; transform: scale(.55) rotate(45deg); }
}

/* --- Knob: the sun slides across and the moon covers it like an eclipse --- */
.tt-knob-track {
  position: absolute; top: 4.18cqw; left: 4.18cqw; width: 37.5cqw; height: 37.5cqw; z-index: 2;
  transition: transform 900ms var(--spring-soft);
}
:root[data-theme="dark"] .tt-knob-track { transform: translateX(54.14cqw); }
/* Concentric light bands that travel with the knob; each ring adds 7.5% white. */
.tt-halo {
  position: absolute; inset: 0; border-radius: 50%;
  box-shadow:
    0 0 0 7cqw rgba(255, 255, 255, .075),
    0 0 0 15cqw rgba(255, 255, 255, .075),
    0 0 0 24cqw rgba(255, 255, 255, .075),
    0 0 0 34cqw rgba(255, 255, 255, .075);
}
/* The rings ripple outward as the knob lands. Two names with the same frames, so each theme restarts it. */
:root[data-theme="dark"] .theme-toggle.tt-touched .tt-halo { animation: tt-ripple-night 1100ms var(--tt-ease-out) 150ms; }
:root[data-theme="light"] .theme-toggle.tt-touched .tt-halo { animation: tt-ripple-day 1100ms var(--tt-ease-out) 150ms; }
@keyframes tt-ripple-night { 0% { transform: scale(.75); } 100% { transform: scale(1); } }
@keyframes tt-ripple-day { 0% { transform: scale(.75); } 100% { transform: scale(1); } }
.tt-knob {
  position: absolute; inset: 0; border-radius: 50%; overflow: hidden;
  box-shadow: .8cqw 1.4cqw 2.2cqw rgba(0, 0, 0, .35), .2cqw .4cqw .5cqw rgba(0, 0, 0, .2);
}
.tt-sun, .tt-moon { position: absolute; inset: 0; border-radius: 50%; }
.tt-sun {
  background: var(--tt-sun);
  box-shadow:
    inset 0 0 0 .35cqw rgba(190, 120, 0, .22),
    inset 0 1cqw 1.2cqw rgba(255, 240, 170, .55),
    inset -.6cqw -1.4cqw 1.8cqw rgba(210, 130, 0, .35);
  transition: transform 900ms var(--spring-soft);
}
/* Once the moon fully covers the sun it is hidden, so no yellow edge peeks out. */
:root[data-theme="dark"] .tt-sun {
  transform: rotate(120deg); opacity: 0;
  transition: transform 900ms var(--spring-soft), opacity 0s 1000ms;
}
.tt-moon {
  background: radial-gradient(circle at 35% 30%, var(--tt-moon-hi) 0%, #c7c9ce 55%, var(--tt-moon-lo) 100%);
  box-shadow:
    inset 0 0 0 .35cqw rgba(0, 0, 0, .12),
    inset 0 1cqw 1.2cqw rgba(255, 255, 255, .5),
    inset -.6cqw -1.4cqw 1.8cqw rgba(60, 65, 80, .3);
  transform: translateX(105%) rotate(90deg);
  transition: transform 700ms var(--tt-ease-in);
}
:root[data-theme="dark"] .tt-moon { transform: none; transition: transform 1000ms var(--spring-soft) 80ms; }
.tt-crater {
  position: absolute; border-radius: 50%; background: var(--tt-crater);
  box-shadow: inset .5cqw .7cqw .9cqw rgba(40, 50, 80, .45), 0 .2cqw .2cqw rgba(255, 255, 255, .5);
}
.tt-c1 { left: 42%; top: 15%; width: 17%; height: 17%; }
.tt-c2 { left: 20%; top: 52%; width: 34%; height: 34%; }
.tt-c3 { left: 64%; top: 52%; width: 25%; height: 25%; }

/* --- Clouds: three layers, back to front. Day: they spring back up. Night: each layer sinks away, front first. --- */
.tt-cloud { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.tt-cloud-1 { z-index: 3; transition: transform 1100ms var(--spring-bouncy) 180ms; }
.tt-cloud-2 { z-index: 4; transition: transform 1100ms var(--spring-bouncy) 110ms; }
.tt-cloud-3 { z-index: 5; transition: transform 1100ms var(--spring-bouncy) 40ms; }
:root[data-theme="dark"] .tt-cloud-3 { transform: translate(6cqw, 50cqw); transition: transform 600ms var(--tt-ease-in) 0ms; }
:root[data-theme="dark"] .tt-cloud-2 { transform: translate(10cqw, 54cqw); transition: transform 650ms var(--tt-ease-in) 60ms; }
:root[data-theme="dark"] .tt-cloud-1 { transform: translate(14cqw, 60cqw); transition: transform 700ms var(--tt-ease-in) 120ms; }
.tt-cloud g { transform-box: view-box; }
:root[data-theme="light"] .tt-cloud g { animation: tt-drift 8s ease-in-out infinite; }
:root[data-theme="light"] .tt-cloud-1 g { animation-duration: 11s; animation-delay: -4s; }
:root[data-theme="light"] .tt-cloud-2 g { animation-duration: 9s; animation-delay: -2s; animation-direction: reverse; }
@keyframes tt-drift {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(-7px); }
}

/* Reduced motion: the global rule in styles/reduced-motion.js removes the transitions; the keyframe animations stop here. */
@media (prefers-reduced-motion: reduce) {
  .theme-toggle *, .theme-toggle *::before, .theme-toggle *::after { animation: none !important; }
}
`;
