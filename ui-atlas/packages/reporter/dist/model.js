function toLocator(candidate) {
    const locator = {
        type: candidate.type,
        value: candidate.value,
        score: candidate.score,
        uniquenessCount: candidate.uniquenessCount,
        reasons: candidate.reasons,
    };
    if (candidate.attribute !== undefined)
        locator.attribute = candidate.attribute;
    if (candidate.role !== undefined)
        locator.role = candidate.role;
    return locator;
}
/**
 * Only a *responsive* set's member names a viewport — a state set's member is
 * the state name. Using it blindly turned a five-state matrix into a diagonal
 * of five one-cell "viewports".
 */
function viewportLabelOf(record) {
    if (record.set?.kind === 'responsive')
        return record.set.member;
    return (record.viewport.name ?? `${String(record.viewport.width)}x${String(record.viewport.height)}`);
}
function toCapture(record) {
    const capture = {
        id: record.id,
        status: record.status,
        kind: record.kind,
        stateName: record.state.name,
        provenance: record.state.provenance,
        verified: record.state.verified,
        viewportLabel: viewportLabelOf(record),
        viewportWidth: record.viewport.width,
        viewportHeight: record.viewport.height,
        deviceScaleFactor: record.viewport.deviceScaleFactor,
        emulatedMobile: record.viewport.mobile,
        routeKey: record.routeKey,
        finalUrl: record.finalUrl,
        capturedAt: record.capturedAt,
        durationMs: record.durationMs,
        readiness: record.readiness,
        warnings: record.warnings,
    };
    if (record.state.verification !== undefined)
        capture.verification = record.state.verification;
    if (record.styleDelta !== undefined)
        capture.styleDelta = record.styleDelta;
    if (record.interactionRecipe !== undefined)
        capture.recipe = record.interactionRecipe;
    if (record.error !== undefined)
        capture.error = record.error;
    if (record.set !== undefined) {
        capture.setId = record.set.id;
        capture.setKind = record.set.kind;
        capture.setMember = record.set.member;
    }
    if (record.image !== undefined) {
        capture.image = {
            // The report lives in `<run>/report/`, the images in `<run>/screenshots/`.
            src: `../${record.image.relativePath}`,
            width: record.image.width,
            height: record.image.height,
            sha256: record.image.sha256,
            byteLength: record.image.byteLength,
        };
    }
    if (record.element !== undefined) {
        const element = record.element;
        const frame = element.framePath.at(-1);
        const view = {
            tagName: element.tagName,
            fingerprint: element.structuralFingerprint,
            chosen: toLocator(element.chosenLocator),
            candidates: element.locatorCandidates.map(toLocator),
            frameDepth: frame?.depth ?? 0,
            crossOriginFrame: frame?.crossOrigin ?? false,
        };
        if (element.role !== undefined)
            view.role = element.role;
        if (element.accessibleName !== undefined)
            view.accessibleName = element.accessibleName;
        if (element.textExcerpt !== undefined)
            view.textExcerpt = element.textExcerpt;
        if (element.shadowHostPath !== undefined)
            view.shadowHostPath = element.shadowHostPath;
        capture.element = view;
    }
    return capture;
}
function unique(values) {
    const out = [];
    for (const value of values) {
        if (value === undefined || value.length === 0)
            continue;
        if (!out.includes(value))
            out.push(value);
    }
    return out;
}
/**
 * Group captures into the things a designer thinks about. Element captures
 * group by structural fingerprint, so the same component photographed at five
 * viewports and four states is one row in the report. Page-level captures group
 * by route and kind.
 */
export function groupComponents(captures) {
    const groups = new Map();
    for (const capture of captures) {
        const key = capture.element === undefined
            ? `page:${capture.routeKey}:${capture.kind}`
            : `element:${capture.element.fingerprint}`;
        groups.set(key, [...(groups.get(key) ?? []), capture]);
    }
    const result = [];
    for (const [key, members] of groups) {
        const first = members[0];
        if (first === undefined)
            continue;
        const viewports = unique(members.map((capture) => capture.viewportLabel));
        const states = unique(members.map((capture) => capture.stateName));
        // One cell per viewport × state. A missing cell means that combination was
        // never attempted, which is different from attempted-and-skipped.
        const cells = [];
        for (const viewport of viewports) {
            for (const state of states) {
                const capture = members.find((item) => item.viewportLabel === viewport && item.stateName === state);
                cells.push(capture === undefined ? { viewport, state } : { viewport, state, capture });
            }
        }
        const element = first.element;
        result.push({
            key,
            label: element === undefined
                ? `${first.routeKey} · ${first.kind}`
                : (element.accessibleName ?? element.textExcerpt ?? `<${element.tagName}>`),
            sublabel: element === undefined
                ? first.finalUrl
                : `${element.role ?? element.tagName} · ${element.chosen.type}="${element.chosen.value}"`,
            ...(element?.role === undefined ? {} : { role: element.role }),
            routeKeys: unique(members.map((capture) => capture.routeKey)),
            captureIds: members.map((capture) => capture.id),
            viewports,
            states,
            cells,
            capturedCount: members.filter((capture) => capture.status === 'captured').length,
            skippedCount: members.filter((capture) => capture.status === 'skipped').length,
            failedCount: members.filter((capture) => capture.status === 'failed').length,
        });
    }
    // Components with the most cells first: those are the interesting matrices.
    return result.sort((a, b) => b.cells.length - a.cells.length || a.label.localeCompare(b.label));
}
/** Exact-hash duplicate groups. Perceptual hashing is a later addition. */
export function groupDuplicates(captures) {
    const byHash = new Map();
    for (const capture of captures) {
        if (capture.image === undefined)
            continue;
        byHash.set(capture.image.sha256, [...(byHash.get(capture.image.sha256) ?? []), capture.id]);
    }
    return [...byHash.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([sha256, captureIds]) => ({ sha256, captureIds }))
        .sort((a, b) => b.captureIds.length - a.captureIds.length);
}
export function buildFacets(captures) {
    return {
        routeKeys: unique(captures.map((capture) => capture.routeKey)).sort(),
        viewports: unique(captures.map((capture) => capture.viewportLabel)),
        states: unique(captures.map((capture) => capture.stateName)),
        provenances: unique(captures.map((capture) => capture.provenance)),
        statuses: unique(captures.map((capture) => capture.status)),
        kinds: unique(captures.map((capture) => capture.kind)),
        roles: unique(captures.map((capture) => capture.element?.role)).sort(),
    };
}
export function buildReportModel(input) {
    const captures = input.captures.map(toCapture);
    const { manifest } = input;
    const run = {
        runId: manifest.runId,
        project: manifest.project,
        command: manifest.command,
        startedAt: manifest.startedAt,
        toolVersion: manifest.toolVersion,
        browserEngine: manifest.browser.engine,
        browserMode: manifest.browser.mode,
        headless: manifest.browser.headless,
        counts: manifest.counts ?? {
            captured: captures.filter((capture) => capture.status === 'captured').length,
            failed: captures.filter((capture) => capture.status === 'failed').length,
            skipped: captures.filter((capture) => capture.status === 'skipped').length,
            pages: input.pages.length,
        },
        warnings: manifest.warnings,
    };
    if (manifest.finishedAt !== undefined)
        run.finishedAt = manifest.finishedAt;
    if (manifest.browser.version !== undefined)
        run.browserVersion = manifest.browser.version;
    if (manifest.browser.profileName !== undefined)
        run.profileName = manifest.browser.profileName;
    return {
        schemaVersion: 1,
        generatedAt: input.generatedAt,
        run,
        captures,
        components: groupComponents(captures),
        duplicates: groupDuplicates(captures),
        pages: input.pages.map((page) => {
            const view = {
                requestedUrl: page.requestedUrl,
                finalUrl: page.finalUrl,
                routeKey: page.routeKey,
                visitedAt: page.visitedAt,
                warnings: page.warnings,
            };
            if (page.title !== undefined)
                view.title = page.title;
            if (page.httpStatus !== undefined)
                view.httpStatus = page.httpStatus;
            if (page.error !== undefined)
                view.error = page.error;
            return view;
        }),
        facets: buildFacets(captures),
        unreadableRecords: input.unreadableRecords,
    };
}
//# sourceMappingURL=model.js.map