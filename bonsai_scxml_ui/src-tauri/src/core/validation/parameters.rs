use super::helpers::{
    add_missing_variable_problem, get_variable_references, normalize_value_type, problem,
    validate_typed_value, variable_id_set, focus_node, node_label,
};
use super::types::{EditorProblemDto, ValidationRequestDto, ValidationVariableDto};

pub(super) fn validate_parameters(request: &ValidationRequestDto, problems: &mut Vec<EditorProblemDto>) {
    let available_variables = if request.available_data_model.is_empty() {
        request.global_data_model.as_slice()
    } else {
        request.available_data_model.as_slice()
    };

    for node in &request.nodes {
        let mut parameter_variables = available_variables.to_vec();
        parameter_variables.extend(node.parameters.iter().filter(|parameter| !parameter.key.is_empty()).map(
            |parameter| ValidationVariableDto {
                id: parameter.key.clone(),
                type_name: parameter.type_name.clone(),
                expression: if parameter.expression.trim().is_empty() {
                    parameter.default_value.clone()
                } else {
                    parameter.expression.clone()
                },
            },
        ));
        let parameter_variable_ids = variable_id_set(&parameter_variables);

        for (index, parameter) in node.parameters.iter().enumerate() {
            let value = parameter.expression.trim();
            let default_value = parameter.default_value.trim();
            let parameter_name = if parameter.key.trim().is_empty() {
                format!("parameter {}", index + 1)
            } else {
                parameter.key.clone()
            };

            if parameter.required && value.is_empty() && default_value.is_empty() {
                let mut item = problem(
                    format!("parameter-required-{}-{index}", node.id),
                    "error",
                    "Parameters",
                    "Required parameter is missing",
                    format!("{}.{} needs a value.", node_label(node), parameter_name),
                );
                focus_node(&mut item, node.id.clone());
                item.detail_tab = Some("parameter".into());
                item.mode = Some("event".into());
                problems.push(item);
                continue;
            }

            let effective_value = if !value.is_empty() { value } else { default_value };
            if effective_value.is_empty() {
                continue;
            }

            let missing_refs: Vec<String> = get_variable_references(effective_value, false)
                .into_iter()
                .filter(|name| !parameter_variable_ids.contains(name))
                .collect();
            if !missing_refs.is_empty() {
                for variable_name in missing_refs {
                    add_missing_variable_problem(
                        problems,
                        Some(node),
                        &variable_name,
                        &format!("for parameter {parameter_name}"),
                        "parameter",
                        None,
                        &format!("parameter-{index}"),
                    );
                }
                continue;
            }

            let Some(expected_type) = normalize_value_type(&parameter.type_name) else {
                continue;
            };

            if let Err(error) = validate_typed_value(effective_value, expected_type, &parameter_variables)
            {
                let mut item = problem(
                    format!("parameter-type-{}-{index}", node.id),
                    "error",
                    "Parameters",
                    "Invalid parameter type",
                    format!("{}.{}: {error}", node_label(node), parameter_name),
                );
                focus_node(&mut item, node.id.clone());
                item.detail_tab = Some("parameter".into());
                item.mode = Some("event".into());
                problems.push(item);
            }
        }
    }
}
