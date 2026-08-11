"use strict";
(() => {
  // packages/identity/dist/dom/aria.js
  var INPUT_TYPE_ROLES = {
    button: "button",
    submit: "button",
    reset: "button",
    image: "button",
    checkbox: "checkbox",
    radio: "radio",
    range: "slider",
    number: "spinbutton",
    search: "searchbox",
    email: "textbox",
    tel: "textbox",
    text: "textbox",
    url: "textbox"
  };
  var SIMPLE_TAG_ROLES = {
    article: "article",
    aside: "complementary",
    button: "button",
    datalist: "listbox",
    dd: "definition",
    dfn: "term",
    dialog: "dialog",
    dt: "term",
    fieldset: "group",
    figure: "figure",
    form: "form",
    h1: "heading",
    h2: "heading",
    h3: "heading",
    h4: "heading",
    h5: "heading",
    h6: "heading",
    hr: "separator",
    li: "listitem",
    main: "main",
    math: "math",
    menu: "list",
    meter: "meter",
    nav: "navigation",
    ol: "list",
    optgroup: "group",
    option: "option",
    output: "status",
    p: "paragraph",
    progress: "progressbar",
    search: "search",
    summary: "button",
    table: "table",
    tbody: "rowgroup",
    td: "cell",
    textarea: "textbox",
    tfoot: "rowgroup",
    th: "columnheader",
    thead: "rowgroup",
    tr: "row",
    ul: "list"
  };
  var NAME_FROM_CONTENT = /* @__PURE__ */ new Set([
    "button",
    "cell",
    "checkbox",
    "columnheader",
    "gridcell",
    "heading",
    "link",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "radio",
    "row",
    "rowheader",
    "switch",
    "tab",
    "tooltip",
    "treeitem"
  ]);
  function collapseWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
  }
  function computeRole(element) {
    const explicit = element.getAttribute("role");
    if (explicit !== null) {
      const first = explicit.trim().split(/\s+/)[0];
      if (first !== void 0 && first.length > 0)
        return first;
    }
    const tag = element.tagName.toLowerCase();
    if (tag === "a" || tag === "area") {
      return element.hasAttribute("href") ? "link" : void 0;
    }
    if (tag === "input") {
      const type = (element.getAttribute("type") ?? "text").toLowerCase();
      if (type === "hidden")
        return void 0;
      return INPUT_TYPE_ROLES[type] ?? "textbox";
    }
    if (tag === "select") {
      const size = Number(element.getAttribute("size") ?? "0");
      return element.hasAttribute("multiple") || size > 1 ? "listbox" : "combobox";
    }
    if (tag === "img") {
      const alt = element.getAttribute("alt");
      return alt === "" ? "presentation" : "img";
    }
    if (tag === "section") {
      return hasAccessibleNameAttribute(element) ? "region" : void 0;
    }
    if (tag === "header") {
      return isInsideSectioningContent(element) ? void 0 : "banner";
    }
    if (tag === "footer") {
      return isInsideSectioningContent(element) ? void 0 : "contentinfo";
    }
    if (tag === "details")
      return "group";
    return SIMPLE_TAG_ROLES[tag];
  }
  function hasAccessibleNameAttribute(element) {
    return element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby");
  }
  function isInsideSectioningContent(element) {
    let parent = element.parentElement;
    while (parent !== null) {
      const tag = parent.tagName.toLowerCase();
      if (tag === "article" || tag === "aside" || tag === "nav" || tag === "section")
        return true;
      parent = parent.parentElement;
    }
    return false;
  }
  function textFromIdRefs(element, attribute) {
    const refs = element.getAttribute(attribute);
    if (refs === null)
      return void 0;
    const root = element.getRootNode();
    const scope = root instanceof ShadowRoot || root instanceof Document ? root : element.ownerDocument;
    const parts = [];
    for (const id of refs.split(/\s+/).filter((part) => part.length > 0)) {
      let target = null;
      try {
        target = scope.querySelector(`[id="${CSS.escape(id)}"]`);
      } catch {
        target = null;
      }
      if (target !== null)
        parts.push(collapseWhitespace(target.textContent ?? ""));
    }
    const joined = collapseWhitespace(parts.join(" "));
    return joined.length > 0 ? joined : void 0;
  }
  function labelText(element) {
    const doc = element.ownerDocument;
    const parts = [];
    if (element.id.length > 0) {
      let labels = null;
      try {
        labels = doc.querySelectorAll(`label[for="${CSS.escape(element.id)}"]`);
      } catch {
        labels = null;
      }
      if (labels !== null) {
        for (const label of Array.from(labels))
          parts.push(collapseWhitespace(label.textContent ?? ""));
      }
    }
    const wrapping = element.closest("label");
    if (wrapping !== null)
      parts.push(collapseWhitespace(wrapping.textContent ?? ""));
    const joined = collapseWhitespace(parts.join(" "));
    return joined.length > 0 ? joined : void 0;
  }
  function computeAccessibleName(element, role = computeRole(element)) {
    const labelledBy = textFromIdRefs(element, "aria-labelledby");
    if (labelledBy !== void 0)
      return labelledBy;
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel !== null) {
      const collapsed = collapseWhitespace(ariaLabel);
      if (collapsed.length > 0)
        return collapsed;
    }
    const tag = element.tagName.toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") {
      const type = (element.getAttribute("type") ?? "").toLowerCase();
      if (tag === "input" && (type === "button" || type === "submit" || type === "reset")) {
        const value = element.getAttribute("value");
        if (value !== null && value.trim().length > 0)
          return collapseWhitespace(value);
        if (type === "submit")
          return "Submit";
        if (type === "reset")
          return "Reset";
      }
      if (tag === "input" && type === "image") {
        const alt = element.getAttribute("alt");
        if (alt !== null && alt.trim().length > 0)
          return collapseWhitespace(alt);
      }
      const label = labelText(element);
      if (label !== void 0)
        return label;
      const placeholder = element.getAttribute("placeholder");
      if (placeholder !== null && placeholder.trim().length > 0)
        return collapseWhitespace(placeholder);
    }
    if (tag === "img" || tag === "area") {
      const alt = element.getAttribute("alt");
      if (alt !== null && alt.length > 0)
        return collapseWhitespace(alt);
    }
    if (tag === "fieldset") {
      const legend = element.querySelector("legend");
      if (legend !== null)
        return collapseWhitespace(legend.textContent ?? "");
    }
    if (tag === "table" || tag === "figure") {
      const caption = element.querySelector(tag === "table" ? "caption" : "figcaption");
      if (caption !== null)
        return collapseWhitespace(caption.textContent ?? "");
    }
    if (role !== void 0 && NAME_FROM_CONTENT.has(role)) {
      const text = collapseWhitespace(element.textContent ?? "");
      if (text.length > 0)
        return text.length > 200 ? text.slice(0, 200) : text;
    }
    const title = element.getAttribute("title");
    if (title !== null && title.trim().length > 0)
      return collapseWhitespace(title);
    return void 0;
  }

  // packages/identity/dist/core/css.js
  function cssEscapeIdent(value) {
    const length = value.length;
    let result = "";
    const firstCode = value.charCodeAt(0);
    for (let index = 0; index < length; index += 1) {
      const code = value.charCodeAt(index);
      if (code === 0) {
        result += "\uFFFD";
        continue;
      }
      if (code >= 1 && code <= 31 || code === 127 || index === 0 && code >= 48 && code <= 57 || index === 1 && code >= 48 && code <= 57 && firstCode === 45) {
        result += `\\${code.toString(16)} `;
        continue;
      }
      if (index === 0 && code === 45 && length === 1) {
        result += `\\${value.charAt(index)}`;
        continue;
      }
      if (code >= 128 || code === 45 || code === 95 || code >= 48 && code <= 57 || code >= 65 && code <= 90 || code >= 97 && code <= 122) {
        result += value.charAt(index);
        continue;
      }
      result += `\\${value.charAt(index)}`;
    }
    return result;
  }
  function cssQuoteAttrValue(value) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }

  // packages/identity/dist/core/scoring.js
  var BASE_SCORES = {
    "test-id": 96,
    "role-name": 92,
    id: 88,
    label: 84,
    alt: 74,
    placeholder: 72,
    title: 66,
    text: 62,
    "css-scoped": 50,
    "css-path": 20
  };
  var TYPE_ORDER = [
    "role-name",
    "test-id",
    "id",
    "label",
    "placeholder",
    "alt",
    "title",
    "text",
    "css-scoped",
    "css-path"
  ];
  function clamp(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }
  function scoreCandidate(draft) {
    const reasons = [...draft.reasons];
    let score = BASE_SCORES[draft.type];
    reasons.push(`base score ${score} for ${draft.type}`);
    if (draft.uniquenessCount === 0) {
      reasons.push("matched nothing when generated");
      return { ...draft, reasons, score: 0 };
    }
    if (draft.uniquenessCount > 1) {
      const penalised = score * 0.35;
      reasons.push(`ambiguous: matched ${draft.uniquenessCount} elements`);
      score = penalised;
    }
    if (draft.scope !== void 0 && draft.scope.length > 0) {
      score += 4;
      reasons.push("scoped to a stable ancestor");
    }
    const value = draft.value;
    if (draft.type !== "css-path" && draft.type !== "css-scoped") {
      if (value.length > 80) {
        score -= 12;
        reasons.push("value is long and likely to change");
      }
      if (/\d{2,}/.test(value)) {
        score -= 6;
        reasons.push("value contains numbers that may change");
      }
    }
    if (draft.type === "css-path") {
      const depth = value.split(">").length;
      if (depth > 3) {
        score -= (depth - 3) * 2;
        reasons.push(`positional path is ${depth} levels deep`);
      }
      if (value.includes(":nth-child")) {
        score -= 8;
        reasons.push("depends on sibling position");
      }
    }
    return { ...draft, reasons, score: clamp(score) };
  }
  function rankCandidates(drafts) {
    return drafts.map(scoreCandidate).sort((a, b) => {
      const aUnique = a.uniquenessCount === 1 ? 1 : 0;
      const bUnique = b.uniquenessCount === 1 ? 1 : 0;
      if (aUnique !== bUnique)
        return bUnique - aUnique;
      if (b.score !== a.score)
        return b.score - a.score;
      return TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
    });
  }

  // packages/identity/dist/core/stability.js
  var GENERATED_PATTERNS = [
    /^:[rR][0-9a-z]*:?$/,
    // React 18 useId
    /^mui-\d+$/i,
    /^ember\d+$/i,
    /^ext-gen\d+$/i,
    /^radix-[-:\w]+$/i,
    /^headlessui-[-\w]+$/i,
    /^react-aria-?\d+/i,
    /^downshift-\d+/i,
    /^ng-?(?:tns-)?\d+/i,
    /^cdk-[-\w]*\d{2,}/i,
    /^tippy-\d+$/i,
    /^uid[-_]?\d+$/i,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    // uuid
    /^__[A-Za-z0-9]+__?\d*$/,
    /^\d+$/
  ];
  var HUMAN_WORD = /[a-z]{3,}/i;
  function inspectId(id) {
    const trimmed = id.trim();
    if (trimmed.length === 0)
      return { generated: true, reason: "empty id" };
    for (const pattern of GENERATED_PATTERNS) {
      if (pattern.test(trimmed))
        return { generated: true, reason: `matches generated pattern ${String(pattern)}` };
    }
    if (trimmed.length > 40)
      return { generated: true, reason: "id is unusually long" };
    if (/[0-9a-f]{10,}/i.test(trimmed) && !/[-_]/.test(trimmed)) {
      return { generated: true, reason: "contains a long hexadecimal run" };
    }
    const digits = (trimmed.match(/\d/g) ?? []).length;
    if (digits > 0 && digits / trimmed.length > 0.5) {
      return { generated: true, reason: "more than half the id is digits" };
    }
    if (!HUMAN_WORD.test(trimmed)) {
      return { generated: true, reason: "contains no word-like segment" };
    }
    if (trimmed.length >= 8 && !/[-_]/.test(trimmed) && /[a-z]/.test(trimmed) && /[A-Z]/.test(trimmed) && /\d/.test(trimmed)) {
      return { generated: true, reason: "looks like random mixed-case alphanumerics" };
    }
    return { generated: false, reason: "looks authored" };
  }
  var HASHED_CLASS = /(?:^|[-_])(?:[a-z0-9]{5,}|[0-9a-f]{6,})$/i;
  function looksHashedClass(className) {
    if (className.length > 30)
      return true;
    if (/^(?:css|sc|jsx|emotion|_)[-_]?[a-z0-9]{4,}$/i.test(className))
      return true;
    if (/^[a-z0-9]{6,}$/i.test(className) && !HUMAN_WORD.test(className))
      return true;
    return HASHED_CLASS.test(className) && /\d/.test(className);
  }
  var BUCKET_EDGES = [16, 32, 64, 128, 256, 512, 1024, 2048];
  function geometryBucket(width, height) {
    const bucket = (value) => {
      const rounded = Math.max(0, Math.round(value));
      for (const edge of BUCKET_EDGES) {
        if (rounded <= edge)
          return `<=${edge}`;
      }
      return ">2048";
    };
    return `w${bucket(width)}|h${bucket(height)}`;
  }
  function normalizeNameClass(name) {
    if (name === void 0)
      return "";
    const collapsed = name.replace(/\s+/g, " ").trim().toLowerCase().replace(/\d+/g, "#").replace(/[‘’“”]/g, "'");
    return collapsed.length > 60 ? `${collapsed.slice(0, 60)}\u2026` : collapsed;
  }
  function excerptText(text, maxLength = 120) {
    const collapsed = text.replace(/\s+/g, " ").trim();
    return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1)}\u2026` : collapsed;
  }

  // packages/identity/dist/dom/traverse.js
  var MAX_VISITED_ELEMENTS = 8e3;
  function queryAllDeep(root, selector) {
    const matches = [];
    const queue = [root];
    let visited = 0;
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === void 0)
        break;
      try {
        for (const element of Array.from(current.querySelectorAll(selector)))
          matches.push(element);
      } catch {
        return { matches: [], truncated: false };
      }
      for (const element of Array.from(current.querySelectorAll("*"))) {
        visited += 1;
        if (visited > MAX_VISITED_ELEMENTS)
          return { matches, truncated: true };
        const shadow = element.shadowRoot;
        if (shadow !== null)
          queue.push(shadow);
      }
    }
    return { matches, truncated: false };
  }
  function allElementsDeep(root) {
    return queryAllDeep(root, "*");
  }
  function composedAncestors(element) {
    const chain = [];
    let current = element;
    for (; ; ) {
      const parent = current.parentNode;
      if (parent === null) {
        const root = current.getRootNode();
        if (root instanceof ShadowRoot) {
          chain.push(root.host);
          current = root.host;
          continue;
        }
        return chain;
      }
      if (parent instanceof Element)
        chain.push(parent);
      else if (!(parent instanceof DocumentFragment) && !(parent instanceof Document))
        return chain;
      current = parent;
    }
  }
  function isVisible(element) {
    const view = element.ownerDocument.defaultView;
    if (view === null)
      return false;
    const style = view.getComputedStyle(element);
    if (style.visibility === "hidden" || style.visibility === "collapse")
      return false;
    if (style.display === "none")
      return false;
    if (Number(style.opacity) === 0)
      return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // packages/identity/dist/dom/probe.js
  var TEST_ID_ATTRIBUTES = [
    "data-testid",
    "data-test-id",
    "data-test",
    "data-qa",
    "data-cy",
    "data-automation-id"
  ];
  var REPORTED_ATTRIBUTES = [
    "type",
    "name",
    "role",
    "href",
    "target",
    "rel",
    "alt",
    "title",
    "placeholder",
    "disabled",
    "checked",
    "selected",
    "readonly",
    "aria-label",
    "aria-expanded",
    "aria-checked",
    "aria-selected",
    "aria-disabled",
    "aria-current",
    "aria-pressed",
    "aria-haspopup",
    ...TEST_ID_ATTRIBUTES
  ];
  var LANDMARK_ROLES = /* @__PURE__ */ new Set([
    "banner",
    "complementary",
    "contentinfo",
    "form",
    "main",
    "navigation",
    "region",
    "search"
  ]);
  function ownerRoot(element) {
    const root = element.getRootNode();
    if (root instanceof ShadowRoot)
      return root;
    return element.ownerDocument;
  }
  function topRoot(element) {
    return element.ownerDocument;
  }
  function directText(element) {
    let text = "";
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === 3)
        text += node.nodeValue ?? "";
    }
    return collapseWhitespace(text);
  }
  function stableClasses(element) {
    const raw = element.getAttribute("class");
    if (raw === null)
      return [];
    return raw.split(/\s+/).filter((name) => name.length > 0 && !looksHashedClass(name)).slice(0, 3);
  }
  function testIdAttribute(element) {
    for (const attribute of TEST_ID_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value !== null && value.trim().length > 0)
        return { attribute, value: value.trim() };
    }
    return void 0;
  }
  function countDeep(selector, root) {
    return queryAllDeep(root, selector).matches.length;
  }
  function simpleSelector(element) {
    const tag = element.tagName.toLowerCase();
    const testId = testIdAttribute(element);
    if (testId !== void 0) {
      return `${tag}[${testId.attribute}=${cssQuoteAttrValue(testId.value)}]`;
    }
    if (element.id.length > 0 && !inspectId(element.id).generated) {
      return `${tag}#${cssEscapeIdent(element.id)}`;
    }
    const classes = stableClasses(element);
    if (classes.length > 0)
      return `${tag}${classes.map((c) => `.${cssEscapeIdent(c)}`).join("")}`;
    return tag;
  }
  function nthOfTypeIndex(element) {
    const parent = element.parentElement;
    if (parent === null)
      return 1;
    let index = 0;
    for (const sibling of Array.from(parent.children)) {
      if (sibling.tagName === element.tagName) {
        index += 1;
        if (sibling === element)
          return index;
      }
    }
    return index === 0 ? 1 : index;
  }
  function cssPathFor(element) {
    const parts = [];
    let current = element;
    let depth = 0;
    while (current !== null && depth < 12) {
      const tag = current.tagName.toLowerCase();
      if (tag === "html") {
        parts.unshift("html");
        break;
      }
      const parent = current.parentElement;
      if (parent === null) {
        parts.unshift(simpleSelector(current));
        const root = current.getRootNode();
        if (root instanceof ShadowRoot) {
          current = root.host;
          depth += 1;
          continue;
        }
        break;
      }
      const sameTagSiblings = Array.from(parent.children).filter((c) => c.tagName === current?.tagName);
      parts.unshift(sameTagSiblings.length > 1 ? `${tag}:nth-of-type(${nthOfTypeIndex(current)})` : tag);
      current = parent;
      depth += 1;
    }
    return parts.join(" > ");
  }
  function findScopeAnchor(element) {
    for (const ancestor of composedAncestors(element)) {
      const testId = testIdAttribute(ancestor);
      if (testId !== void 0) {
        return {
          selector: `[${testId.attribute}=${cssQuoteAttrValue(testId.value)}]`,
          reason: `scoped to ${testId.attribute}="${testId.value}"`
        };
      }
      if (ancestor.id.length > 0 && !inspectId(ancestor.id).generated) {
        return { selector: `#${cssEscapeIdent(ancestor.id)}`, reason: `scoped to #${ancestor.id}` };
      }
      const role = computeRole(ancestor);
      if (role !== void 0 && LANDMARK_ROLES.has(role)) {
        const tag = ancestor.tagName.toLowerCase();
        return { selector: tag, reason: `scoped to the ${role} landmark` };
      }
    }
    return void 0;
  }
  function relativePath(from, to) {
    const parts = [];
    let current = to;
    let depth = 0;
    while (current !== null && current !== from && depth < 8) {
      parts.unshift(simpleSelector(current));
      current = current.parentElement;
      depth += 1;
    }
    if (current !== from)
      return void 0;
    return parts.join(" > ");
  }
  function buildCandidates(element) {
    const drafts = [];
    const root = ownerRoot(element);
    const doc = topRoot(element);
    const role = computeRole(element);
    const accessibleName = computeAccessibleName(element, role);
    const tag = element.tagName.toLowerCase();
    if (role !== void 0 && accessibleName !== void 0 && accessibleName.length > 0) {
      const { matches, truncated } = allElementsDeep(doc);
      let count = 0;
      for (const candidate of matches) {
        if (computeRole(candidate) !== role)
          continue;
        if (computeAccessibleName(candidate, role) === accessibleName)
          count += 1;
      }
      drafts.push({
        type: "role-name",
        value: accessibleName,
        role,
        exact: true,
        uniquenessCount: count,
        reasons: truncated ? ["uniqueness counted over a truncated element scan"] : ["role and accessible name are the most change-resistant identity"]
      });
    }
    const testId = testIdAttribute(element);
    if (testId !== void 0) {
      const selector = `[${testId.attribute}=${cssQuoteAttrValue(testId.value)}]`;
      drafts.push({
        type: "test-id",
        value: testId.value,
        attribute: testId.attribute,
        exact: true,
        uniquenessCount: countDeep(selector, doc),
        reasons: [`authored test attribute ${testId.attribute}`]
      });
    }
    if (element.id.length > 0) {
      const verdict = inspectId(element.id);
      if (!verdict.generated) {
        const selector = `#${cssEscapeIdent(element.id)}`;
        drafts.push({
          type: "id",
          value: element.id,
          exact: true,
          uniquenessCount: countDeep(selector, doc),
          reasons: [verdict.reason]
        });
      }
    }
    if (tag === "input" || tag === "select" || tag === "textarea") {
      const label = labelFor(element);
      if (label !== void 0) {
        drafts.push({
          type: "label",
          value: label,
          exact: true,
          uniquenessCount: countLabelled(doc, label),
          reasons: ["associated <label> text"]
        });
      }
      const placeholder = element.getAttribute("placeholder");
      if (placeholder !== null && placeholder.trim().length > 0) {
        const value = collapseWhitespace(placeholder);
        drafts.push({
          type: "placeholder",
          value,
          exact: true,
          uniquenessCount: countDeep(`[placeholder=${cssQuoteAttrValue(placeholder)}]`, doc),
          reasons: ["placeholder text"]
        });
      }
    }
    const alt = element.getAttribute("alt");
    if (alt !== null && alt.trim().length > 0) {
      drafts.push({
        type: "alt",
        value: collapseWhitespace(alt),
        exact: true,
        uniquenessCount: countDeep(`[alt=${cssQuoteAttrValue(alt)}]`, doc),
        reasons: ["alt text"]
      });
    }
    const title = element.getAttribute("title");
    if (title !== null && title.trim().length > 0) {
      drafts.push({
        type: "title",
        value: collapseWhitespace(title),
        exact: true,
        uniquenessCount: countDeep(`[title=${cssQuoteAttrValue(title)}]`, doc),
        reasons: ["title attribute"]
      });
    }
    const text = directText(element);
    if (text.length > 0 && text.length <= 80) {
      const { matches } = allElementsDeep(doc);
      let count = 0;
      for (const candidate of matches) {
        if (directText(candidate) === text)
          count += 1;
      }
      drafts.push({
        type: "text",
        value: text,
        exact: true,
        uniquenessCount: count,
        reasons: ["visible text content"]
      });
    }
    const anchor = findScopeAnchor(element);
    if (anchor !== void 0) {
      const anchorElement = composedAncestors(element).find((ancestor) => {
        try {
          return ancestor.matches(anchor.selector);
        } catch {
          return false;
        }
      });
      if (anchorElement !== void 0) {
        const relative = relativePath(anchorElement, element);
        if (relative !== void 0) {
          const selector = `${anchor.selector} ${relative}`;
          drafts.push({
            type: "css-scoped",
            value: selector,
            scope: anchor.selector,
            uniquenessCount: countDeep(selector, doc),
            reasons: [anchor.reason]
          });
        }
      }
    }
    const path = cssPathFor(element);
    if (path.length > 0) {
      drafts.push({
        type: "css-path",
        value: path,
        uniquenessCount: countDeep(path, root instanceof ShadowRoot ? doc : doc),
        reasons: ["positional path; breaks on any structural change"]
      });
    }
    return drafts;
  }
  function labelFor(element) {
    const doc = element.ownerDocument;
    if (element.id.length > 0) {
      let label = null;
      try {
        label = doc.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      } catch {
        label = null;
      }
      if (label !== null) {
        const text = collapseWhitespace(label.textContent ?? "");
        if (text.length > 0)
          return text;
      }
    }
    const wrapping = element.closest("label");
    if (wrapping !== null) {
      const text = collapseWhitespace(wrapping.textContent ?? "");
      if (text.length > 0)
        return text;
    }
    return void 0;
  }
  function countLabelled(doc, labelText2) {
    let count = 0;
    for (const label of Array.from(doc.querySelectorAll("label"))) {
      if (collapseWhitespace(label.textContent ?? "") !== labelText2)
        continue;
      const forId = label.getAttribute("for");
      if (forId !== null && forId.length > 0) {
        count += doc.querySelectorAll(`[id="${CSS.escape(forId)}"]`).length;
      } else {
        count += label.querySelectorAll("input, select, textarea").length;
      }
    }
    return count;
  }
  function buildFingerprintInput(element) {
    const role = computeRole(element);
    const accessibleName = computeAccessibleName(element, role);
    const rect = element.getBoundingClientRect();
    const stableAttributes = {};
    const testId = testIdAttribute(element);
    if (testId !== void 0)
      stableAttributes[testId.attribute] = testId.value;
    if (element.id.length > 0 && !inspectId(element.id).generated)
      stableAttributes["id"] = element.id;
    const type = element.getAttribute("type");
    if (type !== null)
      stableAttributes["type"] = type.toLowerCase();
    const name = element.getAttribute("name");
    if (name !== null && !inspectId(name).generated)
      stableAttributes["name"] = name;
    const ancestorRoles = [];
    for (const ancestor of composedAncestors(element)) {
      const ancestorRole = computeRole(ancestor);
      if (ancestorRole !== void 0)
        ancestorRoles.push(ancestorRole);
      if (ancestorRoles.length >= 6)
        break;
    }
    ancestorRoles.reverse();
    const input = {
      tagName: element.tagName.toLowerCase(),
      nameClass: normalizeNameClass(accessibleName ?? directText(element)),
      stableAttributes,
      ancestorRoles,
      geometryBucket: geometryBucket(rect.width, rect.height)
    };
    if (role !== void 0)
      input.role = role;
    return input;
  }
  function reportedAttributes(element) {
    const out = {};
    for (const attribute of REPORTED_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value === null)
        continue;
      out[attribute] = value.length > 200 ? `${value.slice(0, 200)}\u2026` : value;
    }
    const classes = element.getAttribute("class");
    if (classes !== null && classes.length > 0) {
      out["class"] = classes.length > 200 ? `${classes.slice(0, 200)}\u2026` : classes;
    }
    return out;
  }
  function shadowHostPath(element) {
    const hosts = [];
    let current = element;
    for (; ; ) {
      const root = current.getRootNode();
      if (!(root instanceof ShadowRoot))
        break;
      hosts.unshift(simpleSelector(root.host));
      current = root.host;
    }
    return hosts;
  }
  function looksLikeClosedShadowHost(element) {
    return element.tagName.includes("-") && element.shadowRoot === null && element.childElementCount === 0;
  }
  function probeElement(element) {
    const role = computeRole(element);
    const accessibleName = computeAccessibleName(element, role);
    const rect = element.getBoundingClientRect();
    const text = directText(element) || collapseWhitespace(element.textContent ?? "");
    const probe = {
      tagName: element.tagName.toLowerCase(),
      boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      visible: isVisible(element),
      candidates: rankCandidates(buildCandidates(element)),
      fingerprintInput: buildFingerprintInput(element),
      shadowHostPath: shadowHostPath(element),
      closedShadowEncountered: looksLikeClosedShadowHost(element),
      attributes: reportedAttributes(element)
    };
    if (role !== void 0)
      probe.role = role;
    if (accessibleName !== void 0)
      probe.accessibleName = accessibleName;
    if (text.length > 0)
      probe.textExcerpt = excerptText(text);
    return probe;
  }

  // packages/protocol/dist/constants.js
  var BRIDGE_BINDING = "__uiAtlasBridge";
  var OVERLAY_GLOBAL = "__uiAtlasOverlay";
  var OVERLAY_HOST_ATTRIBUTE = "data-ui-atlas-overlay";
  var PROTOCOL_VERSION = 1;
  var DEFAULT_SHORTCUTS = {
    toggleInspect: "Alt+I",
    captureElement: "Alt+C",
    captureViewport: "Alt+V",
    captureResponsive: "Alt+R",
    captureAnimation: "Alt+A",
    cancel: "Escape",
    selectParent: "ArrowUp",
    selectChild: "ArrowDown",
    selectPrevSibling: "ArrowLeft",
    selectNextSibling: "ArrowRight"
  };

  // packages/overlay/src/page/bridge.ts
  var BridgeError = class extends Error {
    code;
    constructor(code, message) {
      super(message);
      this.name = "BridgeError";
      this.code = code;
    }
  };
  function createBridge(token) {
    let counter = 0;
    const binding = () => {
      const candidate = window[BRIDGE_BINDING];
      return typeof candidate === "function" ? candidate : void 0;
    };
    return {
      available: () => binding() !== void 0,
      async call(method, params) {
        const send = binding();
        if (send === void 0) {
          throw new BridgeError("protocol.invalid-message", "UI Atlas host bridge is not available");
        }
        counter += 1;
        const response = await send({
          v: PROTOCOL_VERSION,
          token,
          id: `p${String(counter)}`,
          method,
          params
        });
        if (response.ok) return response.result;
        throw new BridgeError(response.error.code, response.error.message);
      }
    };
  }

  // packages/overlay/src/page/highlight.ts
  var Highlight = class {
    layer;
    hoverBox;
    selectedBox;
    marginBox;
    paddingBox;
    label;
    options;
    constructor(root, options) {
      this.options = options;
      this.layer = document.createElement("div");
      this.layer.className = "ua-highlight-layer";
      this.marginBox = box("ua-box ua-box--margin");
      this.paddingBox = box("ua-box ua-box--padding");
      this.hoverBox = box("ua-box ua-box--hover");
      this.selectedBox = box("ua-box ua-box--selected");
      this.label = document.createElement("div");
      this.label.className = "ua-box-label";
      this.label.hidden = true;
      this.layer.append(this.marginBox, this.paddingBox, this.hoverBox, this.selectedBox, this.label);
      root.append(this.layer);
      this.hideHover();
      this.hideSelected();
    }
    setOptions(options) {
      this.options = options;
      if (!options.showBoxModel) {
        this.marginBox.hidden = true;
        this.paddingBox.hidden = true;
      }
    }
    showHover(element, caption) {
      const rect = element.getBoundingClientRect();
      place(this.hoverBox, rect);
      this.hoverBox.hidden = false;
      this.label.textContent = caption;
      this.label.hidden = false;
      placeLabel(this.label, rect);
      if (this.options.showBoxModel) this.showBoxModel(element, rect);
    }
    hideHover() {
      this.hoverBox.hidden = true;
      this.label.hidden = true;
      this.marginBox.hidden = true;
      this.paddingBox.hidden = true;
    }
    showSelected(element) {
      place(this.selectedBox, element.getBoundingClientRect());
      this.selectedBox.hidden = false;
    }
    hideSelected() {
      this.selectedBox.hidden = true;
    }
    /** Re-measure a still-selected element after scroll, resize or layout change. */
    refreshSelected(element) {
      if (element === void 0 || !element.isConnected) {
        this.hideSelected();
        return;
      }
      place(this.selectedBox, element.getBoundingClientRect());
    }
    showBoxModel(element, rect) {
      const view = element.ownerDocument.defaultView;
      if (view === null) return;
      const style = view.getComputedStyle(element);
      const num = (value) => Number.parseFloat(value) || 0;
      place(this.marginBox, {
        x: rect.x - num(style.marginLeft),
        y: rect.y - num(style.marginTop),
        width: rect.width + num(style.marginLeft) + num(style.marginRight),
        height: rect.height + num(style.marginTop) + num(style.marginBottom)
      });
      place(this.paddingBox, {
        x: rect.x + num(style.paddingLeft) + num(style.borderLeftWidth),
        y: rect.y + num(style.paddingTop) + num(style.borderTopWidth),
        width: Math.max(
          0,
          rect.width - num(style.paddingLeft) - num(style.paddingRight) - num(style.borderLeftWidth) - num(style.borderRightWidth)
        ),
        height: Math.max(
          0,
          rect.height - num(style.paddingTop) - num(style.paddingBottom) - num(style.borderTopWidth) - num(style.borderBottomWidth)
        )
      });
      this.marginBox.hidden = false;
      this.paddingBox.hidden = false;
    }
    destroy() {
      this.layer.remove();
    }
  };
  function box(className) {
    const element = document.createElement("div");
    element.className = className;
    element.hidden = true;
    return element;
  }
  function place(element, rect) {
    element.style.transform = `translate(${String(Math.round(rect.x))}px, ${String(Math.round(rect.y))}px)`;
    element.style.width = `${String(Math.max(0, Math.round(rect.width)))}px`;
    element.style.height = `${String(Math.max(0, Math.round(rect.height)))}px`;
  }
  function placeLabel(element, rect) {
    const above = rect.y > 24;
    const y = above ? rect.y - 22 : rect.y + rect.height + 4;
    element.style.transform = `translate(${String(Math.round(rect.x))}px, ${String(Math.round(y))}px)`;
  }

  // packages/overlay/src/page/inspect.ts
  function isOverlayNode(node) {
    let current = node;
    while (current !== null) {
      if (current instanceof Element && current.hasAttribute(OVERLAY_HOST_ATTRIBUTE)) return true;
      const parent = current.parentNode;
      if (parent === null) {
        const root = current.getRootNode();
        if (root instanceof ShadowRoot) {
          current = root.host;
          continue;
        }
        return false;
      }
      current = parent;
    }
    return false;
  }
  function deepElementFromPoint(x, y) {
    let root = document;
    let found;
    for (let depth = 0; depth < 20; depth += 1) {
      const candidates = root.elementsFromPoint(x, y).filter((element) => !isOverlayNode(element));
      const next = candidates[0];
      if (next === void 0 || next === found) break;
      found = next;
      const shadow = next.shadowRoot;
      if (shadow === null) break;
      root = shadow;
    }
    return found;
  }
  var InspectMode = class {
    constructor(callbacks) {
      this.callbacks = callbacks;
    }
    cleanups = [];
    enabled = false;
    hovered;
    get active() {
      return this.enabled;
    }
    get hoveredElement() {
      return this.hovered;
    }
    enable() {
      if (this.enabled) return;
      this.enabled = true;
      this.listen("pointermove", (event) => {
        const pointer = event;
        if (isOverlayNode(pointer.target)) {
          this.setHovered(void 0);
          return;
        }
        this.setHovered(deepElementFromPoint(pointer.clientX, pointer.clientY));
      });
      for (const type of ["pointerdown", "mousedown", "mouseup", "pointerup", "dblclick", "contextmenu"]) {
        this.listen(type, (event) => {
          if (isOverlayNode(event.target)) return;
          if (event.altKey) return;
          event.preventDefault();
          event.stopPropagation();
        });
      }
      this.listen("click", (event) => {
        if (isOverlayNode(event.target)) return;
        const mouse = event;
        const element = deepElementFromPoint(mouse.clientX, mouse.clientY);
        if (element === void 0) return;
        if (mouse.altKey) {
          this.callbacks.onInteract(element);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.callbacks.onSelect(element);
      });
      this.listen("pointerleave", () => this.setHovered(void 0), window);
    }
    disable() {
      if (!this.enabled) return;
      this.enabled = false;
      for (const cleanup of this.cleanups.splice(0)) cleanup();
      this.setHovered(void 0);
    }
    setHovered(element) {
      if (element === this.hovered) return;
      this.hovered = element;
      this.callbacks.onHover(element);
    }
    listen(type, handler, target = document) {
      const options = { capture: true };
      target.addEventListener(type, handler, options);
      this.cleanups.push(() => {
        target.removeEventListener(type, handler, options);
      });
    }
  };
  function navigateFrom(element, direction) {
    switch (direction) {
      case "parent": {
        const parent = element.parentElement;
        if (parent !== null) return parent;
        const root = element.getRootNode();
        return root instanceof ShadowRoot ? root.host : void 0;
      }
      case "child": {
        const shadow = element.shadowRoot;
        if (shadow !== null && shadow.firstElementChild !== null) return shadow.firstElementChild;
        return element.firstElementChild ?? void 0;
      }
      case "previous":
        return element.previousElementSibling ?? void 0;
      case "next":
        return element.nextElementSibling ?? void 0;
      default:
        return void 0;
    }
  }

  // packages/overlay/src/page/shortcuts.ts
  function matchesCombo(event, combo) {
    const parts = combo.split("+").map((part) => part.trim()).filter((part) => part.length > 0);
    const key = parts.pop();
    if (key === void 0) return false;
    const wanted = {
      alt: false,
      shift: false,
      ctrl: false,
      meta: false
    };
    for (const modifier of parts) {
      const name = modifier.toLowerCase();
      if (name === "alt" || name === "option") wanted.alt = true;
      else if (name === "shift") wanted.shift = true;
      else if (name === "ctrl" || name === "control") wanted.ctrl = true;
      else if (name === "meta" || name === "cmd" || name === "command") wanted.meta = true;
      else return false;
    }
    if (event.altKey !== wanted.alt) return false;
    if (event.shiftKey !== wanted.shift) return false;
    if (event.ctrlKey !== wanted.ctrl) return false;
    if (event.metaKey !== wanted.meta) return false;
    if (key.length === 1 && /[a-z0-9]/i.test(key)) {
      const code = /[0-9]/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`;
      return event.code === code || event.key.toLowerCase() === key.toLowerCase();
    }
    return event.key === key;
  }
  function isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    const tag = target.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    return target instanceof HTMLElement && target.isContentEditable;
  }

  // packages/overlay/src/page/styles.ts
  var OVERLAY_STYLES = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  color-scheme: dark;
  font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.ua-highlight-layer { position: fixed; inset: 0; pointer-events: none; }

.ua-box {
  position: fixed;
  top: 0;
  left: 0;
  pointer-events: none;
  box-sizing: border-box;
}
.ua-box--hover { outline: 1px solid #38bdf8; background: rgba(56, 189, 248, 0.14); }
.ua-box--selected { outline: 2px solid #f472b6; background: rgba(244, 114, 182, 0.10); }
.ua-box--margin { background: rgba(251, 191, 36, 0.18); }
.ua-box--padding { background: rgba(74, 222, 128, 0.18); }

.ua-box-label {
  /* Inherited properties cross the shadow boundary, and the page can style our
     host element directly (its rules beat :host). Every inheritable property we
     care about is therefore declared here rather than inherited. */
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 400;
  font-style: normal;
  letter-spacing: normal;
  word-spacing: normal;
  text-align: left;
  text-transform: none;
  text-indent: 0;
  direction: ltr;
  position: fixed;
  top: 0;
  left: 0;
  padding: 2px 6px;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
  line-height: 16px;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.ua-panel {
  /* Same reasoning as .ua-box-label: never inherit typography from the page. */
  font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-weight: 400;
  font-style: normal;
  letter-spacing: normal;
  word-spacing: normal;
  text-align: left;
  text-transform: none;
  text-indent: 0;
  direction: ltr;
  white-space: normal;
  position: fixed;
  top: 16px;
  right: 16px;
  width: 320px;
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  background: #0f172a;
  color: #e2e8f0;
  border: 1px solid #1e293b;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 1.45;
  overflow: hidden;
}
.ua-panel[hidden] { display: none; }

.ua-titlebar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #111c33;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid #1e293b;
}
.ua-title { font-weight: 600; letter-spacing: 0.02em; flex: 1; }
.ua-run { color: #94a3b8; font-size: 11px; font-family: ui-monospace, Menlo, monospace; }

.ua-body { overflow: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; }

.ua-section { display: flex; flex-direction: column; gap: 6px; }
.ua-section > h3 {
  margin: 0;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #7c8aa5;
  font-weight: 600;
}

.ua-row { display: flex; flex-wrap: wrap; gap: 6px; }

button.ua-btn {
  all: unset;
  box-sizing: border-box;
  padding: 5px 9px;
  border-radius: 6px;
  background: #1e293b;
  color: #e2e8f0;
  border: 1px solid #2b3a52;
  cursor: pointer;
  font-size: 11px;
  white-space: nowrap;
}
button.ua-btn:hover { background: #27364f; }
button.ua-btn:focus-visible { outline: 2px solid #38bdf8; outline-offset: 1px; }
button.ua-btn[aria-pressed="true"] { background: #2563eb; border-color: #3b82f6; }
button.ua-btn[disabled] { opacity: 0.45; cursor: not-allowed; }
button.ua-btn--primary { background: #db2777; border-color: #ec4899; }
button.ua-btn--primary:hover { background: #be185d; }

.ua-kv { display: grid; grid-template-columns: 84px 1fr; gap: 2px 8px; }
.ua-kv dt { color: #7c8aa5; }
.ua-kv dd { margin: 0; word-break: break-word; font-family: ui-monospace, Menlo, monospace; }

.ua-empty { color: #7c8aa5; font-style: italic; }

.ua-locator {
  background: #111c33;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 6px;
  font-family: ui-monospace, Menlo, monospace;
  word-break: break-all;
}
.ua-score { color: #4ade80; }
.ua-score--low { color: #fbbf24; }

.ua-jobs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ua-job {
  display: flex;
  gap: 6px;
  align-items: baseline;
  background: #111c33;
  border-radius: 6px;
  padding: 4px 6px;
}
.ua-job__label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ua-job__status { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
.ua-job--done .ua-job__status { color: #4ade80; }
.ua-job--failed .ua-job__status { color: #f87171; }
.ua-job--running .ua-job__status { color: #38bdf8; }
.ua-job--queued .ua-job__status { color: #94a3b8; }
.ua-job--cancelled .ua-job__status { color: #94a3b8; }

.ua-notice { padding: 6px 8px; border-radius: 6px; font-size: 11px; }
.ua-notice--info { background: #14263f; color: #bae6fd; }
.ua-notice--warn { background: #3a2c10; color: #fde68a; }
.ua-notice--error { background: #3b1113; color: #fecaca; }

.ua-input {
  all: unset;
  box-sizing: border-box;
  width: 64px;
  padding: 4px 6px;
  border-radius: 6px;
  background: #111c33;
  border: 1px solid #2b3a52;
  color: #e2e8f0;
  font-family: ui-monospace, Menlo, monospace;
}
.ua-input:focus-visible { outline: 2px solid #38bdf8; outline-offset: 1px; }

.ua-help { display: grid; grid-template-columns: 96px 1fr; gap: 2px 8px; color: #94a3b8; font-size: 11px; }
.ua-help kbd {
  font-family: ui-monospace, Menlo, monospace;
  background: #1e293b;
  border-radius: 4px;
  padding: 0 4px;
}

.ua-toggle-pill {
  position: fixed;
  top: 16px;
  right: 16px;
  pointer-events: auto;
}
`;

  // packages/overlay/src/page/toolbar.ts
  var CAPTURABLE_STATES = [
    "default",
    "hover",
    "focus",
    "focus-visible",
    "active",
    "checked",
    "selected",
    "expanded",
    "disabled"
  ];
  var Toolbar = class {
    element;
    callbacks;
    session;
    selection;
    selectedStates = /* @__PURE__ */ new Set(["default"]);
    inspectActive = false;
    boxModel = false;
    runLabel;
    inspectButton;
    boxModelButton;
    detailsHost;
    stateRow;
    viewportRow;
    captureRow;
    jobList;
    noticeHost;
    helpHost;
    widthInput;
    heightInput;
    constructor(root, callbacks) {
      this.callbacks = callbacks;
      this.element = div("ua-panel");
      const titlebar = div("ua-titlebar");
      const title = document.createElement("span");
      title.className = "ua-title";
      title.textContent = "UI Atlas";
      this.runLabel = document.createElement("span");
      this.runLabel.className = "ua-run";
      this.runLabel.textContent = "connecting\u2026";
      titlebar.append(title, this.runLabel);
      makeDraggable(this.element, titlebar);
      const body = div("ua-body");
      const modeSection = section("Mode");
      const modeRow = div("ua-row");
      this.inspectButton = button("Inspect", () => this.callbacks.onToggleInspect());
      this.inspectButton.setAttribute("aria-pressed", "false");
      this.boxModelButton = button("Box model", () => {
        this.boxModel = !this.boxModel;
        this.boxModelButton.setAttribute("aria-pressed", String(this.boxModel));
        this.callbacks.onToggleBoxModel(this.boxModel);
      });
      this.boxModelButton.setAttribute("aria-pressed", "false");
      const clearButton = button("Clear", () => this.callbacks.onClearSelection());
      modeRow.append(this.inspectButton, this.boxModelButton, clearButton);
      modeSection.append(modeRow);
      const elementSection = section("Element");
      this.detailsHost = div("ua-section");
      elementSection.append(this.detailsHost);
      const stateSection = section("States");
      this.stateRow = div("ua-row");
      stateSection.append(this.stateRow);
      const viewportSection = section("Viewport");
      this.viewportRow = div("ua-row");
      const customRow = div("ua-row");
      this.widthInput = numberInput(1440);
      this.heightInput = numberInput(1e3);
      const applyButton = button("Apply", () => {
        const width = Number(this.widthInput.value);
        const height = Number(this.heightInput.value);
        if (Number.isFinite(width) && Number.isFinite(height)) {
          this.callbacks.onSetViewport(Math.round(width), Math.round(height));
        }
      });
      customRow.append(this.widthInput, this.heightInput, applyButton);
      viewportSection.append(this.viewportRow, customRow);
      const captureSection = section("Capture");
      this.captureRow = div("ua-row");
      captureSection.append(this.captureRow);
      this.renderCaptureButtons();
      const queueSection = section("Queue");
      this.jobList = document.createElement("ul");
      this.jobList.className = "ua-jobs";
      queueSection.append(this.jobList);
      this.noticeHost = div("ua-section");
      const helpSection = section("Shortcuts");
      this.helpHost = div("ua-help");
      helpSection.append(this.helpHost);
      body.append(
        this.noticeHost,
        modeSection,
        elementSection,
        stateSection,
        viewportSection,
        captureSection,
        queueSection,
        helpSection
      );
      this.element.append(titlebar, body);
      root.append(this.element);
      this.renderStates();
      this.renderSelection();
      this.renderJobs([]);
    }
    setSession(session) {
      this.session = session;
      this.runLabel.textContent = session.outputLabel;
      this.renderViewportPresets();
      this.renderHelp();
      this.renderCaptureButtons();
    }
    setInspectActive(active) {
      this.inspectActive = active;
      this.inspectButton.setAttribute("aria-pressed", String(active));
      this.inspectButton.textContent = active ? "Inspecting" : "Inspect";
    }
    setSelection(selection) {
      this.selection = selection;
      this.renderSelection();
      this.renderCaptureButtons();
    }
    renderJobs(jobs) {
      this.jobList.textContent = "";
      if (jobs.length === 0) {
        const empty = document.createElement("li");
        empty.className = "ua-empty";
        empty.textContent = "No captures yet.";
        this.jobList.append(empty);
        return;
      }
      for (const job of jobs.slice(-12).reverse()) {
        const item = document.createElement("li");
        item.className = `ua-job ua-job--${job.status}`;
        const label = document.createElement("span");
        label.className = "ua-job__label";
        label.textContent = job.progress === void 0 ? job.label : `${job.label} \u2014 ${job.progress}`;
        const status = document.createElement("span");
        status.className = "ua-job__status";
        status.textContent = job.status;
        item.append(label, status);
        if (job.error !== void 0) item.title = `${job.error.code}: ${job.error.message}`;
        else if (job.warnings.length > 0) item.title = job.warnings.join("\n");
        this.jobList.append(item);
      }
    }
    notice(level, message) {
      this.noticeHost.textContent = "";
      const notice = div(`ua-notice ua-notice--${level}`);
      notice.textContent = message;
      this.noticeHost.append(notice);
    }
    clearNotice() {
      this.noticeHost.textContent = "";
    }
    get states() {
      const ordered = CAPTURABLE_STATES.filter((state) => this.selectedStates.has(state));
      return ordered.length > 0 ? ordered : ["default"];
    }
    renderStates() {
      this.stateRow.textContent = "";
      for (const state of CAPTURABLE_STATES) {
        const control = button(state, () => {
          if (this.selectedStates.has(state)) this.selectedStates.delete(state);
          else this.selectedStates.add(state);
          if (this.selectedStates.size === 0) this.selectedStates.add("default");
          this.renderStates();
        });
        control.setAttribute("aria-pressed", String(this.selectedStates.has(state)));
        this.stateRow.append(control);
      }
    }
    renderViewportPresets() {
      this.viewportRow.textContent = "";
      for (const preset of this.session?.viewportPresets ?? []) {
        const label = `${preset.name ?? "preset"} ${String(preset.width)}\xD7${String(preset.height)}`;
        const control = button(label, () => {
          this.widthInput.value = String(preset.width);
          this.heightInput.value = String(preset.height);
          this.callbacks.onSetViewport(preset.width, preset.height, preset.name);
        });
        this.viewportRow.append(control);
      }
    }
    renderCaptureButtons() {
      this.captureRow.textContent = "";
      const hasSelection = this.selection !== void 0;
      const element = button(
        "Element",
        () => this.callbacks.onCapture({
          kind: "element",
          states: ["default"],
          responsive: false,
          includeOverlay: false
        })
      );
      element.className = "ua-btn ua-btn--primary";
      element.disabled = !hasSelection;
      const stateSet = button(
        "State set",
        () => this.callbacks.onCapture({
          kind: "element",
          states: this.states,
          responsive: false,
          includeOverlay: false,
          label: `states: ${this.states.join(", ")}`
        })
      );
      stateSet.disabled = !hasSelection;
      const responsive = button(
        "Responsive set",
        () => this.callbacks.onCapture({
          kind: hasSelection ? "element" : "viewport",
          states: ["default"],
          responsive: true,
          includeOverlay: false,
          label: "responsive set"
        })
      );
      responsive.disabled = this.session?.capabilities.responsive !== true;
      const viewport = button(
        "Viewport",
        () => this.callbacks.onCapture({
          kind: "viewport",
          states: ["default"],
          responsive: false,
          includeOverlay: false
        })
      );
      const fullPage = button(
        "Full page",
        () => this.callbacks.onCapture({
          kind: "full-page",
          states: ["default"],
          responsive: false,
          includeOverlay: false
        })
      );
      fullPage.disabled = this.session?.capabilities.fullPage !== true;
      const animation = button(
        "Animation",
        () => this.callbacks.onCapture({
          kind: "element",
          states: ["default"],
          responsive: false,
          includeOverlay: false,
          label: "animation"
        })
      );
      animation.disabled = this.session?.capabilities.animation !== true;
      animation.title = "Animation capture lands in a later phase.";
      this.captureRow.append(element, stateSet, viewport, fullPage, responsive, animation);
    }
    renderSelection() {
      this.detailsHost.textContent = "";
      if (this.selection === void 0) {
        const empty = div("ua-empty");
        empty.textContent = this.inspectActive ? "Point at an element and click to select it." : "Turn on inspect mode to select an element.";
        this.detailsHost.append(empty);
        return;
      }
      const { identity, resolution, warnings } = this.selection;
      const list = document.createElement("dl");
      list.className = "ua-kv";
      addPair(list, "tag", identity.tagName);
      addPair(list, "role", identity.role ?? "\u2014");
      addPair(list, "name", identity.accessibleName ?? "\u2014");
      addPair(
        list,
        "size",
        `${String(Math.round(identity.boundingBox.width))} \xD7 ${String(Math.round(identity.boundingBox.height))}`
      );
      addPair(list, "matches", String(resolution.matches));
      this.detailsHost.append(list);
      const locator = div("ua-locator");
      const score = document.createElement("span");
      score.className = identity.chosenLocator.score >= 70 ? "ua-score" : "ua-score ua-score--low";
      score.textContent = `${identity.chosenLocator.type} \xB7 ${String(identity.chosenLocator.score)}`;
      const value = document.createElement("div");
      value.textContent = identity.chosenLocator.value;
      locator.append(score, value);
      locator.title = identity.chosenLocator.reasons.join("\n");
      this.detailsHost.append(locator);
      if (warnings.length > 0) {
        const warning = div("ua-notice ua-notice--warn");
        warning.textContent = warnings[0] ?? "";
        warning.title = warnings.join("\n");
        this.detailsHost.append(warning);
      }
    }
    renderHelp() {
      this.helpHost.textContent = "";
      const shortcuts = this.session?.shortcuts ?? {};
      for (const [action, combo] of Object.entries(shortcuts)) {
        const key = document.createElement("kbd");
        key.textContent = combo;
        const label = document.createElement("span");
        label.textContent = humanise(action);
        this.helpHost.append(key, label);
      }
    }
    setVisible(visible) {
      this.element.hidden = !visible;
    }
  };
  function div(className) {
    const element = document.createElement("div");
    element.className = className;
    return element;
  }
  function section(title) {
    const element = div("ua-section");
    const heading = document.createElement("h3");
    heading.textContent = title;
    element.append(heading);
    return element;
  }
  function button(label, onClick) {
    const element = document.createElement("button");
    element.className = "ua-btn";
    element.type = "button";
    element.textContent = label;
    element.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return element;
  }
  function numberInput(value) {
    const element = document.createElement("input");
    element.className = "ua-input";
    element.type = "number";
    element.value = String(value);
    element.min = "200";
    element.max = "10000";
    return element;
  }
  function addPair(list, term, description) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = description;
    list.append(dt, dd);
  }
  function humanise(action) {
    return action.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  }
  function makeDraggable(panel, handle) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    handle.addEventListener("pointerdown", (event) => {
      dragging = true;
      const rect = panel.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const maxX = Math.max(0, window.innerWidth - panel.offsetWidth);
      const maxY = Math.max(0, window.innerHeight - 40);
      const x = Math.min(Math.max(0, event.clientX - offsetX), maxX);
      const y = Math.min(Math.max(0, event.clientY - offsetY), maxY);
      panel.style.left = `${String(Math.round(x))}px`;
      panel.style.top = `${String(Math.round(y))}px`;
      panel.style.right = "auto";
      event.stopPropagation();
    });
    const stop = (event) => {
      if (!dragging) return;
      dragging = false;
      handle.releasePointerCapture?.(event.pointerId);
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  // packages/overlay/src/page/main.ts
  function isTopFrame() {
    try {
      return window.top === window;
    } catch {
      return false;
    }
  }
  var OverlayApp = class {
    constructor(bootstrap) {
      this.bootstrap = bootstrap;
      this.bridge = createBridge(bootstrap.token);
      this.shortcuts = { ...DEFAULT_SHORTCUTS, ...bootstrap.shortcuts };
      this.host = document.createElement("ui-atlas-overlay");
      this.host.setAttribute(OVERLAY_HOST_ATTRIBUTE, "");
      this.host.style.setProperty("position", "fixed", "important");
      this.host.style.setProperty("inset", "0", "important");
      this.host.style.setProperty("pointer-events", "none", "important");
      this.host.style.setProperty("z-index", "2147483647", "important");
      this.shadow = this.host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = OVERLAY_STYLES;
      this.shadow.append(style);
      this.highlight = new Highlight(this.shadow, { showBoxModel: false });
      this.inspect = new InspectMode({
        onHover: (element) => this.handleHover(element),
        onSelect: (element) => void this.handleSelect(element),
        onCancel: () => this.exitInspect(),
        onInteract: () => void 0
      });
      this.toolbar = isTopFrame() ? new Toolbar(this.shadow, {
        onToggleInspect: () => this.toggleInspect(),
        onCapture: (intent) => void this.requestCapture(intent),
        onSetViewport: (width, height, presetName) => void this.setViewport(width, height, presetName),
        onClearSelection: () => this.clearSelection(),
        onToggleBoxModel: (next) => this.highlight.setOptions({ showBoxModel: next })
      }) : void 0;
    }
    bridge;
    host;
    shadow;
    highlight;
    inspect;
    toolbar;
    session;
    shortcuts;
    selectedElement;
    selectedProbe;
    jobs = /* @__PURE__ */ new Map();
    rafHandle;
    keydownHandler;
    async mount() {
      await documentReady();
      document.documentElement.append(this.host);
      this.keepMounted();
      this.installKeyboard();
      this.installGlobal();
      this.startTracking();
      try {
        const result = await this.bridge.call("hello", {
          overlayVersion: this.bootstrap.version,
          url: location.href
        });
        this.session = result.session;
        this.shortcuts = { ...this.shortcuts, ...result.session.shortcuts };
        this.toolbar?.setSession(result.session);
      } catch (error) {
        this.toolbar?.notice("error", describe(error));
        return;
      }
      if (this.bootstrap.autoInspect) this.enterInspect();
    }
    /* ---------------------------------------------------------------------- */
    /* Inspect mode                                                            */
    /* ---------------------------------------------------------------------- */
    toggleInspect() {
      if (this.inspect.active) this.exitInspect();
      else this.enterInspect();
    }
    enterInspect(broadcast = true) {
      this.inspect.enable();
      this.toolbar?.setInspectActive(true);
      if (broadcast) void this.bridge.call("inspect/mode", { active: true }).catch(() => void 0);
    }
    exitInspect(broadcast = true) {
      this.inspect.disable();
      this.highlight.hideHover();
      this.toolbar?.setInspectActive(false);
      if (broadcast) void this.bridge.call("inspect/mode", { active: false }).catch(() => void 0);
    }
    handleHover(element) {
      if (element === void 0) {
        this.highlight.hideHover();
        return;
      }
      this.highlight.showHover(element, describeElement(element));
    }
    async handleSelect(element) {
      this.selectedElement = element;
      this.highlight.showSelected(element);
      let probe;
      try {
        probe = probeElement(element);
      } catch (error) {
        this.toolbar?.notice("error", `could not describe the element: ${describe(error)}`);
        return;
      }
      this.selectedProbe = probe;
      try {
        const view = await this.bridge.call("element/selected", { probe });
        this.toolbar?.setSelection(view);
        if (probe.closedShadowEncountered) {
          this.toolbar?.notice(
            "warn",
            "This element looks like a closed shadow host. Element-level inspection inside closed shadow DOM is not supported."
          );
        } else {
          this.toolbar?.clearNotice();
        }
      } catch (error) {
        this.toolbar?.setSelection(void 0);
        this.toolbar?.notice("error", describe(error));
      }
    }
    clearSelection() {
      this.selectedElement = void 0;
      this.selectedProbe = void 0;
      this.highlight.hideSelected();
      this.toolbar?.setSelection(void 0);
      void this.bridge.call("element/cleared", {}).catch(() => void 0);
    }
    moveSelection(direction) {
      if (this.selectedElement === void 0) return;
      const next = navigateFrom(this.selectedElement, direction);
      if (next === void 0) return;
      void this.handleSelect(next);
    }
    /* ---------------------------------------------------------------------- */
    /* Host operations                                                         */
    /* ---------------------------------------------------------------------- */
    async requestCapture(intent) {
      const params = {
        kind: intent.kind,
        states: intent.states,
        includeOverlay: intent.includeOverlay,
        responsive: intent.responsive
      };
      if (intent.label !== void 0) params["label"] = intent.label;
      if (intent.kind === "element") {
        if (this.selectedProbe === void 0) {
          this.toolbar?.notice("warn", "Select an element before capturing it.");
          return;
        }
        params["probe"] = this.selectedProbe;
      }
      if (intent.responsive && this.session?.capabilities.responsive === false) {
        this.toolbar?.notice("warn", "Responsive capture is not enabled for this session.");
        return;
      }
      try {
        const result = await this.bridge.call("capture/request", params);
        for (const job of result.jobs) this.jobs.set(job.id, job);
        this.toolbar?.renderJobs([...this.jobs.values()]);
      } catch (error) {
        this.toolbar?.notice("error", describe(error));
      }
    }
    async setViewport(width, height, presetName) {
      const params = { width, height };
      if (presetName !== void 0) params["presetName"] = presetName;
      try {
        await this.bridge.call("viewport/set", params);
        this.toolbar?.clearNotice();
      } catch (error) {
        this.toolbar?.notice("error", describe(error));
      }
    }
    /* ---------------------------------------------------------------------- */
    /* Host -> page events                                                     */
    /* ---------------------------------------------------------------------- */
    dispatch(event) {
      switch (event.type) {
        case "queue/update":
          this.jobs.set(event.job.id, event.job);
          this.toolbar?.renderJobs([...this.jobs.values()]);
          break;
        case "session/update":
          this.session = event.session;
          this.toolbar?.setSession(event.session);
          break;
        case "notice":
          this.toolbar?.notice(event.level, event.message);
          break;
        case "selection/invalidated":
          this.clearSelection();
          this.toolbar?.notice("warn", event.reason);
          break;
        case "inspect/mode":
          if (event.active) this.enterInspect(false);
          else this.exitInspect(false);
          break;
        default:
          break;
      }
    }
    hide() {
      this.host.style.setProperty("display", "none", "important");
    }
    show() {
      this.host.style.removeProperty("display");
    }
    debugState() {
      return {
        inspecting: this.inspect.active,
        hasSelection: this.selectedElement !== void 0,
        jobs: this.jobs.size
      };
    }
    /* ---------------------------------------------------------------------- */
    /* Plumbing                                                                */
    /* ---------------------------------------------------------------------- */
    installGlobal() {
      const api = {
        version: this.bootstrap.version,
        dispatch: (event) => this.dispatch(event),
        hide: () => this.hide(),
        show: () => this.show(),
        debugState: () => this.debugState()
      };
      Object.defineProperty(window, OVERLAY_GLOBAL, {
        value: api,
        configurable: true,
        enumerable: false,
        writable: false
      });
    }
    installKeyboard() {
      const handler = (event) => {
        if (isTypingTarget(event.target) && !event.altKey) return;
        if (matchesCombo(event, this.shortcuts["toggleInspect"] ?? "Alt+I")) {
          event.preventDefault();
          this.toggleInspect();
          return;
        }
        if (matchesCombo(event, this.shortcuts["cancel"] ?? "Escape")) {
          if (this.inspect.active) {
            event.preventDefault();
            this.exitInspect();
          } else if (this.selectedElement !== void 0) {
            event.preventDefault();
            this.clearSelection();
          }
          return;
        }
        if (matchesCombo(event, this.shortcuts["captureElement"] ?? "Alt+C")) {
          event.preventDefault();
          void this.requestCapture({ kind: "element", states: ["default"], responsive: false, includeOverlay: false });
          return;
        }
        if (matchesCombo(event, this.shortcuts["captureViewport"] ?? "Alt+V")) {
          event.preventDefault();
          void this.requestCapture({ kind: "viewport", states: ["default"], responsive: false, includeOverlay: false });
          return;
        }
        if (matchesCombo(event, this.shortcuts["captureResponsive"] ?? "Alt+R")) {
          event.preventDefault();
          void this.requestCapture({
            kind: this.selectedProbe === void 0 ? "viewport" : "element",
            states: ["default"],
            responsive: true,
            includeOverlay: false,
            label: "responsive set"
          });
          return;
        }
        if (matchesCombo(event, this.shortcuts["captureAnimation"] ?? "Alt+A")) {
          event.preventDefault();
          this.toolbar?.notice("info", "Animation capture lands in a later phase.");
          return;
        }
        if (this.selectedElement === void 0) return;
        const moves = [
          [this.shortcuts["selectParent"] ?? "ArrowUp", "parent"],
          [this.shortcuts["selectChild"] ?? "ArrowDown", "child"],
          [this.shortcuts["selectPrevSibling"] ?? "ArrowLeft", "previous"],
          [this.shortcuts["selectNextSibling"] ?? "ArrowRight", "next"]
        ];
        for (const [combo, direction] of moves) {
          if (matchesCombo(event, combo)) {
            event.preventDefault();
            this.moveSelection(direction);
            return;
          }
        }
      };
      this.keydownHandler = handler;
      window.addEventListener("keydown", handler, { capture: true });
    }
    /** Keep the highlight glued to a selected element as the page moves. */
    startTracking() {
      const tick = () => {
        if (this.selectedElement !== void 0) {
          if (!this.selectedElement.isConnected) {
            const reason = "The selected element was removed from the page.";
            this.selectedElement = void 0;
            this.selectedProbe = void 0;
            this.highlight.hideSelected();
            this.toolbar?.setSelection(void 0);
            this.toolbar?.notice("warn", reason);
          } else {
            this.highlight.refreshSelected(this.selectedElement);
          }
        }
        this.rafHandle = requestAnimationFrame(tick);
      };
      this.rafHandle = requestAnimationFrame(tick);
    }
    /** Re-attach after a framework replaces `document.documentElement`'s children. */
    keepMounted() {
      const observer = new MutationObserver(() => {
        if (!this.host.isConnected && document.documentElement !== null) {
          document.documentElement.append(this.host);
        }
      });
      observer.observe(document.documentElement, { childList: true });
    }
    destroy() {
      this.inspect.disable();
      if (this.rafHandle !== void 0) cancelAnimationFrame(this.rafHandle);
      if (this.keydownHandler !== void 0) {
        window.removeEventListener("keydown", this.keydownHandler, { capture: true });
      }
      this.highlight.destroy();
      this.host.remove();
    }
  };
  function describeElement(element) {
    const tag = element.tagName.toLowerCase();
    const id = element.id.length > 0 ? `#${element.id}` : "";
    const rect = element.getBoundingClientRect();
    return `${tag}${id} \xB7 ${String(Math.round(rect.width))}\xD7${String(Math.round(rect.height))}`;
  }
  function describe(error) {
    if (error instanceof BridgeError) return `${error.code}: ${error.message}`;
    return error instanceof Error ? error.message : String(error);
  }
  async function documentReady() {
    if (document.documentElement !== null) return;
    await new Promise((resolve) => {
      const check = () => {
        if (document.documentElement !== null) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });
  }
  var globals = window;
  if (globals[OVERLAY_GLOBAL] === void 0) {
    const app = new OverlayApp(__UI_ATLAS_BOOTSTRAP__);
    void app.mount().catch(() => {
      app.destroy();
    });
  }
})();
