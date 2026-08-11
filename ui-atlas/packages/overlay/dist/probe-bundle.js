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

  // packages/overlay/src/page/probe-entry.ts
  var PROBE_GLOBAL = "__uiAtlasProbe";
  var globals = window;
  if (globals[PROBE_GLOBAL] === void 0) {
    Object.defineProperty(window, PROBE_GLOBAL, {
      value: (element) => probeElement(element),
      configurable: true,
      enumerable: false,
      writable: false
    });
  }
})();
