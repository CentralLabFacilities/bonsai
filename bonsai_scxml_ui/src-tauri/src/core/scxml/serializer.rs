use std::collections::{HashMap, HashSet};

use crate::core::model::{AssignmentDto, StateDto, StateKindDto, WorkflowDto};

pub(crate) fn serialize_scxml(workflow: &WorkflowDto) -> Result<String, String> {
    let states_by_id: HashMap<&str, &StateDto> = workflow
        .states
        .iter()
        .map(|state| (state.id.as_str(), state))
        .collect();

    validate_parent_links(workflow, &states_by_id)?;

    let initial_scxml_id = workflow
        .initial_scxml_state_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            workflow
                .initial_state_id
                .as_deref()
                .and_then(|id| states_by_id.get(id).map(|state| state.scxml_id.as_str()))
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
        output.push_str(&format!("\n       initial=\"{}\"", escape_attr(initial_scxml_id)));
    }
    if let Some(name) = workflow.name.as_deref().filter(|value| !value.trim().is_empty()) {
        output.push_str(&format!("\n       name=\"{}\"", escape_attr(name)));
    }
    output.push_str(">\n\n");

    render_root_datamodel(workflow, &mut output);

    let mut visiting = HashSet::new();
    for state in workflow.states.iter().filter(|state| state.parent_id.is_none()) {
        output.push('\n');
        render_state(workflow, state, 1, &states_by_id, &mut visiting, &mut output)?;
        output.push('\n');
    }

    output.push_str("\n</scxml>\n");
    Ok(output)
}

fn validate_parent_links(
    workflow: &WorkflowDto,
    states_by_id: &HashMap<&str, &StateDto>,
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

fn render_root_datamodel(workflow: &WorkflowDto, output: &mut String) {
    if workflow.data_model.is_empty() && workflow.slot_declarations.is_empty() {
        return;
    }

    output.push_str("    <datamodel>\n");
    for entry in &workflow.data_model {
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
    }

    if !workflow.slot_declarations.is_empty() {
        output.push_str("        <data id=\"#_SLOTS\">\n");
        output.push_str("            <slots>\n");
        for slot in &workflow.slot_declarations {
            let tag = if slot.inherited { "inheritSlot" } else { "slot" };
            output.push_str(&format!(
                "                <{} key=\"{}\" state=\"{}\" xpath=\"{}\"/>\n",
                tag,
                escape_attr(&slot.key),
                escape_attr(&slot.state),
                escape_attr(&slot.xpath)
            ));
        }
        output.push_str("            </slots>\n");
        output.push_str("        </data>\n");
    }
    output.push_str("    </datamodel>\n");
}

fn render_state(
    workflow: &WorkflowDto,
    state: &StateDto,
    depth: usize,
    states_by_id: &HashMap<&str, &StateDto>,
    visiting: &mut HashSet<String>,
    output: &mut String,
) -> Result<(), String> {
    if !visiting.insert(state.id.clone()) {
        return Err(format!("Cycle detected in state parent graph at '{}'.", state.id));
    }

    let indent = "    ".repeat(depth);
    let tag = match state.kind {
        StateKindDto::Parallel => "parallel",
        StateKindDto::Final => "final",
        _ => "state",
    };

    output.push_str(&format!(
        "{}<{} id=\"{}\"",
        indent,
        tag,
        escape_attr(&state.scxml_id)
    ));

    if matches!(state.kind, StateKindDto::Submachine) {
        if let Some(source) = state.source.as_deref().filter(|value| !value.trim().is_empty()) {
            output.push_str(&format!(" src=\"{}\"", escape_attr(source)));
        }
    }

    let initial_scxml_id = state
        .initial_child_scxml_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            state
                .initial_child_id
                .as_deref()
                .and_then(|id| states_by_id.get(id).map(|child| child.scxml_id.as_str()))
        });
    if let Some(initial) = initial_scxml_id {
        output.push_str(&format!(" initial=\"{}\"", escape_attr(initial)));
    }

    let children: Vec<&StateDto> = workflow
        .states
        .iter()
        .filter(|candidate| candidate.parent_id.as_deref() == Some(state.id.as_str()))
        .collect();
    let transitions: Vec<_> = workflow
        .transitions
        .iter()
        .filter(|transition| transition.source_state_id == state.id)
        .collect();

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
        visiting.remove(&state.id);
        return Ok(());
    }

    output.push_str(">\n");
    render_editor_metadata(state, depth + 1, output);
    render_local_datamodel(state, depth + 1, output);
    render_action("onentry", &state.on_entry, depth + 1, output);
    render_action("onexit", &state.on_exit, depth + 1, output);

    for transition in transitions {
        render_transition(transition, depth + 1, states_by_id, output);
    }

    for child in children {
        render_state(workflow, child, depth + 1, states_by_id, visiting, output)?;
        output.push('\n');
    }

    output.push_str(&format!("{}</{}>", indent, tag));
    visiting.remove(&state.id);
    Ok(())
}

fn render_editor_metadata(state: &StateDto, depth: usize, output: &mut String) {
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

fn render_local_datamodel(state: &StateDto, depth: usize, output: &mut String) {
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

fn render_action(name: &str, assignments: &[AssignmentDto], depth: usize, output: &mut String) {
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
    transition: &crate::core::model::TransitionDto,
    depth: usize,
    states_by_id: &HashMap<&str, &StateDto>,
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

    if transition.assignments.is_empty() {
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
    output.push_str(&format!("{}</transition>\n", indent));

}

fn escape_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn format_number(value: f64) -> String {
    if value.fract() == 0.0 {
        format!("{}", value as i64)
    } else {
        value.to_string()
    }
}
