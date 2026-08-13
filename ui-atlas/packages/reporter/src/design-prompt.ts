/**
 * The prompt this project hands to Claude Design.
 *
 * This file is meant to be edited. The prompt is the part of UI Atlas most
 * likely to be wrong on the first try and most likely to keep changing, so it
 * is kept as data — a list of stages, each one a title and a function from
 * observed facts to text — rather than being woven through the page renderer.
 * Changing what the tool asks for should mean editing prose in one place and
 * rebuilding, and nothing else.
 *
 * Two rules the stages are written under, and that new ones should keep:
 *
 *  - **Only say what was observed.** Every number, route, component and colour
 *    interpolated here came off a capture record or a token scan. The prompt
 *    may say "34 elements used #2563eb"; it may not say "your primary colour is
 *    #2563eb", because nothing measured that.
 *  - **Say what is missing too.** A prompt that lists three viewports and stays
 *    quiet about the fourth invites a model to invent one. Where the material
 *    is thin, the stage says so and tells the model to leave a gap rather than
 *    fill it.
 *
 * The stage list is exported, so a caller can render one stage, all of them, or
 * a subset — the project page shows each separately with its own copy button.
 */

import type {
  ComponentFact,
  MotionFact,
  ProjectFacts,
  RouteFact,
  TokenFact,
  ViewportFact,
} from './project-facts.js';

export interface PromptStage {
  /** Stable id, used as the anchor and the copy-button target on the page. */
  id: string;
  title: string;
  /** One line under the heading, in the tool's voice rather than the prompt's. */
  intent: string;
  /**
   * When present and false, the stage is left out entirely. A motion stage in
   * a project where nothing moved would be asking for invention.
   */
  applies?: (facts: ProjectFacts) => boolean;
  body: (facts: ProjectFacts) => string;
}

/* ========================================================================== */
/*  EDIT HERE — the prompt text itself                                        */
/* ========================================================================== */

export const DESIGN_PROMPT_STAGES: readonly PromptStage[] = [
  {
    id: 'foundations',
    title: 'Stage 1 — Foundations',
    intent: 'Turn the reference material into a token set and the rules that govern it.',
    body: (facts) =>
      [
        heading('Stage 1 — Foundations'),
        '',
        `Build the foundations of a design system from reference material captured from ${siteName(facts)}.`,
        '',
        materialSection(facts),
        '',
        observedValuesSection(facts),
        '',
        section('What to produce in this stage', [
          '1. **Colour.** Group the observed colours into roles you can defend from the images: surface, raised surface, text, secondary text, border, and the accent(s) actually used for primary actions. Give each a name and the exact value. Where two observed values are within a hair of each other, pick one and say which you dropped.',
          '2. **Type.** A scale, from the observed font families, sizes, weights and line heights. State the base size and the ratio between steps. If the observed sizes do not fit a clean ratio, keep the observed sizes and say so — do not round the site into a scale it does not have.',
          '3. **Spacing.** A single spacing scale, from the observed lengths. State the base unit.',
          '4. **Radius and elevation.** The radii actually in use, and each distinct shadow, written as a token.',
          '5. **The rules.** Two or three sentences on how this system behaves: what carries emphasis, how density is handled, what is deliberately plain.',
        ]),
        '',
        section('Constraints', [
          '- Every token must trace to something in the reference material. If you cannot point at where a value came from, do not add it.',
          '- Observed values are counts from the live site, not decisions. Frequency is evidence, not authority — a colour used twice may still be the accent.',
          '- Leave gaps as gaps. If nothing in the material shows a disabled state, an error colour or a dark theme, list it under "not observed" instead of designing one.',
          '- Output the tokens as a flat, named list with values. No component work yet.',
        ]),
      ].join('\n'),
  },

  {
    id: 'components',
    title: 'Stage 2 — Components',
    intent: 'Build each captured component, in exactly the states that were captured.',
    applies: (facts) => facts.components.length > 0,
    body: (facts) =>
      [
        heading('Stage 2 — Components'),
        '',
        'Using the tokens from Stage 1, build the component library. The reference images show each component in the states listed below — these were captured from the live site, so the states named here are the ones there is evidence for.',
        '',
        section(`Components captured (${String(facts.components.length)})`, componentLines(facts.components)),
        '',
        section('What to produce in this stage', [
          '1. Each component above, built from Stage 1 tokens only.',
          '2. Every state listed beside it, as a variant. Match the reference image for that state — including what does *not* change.',
          '3. For each component, one line on what its states have in common: whether hover moves it, whether focus is a ring or a fill, whether active is a shift or a colour change. That consistency is the system.',
          '4. A states matrix per component: the component down the side, its states across the top, so a gap is visible.',
        ]),
        '',
        section('Constraints', [
          '- Do not add states that are not listed. An unobserved `disabled` is an invented one.',
          '- Do not add components that are not listed. If the material implies a component it never captured, name it in a "suggested next capture" list instead of building it.',
          '- Where a component was captured on more than one route, it is one component. Reconcile the differences and say which you took as canonical.',
          '- Keep names from the reference: a component captured as `button "Save changes"` is a Button with a label, not a `SaveChangesButton`.',
        ]),
      ].join('\n'),
  },

  {
    id: 'refinement',
    title: 'Stage 3 — Refinement, at Apple precision',
    intent: 'The pass that separates a system that works from one that feels made.',
    body: (facts) =>
      [
        heading('Stage 3 — Refinement, at Apple precision'),
        '',
        'Everything is in place and none of it is finished. Go back over Stages 1 and 2 with the tolerances below. The bar is Apple-grade: the kind of precision where nothing looks wrong and no single thing is what fixed it.',
        '',
        section('Optical, not mathematical', [
          '- Centre things optically. A glyph, an icon and a caret each have different visual mass; equal padding on both sides of a triangle is not centred.',
          '- Align to the shape people see, not the box it lives in. Text aligns to its cap height and baseline, not to its line box.',
          '- Icons beside text: match x-height, not point size, and settle the vertical offset by eye.',
          '- Circular and heavily rounded shapes need slightly more padding than square ones to read as equally inset.',
        ]),
        '',
        section('Type', [
          '- Tighten tracking as size increases; loosen it at small sizes. A display size set at body tracking looks loose, and a caption at display tracking looks cramped.',
          '- Line height falls as type grows. Headlines want roughly 1.1–1.2; body wants 1.4–1.6.',
          '- One optical size change per step, and a reason for every step in the scale. Delete any step nothing uses.',
          '- Set measure between 45 and 75 characters. Anything wider needs a reason.',
        ]),
        '',
        section('Edges, hairlines and depth', [
          '- Hairlines render at one device pixel, not one CSS pixel — a 1px border at 2× is twice as heavy as intended.',
          '- Borders should be the same hue as the surface they sit on, darkened, rather than a neutral grey laid over colour.',
          '- Shadows come from one implied light source, from above. Two shadows with different implied directions are the fastest way to read as unfinished.',
          '- Prefer a large soft shadow plus a tight tight one over a single medium shadow; that is what gives an edge and a lift at once.',
          '- Nested radii: the inner radius is the outer radius minus the padding between them, or the corners will not be concentric.',
        ]),
        '',
        section('Colour and contrast', [
          '- Body text against its surface: at least 4.5:1. Large text and UI edges: at least 3:1. Check every token pair you actually ship, not just the primary one.',
          '- Do not use pure black or pure white for text on a coloured surface; tint them toward the surface.',
          '- Disabled must be legible enough to read and clearly inert. Reduced opacity alone usually fails one of those two.',
          '- Focus rings need contrast against both the component and the page behind it. One ring colour rarely satisfies both — use an offset.',
        ]),
        '',
        section('Interaction and motion', [
          '- Every interactive element needs default, hover, focus-visible, active and disabled, whether or not the reference captured all five. Where a state was not observed, derive it from the ones that were and mark it derived.',
          '- Touch targets are at least 44×44pt regardless of the visual size of the control.',
          '- Transitions: 150–250ms for state changes, ease-out for things arriving, ease-in for things leaving. Nothing linear except opacity.',
          '- Motion should never be the only signal for a state change.',
        ]),
        '',
        section('Discipline', [
          '- No arbitrary values. Every number in the output is a token or a documented exception.',
          '- Remove any token nothing uses. A system is what survives the edit.',
          `- Re-check against the reference images${exportHint(facts)} — after a refinement pass, the drift from the source is what you are least likely to notice.`,
        ]),
      ].join('\n'),
  },

  {
    id: 'motion',
    title: 'Stage 4 — Motion',
    intent: 'What actually moves on the site, and how the system should move.',
    applies: (facts) => facts.motion.length > 0,
    body: (facts) =>
      [
        heading('Stage 4 — Motion'),
        '',
        'Motion was captured from the live site. Frames are sampled at points through one iteration; recordings are a fallback for motion that has no keyframes to sample, and start with the page load they needed.',
        '',
        section(`Motion captured (${String(facts.motion.length)})`, motionLines(facts.motion)),
        '',
        section('What to produce in this stage', [
          '1. A motion scale: two or three durations, named, with what each is for.',
          '2. An easing set: the curves the captured frames are consistent with. Frames are samples, so state the curve as the closest defensible fit rather than a measurement.',
          '3. Rules for what moves: which properties are animated, which never are, and what happens under `prefers-reduced-motion`.',
        ]),
        '',
        section('Constraints', [
          '- A sampled frame set shows the shape of a transition, not its timing function. Do not report an easing curve as observed.',
          '- A recording shows what a still cannot and promises nothing about frame timing.',
          '- Motion not captured here should not be invented. List it as a gap.',
        ]),
      ].join('\n'),
  },

  {
    id: 'assembly',
    title: 'Stage 5 — Screens',
    intent: 'Put the system back together as the pages it came from.',
    applies: (facts) => facts.routes.length > 0,
    body: (facts) =>
      [
        heading('Stage 5 — Screens'),
        '',
        'Rebuild the captured screens from the finished system. This is the check on Stages 1–3: anything the tokens and components cannot express will show up here as a gap or a one-off.',
        '',
        section(`Screens captured (${String(facts.routes.length)})`, routeLines(facts.routes)),
        '',
        section(`Widths captured (${String(facts.viewports.length)})`, viewportLines(facts.viewports)),
        '',
        section('What to produce in this stage', [
          '1. Each screen above, at each captured width, built only from Stage 2 components and Stage 1 tokens.',
          '2. A list of every place you had to reach outside the system, and what token or component it implies is missing.',
          '3. The layout rules the screens share: container width, gutters, the grid, and how the layout changes between the captured widths.',
        ]),
        '',
        section('Constraints', [
          '- Only the widths listed were captured. Behaviour between them is interpolation; say so rather than presenting it as observed.',
          '- Where a screen shows content this project never captured in detail, use plain placeholders. Do not invent copy or imagery and present it as the site’s.',
          '- Finish by listing what would be worth capturing next to close the largest gaps.',
        ]),
      ].join('\n'),
  },
];

/* ========================================================================== */
/*  Below here is plumbing. The prose lives above.                            */
/* ========================================================================== */

export interface BuiltPromptStage {
  id: string;
  title: string;
  intent: string;
  text: string;
}

export interface BuiltPrompt {
  stages: BuiltPromptStage[];
  /** Every stage, in order, for a single copy of the whole thing. */
  combined: string;
  /** Stages left out because the project has nothing for them, and why. */
  omitted: Array<{ id: string; title: string; reason: string }>;
}

export function buildDesignPrompt(
  facts: ProjectFacts,
  stages: readonly PromptStage[] = DESIGN_PROMPT_STAGES,
): BuiltPrompt {
  const built: BuiltPromptStage[] = [];
  const omitted: BuiltPrompt['omitted'] = [];

  for (const stage of stages) {
    if (stage.applies !== undefined && !stage.applies(facts)) {
      omitted.push({
        id: stage.id,
        title: stage.title,
        reason: 'this project has not captured anything for it yet',
      });
      continue;
    }
    built.push({
      id: stage.id,
      title: stage.title,
      intent: stage.intent,
      text: stage.body(facts).trimEnd(),
    });
  }

  return {
    stages: built,
    combined: built.map((stage) => stage.text).join('\n\n---\n\n'),
    omitted,
  };
}

/* -------------------------------------------------------------------------- */
/* Small formatters, so the stage bodies above stay readable                   */
/* -------------------------------------------------------------------------- */

function heading(text: string): string {
  return `# ${text}`;
}

function section(title: string, lines: readonly string[]): string {
  if (lines.length === 0) return `## ${title}\n\n_Nothing captured._`;
  return `## ${title}\n\n${lines.join('\n')}`;
}

function siteName(facts: ProjectFacts): string {
  const site = facts.manifest?.site;
  if (site === undefined) return facts.project;
  return `${site.label} (${site.origin})`;
}

function exportHint(facts: ProjectFacts): string {
  const count = facts.exportPlan.entries.length;
  return count === 0 ? '' : ` in \`exports/\` (${String(count)} files)`;
}

/** What the model has been handed, described the way the export names it. */
function materialSection(facts: ProjectFacts): string {
  const counts = new Map<string, number>();
  for (const entry of facts.exportPlan.entries) {
    counts.set(entry.group, (counts.get(entry.group) ?? 0) + 1);
  }

  const lines = [
    `- **${String(facts.exportPlan.entries.length)} reference images**, captured from the live site across ${plural(facts.totals.sessions, 'session')}.`,
    '- They are named to sort into reading order: `NN-page-…` are whole screens, `NN-component-…` are single components in one state, `NN-motion-…` are frames of something moving.',
  ];
  const parts = [...counts.entries()].map(([group, count]) => `${String(count)} ${group}`);
  if (parts.length > 0) lines.push(`- Breakdown: ${parts.join(', ')}.`);
  if (facts.exportPlan.skipped.length > 0) {
    lines.push(
      `- ${plural(facts.exportPlan.skipped.length, 'capture')} produced no image and ${facts.exportPlan.skipped.length === 1 ? 'is' : 'are'} not included.`,
    );
  }

  return section('What you have been given', lines);
}

/**
 * The observed values, with the sentence that says what they are.
 *
 * If nothing scanned styles, the section says that instead of being absent —
 * a model given no colours and no explanation will supply its own.
 */
function observedValuesSection(facts: ProjectFacts): string {
  const groups: Array<[string, TokenFact[] | undefined]> = [
    ['Colour', facts.tokens.color],
    ['Background', facts.tokens.background],
    ['Border', facts.tokens.border],
    ['Typography', facts.tokens.typography],
    ['Spacing', facts.tokens.spacing],
    ['Radius', facts.tokens.radius],
    ['Shadow', facts.tokens.shadow],
  ];

  const lines: string[] = [];
  for (const [label, items] of groups) {
    if (items === undefined || items.length === 0) continue;
    lines.push(`- **${label}:** ${items.map(tokenText).join(', ')}`);
  }

  if (lines.length === 0) {
    return section('Observed values', [
      '- No style scan has been run for this project, so there are no measured values here.',
      '- Read the values off the reference images, and say when you are estimating.',
      '- (`ui-atlas tokens <url>` records them, and this prompt will include them next time.)',
    ]);
  }

  return section('Observed values', [
    '_Counted from the live site’s computed styles. Observations, not decisions: the site uses these, which is not the same as them being right. The number is how many elements carried the value._',
    '',
    ...lines,
  ]);
}

function tokenText(token: TokenFact): string {
  return `\`${token.value}\` (${String(token.count)})`;
}

function componentLines(components: readonly ComponentFact[]): string[] {
  return components.map((component) => {
    const name = component.label === undefined ? component.subject : `${component.subject} “${component.label}”`;
    const routes = component.routes.length > 1 ? ` · on ${component.routes.join(', ')}` : '';
    return `- **${name}** — states: ${component.states.join(', ')}${routes}`;
  });
}

function motionLines(motion: readonly MotionFact[]): string[] {
  return motion.map((item) => {
    const duration = item.durationMs === undefined ? '' : ` · ~${String(Math.round(item.durationMs))}ms`;
    const shape =
      item.kind === 'recording' ? 'recording' : `${plural(item.frames, 'sampled frame')}`;
    return `- **${item.name}** on ${item.route} — ${shape}${duration}`;
  });
}

function routeLines(routes: readonly RouteFact[]): string[] {
  return routes.map((route) => {
    const title = route.title === undefined ? '' : ` — ${route.title}`;
    return `- \`${route.path}\`${title} · ${plural(route.captures, 'capture')}`;
  });
}

function viewportLines(viewports: readonly ViewportFact[]): string[] {
  return viewports.map(
    (viewport) =>
      `- **${viewport.label}** — ${String(viewport.width)}×${String(viewport.height)}` +
      `${viewport.mobile ? ' (device emulation)' : ''} · ${plural(viewport.captures, 'capture')}`,
  );
}

function plural(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${String(count)} ${noun}s`;
}
