Interactive orrery as a personal site. vanilla JS, single `<canvas>`, no framework, no build step.

live @ https://taliaduckie.github.io/orrery/

Concept

The sun sits @ center w name + about card. Interests/relevant topics are planets. Radius and orbit distance roughly encode emphasis but not super agro about it. Each planet has relevant moons: projects, essays, work etc etc. Click a planet to zoom into its moons, click a moon for its card, click the sun for the about card. esc, the pull-back button, or tapping empty space all back out one level. same ladder, so touch isn't stuck hunting for the button.

Currently orbiting: pragmatics stuff, AI thoughts, bad food science, photography, writing, violin. May change w time!

Files

index.html    shell: canvas elements, panel markup, meta/og tags, font links
styles.css    all visual styling
content.js    all words/numbers. edit this, not orrery.js
orrery.js     engine: orbital math, rendering, hit-testing, interaction
favicon.svg   lil ringed planet
preview.png   social share image
photos/       hover-peek + portrait images

content.js is a plain SITE object, three sections:

sun: label, description, color, size, about-card copy (name, paragraphs, links)
social: corner link bar (label/href pairs)
planets: array. Each: name, desc, color, r (size = weight), a (orbit radius), e (eccentricity 0-~0.2), period (secs/orbit), rot (orbit tilt, radians). Optional pattern: 'glass'. Optional ring: { inner, outer, tilt, angle, color, alpha }.

  moons: [{ name, body, ... }]. a moon can also carry:
    href: '...'                              single "open →" link, OR
    links: [{ label, href }, ...]            several labeled links
    photos: { 'phrase in body': 'photos/x.jpg' }   that phrase becomes a hover-to-peek image
  body supports *italics* and \n line breaks. leave href '#' (or drop links) for a text-only node.

New planet, retitled moon, new color: all content.js, never orrery.js.

Running locally

python3 -m http.server 8000, open localhost:8000. file:// mostly works but some browsers block local script loading, so a server is safer. deploys straight to GitHub Pages from main, no build step.

how it works!

One requestAnimationFrame loop: update (positions) then render (redraw).
Camera is an eased target; view chases target for zoom on planet click. Two modes: system (all planets) / planet (one planet's moons). Focusing locks camera to that planet, fades in moons.
Hover freezes that orbit (isPlanetPaused / isMoonPaused, checked in update). labels only show on hover/focus; everything else lives in the tooltip.
Background: dark-blue sky, ~320 baked stars + 25 real constellation asterisms placed once (random, non-overlapping, ringed *around* the orrery so they never sit under a planet). dwell on a constellation to reveal its star names.
drawBody: radial gradient lit from the sun's direction + a darkened terminator on the far side + soft bloom + optional seeded drawGlass marbling (seeded so it's stable, not shimmering). rings in two passes (drawRingHalf front/back) so the planet occludes the far arc.
depth: mouse parallax shifts bg/sun/rings/planets by different amounts (par + PX_* constants, eased so it lags). a comet trail evaporates behind the cursor (#comet overlay). the odd shooting star drifts through, and rarer still a ufo: same spawn/move/draw shape as the meteor but ~10x slower, because unlike a shooting star you're meant to catch it (see secret below). drawn last in render so it sits above the planets, matching the hit priority handleClick gives it.
mouse: live hit-test on pointermove. touch: hold-to-hover (300ms), tap = click.
deep links: the URL hash mirrors state (#ai-thoughts, #ai-thoughts/sycophancy-mapping, #about) so back/forward + sharing a specific thing work.
respects prefers-reduced-motion: freezes orbits, kills parallax/comet/shooting-stars/ufo, snaps the camera instead of easing. note the ufo being gated here means reduced-motion users can only reach the game by keyboard.
hidden #a11y text layer (built from SITE) + og/meta tags so search engines & screen readers get the content the canvas otherwise hides. a deploy-time Action (prerender.js) also bakes that outline into static index.html, so non-JS crawlers get it too — you still just edit content.js.

secret: three ways in. konami code (↑ ↑ ↓ ↓ ← → ← → b a), type "comet", or tap the ufo. the ufo is the only one that works without a keyboard, and it's a coin flip: half the time you get in, half the time it bolts. one tap per sighting (pending stays truthy as 'gone' so you can't chase it down and re-roll). first ufo 20-45s in, then one every 60-100s.

the game: four routes, each harder than the last (LEVELS: more looping, smaller rings, less of the path predicted for you). a tracer draws the intended path, then the rings fade in behind it. pull back from the fixed anchor and a second trail of small circles predicts where this shot actually goes, so you match one to the other. clear the rings in order. hit a planet or the sun, or cross the boundary heading outward, and the route resets. clear all four and the sun flares, the orbit rings pulse outward in sequence, and it drops you back in the orrery. f toggles free shoot: no route, fling as many as you like, f again to pick the route back up.

two things hold that together and will silently break it if changed. planets freeze while gameOn: the line is a solved launch through a static field, so a moving field makes it unfollowable. and the generator, the prediction dots and the live run all step at the same fixed SIM_H, because with variable frame dt a perfect launch diverges from the drawn line near the sun, where forces are huge. buildCourse doesn't draw a path, it replays a launch that survived, so the line is always followable by construction.

Fonts and vibes

IM Fell English (headings), Libre Baskerville (body). Both via Google Fonts in index.html. Swap the <link> and CSS font-family together.
