use std::collections::{HashMap, HashSet};

use crate::core::model::{Assignment, State, StateKind, Transition, Workflow};

struct SerializationIndex<'a> {
    states_by_id: HashMap<&'a str, &'a State>,
    children_by_parent: HashMap<&'a str, Vec<&'a State>>,
    transitions_by_source: HashMap<&'a str, Vec<&'a Transition>>,
}

impl<'a> SerializationIndex<'a> {
    fn new(workflow: &'a Workflow) -> Self {
        let mut index = Self {
            states_by_id: HashMap::new(),
            children_by_parent: HashMap::new(),
            transitions_by_source: HashMap::new(),
        };
        // Buckets retain vector order and original instances, even for duplicate ids.
        for state in &workflow.states {
            index.states_by_id.insert(state.id.as_str(), state);
            if let Some(parent_id) = state.parent_id.as_deref() {
                index
                    .children_by_parent
                    .entry(parent_id)
                    .or_default()
                    .push(state);
            }
        }
        for transition in &workflow.transitions {
            index
                .transitions_by_source
                .entry(transition.source_state_id.as_str())
                .or_default()
                .push(transition);
        }
        index
    }
}

pub(crate) fn serialize_scxml(workflow: &Workflow) -> Result<String, String> {
    let index = SerializationIndex::new(workflow);
    validate_parent_links(workflow, &index.states_by_id)?;

    let initial_scxml_id = workflow
        .initial_scxml_state_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            workflow.initial_state_id.as_deref().and_then(|id| {
                index
                    .states_by_id
                    .get(id)
                    .map(|state| state.scxml_id.as_str())
            })
        })
        .or_else(|| {
            workflow
                .states
                .iter()
                .find(|state| state.parent_id.is_none() && state.is_initial)
                .map(|state| state.scxml_id.as_str())
        })
        .or_else(|| {
            workflow
                .states
                .iter()
                .find(|state| state.parent_id.is_none())
                .map(|state| state.scxml_id.as_str())
        })
        .unwrap_or_default();

    let mut output = String::new();
    output.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    output.push_str("<scxml xmlns=\"http://www.w3.org/2005/07/scxml\"\n");
    output.push_str("       xmlns:editor=\"http://bonsai.cit-ec.uni-bielefeld.de/editor\"\n");
    output.push_str("       version=\"1.0\"");
    if !initial_scxml_id.is_empty() {
        output.push_str(&format!(
            "\n       initial=\"{}\"",
            escape_attr(initial_scxml_id)
        ));
    }
    if let Some(name) = workflow
        .name
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        output.push_str(&format!("\n       name=\"{}\"", escape_attr(name)));
    }
    output.push_str(">\n\n");

    render_root_datamodel(workflow, &mut output);

    let mut visiting = HashSet::new();
    for state in workflow
        .states
        .iter()
        .filter(|state| state.parent_id.is_none())
    {
        output.push('\n');
        render_state(state, 1, &index, &mut visiting, &mut output)?;
        output.push('\n');
    }

    output.push_str("\n</scxml>\n");
    Ok(output)
}

fn validate_parent_links(
    workflow: &Workflow,
    states_by_id: &HashMap<&str, &State>,
) -> Result<(), String> {
    for state in &workflow.states {
        if let Some(parent_id) = state.parent_id.as_deref() {
            if !states_by_id.contains_key(parent_id) {
                return Err(format!(
                    "State '{}' references missing parent '{}'.",
                    state.id, parent_id
                ));
            }
        }
    }
    Ok(())
}

fn render_root_datamodel(workflow: &Workflow, output: &mut String) {
    // The editor has historically emitted a root <datamodel> even when it is
    // empty. Keep that stable for desktop Rust serialization so a save does not
    // introduce an avoidable structural diff in otherwise unchanged files.
    output.push_str("    <datamodel>\n");

    let render_slots = |output: &mut String| {
        if workflow.slot_declarations.is_empty() {
            return;
        }
        output.push_str("        <data id=\"#_SLOTS\">\n");
        output.push_str("            <slots>\n");
        for slot in &workflow.slot_declarations {
            let tag = if slot.inherited {
                "inheritSlot"
            } else {
                "slot"
            };
            output.push_str(&format!("                <{}", tag));
            if slot.inherited || !slot.key.is_empty() {
                output.push_str(&format!(" key=\"{}\"", escape_attr(&slot.key)));
            }
            if slot.inherited || !slot.state.is_empty() {
                output.push_str(&format!(" state=\"{}\"", escape_attr(&slot.state)));
            }
            output.push_str(&format!(" xpath=\"{}\"/>\n", escape_attr(&slot.xpath)));
        }
        output.push_str("            </slots>\n");
        output.push_str("        </data>\n");
    };

    for (index, entry) in workflow.data_model.iter().enumerate() {
        output.push_str(&format!(
            "        <data id=\"{}\" expr=\"{}\"{} />\n",
            escape_attr(&entry.id),
            escape_attr(&entry.expression),
            entry
                .type_name
                .as_deref()
                .filter(|value| !value.is_empty())
                .map(|value| format!(" type=\"{}\"", escape_attr(value)))
                .unwrap_or_default()
        ));

        // Match the historical JS exporter: #_SLOTS is placed directly after
        // the first root datamodel entry (normally #_STATE_PREFIX).
        if index == 0 {
            render_slots(output);
        }
    }

    if workflow.data_model.is_empty() {
        render_slots(output);
    }

    output.push_str("    </datamodel>\n");
}

fn render_state<'a>(
    state: &'a State,
    depth: usize,
    index: &SerializationIndex<'a>,
    visiting: &mut HashSet<&'a str>,
    output: &mut String,
) -> Result<(), String> {
    if !visiting.insert(state.id.as_str()) {
        return Err(format!(
            "Cycle detected in state parent graph at '{}'.",
            state.id
        ));
    }

    let indent = "    ".repeat(depth);
    let tag = match state.kind {
        StateKind::Parallel => "parallel",
        StateKind::Final => "final",
        _ => "state",
    };

    output.push_str(&format!(
        "{}<{} id=\"{}\"",
        indent,
        tag,
        escape_attr(&state.scxml_id)
    ));

    if matches!(state.kind, StateKind::Submachine) {
        if let Some(source) = state
            .source
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            output.push_str(&format!(" src=\"{}\"", escape_attr(source)));
        }
    }

    let initial_scxml_id = state
        .initial_child_scxml_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            state.initial_child_id.as_deref().and_then(|id| {
                index
                    .states_by_id
                    .get(id)
                    .map(|child| child.scxml_id.as_str())
            })
        });
    if let Some(initial) = initial_scxml_id {
        output.push_str(&format!(" initial=\"{}\"", escape_attr(initial)));
    }

    let children = index
        .children_by_parent
        .get(state.id.as_str())
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    let transitions = index
        .transitions_by_source
        .get(state.id.as_str())
        .map(Vec::as_slice)
        .unwrap_or(&[]);

    let has_body = !state.parameters.is_empty()
        || !state.on_entry.is_empty()
        || !state.on_exit.is_empty()
        || !transitions.is_empty()
        || !children.is_empty()
        || !state.editor.positions.is_empty()
        || !state.editor.edge_targets.is_empty()
        || state.editor.x != 0.0
        || state.editor.y != 0.0
        || state.editor.width.is_some()
        || state.editor.height.is_some()
        || state.editor.collapsed;

    if !has_body {
        output.push_str("/>");
        visiting.remove(state.id.as_str());
        return Ok(());
    }

    output.push_str(">\n");
    render_editor_metadata(state, depth + 1, output);
    render_local_datamodel(state, depth + 1, output);
    render_action("onentry", &state.on_entry, depth + 1, output);
    render_action("onexit", &state.on_exit, depth + 1, output);

    for transition in transitions {
        render_transition(transition, depth + 1, &index.states_by_id, output);
    }

    for child in children {
        render_state(child, depth + 1, index, visiting, output)?;
        output.push('\n');
    }

    output.push_str(&format!("{}</{}>", indent, tag));
    visiting.remove(state.id.as_str());
    Ok(())
}

fn render_editor_metadata(state: &State, depth: usize, output: &mut String) {
    let has_metadata = !state.editor.positions.is_empty()
        || !state.editor.edge_targets.is_empty()
        || state.editor.x != 0.0
        || state.editor.y != 0.0
        || state.editor.width.is_some()
        || state.editor.height.is_some()
        || state.editor.collapsed;
    if !has_metadata {
        return;
    }

    let indent = "    ".repeat(depth);
    output.push_str(&format!("{}<metadata>\n", indent));

    if state.editor.positions.is_empty() {
        output.push_str(&format!(
            "{}    <editor:position x=\"{}\" y=\"{}\"/>\n",
            indent,
            format_number(state.editor.x),
            format_number(state.editor.y)
        ));
    } else {
        for position in &state.editor.positions {
            output.push_str(&format!("{}    <editor:position", indent));
            if let Some(instance_id) = position.instance_id.as_deref() {
                output.push_str(&format!(" instance=\"{}\"", escape_attr(instance_id)));
            }
            if let Some(clone_type) = position.clone_type.as_deref() {
                output.push_str(&format!(" clone=\"{}\"", escape_attr(clone_type)));
            }
            output.push_str(&format!(
                " x=\"{}\" y=\"{}\"/>\n",
                format_number(position.x),
                format_number(position.y)
            ));
        }
    }

    for route in &state.editor.edge_targets {
        output.push_str(&format!(
            "{}    <editor:edgeTarget event=\"{}\" target=\"{}\" occurrence=\"{}\" instance=\"{}\"/>\n",
            indent,
            escape_attr(&route.event),
            escape_attr(&route.target_scxml_id),
            route.occurrence,
            escape_attr(&route.target_instance_id)
        ));
    }

    output.push_str(&format!("{}</metadata>\n", indent));
}

fn render_local_datamodel(state: &State, depth: usize, output: &mut String) {
    if state.parameters.is_empty() {
        return;
    }

    let indent = "    ".repeat(depth);
    output.push_str(&format!("{}<datamodel>\n", indent));
    for parameter in &state.parameters {
        let expression = if !parameter.expression.is_empty() {
            parameter.expression.as_str()
        } else {
            parameter.default_value.as_deref().unwrap_or_default()
        };
        output.push_str(&format!(
            "{}    <data id=\"{}\" expr=\"{}\"{} />\n",
            indent,
            escape_attr(&parameter.key),
            escape_attr(expression),
            if parameter.type_name.is_empty() {
                String::new()
            } else {
                format!(" type=\"{}\"", escape_attr(&parameter.type_name))
            }
        ));
    }
    output.push_str(&format!("{}</datamodel>\n", indent));
}

fn render_action(name: &str, assignments: &[Assignment], depth: usize, output: &mut String) {
    if assignments.is_empty() {
        return;
    }

    let indent = "    ".repeat(depth);
    output.push_str(&format!("{}<{}>\n", indent, name));
    for assignment in assignments {
        output.push_str(&format!(
            "{}    <assign location=\"{}\" expr=\"{}\"/>\n",
            indent,
            escape_attr(assignment.location.trim_start_matches('@')),
            escape_attr(&assignment.expression)
        ));
    }
    output.push_str(&format!("{}</{}>\n", indent, name));
}

fn render_transition(
    transition: &Transition,
    depth: usize,
    states_by_id: &HashMap<&str, &State>,
    output: &mut String,
) {
    let indent = "    ".repeat(depth);
    let target = if !transition.target_scxml_id.trim().is_empty() {
        transition.target_scxml_id.as_str()
    } else {
        transition
            .target_state_id
            .as_deref()
            .and_then(|id| states_by_id.get(id).map(|state| state.scxml_id.as_str()))
            .unwrap_or_default()
    };

    output.push_str(&format!("{}<transition", indent));
    if !transition.event.is_empty() {
        output.push_str(&format!(" event=\"{}\"", escape_attr(&transition.event)));
    }
    if !target.is_empty() {
        output.push_str(&format!(" target=\"{}\"", escape_attr(target)));
    }
    if !transition.condition.is_empty() {
        output.push_str(&format!(" cond=\"{}\"", escape_attr(&transition.condition)));
    }

    if transition.assignments.is_empty() && transition.sent_events.is_empty() {
        output.push_str("/>\n");
        return;
    }

    output.push_str(">\n");
    for assignment in &transition.assignments {
        output.push_str(&format!(
            "{}    <assign location=\"{}\" expr=\"{}\"/>\n",
            indent,
            escape_attr(assignment.location.trim_start_matches('@')),
            escape_attr(&assignment.expression)
        ));
    }
    for event in &transition.sent_events {
        output.push_str(&format!(
            "{}    <send event=\"{}\"/>\n",
            indent,
            escape_attr(event)
        ));
    }
    output.push_str(&format!("{}</transition>\n", indent));
}

fn escape_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::{escape_attr, serialize_scxml};
    use crate::core::model::{StateId, Workflow};
    use crate::core::scxml::parse_scxml;

    #[test]
    fn keeps_apostrophes_in_double_quoted_attributes() {
        assert_eq!(
            escape_attr("'de.unibi.citec.clf.bonsai.skills.'"),
            "'de.unibi.citec.clf.bonsai.skills.'"
        );
    }

    #[test]
    fn omits_empty_normal_binding_attributes_but_keeps_bound_and_inherited_xml() {
        let workflow = Workflow::from_dto(
            serde_json::from_value(serde_json::json!({
                "slotDeclarations": [
                    {"key": "", "state": "", "xpath": "/needed"},
                    {"key": "Key", "state": "", "xpath": "/key-only"},
                    {"key": "", "state": "Root", "xpath": "/state-only"},
                    {"key": "Key", "state": "Root", "xpath": "/bound"},
                    {"key": "Own", "state": "Ancestor", "xpath": "/outer", "inherited": true},
                    {"key": "Legacy", "state": "", "xpath": "", "inherited": true}
                ]
            }))
            .unwrap(),
        )
        .unwrap();
        let xml = serialize_scxml(&workflow).unwrap();
        assert!(xml.contains(concat!(
            "                <slot xpath=\"/needed\"/>\n",
            "                <slot key=\"Key\" xpath=\"/key-only\"/>\n",
            "                <slot state=\"Root\" xpath=\"/state-only\"/>\n",
            "                <slot key=\"Key\" state=\"Root\" xpath=\"/bound\"/>\n",
            "                <inheritSlot key=\"Own\" state=\"Ancestor\" xpath=\"/outer\"/>\n",
            "                <inheritSlot key=\"Legacy\" state=\"\" xpath=\"\"/>\n"
        )));
    }

    #[test]
    fn preserves_exact_xml_order_conditions_actions_and_duplicate_scxml_names() {
        let workflow = Workflow::from_dto(serde_json::from_value(serde_json::json!({
            "name": "Flow & 'name'",
            "initialStateId": "root",
            "states": [
                {"id": "b", "scxmlId": "Repeated", "kind": "skill", "parentId": "root",
                 "parameters": [{"key": "text", "defaultValue": "'fallback'", "typeName": "String"}]},
                {"id": "end", "scxmlId": "End", "kind": "final"},
                {"id": "root", "scxmlId": "Root", "kind": "compound", "initialChildId": "a",
                 "editor": {"positions": [
                     {"x": 1.5, "y": 2},
                     {"x": -3, "y": 4.25, "instanceId": "copy", "cloneType": "reference"}
                 ], "edgeTargets": [{"event": "done", "targetScxmlId": "End", "occurrence": 2,
                                      "targetInstanceId": "end-copy"}]},
                 "onEntry": [{"location": "@@count", "expression": "1"},
                             {"location": "@text", "expression": "'a&b'"}],
                 "onExit": [{"location": "@count", "expression": "count + 1"}]},
                {"id": "leaf", "scxmlId": "Leaf", "kind": "submachine", "parentId": "a",
                 "source": "${BEH}/a&b.xml"},
                {"id": "a", "scxmlId": "Repeated", "kind": "parallel", "parentId": "root"}
            ],
            "transitions": [
                {"id": "ta", "sourceStateId": "a", "targetStateId": "b", "targetScxmlId": "",
                 "event": "go", "condition": "count < 2 && text == \"yes\"",
                 "assignments": [{"location": "@@count", "expression": "count + 1"}],
                 "sentEvents": ["first", "second"]},
                {"id": "tr1", "sourceStateId": "root", "targetStateId": "end", "targetScxmlId": "",
                 "event": "Repeated.success", "condition": "ready"},
                {"id": "tb", "sourceStateId": "b", "targetScxmlId": "",
                 "sentEvents": ["behavior.success"]},
                {"id": "tr2", "sourceStateId": "root", "targetScxmlId": " external ",
                 "condition": "count > 0"}
            ],
            "dataModel": [{"id": "#_STATE_PREFIX", "expression": "'pkg.'"},
                          {"id": "count", "expression": "0", "typeName": "integer"}],
            "slotDeclarations": [{"key": "Model", "state": "Repeated", "xpath": "/model"},
                                 {"key": "Other", "state": "Root", "xpath": "/other", "inherited": true}]
        })).unwrap()).unwrap();

        assert_eq!(
            serialize_scxml(&workflow).unwrap(),
            r##"<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml"
       xmlns:editor="http://bonsai.cit-ec.uni-bielefeld.de/editor"
       version="1.0"
       initial="Root"
       name="Flow &amp; 'name'">

    <datamodel>
        <data id="#_STATE_PREFIX" expr="'pkg.'" />
        <data id="#_SLOTS">
            <slots>
                <slot key="Model" state="Repeated" xpath="/model"/>
                <inheritSlot key="Other" state="Root" xpath="/other"/>
            </slots>
        </data>
        <data id="count" expr="0" type="integer" />
    </datamodel>

    <final id="End"/>

    <state id="Root" initial="Repeated">
        <metadata>
            <editor:position x="1.5" y="2"/>
            <editor:position instance="copy" clone="reference" x="-3" y="4.25"/>
            <editor:edgeTarget event="done" target="End" occurrence="2" instance="end-copy"/>
        </metadata>
        <onentry>
            <assign location="count" expr="1"/>
            <assign location="text" expr="'a&amp;b'"/>
        </onentry>
        <onexit>
            <assign location="count" expr="count + 1"/>
        </onexit>
        <transition event="Repeated.success" target="End" cond="ready"/>
        <transition target=" external " cond="count &gt; 0"/>
        <state id="Repeated">
            <datamodel>
                <data id="text" expr="'fallback'" type="String" />
            </datamodel>
            <transition>
                <send event="behavior.success"/>
            </transition>
        </state>
        <parallel id="Repeated">
            <transition event="go" target="Repeated" cond="count &lt; 2 &amp;&amp; text == &quot;yes&quot;">
                <assign location="count" expr="count + 1"/>
                <send event="first"/>
                <send event="second"/>
            </transition>
            <state id="Leaf" src="${BEH}/a&amp;b.xml"/>
        </parallel>
    </state>

</scxml>
"##
        );
    }

    #[test]
    fn preserves_missing_parent_error_and_rootless_cycle_omission() {
        let mut workflow =
            parse_scxml("<scxml><state id=\"A\"/><state id=\"B\"/></scxml>").unwrap();
        workflow.states[0].parent_id = Some(StateId::from("missing"));
        assert_eq!(
            serialize_scxml(&workflow).unwrap_err(),
            "State 'state-1' references missing parent 'missing'."
        );

        workflow.states[0].parent_id = Some(workflow.states[1].id.clone());
        workflow.states[1].parent_id = Some(workflow.states[0].id.clone());
        assert_eq!(
            serialize_scxml(&workflow).unwrap(),
            serialize_scxml(&Workflow::default()).unwrap()
        );
    }
}

fn format_number(value: f64) -> String {
    if value.fract() == 0.0 {
        format!("{}", value as i64)
    } else {
        value.to_string()
    }
}
