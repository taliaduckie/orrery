/* ============================================================
   content.js — EDIT ME
   All the words, colors, and numbers live here. The engine
   (orrery.js) reads this object and never needs to be touched wût wût

   color   : hex string, e.g. '#9b3d34'
   r       : body size in world units (relative emphasis; bigger = more weight)
   a       : orbit radius (distance from the sun)
   e       : eccentricity? 0..~0.2 (how elliptical or whatever the orbit is)
   period  : seconds for one full orbit (bigger = slower)
   rot     : orientation of the orbit ellipse, in radians (just vary it per body)

   moons   : dr = orbit radius around the planet, the rest as above.
             body = the card text. href = link the "open →" goes to.
   ============================================================ */

const SITE = {
  sun: {
    label: 'Hi!',   // <- shown under the sun
    desc:  'click to read more',
    color: '#c47a2f',
    r: 46,
    about: {
      kicker: '',          // maybe beb small line above the name; leave '' to hide
      name: 'Talia Honikman',
      paragraphs: [
        "Hi! I'm curious about the gap between what's said and what's meant. This question is central to many of my interests and also shows up in many seemingly unrelated areas — pragmatics, language models, photography, food etc. Human communication forms are inherently lossy and for me this is what makes them worth thinking about.",
        "PS: if a ufo drifts past, tap it (50/50 it takes you somewhere). Or just type \"comet\"."
      ],
      links: [
        { label: 'email', href: 'mailto:tbhonikman@gmail.com' },
        { label: 'cv',    href: 'Honikman-Talia-CV-2026.pdf' }
      ]
    }
  },

  // links in the persistent corner bar  
  social: [
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/talia-b-honikman/' },
    { label: 'Substack', href: 'https://taliahonikman.substack.com/' },
    { label: 'GitHub',   href: 'https://github.com/taliaduckie' },
    { label: 'RSS',      href: 'https://taliahonikman.substack.com/feed' }
  ],

  // varied sizes (emphasis?), orbits, eccentricities, periods (slow, all different)
  planets: [
    {
      name: 'pragmatics stuff',
      desc: 'literal meaning ⊂ actual meaning',
      color: '#9b3d34', r: 27, a: 520, e: 0.10, period: 232, rot: 3.45,
      pattern: 'glass',   // blown-glass y surface

      moons: [
        { name: 'negation taxonomy',    dr: 50, period: 17, e: 0.06, rot: 0.4, href: 'https://docs.google.com/document/d/1bIu_TZ74EtzlIcLg9-SXu6GmK8S7GPPsve7MUjhKLeY/preview', body: 'Ghosting outranks gaslighting; honesty and politeness are orthogonal.' },
        { name: 'gricean classifier',   dr: 74, period: 25, e: 0.12, rot: 2.1, href: 'https://github.com/taliaduckie/grice-maxim-classifier', body: 'A roberta-base model fine-tuned to classify utterances by which Gricean maxim they violate (quality, quantity, relevance, manner).' },
        { name: 'irony and projection', dr: 96, period: 34, e: 0.08, rot: 4.0, href: '#', body: 'Some of my undergraduate work focused on irony and presupposition projection: how ironic speech deliberately violates cooperative norms to communicate more than what’s said, and how certain presupposed content survives embedding under negation and conditionals irrespective of context.' }
      ]
    },
    {
      name: 'AI thoughts',
      desc: 'humanities/linguistics oriented AI thoughts',
      color: '#5d7a44', r: 31, a: 262, e: 0.13, period: 108, rot: 1.15, // largest — strong emphasis
      pattern: 'glass',   // also blown-glass y surface
      ring: { inner: 1.62, outer: 1.9, tilt: 0.28, angle: 0.5, color: '#a8b196', alpha: 0.36 },
      moons: [
        { name: 'fine, i’ll be aligned',                 dr: 52,  period: 19, e: 0.05, rot: 1.0, href: 'https://taliahonikman.substack.com/p/fine-ill-be-aligned', body: 'What “alignment faking” borrows from someone saying “fine” when they’re not.' },
        { name: 'the marshmallow benchmark',             dr: 78,  period: 28, e: 0.14, rot: 3.0, href: 'https://taliahonikman.substack.com/p/behold-the-marshmallow-benchmark', body: 'About a month ago I started writing an outline for a post about AI counting marshmallows.' },
        { name: 'sycophancy mapping',                    dr: 100, period: 37, e: 0.09, rot: 5.1, href: '#', body: 'In progress: sycophancy mapping in language models. How a discourse classifier’s blind spots (moments that it can’t tell genuine agreement from people-pleasing) reveal something about the mechanisms of AI-related adulation.' },
        { name: 'evidence-inverting confabulation',      dr: 124, period: 46, e: 0.11, rot: 4.2, href: 'https://taliahonikman.substack.com/p/no-youre-hallucinating', body: '' }
      ]
    },
    {
      name: 'bad food science',
      desc: 'rankings, sortings, meltings, testings...',
      color: '#b06a2c', r: 21, a: 348, e: 0.06, period: 152, rot: 2.05,
      moons: [
        { name: 'pasta mechanics',        dr: 48, period: 16, e: 0.07, rot: 0.7, href: 'https://docs.google.com/document/d/1883SsckLPuwK758Ua7wjFAL5EVV2zCs7iVY_ZU4UrT4/preview', body: 'In progress: pasta alla gricia fluid mechanics experiment.' },
        { name: 'american breakfast cereal model', dr: 72, period: 26, e: 0.10, rot: 2.6,
          links: [
            { label: 'the writeup',    href: 'https://taliahonikman.substack.com/p/ranking-american-breakfast-cereals' },
            { label: 'model website',  href: 'https://taliacerealspace.com/' }
          ],
          body: 'A tier ranking of (most) of the americana canon.' },
        // photos: map a phrase from the body to an image; it becomes a hover-to-peek term
        { name: 'absurd baking projects', dr: 94, period: 34, e: 0.08, rot: 4.6, href: '#',
          body: 'Recently: croissants, apple sourdough cinnamon rolls, pizza w/ from scratch mozz.',
          photos: {
            'croissants': 'photos/croissants-attempt-one.jpg',
            'apple sourdough cinnamon rolls': 'photos/apple-cinnamon-rolls.jpg',
            'pizza w/ from scratch mozz': 'photos/sourdough-marg.jpg'
          } }
      ]
    },
    {
      name: 'photography',
      desc: 'incredibly amateur; film + portraiture',
      color: '#356b6b', r: 18, a: 432, e: 0.16, period: 188, rot: 2.75,
      moons: [
        { name: 'velvia diaries', dr: 50, period: 18, e: 0.08, rot: 1.4, href: '#',
          body: 'Shot on Velvia: Gaviota Peak, Half Moon Bay, the streets of Padua, tulips in DC.',
          photos: {
            'Gaviota Peak': 'photos/gaviota-peak-velvia.jpg',
            'Half Moon Bay': 'photos/half-moon-bay-velvia.jpg',
            'the streets of Padua': 'photos/streets-of-padua-velvia.jpg',
            'tulips in DC': 'photos/tulips-dc-velvia.jpg'
          } },
        { name: 'portraiture',    dr: 74, period: 27, e: 0.13, rot: 3.5, href: '#',
          body: 'Portraits of friends: Jason, Maya, Nic.',
          photos: {
            'Jason': 'photos/Jason.jpg',
            'Maya': 'photos/Maya.jpg',
            'Nic': 'photos/Nic.jpg'
          } },
        { name: 'miscellaneous',  dr: 96, period: 35, e: 0.06, rot: 5.6, href: '#', body: 'Mostly dog and airplane pictures...' }
      ]
    },
    {
      name: 'writing',
      desc: 'about various topics and miscellany',
      color: '#7a3f57', r: 24, a: 175, e: 0.09, period: 74, rot: 0.35,
      moons: [
        { name: 'essays',       dr: 50, period: 17, e: 0.07, rot: 0.9,
          links: [{ label: 'the hedge', href: 'https://taliahonikman.substack.com/' }],
          body: 'Longer pieces.' },
        { name: 'reading list', dr: 76, period: 27, e: 0.11, rot: 3.2, href: '#',
          body: 'Recently loved: *Seveneves* (Stephenson), *Now Is Not the Time to Panic* (Wilson), *On Not Knowing* (Ogden), *Consolations II* (Whyte).\nAll-time: *Musicophilia* (Sacks), *Assholes: A Theory* (James), *Round Ireland with a Fridge* (Hawks), *Superintelligence* (Bostrom), *Symphony for the City of the Dead* (Anderson).' },
        { name: 'fiction',      dr: 98, period: 36, e: 0.05, rot: 5.4, href: '#', body: 'Written constantly, published never (so far).' }
      ]
    },
    {
      name: 'violin',
      desc: 'classically trained has-been',
      color: '#b56e84', r: 22, a: 625, e: 0.08, period: 268, rot: 0.8,
      // ring!!!! inner/outer are multiples of the planet radius,and tilt squashes
      // the ellipse (0 = edge-on, 1 = face-on). angle tips the ring in radians.
      ring: { inner: 1.72, outer: 2.12, tilt: 0.34, angle: -0.55, color: '#c2ad88' },
      moons: [
        { name: 'related essays', dr: 50, period: 18, e: 0.07, rot: 0.6,
          links: [
            { label: 'the road not chosen', href: 'https://taliahonikman.substack.com/p/the-road-not-chosen' },
            { label: 'violin logic',        href: 'https://taliahonikman.substack.com/p/violin-logic' }
          ],
          body: '' },
        { name: 'recordings',     dr: 78, period: 28, e: 0.11, rot: 3.0, href: '#', body: 'Incoming...' }
      ]
    }
  ]
};
