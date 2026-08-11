import { z } from 'zod';
/**
 * Normalised, DOM-free facts about an element that the host hashes into a
 * structural fingerprint. Deliberately excludes transient class hashes,
 * absolute page coordinates and user data.
 */
export declare const FingerprintInputSchema: z.ZodObject<{
    tagName: z.ZodString;
    role: z.ZodOptional<z.ZodString>;
    nameClass: z.ZodString;
    stableAttributes: z.ZodRecord<z.ZodString, z.ZodString>;
    ancestorRoles: z.ZodArray<z.ZodString>;
    geometryBucket: z.ZodString;
}, z.core.$strip>;
export type FingerprintInput = z.infer<typeof FingerprintInputSchema>;
export declare const ElementProbeSchema: z.ZodObject<{
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
    visible: z.ZodBoolean;
    candidates: z.ZodArray<z.ZodObject<{
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
    fingerprintInput: z.ZodObject<{
        tagName: z.ZodString;
        role: z.ZodOptional<z.ZodString>;
        nameClass: z.ZodString;
        stableAttributes: z.ZodRecord<z.ZodString, z.ZodString>;
        ancestorRoles: z.ZodArray<z.ZodString>;
        geometryBucket: z.ZodString;
    }, z.core.$strip>;
    shadowHostPath: z.ZodArray<z.ZodString>;
    closedShadowEncountered: z.ZodBoolean;
    attributes: z.ZodRecord<z.ZodString, z.ZodString>;
}, z.core.$strip>;
export type ElementProbe = z.infer<typeof ElementProbeSchema>;
export declare const CaptureRequestSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        element: "element";
        viewport: "viewport";
        "full-page": "full-page";
        "animation-frame": "animation-frame";
        "animation-video": "animation-video";
    }>;
    states: z.ZodDefault<z.ZodArray<z.ZodEnum<{
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
    }>>>;
    includeOverlay: z.ZodDefault<z.ZodBoolean>;
    responsive: z.ZodDefault<z.ZodBoolean>;
    label: z.ZodOptional<z.ZodString>;
    probe: z.ZodOptional<z.ZodObject<{
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
        visible: z.ZodBoolean;
        candidates: z.ZodArray<z.ZodObject<{
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
        fingerprintInput: z.ZodObject<{
            tagName: z.ZodString;
            role: z.ZodOptional<z.ZodString>;
            nameClass: z.ZodString;
            stableAttributes: z.ZodRecord<z.ZodString, z.ZodString>;
            ancestorRoles: z.ZodArray<z.ZodString>;
            geometryBucket: z.ZodString;
        }, z.core.$strip>;
        shadowHostPath: z.ZodArray<z.ZodString>;
        closedShadowEncountered: z.ZodBoolean;
        attributes: z.ZodRecord<z.ZodString, z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CaptureRequest = z.infer<typeof CaptureRequestSchema>;
export declare const QUEUE_JOB_STATUSES: readonly ["queued", "running", "done", "failed", "cancelled"];
export declare const QueueJobStatusSchema: z.ZodEnum<{
    failed: "failed";
    queued: "queued";
    running: "running";
    done: "done";
    cancelled: "cancelled";
}>;
export type QueueJobStatus = z.infer<typeof QueueJobStatusSchema>;
export declare const QueueJobSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodString;
    kind: z.ZodEnum<{
        element: "element";
        viewport: "viewport";
        "full-page": "full-page";
        "animation-frame": "animation-frame";
        "animation-video": "animation-video";
    }>;
    states: z.ZodArray<z.ZodEnum<{
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
    }>>;
    label: z.ZodString;
    status: z.ZodEnum<{
        failed: "failed";
        queued: "queued";
        running: "running";
        done: "done";
        cancelled: "cancelled";
    }>;
    progress: z.ZodOptional<z.ZodString>;
    captureIds: z.ZodArray<z.ZodString>;
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
export type QueueJob = z.infer<typeof QueueJobSchema>;
export declare const OverlaySessionSchema: z.ZodObject<{
    protocolVersion: z.ZodLiteral<1>;
    runId: z.ZodString;
    project: z.ZodString;
    outputLabel: z.ZodString;
    viewportPresets: z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>;
    shortcuts: z.ZodRecord<z.ZodString, z.ZodString>;
    capabilities: z.ZodObject<{
        fullPage: z.ZodBoolean;
        responsive: z.ZodBoolean;
        animation: z.ZodBoolean;
        states: z.ZodArray<z.ZodEnum<{
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
        }>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type OverlaySession = z.infer<typeof OverlaySessionSchema>;
export declare const BridgeRequestSchema: z.ZodObject<{
    v: z.ZodLiteral<1>;
    token: z.ZodString;
    id: z.ZodString;
    method: z.ZodString;
    params: z.ZodUnknown;
}, z.core.$strip>;
export type BridgeRequest = z.infer<typeof BridgeRequestSchema>;
export declare const BridgeResponseSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    ok: z.ZodLiteral<true>;
    id: z.ZodString;
    result: z.ZodUnknown;
}, z.core.$strip>, z.ZodObject<{
    ok: z.ZodLiteral<false>;
    id: z.ZodString;
    error: z.ZodObject<{
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
    }, z.core.$strip>;
}, z.core.$strip>], "ok">;
export type BridgeResponse = z.infer<typeof BridgeResponseSchema>;
export declare const HelloParamsSchema: z.ZodObject<{
    overlayVersion: z.ZodString;
    url: z.ZodString;
}, z.core.$strip>;
export declare const HelloResultSchema: z.ZodObject<{
    session: z.ZodObject<{
        protocolVersion: z.ZodLiteral<1>;
        runId: z.ZodString;
        project: z.ZodString;
        outputLabel: z.ZodString;
        viewportPresets: z.ZodArray<z.ZodObject<{
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
        }, z.core.$strip>>;
        shortcuts: z.ZodRecord<z.ZodString, z.ZodString>;
        capabilities: z.ZodObject<{
            fullPage: z.ZodBoolean;
            responsive: z.ZodBoolean;
            animation: z.ZodBoolean;
            states: z.ZodArray<z.ZodEnum<{
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
            }>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const SelectParamsSchema: z.ZodObject<{
    probe: z.ZodObject<{
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
        visible: z.ZodBoolean;
        candidates: z.ZodArray<z.ZodObject<{
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
        fingerprintInput: z.ZodObject<{
            tagName: z.ZodString;
            role: z.ZodOptional<z.ZodString>;
            nameClass: z.ZodString;
            stableAttributes: z.ZodRecord<z.ZodString, z.ZodString>;
            ancestorRoles: z.ZodArray<z.ZodString>;
            geometryBucket: z.ZodString;
        }, z.core.$strip>;
        shadowHostPath: z.ZodArray<z.ZodString>;
        closedShadowEncountered: z.ZodBoolean;
        attributes: z.ZodRecord<z.ZodString, z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const SelectResultSchema: z.ZodObject<{
    identity: z.ZodObject<{
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
    resolution: z.ZodObject<{
        matches: z.ZodNumber;
        usedCandidateIndex: z.ZodNumber;
        fellBack: z.ZodBoolean;
    }, z.core.$strip>;
    warnings: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const ClearSelectionParamsSchema: z.ZodObject<{}, z.core.$strip>;
export declare const CaptureResultSchema: z.ZodObject<{
    jobs: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        createdAt: z.ZodString;
        kind: z.ZodEnum<{
            element: "element";
            viewport: "viewport";
            "full-page": "full-page";
            "animation-frame": "animation-frame";
            "animation-video": "animation-video";
        }>;
        states: z.ZodArray<z.ZodEnum<{
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
        }>>;
        label: z.ZodString;
        status: z.ZodEnum<{
            failed: "failed";
            queued: "queued";
            running: "running";
            done: "done";
            cancelled: "cancelled";
        }>;
        progress: z.ZodOptional<z.ZodString>;
        captureIds: z.ZodArray<z.ZodString>;
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
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const QueueListParamsSchema: z.ZodObject<{}, z.core.$strip>;
export declare const QueueListResultSchema: z.ZodObject<{
    jobs: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        createdAt: z.ZodString;
        kind: z.ZodEnum<{
            element: "element";
            viewport: "viewport";
            "full-page": "full-page";
            "animation-frame": "animation-frame";
            "animation-video": "animation-video";
        }>;
        states: z.ZodArray<z.ZodEnum<{
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
        }>>;
        label: z.ZodString;
        status: z.ZodEnum<{
            failed: "failed";
            queued: "queued";
            running: "running";
            done: "done";
            cancelled: "cancelled";
        }>;
        progress: z.ZodOptional<z.ZodString>;
        captureIds: z.ZodArray<z.ZodString>;
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
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const SetViewportParamsSchema: z.ZodObject<{
    width: z.ZodNumber;
    height: z.ZodNumber;
    presetName: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const SetViewportResultSchema: z.ZodObject<{
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
}, z.core.$strip>;
export declare const InspectModeParamsSchema: z.ZodObject<{
    active: z.ZodBoolean;
}, z.core.$strip>;
export declare const InspectModeResultSchema: z.ZodObject<{
    active: z.ZodBoolean;
}, z.core.$strip>;
export declare const LogParamsSchema: z.ZodObject<{
    level: z.ZodEnum<{
        error: "error";
        debug: "debug";
        info: "info";
        warn: "warn";
    }>;
    message: z.ZodString;
    detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export declare const BRIDGE_METHODS: {
    readonly hello: {
        readonly params: z.ZodObject<{
            overlayVersion: z.ZodString;
            url: z.ZodString;
        }, z.core.$strip>;
        readonly result: z.ZodObject<{
            session: z.ZodObject<{
                protocolVersion: z.ZodLiteral<1>;
                runId: z.ZodString;
                project: z.ZodString;
                outputLabel: z.ZodString;
                viewportPresets: z.ZodArray<z.ZodObject<{
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
                }, z.core.$strip>>;
                shortcuts: z.ZodRecord<z.ZodString, z.ZodString>;
                capabilities: z.ZodObject<{
                    fullPage: z.ZodBoolean;
                    responsive: z.ZodBoolean;
                    animation: z.ZodBoolean;
                    states: z.ZodArray<z.ZodEnum<{
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
                    }>>;
                }, z.core.$strip>;
            }, z.core.$strip>;
        }, z.core.$strip>;
    };
    readonly 'element/selected': {
        readonly params: z.ZodObject<{
            probe: z.ZodObject<{
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
                visible: z.ZodBoolean;
                candidates: z.ZodArray<z.ZodObject<{
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
                fingerprintInput: z.ZodObject<{
                    tagName: z.ZodString;
                    role: z.ZodOptional<z.ZodString>;
                    nameClass: z.ZodString;
                    stableAttributes: z.ZodRecord<z.ZodString, z.ZodString>;
                    ancestorRoles: z.ZodArray<z.ZodString>;
                    geometryBucket: z.ZodString;
                }, z.core.$strip>;
                shadowHostPath: z.ZodArray<z.ZodString>;
                closedShadowEncountered: z.ZodBoolean;
                attributes: z.ZodRecord<z.ZodString, z.ZodString>;
            }, z.core.$strip>;
        }, z.core.$strip>;
        readonly result: z.ZodObject<{
            identity: z.ZodObject<{
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
            resolution: z.ZodObject<{
                matches: z.ZodNumber;
                usedCandidateIndex: z.ZodNumber;
                fellBack: z.ZodBoolean;
            }, z.core.$strip>;
            warnings: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
    };
    readonly 'element/cleared': {
        readonly params: z.ZodObject<{}, z.core.$strip>;
        readonly result: z.ZodObject<{}, z.core.$strip>;
    };
    readonly 'capture/request': {
        readonly params: z.ZodObject<{
            kind: z.ZodEnum<{
                element: "element";
                viewport: "viewport";
                "full-page": "full-page";
                "animation-frame": "animation-frame";
                "animation-video": "animation-video";
            }>;
            states: z.ZodDefault<z.ZodArray<z.ZodEnum<{
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
            }>>>;
            includeOverlay: z.ZodDefault<z.ZodBoolean>;
            responsive: z.ZodDefault<z.ZodBoolean>;
            label: z.ZodOptional<z.ZodString>;
            probe: z.ZodOptional<z.ZodObject<{
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
                visible: z.ZodBoolean;
                candidates: z.ZodArray<z.ZodObject<{
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
                fingerprintInput: z.ZodObject<{
                    tagName: z.ZodString;
                    role: z.ZodOptional<z.ZodString>;
                    nameClass: z.ZodString;
                    stableAttributes: z.ZodRecord<z.ZodString, z.ZodString>;
                    ancestorRoles: z.ZodArray<z.ZodString>;
                    geometryBucket: z.ZodString;
                }, z.core.$strip>;
                shadowHostPath: z.ZodArray<z.ZodString>;
                closedShadowEncountered: z.ZodBoolean;
                attributes: z.ZodRecord<z.ZodString, z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        readonly result: z.ZodObject<{
            jobs: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                createdAt: z.ZodString;
                kind: z.ZodEnum<{
                    element: "element";
                    viewport: "viewport";
                    "full-page": "full-page";
                    "animation-frame": "animation-frame";
                    "animation-video": "animation-video";
                }>;
                states: z.ZodArray<z.ZodEnum<{
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
                }>>;
                label: z.ZodString;
                status: z.ZodEnum<{
                    failed: "failed";
                    queued: "queued";
                    running: "running";
                    done: "done";
                    cancelled: "cancelled";
                }>;
                progress: z.ZodOptional<z.ZodString>;
                captureIds: z.ZodArray<z.ZodString>;
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
            }, z.core.$strip>>;
        }, z.core.$strip>;
    };
    readonly 'queue/list': {
        readonly params: z.ZodObject<{}, z.core.$strip>;
        readonly result: z.ZodObject<{
            jobs: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                createdAt: z.ZodString;
                kind: z.ZodEnum<{
                    element: "element";
                    viewport: "viewport";
                    "full-page": "full-page";
                    "animation-frame": "animation-frame";
                    "animation-video": "animation-video";
                }>;
                states: z.ZodArray<z.ZodEnum<{
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
                }>>;
                label: z.ZodString;
                status: z.ZodEnum<{
                    failed: "failed";
                    queued: "queued";
                    running: "running";
                    done: "done";
                    cancelled: "cancelled";
                }>;
                progress: z.ZodOptional<z.ZodString>;
                captureIds: z.ZodArray<z.ZodString>;
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
            }, z.core.$strip>>;
        }, z.core.$strip>;
    };
    readonly 'viewport/set': {
        readonly params: z.ZodObject<{
            width: z.ZodNumber;
            height: z.ZodNumber;
            presetName: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly result: z.ZodObject<{
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
        }, z.core.$strip>;
    };
    readonly 'inspect/mode': {
        readonly params: z.ZodObject<{
            active: z.ZodBoolean;
        }, z.core.$strip>;
        readonly result: z.ZodObject<{
            active: z.ZodBoolean;
        }, z.core.$strip>;
    };
    readonly log: {
        readonly params: z.ZodObject<{
            level: z.ZodEnum<{
                error: "error";
                debug: "debug";
                info: "info";
                warn: "warn";
            }>;
            message: z.ZodString;
            detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>;
        readonly result: z.ZodObject<{}, z.core.$strip>;
    };
};
export type BridgeMethod = keyof typeof BRIDGE_METHODS;
export type BridgeParams<M extends BridgeMethod> = z.infer<(typeof BRIDGE_METHODS)[M]['params']>;
export type BridgeResult<M extends BridgeMethod> = z.infer<(typeof BRIDGE_METHODS)[M]['result']>;
export declare function isBridgeMethod(value: string): value is BridgeMethod;
export declare const HostEventSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"queue/update">;
    job: z.ZodObject<{
        id: z.ZodString;
        createdAt: z.ZodString;
        kind: z.ZodEnum<{
            element: "element";
            viewport: "viewport";
            "full-page": "full-page";
            "animation-frame": "animation-frame";
            "animation-video": "animation-video";
        }>;
        states: z.ZodArray<z.ZodEnum<{
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
        }>>;
        label: z.ZodString;
        status: z.ZodEnum<{
            failed: "failed";
            queued: "queued";
            running: "running";
            done: "done";
            cancelled: "cancelled";
        }>;
        progress: z.ZodOptional<z.ZodString>;
        captureIds: z.ZodArray<z.ZodString>;
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
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"session/update">;
    session: z.ZodObject<{
        protocolVersion: z.ZodLiteral<1>;
        runId: z.ZodString;
        project: z.ZodString;
        outputLabel: z.ZodString;
        viewportPresets: z.ZodArray<z.ZodObject<{
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
        }, z.core.$strip>>;
        shortcuts: z.ZodRecord<z.ZodString, z.ZodString>;
        capabilities: z.ZodObject<{
            fullPage: z.ZodBoolean;
            responsive: z.ZodBoolean;
            animation: z.ZodBoolean;
            states: z.ZodArray<z.ZodEnum<{
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
            }>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"notice">;
    level: z.ZodEnum<{
        error: "error";
        info: "info";
        warn: "warn";
    }>;
    message: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"selection/invalidated">;
    reason: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"inspect/mode">;
    active: z.ZodBoolean;
}, z.core.$strip>], "type">;
export type HostEvent = z.infer<typeof HostEventSchema>;
/** Bootstrap options handed to the injected overlay at document start. */
export declare const OverlayBootstrapSchema: z.ZodObject<{
    token: z.ZodString;
    version: z.ZodString;
    autoInspect: z.ZodBoolean;
    shortcuts: z.ZodRecord<z.ZodString, z.ZodString>;
}, z.core.$strip>;
export type OverlayBootstrap = z.infer<typeof OverlayBootstrapSchema>;
//# sourceMappingURL=messages.d.ts.map