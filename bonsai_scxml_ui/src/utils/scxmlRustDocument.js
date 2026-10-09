class WorkflowXmlNode {
    constructor(localName, attributes = {}, children = [], nodeName = null) {
        this.localName = localName;
        this.nodeName = nodeName || localName;
        this.children = children;
        this.attributes = new Map(
            Object.entries(attributes).filter(
                ([, value]) => value !== undefined && value !== null
            )
        );
    }

    getAttribute(name) {
        return this.attributes.has(name)
            ? String(this.attributes.get(name))
            : null;
    }

    getElementsByTagName(name) {
        const matches = [];
        const visit = (node) => {
            for (const child of node.children || []) {
                if (name === "*" || child.localName === name) {
                    matches.push(child);
                }
                visit(child);
            }
        };
        visit(this);
        return matches;
    }

    querySelector(selector) {
        // This is the only selector used by scxmlImport.js.
        if (selector === ":scope > state") {
            return this.children.find((child) => child.localName === "state") || null;
        }
        return null;
    }
}

const xmlNode = (localName, attributes = {}, children = [], nodeName = null) =>
    new WorkflowXmlNode(localName, attributes, children, nodeName);

const assignmentNodes = (assignments = []) =>
    (assignments || []).map((assignment) =>
        xmlNode("assign", {
            location: assignment?.location || "",
            expr: assignment?.expression || "",
        })
    );

const actionNode = (name, assignments = []) => {
    const children = assignmentNodes(assignments);
    return children.length > 0 ? xmlNode(name, {}, children) : null;
};

const stateTagName = (state) => {
    if (state?.kind === "parallel") return "parallel";
    if (state?.kind === "final") return "final";
    return "state";
};

const buildMetadataNode = (state) => {
    const editor = state?.editor || {};
    const positions = Array.isArray(editor.positions) ? editor.positions : [];
    const routes = Array.isArray(editor.edgeTargets) ? editor.edgeTargets : [];
    const children = [];

    if (positions.length > 0) {
        positions.forEach((position) => {
            children.push(
                xmlNode(
                    "position",
                    {
                        x: position?.x ?? 0,
                        y: position?.y ?? 0,
                        instance: position?.instanceId || undefined,
                        clone: position?.cloneType || undefined,
                    },
                    [],
                    "editor:position"
                )
            );
        });
    } else if (Number(editor.x) !== 0 || Number(editor.y) !== 0) {
        children.push(
            xmlNode(
                "position",
                { x: editor.x || 0, y: editor.y || 0 },
                [],
                "editor:position"
            )
        );
    }

    routes.forEach((route) => {
        children.push(
            xmlNode(
                "edgeTarget",
                {
                    event: route?.event || "",
                    target: route?.targetScxmlId || "",
                    occurrence: route?.occurrence ?? 0,
                    instance: route?.targetInstanceId || "",
                },
                [],
                "editor:edgeTarget"
            )
        );
    });

    return children.length > 0 ? xmlNode("metadata", {}, children) : null;
};

const buildLocalDatamodelNode = (state) => {
    const entries = Array.isArray(state?.parameters) ? state.parameters : [];
    if (entries.length === 0) return null;

    return xmlNode(
        "datamodel",
        {},
        entries.map((entry) =>
            xmlNode("data", {
                id: entry?.key || "",
                expr: entry?.expression || "",
                type: entry?.typeName || undefined,
            })
        )
    );
};

const buildTransitionNode = (transition) => {
    const children = [
        ...assignmentNodes(transition?.assignments || []),
        ...(transition?.sentEvents || []).map((event) =>
            xmlNode("send", { event })
        ),
    ];

    return xmlNode(
        "transition",
        {
            event: transition?.event || undefined,
            target: transition?.targetScxmlId || undefined,
            cond: transition?.condition || undefined,
        },
        children
    );
};

const buildRootDatamodelNode = (workflow) => {
    const dataEntries = (workflow?.dataModel || []).map((entry) =>
        xmlNode("data", {
            id: entry?.id || "",
            expr: entry?.expression || "",
            type: entry?.typeName || undefined,
        })
    );

    const slots = Array.isArray(workflow?.slotDeclarations)
        ? workflow.slotDeclarations
        : [];
    if (slots.length > 0) {
        const slotNodes = slots.map((slot) =>
            xmlNode(slot?.inherited ? "inheritSlot" : "slot", {
                key: slot?.key || "",
                state: slot?.state || "",
                xpath: slot?.xpath || "",
            })
        );
        dataEntries.push(
            xmlNode(
                "data",
                { id: "#_SLOTS" },
                [xmlNode("slots", {}, slotNodes)]
            )
        );
    }

    return dataEntries.length > 0
        ? xmlNode("datamodel", {}, dataEntries)
        : null;
};

/**
 * Convert WorkflowDto into the minimal document/element surface consumed by
 * the legacy graph projection in scxmlImport.js.
 */
export const workflowDtoToScxmlDocument = (workflow) => {
    const states = Array.isArray(workflow?.states) ? workflow.states : [];
    const transitions = Array.isArray(workflow?.transitions)
        ? workflow.transitions
        : [];

    const childrenByParent = new Map();
    states.forEach((state) => {
        const parentKey = state?.parentId || null;
        if (!childrenByParent.has(parentKey)) {
            childrenByParent.set(parentKey, []);
        }
        childrenByParent.get(parentKey).push(state);
    });

    const transitionsBySource = new Map();
    transitions.forEach((transition) => {
        const sourceId = transition?.sourceStateId;
        if (!sourceId) return;
        if (!transitionsBySource.has(sourceId)) {
            transitionsBySource.set(sourceId, []);
        }
        transitionsBySource.get(sourceId).push(transition);
    });

    const buildState = (state) => {
        const children = [];
        const metadata = buildMetadataNode(state);
        const datamodel = buildLocalDatamodelNode(state);
        const onEntry = actionNode("onentry", state?.onEntry);
        const onExit = actionNode("onexit", state?.onExit);

        if (metadata) children.push(metadata);
        if (datamodel) children.push(datamodel);
        if (onEntry) children.push(onEntry);
        if (onExit) children.push(onExit);

        (transitionsBySource.get(state?.id) || []).forEach((transition) => {
            children.push(buildTransitionNode(transition));
        });

        (childrenByParent.get(state?.id) || []).forEach((childState) => {
            children.push(buildState(childState));
        });

        return xmlNode(
            stateTagName(state),
            {
                id: state?.scxmlId || state?.fullSkillName || state?.label || "",
                src: state?.source || undefined,
                initial: state?.initialChildScxmlId || undefined,
                final: state?.kind === "final" ? "true" : undefined,
            },
            children
        );
    };

    const rootChildren = [];
    const rootDatamodel = buildRootDatamodelNode(workflow);
    if (rootDatamodel) rootChildren.push(rootDatamodel);
    (childrenByParent.get(null) || []).forEach((state) => {
        rootChildren.push(buildState(state));
    });

    const root = xmlNode(
        "scxml",
        {
            initial: workflow?.initialScxmlStateId || undefined,
            name: workflow?.name || undefined,
        },
        rootChildren
    );

    return {
        getElementsByTagName(name) {
            if (name === "scxml" || name === "*") {
                if (name === "scxml") return [root];
                return [root, ...root.getElementsByTagName("*")];
            }
            return root.getElementsByTagName(name);
        },
    };
};
