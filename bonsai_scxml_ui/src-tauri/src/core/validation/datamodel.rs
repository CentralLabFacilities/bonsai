use std::collections::HashMap;

use super::helpers::{
    add_missing_variable_problem, normalize_assignment_location, problem,
    validate_expression_references, variable_id_set,
};
use super::index::ValidationIndex;
use super::types::{EditorProblemDto, ValidationRequestDto};

pub(super) fn validate_datamodel(
    request: &ValidationRequestDto,
    index: &ValidationIndex<'_>,
    problems: &mut Vec<EditorProblemDto>,
) {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for entry in &request.global_data_model {
        let id = entry.id.trim();
        if id.is_empty() {
            continue;
        }
        *counts.entry(id.to_string()).or_default() += 1;
    }

    for (id, count) in counts {
        if count > 1 {
            problems.push(problem(
                format!("datamodel-duplicate-{id}"),
                "error",
                "Datamodel",
                "Duplicate data ID",
                format!("{id} is defined {count} times."),
            ));
        }
    }

    let global_variable_ids = variable_id_set(&request.available_data_model);

    for node in &request.nodes {
        let action_target_ids = if node.node_type == "submachine" && node.has_local_data_model {
            variable_id_set(&node.local_data_model)
        } else {
            global_variable_ids.clone()
        };

        for (action_name, assignments) in [
            ("onEntry", node.on_entry.as_slice()),
            ("onExit", node.on_exit.as_slice()),
        ] {
            for (index, assignment) in assignments.iter().enumerate() {
                let location = normalize_assignment_location(&assignment.location);
                if !location.is_empty() && !action_target_ids.contains(&location) {
                    add_missing_variable_problem(
                        problems,
                        Some(node),
                        &location,
                        &format!("as the {action_name} assignment target"),
                        "actions",
                        None,
                        &format!("{action_name}-location-{index}"),
                    );
                }

                validate_expression_references(
                    problems,
                    Some(node),
                    &assignment.expression,
                    &global_variable_ids,
                    &format!("in the {action_name} assignment expression"),
                    "actions",
                    None,
                    &format!("{action_name}-expr-{index}"),
                    true,
                );
            }
        }
    }

    for edge in &request.edges {
        let source_id = if edge.semantic_source.trim().is_empty() {
            edge.source.as_str()
        } else {
            edge.semantic_source.as_str()
        };
        let Some(source) = index.nodes_by_id.get(source_id).copied() else {
            continue;
        };

        for (index, assignment) in edge.assignments.iter().enumerate() {
            let location = normalize_assignment_location(&assignment.location);
            if !location.is_empty() && !global_variable_ids.contains(&location) {
                add_missing_variable_problem(
                    problems,
                    Some(source),
                    &location,
                    "as a transition assignment target",
                    "allgemein",
                    Some(edge.id.clone()),
                    &format!("transition-location-{}-{index}", edge.id),
                );
            }

            validate_expression_references(
                problems,
                Some(source),
                &assignment.expression,
                &global_variable_ids,
                "in a transition assignment expression",
                "allgemein",
                Some(edge.id.clone()),
                &format!("transition-expr-{}-{index}", edge.id),
                true,
            );
        }
    }
}
