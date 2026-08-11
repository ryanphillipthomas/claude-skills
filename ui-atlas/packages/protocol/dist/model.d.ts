import { z } from 'zod';
/**
 * Every persisted record carries this version. Bump it (and write a migration
 * note in docs/adr) whenever a field changes meaning or is removed.
 */
export declare const SCHEMA_VERSION = 1;
export declare const SchemaVersionSchema: z.ZodLiteral<1>;
export declare const IsoDateTimeSchema: z.ZodString;
export declare const BoxSchema: z.ZodObject<{
    x: z.ZodNumber;
    y: z.ZodNumber;
    width: z.ZodNumber;
    height: z.ZodNumber;
}, z.core.$strip>;
export type Box = z.infer<typeof BoxSchema>;
export declare const CAPTURE_KINDS: readonly ["element", "viewport", "full-page", "animation-frame", "animation-video"];
export declare const CaptureKindSchema: z.ZodEnum<{
    element: "element";
    viewport: "viewport";
    "full-page": "full-page";
    "animation-frame": "animation-frame";
    "animation-video": "animation-video";
}>;
export type CaptureKind = z.infer<typeof CaptureKindSchema>;
export declare const STILL_CAPTURE_KINDS: readonly ["element", "viewport", "full-page"];
export declare const StillCaptureKindSchema: z.ZodEnum<{
    element: "element";
    viewport: "viewport";
    "full-page": "full-page";
}>;
/** The kinds that produce a single image. Animation kinds land in phase 4. */
export type StillCaptureKind = z.infer<typeof StillCaptureKindSchema>;
export declare const STATE_NAMES: readonly ["default", "hover", "focus", "focus-visible", "active", "checked", "selected", "expanded", "disabled", "custom"];
export declare const StateNameSchema: z.ZodEnum<{
    default: "default";
    hover: "hover";
    focus: "focus";
    "focus-visible": "focus-visible";
    active: "active";
    checked: "checked";
    selected: "selected";
    expanded: "expanded";
    disabled: "disabled";
    custom: "custom";
}>;
export type StateName = z.infer<typeof StateNameSchema>;
/**
 * How a captured state came to be.
 * - `observed`   the page was already in this state; nothing was done to it.
 * - `interacted` a real user-equivalent interaction produced it (hover, focus,
 *                mouse-down, keyboard navigation).
 * - `forced`     the state was synthesised (CDP forced pseudo state, injected
 *                attribute). Never present these as naturally observed.
 */
export declare const STATE_PROVENANCES: readonly ["observed", "interacted", "forced"];
export declare const StateProvenanceSchema: z.ZodEnum<{
    observed: "observed";
    interacted: "interacted";
    forced: "forced";
}>;
export type StateProvenance = z.infer<typeof StateProvenanceSchema>;
export declare const CaptureStateSchema: z.ZodObject<{
    name: z.ZodEnum<{
        default: "default";
        hover: "hover";
        focus: "focus";
        "focus-visible": "focus-visible";
        active: "active";
        checked: "checked";
        selected: "selected";
        expanded: "expanded";
        disabled: "disabled";
        custom: "custom";
    }>;
    label: z.ZodOptional<z.ZodString>;
    provenance: z.ZodEnum<{
        observed: "observed";
        interacted: "interacted";
        forced: "forced";
    }>;
    verified: z.ZodBoolean;
    verification: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CaptureState = z.infer<typeof CaptureStateSchema>;
export declare const ViewportSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    width: z.ZodNumber;
    height: z.ZodNumber;
    deviceScaleFactor: z.ZodNumber;
    mobile: z.ZodBoolean;
    hasTouch: z.ZodBoolean;
    userAgentClass: z.ZodEnum<{
        mobile: "mobile";
        desktop: "desktop";
    }>;
}, z.core.$strip>;
export type Viewport = z.infer<typeof ViewportSchema>;
export declare const FrameIdentitySchema: z.ZodObject<{
    depth: z.ZodNumber;
    url: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    selectorInParent: z.ZodOptional<z.ZodString>;
    crossOrigin: z.ZodBoolean;
}, z.core.$strip>;
export type FrameIdentity = z.infer<typeof FrameIdentitySchema>;
export declare const LOCATOR_CANDIDATE_TYPES: readonly ["role-name", "test-id", "id", "label", "placeholder", "alt", "title", "text", "css-scoped", "css-path"];
export declare const LocatorCandidateTypeSchema: z.ZodEnum<{
    label: "label";
    "role-name": "role-name";
    "test-id": "test-id";
    id: "id";
    placeholder: "placeholder";
    alt: "alt";
    title: "title";
    text: "text";
    "css-scoped": "css-scoped";
    "css-path": "css-path";
}>;
export type LocatorCandidateType = z.infer<typeof LocatorCandidateTypeSchema>;
export declare const LocatorCandidateSchema: z.ZodObject<{
    type: z.ZodEnum<{
        label: "label";
        "role-name": "role-name";
        "test-id": "test-id";
        id: "id";
        placeholder: "placeholder";
        alt: "alt";
        title: "title";
        text: "text";
        "css-scoped": "css-scoped";
        "css-path": "css-path";
    }>;
    value: z.ZodString;
    role: z.ZodOptional<z.ZodString>;
    attribute: z.ZodOptional<z.ZodString>;
    exact: z.ZodOptional<z.ZodBoolean>;
    scope: z.ZodOptional<z.ZodString>;
    uniquenessCount: z.ZodNumber;
    score: z.ZodNumber;
    reasons: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type LocatorCandidate = z.infer<typeof LocatorCandidateSchema>;
export declare const ElementIdentitySchema: z.ZodObject<{
    framePath: z.ZodArray<z.ZodObject<{
        depth: z.ZodNumber;
        url: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        selectorInParent: z.ZodOptional<z.ZodString>;
        crossOrigin: z.ZodBoolean;
    }, z.core.$strip>>;
    locatorCandidates: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<{
            label: "label";
            "role-name": "role-name";
            "test-id": "test-id";
            id: "id";
            placeholder: "placeholder";
            alt: "alt";
            title: "title";
            text: "text";
            "css-scoped": "css-scoped";
            "css-path": "css-path";
        }>;
        value: z.ZodString;
        role: z.ZodOptional<z.ZodString>;
        attribute: z.ZodOptional<z.ZodString>;
        exact: z.ZodOptional<z.ZodBoolean>;
        scope: z.ZodOptional<z.ZodString>;
        uniquenessCount: z.ZodNumber;
        score: z.ZodNumber;
        reasons: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    chosenLocator: z.ZodObject<{
        type: z.ZodEnum<{
            label: "label";
            "role-name": "role-name";
            "test-id": "test-id";
            id: "id";
            placeholder: "placeholder";
            alt: "alt";
            title: "title";
            text: "text";
            "css-scoped": "css-scoped";
            "css-path": "css-path";
        }>;
        value: z.ZodString;
        role: z.ZodOptional<z.ZodString>;
        attribute: z.ZodOptional<z.ZodString>;
        exact: z.ZodOptional<z.ZodBoolean>;
        scope: z.ZodOptional<z.ZodString>;
        uniquenessCount: z.ZodNumber;
        score: z.ZodNumber;
        reasons: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    structuralFingerprint: z.ZodString;
    tagName: z.ZodString;
    role: z.ZodOptional<z.ZodString>;
    accessibleName: z.ZodOptional<z.ZodString>;
    textExcerpt: z.ZodOptional<z.ZodString>;
    boundingBox: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>;
    shadowHostPath: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type ElementIdentity = z.infer<typeof ElementIdentitySchema>;
export declare const READINESS_CHECKS: readonly ["load-state", "fonts-ready", "images-decoded", "element-stable", "mutation-quiet", "animation-frames"];
export declare const ReadinessCheckNameSchema: z.ZodEnum<{
    "load-state": "load-state";
    "fonts-ready": "fonts-ready";
    "images-decoded": "images-decoded";
    "element-stable": "element-stable";
    "mutation-quiet": "mutation-quiet";
    "animation-frames": "animation-frames";
}>;
export type ReadinessCheckName = z.infer<typeof ReadinessCheckNameSchema>;
export declare const ReadinessCheckSchema: z.ZodObject<{
    name: z.ZodEnum<{
        "load-state": "load-state";
        "fonts-ready": "fonts-ready";
        "images-decoded": "images-decoded";
        "element-stable": "element-stable";
        "mutation-quiet": "mutation-quiet";
        "animation-frames": "animation-frames";
    }>;
    status: z.ZodEnum<{
        passed: "passed";
        "timed-out": "timed-out";
        skipped: "skipped";
        failed: "failed";
    }>;
    durationMs: z.ZodNumber;
    detail: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ReadinessCheck = z.infer<typeof ReadinessCheckSchema>;
export declare const ReadinessResultSchema: z.ZodObject<{
    startedAt: z.ZodString;
    durationMs: z.ZodNumber;
    deadlineMs: z.ZodNumber;
    deadlineExceeded: z.ZodBoolean;
    checks: z.ZodArray<z.ZodObject<{
        name: z.ZodEnum<{
            "load-state": "load-state";
            "fonts-ready": "fonts-ready";
            "images-decoded": "images-decoded";
            "element-stable": "element-stable";
            "mutation-quiet": "mutation-quiet";
            "animation-frames": "animation-frames";
        }>;
        status: z.ZodEnum<{
            passed: "passed";
            "timed-out": "timed-out";
            skipped: "skipped";
            failed: "failed";
        }>;
        durationMs: z.ZodNumber;
        detail: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    warnings: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type ReadinessResult = z.infer<typeof ReadinessResultSchema>;
export declare const StyleSnapshotSchema: z.ZodRecord<z.ZodString, z.ZodString>;
export type StyleSnapshot = z.infer<typeof StyleSnapshotSchema>;
export declare const StyleDeltaSchema: z.ZodObject<{
    changed: z.ZodRecord<z.ZodString, z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
    }, z.core.$strip>>;
    descendantVisibilityChanged: z.ZodOptional<z.ZodBoolean>;
    boundsChanged: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type StyleDelta = z.infer<typeof StyleDeltaSchema>;
/**
 * A record of what the host actually did to reach a state. Phase 3 recipes will
 * extend this vocabulary; every entry here is already produced today.
 */
export declare const RECIPE_ACTIONS: readonly ["navigate", "select", "hover", "focus", "keyboard-focus", "press", "mouse-down", "mouse-up", "scroll", "set-viewport", "force-pseudo-state", "capture"];
export declare const RecipeActionSchema: z.ZodEnum<{
    hover: "hover";
    focus: "focus";
    navigate: "navigate";
    select: "select";
    "keyboard-focus": "keyboard-focus";
    press: "press";
    "mouse-down": "mouse-down";
    "mouse-up": "mouse-up";
    scroll: "scroll";
    "set-viewport": "set-viewport";
    "force-pseudo-state": "force-pseudo-state";
    capture: "capture";
}>;
export type RecipeAction = z.infer<typeof RecipeActionSchema>;
export declare const RecipeStepSchema: z.ZodObject<{
    action: z.ZodEnum<{
        hover: "hover";
        focus: "focus";
        navigate: "navigate";
        select: "select";
        "keyboard-focus": "keyboard-focus";
        press: "press";
        "mouse-down": "mouse-down";
        "mouse-up": "mouse-up";
        scroll: "scroll";
        "set-viewport": "set-viewport";
        "force-pseudo-state": "force-pseudo-state";
        capture: "capture";
    }>;
    target: z.ZodOptional<z.ZodString>;
    detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    atMs: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type RecipeStep = z.infer<typeof RecipeStepSchema>;
export declare const AnimationSampleSchema: z.ZodObject<{
    animationId: z.ZodString;
    progress: z.ZodNumber;
    currentTimeMs: z.ZodNumber;
    durationMs: z.ZodOptional<z.ZodNumber>;
    easing: z.ZodOptional<z.ZodString>;
    playState: z.ZodOptional<z.ZodString>;
    method: z.ZodEnum<{
        "web-animations": "web-animations";
        cdp: "cdp";
        screencast: "screencast";
    }>;
    limitations: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type AnimationSample = z.infer<typeof AnimationSampleSchema>;
export declare const ImageRefSchema: z.ZodObject<{
    relativePath: z.ZodString;
    sha256: z.ZodString;
    width: z.ZodNumber;
    height: z.ZodNumber;
    byteLength: z.ZodNumber;
}, z.core.$strip>;
export type ImageRef = z.infer<typeof ImageRefSchema>;
export declare const CAPTURE_STATUSES: readonly ["captured", "failed", "skipped"];
export declare const CaptureStatusSchema: z.ZodEnum<{
    skipped: "skipped";
    failed: "failed";
    captured: "captured";
}>;
export type CaptureStatus = z.infer<typeof CaptureStatusSchema>;
export declare const CaptureSetSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodEnum<{
        state: "state";
        responsive: "responsive";
        animation: "animation";
    }>;
    member: z.ZodString;
}, z.core.$strip>;
export type CaptureSet = z.infer<typeof CaptureSetSchema>;
export declare const CaptureRecordSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    id: z.ZodString;
    runId: z.ZodString;
    project: z.ZodString;
    sourceUrl: z.ZodString;
    finalUrl: z.ZodString;
    routeKey: z.ZodString;
    capturedAt: z.ZodString;
    kind: z.ZodEnum<{
        element: "element";
        viewport: "viewport";
        "full-page": "full-page";
        "animation-frame": "animation-frame";
        "animation-video": "animation-video";
    }>;
    status: z.ZodEnum<{
        skipped: "skipped";
        failed: "failed";
        captured: "captured";
    }>;
    state: z.ZodObject<{
        name: z.ZodEnum<{
            default: "default";
            hover: "hover";
            focus: "focus";
            "focus-visible": "focus-visible";
            active: "active";
            checked: "checked";
            selected: "selected";
            expanded: "expanded";
            disabled: "disabled";
            custom: "custom";
        }>;
        label: z.ZodOptional<z.ZodString>;
        provenance: z.ZodEnum<{
            observed: "observed";
            interacted: "interacted";
            forced: "forced";
        }>;
        verified: z.ZodBoolean;
        verification: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    viewport: z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        width: z.ZodNumber;
        height: z.ZodNumber;
        deviceScaleFactor: z.ZodNumber;
        mobile: z.ZodBoolean;
        hasTouch: z.ZodBoolean;
        userAgentClass: z.ZodEnum<{
            mobile: "mobile";
            desktop: "desktop";
        }>;
    }, z.core.$strip>;
    element: z.ZodOptional<z.ZodObject<{
        framePath: z.ZodArray<z.ZodObject<{
            depth: z.ZodNumber;
            url: z.ZodString;
            name: z.ZodOptional<z.ZodString>;
            selectorInParent: z.ZodOptional<z.ZodString>;
            crossOrigin: z.ZodBoolean;
        }, z.core.$strip>>;
        locatorCandidates: z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<{
                label: "label";
                "role-name": "role-name";
                "test-id": "test-id";
                id: "id";
                placeholder: "placeholder";
                alt: "alt";
                title: "title";
                text: "text";
                "css-scoped": "css-scoped";
                "css-path": "css-path";
            }>;
            value: z.ZodString;
            role: z.ZodOptional<z.ZodString>;
            attribute: z.ZodOptional<z.ZodString>;
            exact: z.ZodOptional<z.ZodBoolean>;
            scope: z.ZodOptional<z.ZodString>;
            uniquenessCount: z.ZodNumber;
            score: z.ZodNumber;
            reasons: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
        chosenLocator: z.ZodObject<{
            type: z.ZodEnum<{
                label: "label";
                "role-name": "role-name";
                "test-id": "test-id";
                id: "id";
                placeholder: "placeholder";
                alt: "alt";
                title: "title";
                text: "text";
                "css-scoped": "css-scoped";
                "css-path": "css-path";
            }>;
            value: z.ZodString;
            role: z.ZodOptional<z.ZodString>;
            attribute: z.ZodOptional<z.ZodString>;
            exact: z.ZodOptional<z.ZodBoolean>;
            scope: z.ZodOptional<z.ZodString>;
            uniquenessCount: z.ZodNumber;
            score: z.ZodNumber;
            reasons: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
        structuralFingerprint: z.ZodString;
        tagName: z.ZodString;
        role: z.ZodOptional<z.ZodString>;
        accessibleName: z.ZodOptional<z.ZodString>;
        textExcerpt: z.ZodOptional<z.ZodString>;
        boundingBox: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            width: z.ZodNumber;
            height: z.ZodNumber;
        }, z.core.$strip>;
        shadowHostPath: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    interactionRecipe: z.ZodOptional<z.ZodArray<z.ZodObject<{
        action: z.ZodEnum<{
            hover: "hover";
            focus: "focus";
            navigate: "navigate";
            select: "select";
            "keyboard-focus": "keyboard-focus";
            press: "press";
            "mouse-down": "mouse-down";
            "mouse-up": "mouse-up";
            scroll: "scroll";
            "set-viewport": "set-viewport";
            "force-pseudo-state": "force-pseudo-state";
            capture: "capture";
        }>;
        target: z.ZodOptional<z.ZodString>;
        detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        atMs: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>>;
    readiness: z.ZodObject<{
        startedAt: z.ZodString;
        durationMs: z.ZodNumber;
        deadlineMs: z.ZodNumber;
        deadlineExceeded: z.ZodBoolean;
        checks: z.ZodArray<z.ZodObject<{
            name: z.ZodEnum<{
                "load-state": "load-state";
                "fonts-ready": "fonts-ready";
                "images-decoded": "images-decoded";
                "element-stable": "element-stable";
                "mutation-quiet": "mutation-quiet";
                "animation-frames": "animation-frames";
            }>;
            status: z.ZodEnum<{
                passed: "passed";
                "timed-out": "timed-out";
                skipped: "skipped";
                failed: "failed";
            }>;
            durationMs: z.ZodNumber;
            detail: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        warnings: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    styleDelta: z.ZodOptional<z.ZodObject<{
        changed: z.ZodRecord<z.ZodString, z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
        }, z.core.$strip>>;
        descendantVisibilityChanged: z.ZodOptional<z.ZodBoolean>;
        boundsChanged: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    animation: z.ZodOptional<z.ZodObject<{
        animationId: z.ZodString;
        progress: z.ZodNumber;
        currentTimeMs: z.ZodNumber;
        durationMs: z.ZodOptional<z.ZodNumber>;
        easing: z.ZodOptional<z.ZodString>;
        playState: z.ZodOptional<z.ZodString>;
        method: z.ZodEnum<{
            "web-animations": "web-animations";
            cdp: "cdp";
            screencast: "screencast";
        }>;
        limitations: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    set: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<{
            state: "state";
            responsive: "responsive";
            animation: "animation";
        }>;
        member: z.ZodString;
    }, z.core.$strip>>;
    image: z.ZodOptional<z.ZodObject<{
        relativePath: z.ZodString;
        sha256: z.ZodString;
        width: z.ZodNumber;
        height: z.ZodNumber;
        byteLength: z.ZodNumber;
    }, z.core.$strip>>;
    durationMs: z.ZodNumber;
    warnings: z.ZodArray<z.ZodString>;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodEnum<{
            "settle.timeout": "settle.timeout";
            "settle.check-failed": "settle.check-failed";
            "locator.not-found": "locator.not-found";
            "locator.ambiguous": "locator.ambiguous";
            "locator.detached": "locator.detached";
            "locator.hidden": "locator.hidden";
            "capture.failed": "capture.failed";
            "capture.timeout": "capture.timeout";
            "capture.navigation-during-capture": "capture.navigation-during-capture";
            "state.unsupported": "state.unsupported";
            "state.verification-failed": "state.verification-failed";
            "browser.launch-failed": "browser.launch-failed";
            "browser.closed": "browser.closed";
            "artifact.write-failed": "artifact.write-failed";
            "artifact.path-escape": "artifact.path-escape";
            "config.invalid": "config.invalid";
            "protocol.invalid-message": "protocol.invalid-message";
            "protocol.unknown-method": "protocol.unknown-method";
            "auth.not-found": "auth.not-found";
            internal: "internal";
        }>;
        message: z.ZodString;
        detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        cause: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CaptureRecord = z.infer<typeof CaptureRecordSchema>;
export declare const PageRecordSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    id: z.ZodString;
    runId: z.ZodString;
    requestedUrl: z.ZodString;
    finalUrl: z.ZodString;
    routeKey: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    visitedAt: z.ZodString;
    httpStatus: z.ZodOptional<z.ZodNumber>;
    readiness: z.ZodOptional<z.ZodObject<{
        startedAt: z.ZodString;
        durationMs: z.ZodNumber;
        deadlineMs: z.ZodNumber;
        deadlineExceeded: z.ZodBoolean;
        checks: z.ZodArray<z.ZodObject<{
            name: z.ZodEnum<{
                "load-state": "load-state";
                "fonts-ready": "fonts-ready";
                "images-decoded": "images-decoded";
                "element-stable": "element-stable";
                "mutation-quiet": "mutation-quiet";
                "animation-frames": "animation-frames";
            }>;
            status: z.ZodEnum<{
                passed: "passed";
                "timed-out": "timed-out";
                skipped: "skipped";
                failed: "failed";
            }>;
            durationMs: z.ZodNumber;
            detail: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        warnings: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    warnings: z.ZodArray<z.ZodString>;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodEnum<{
            "settle.timeout": "settle.timeout";
            "settle.check-failed": "settle.check-failed";
            "locator.not-found": "locator.not-found";
            "locator.ambiguous": "locator.ambiguous";
            "locator.detached": "locator.detached";
            "locator.hidden": "locator.hidden";
            "capture.failed": "capture.failed";
            "capture.timeout": "capture.timeout";
            "capture.navigation-during-capture": "capture.navigation-during-capture";
            "state.unsupported": "state.unsupported";
            "state.verification-failed": "state.verification-failed";
            "browser.launch-failed": "browser.launch-failed";
            "browser.closed": "browser.closed";
            "artifact.write-failed": "artifact.write-failed";
            "artifact.path-escape": "artifact.path-escape";
            "config.invalid": "config.invalid";
            "protocol.invalid-message": "protocol.invalid-message";
            "protocol.unknown-method": "protocol.unknown-method";
            "auth.not-found": "auth.not-found";
            internal: "internal";
        }>;
        message: z.ZodString;
        detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        cause: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type PageRecord = z.infer<typeof PageRecordSchema>;
export declare const BROWSER_MODES: readonly ["clean", "profile", "storage-state", "attach"];
export declare const BrowserModeSchema: z.ZodEnum<{
    clean: "clean";
    profile: "profile";
    "storage-state": "storage-state";
    attach: "attach";
}>;
export type BrowserMode = z.infer<typeof BrowserModeSchema>;
export declare const RunManifestSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    runId: z.ZodString;
    project: z.ZodString;
    command: z.ZodString;
    startedAt: z.ZodString;
    finishedAt: z.ZodOptional<z.ZodString>;
    toolVersion: z.ZodString;
    browser: z.ZodObject<{
        engine: z.ZodLiteral<"chromium">;
        version: z.ZodOptional<z.ZodString>;
        mode: z.ZodEnum<{
            clean: "clean";
            profile: "profile";
            "storage-state": "storage-state";
            attach: "attach";
        }>;
        headless: z.ZodBoolean;
        profileName: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    baseViewport: z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        width: z.ZodNumber;
        height: z.ZodNumber;
        deviceScaleFactor: z.ZodNumber;
        mobile: z.ZodBoolean;
        hasTouch: z.ZodBoolean;
        userAgentClass: z.ZodEnum<{
            mobile: "mobile";
            desktop: "desktop";
        }>;
    }, z.core.$strip>;
    counts: z.ZodOptional<z.ZodObject<{
        captured: z.ZodNumber;
        failed: z.ZodNumber;
        skipped: z.ZodNumber;
        pages: z.ZodNumber;
    }, z.core.$strip>>;
    warnings: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type RunManifest = z.infer<typeof RunManifestSchema>;
//# sourceMappingURL=model.d.ts.map