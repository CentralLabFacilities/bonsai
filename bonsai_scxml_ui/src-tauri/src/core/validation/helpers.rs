use std::collections::HashSet;

use super::types::{
    EditorProblemDto, ValidationNodeDto, ValidationSlotDto, ValidationVariableDto,
};

pub(super) fn node_label(node: &ValidationNodeDto) -> &str {
    if !node.label.trim().is_empty() {
        node.label.trim()
    } else if !node.full_skill_name.trim().is_empty() {
        node.full_skill_name.trim()
    } else if !node.id.trim().is_empty() {
        node.id.trim()
    } else {
        "Unknown state"
    }
}

pub(super) fn base_node_name(node: &ValidationNodeDto) -> String {
    let value = if !node.full_skill_name.trim().is_empty() {
        node.full_skill_name.trim()
    } else {
        node.label.trim()
    };
    value
        .split('#')
        .next()
        .unwrap_or(value)
        .rsplit('.')
        .next()
        .unwrap_or(value)
        .to_lowercase()
}

pub(super) fn is_valid_behavior_terminal(node: &ValidationNodeDto) -> bool {
    let name = base_node_name(node);
    node.is_final || node.is_behavior_exit || name == "end" || name == "fatal"
}

pub(super) fn exposes_implicit_fatal(node: &ValidationNodeDto) -> bool {
    node.node_type == "custom" && !is_valid_behavior_terminal(node)
}

pub(super) fn normalize_assignment_location(value: &str) -> String {
    value.trim().trim_start_matches('@').to_string()
}

pub(super) fn variable_id_set(entries: &[ValidationVariableDto]) -> HashSet<String> {
    entries
        .iter()
        .map(|entry| entry.id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect()
}

#[allow(clippy::too_many_arguments)]
pub(super) fn add_missing_variable_problem(
    problems: &mut Vec<EditorProblemDto>,
    node: Option<&ValidationNodeDto>,
    variable_name: &str,
    usage: &str,
    detail_tab: &str,
    edge_id: Option<String>,
    suffix: &str,
) {
    let node_id = node.map(|node| node.id.as_str()).unwrap_or("workflow");
    let raw_id = format!("variable-missing-{node_id}-{variable_name}-{usage}-{suffix}");
    let id = sanitize_problem_id(&raw_id);
    let label = node.map(node_label).unwrap_or("Unknown state");
    let mut item = problem(
        id,
        "error",
        "Variables",
        "Undefined variable",
        format!(
            "{label} uses “{variable_name}” {usage}, but it is not defined in this state machine."
        ),
    );
    if let Some(node) = node {
        focus_node(&mut item, node.id.clone());
    }
    item.edge_id = edge_id;
    item.detail_tab = Some(detail_tab.into());
    item.mode = Some("event".into());
    problems.push(item);
}

#[allow(clippy::too_many_arguments)]
pub(super) fn validate_expression_references(
    problems: &mut Vec<EditorProblemDto>,
    node: Option<&ValidationNodeDto>,
    expression: &str,
    available_ids: &HashSet<String>,
    usage: &str,
    detail_tab: &str,
    edge_id: Option<String>,
    suffix: &str,
    include_bare: bool,
) {
    for variable_name in get_variable_references(expression, include_bare) {
        if available_ids.contains(&variable_name) {
            continue;
        }
        add_missing_variable_problem(
            problems,
            node,
            &variable_name,
            usage,
            detail_tab,
            edge_id.clone(),
            suffix,
        );
    }
}

pub(super) fn get_variable_references(value: &str, include_bare: bool) -> Vec<String> {
    let chars: Vec<char> = value.chars().collect();
    let mut scrubbed = chars.clone();
    let mut quote: Option<char> = None;
    let mut escaped = false;

    for index in 0..chars.len() {
        let ch = chars[index];
        if let Some(active_quote) = quote {
            scrubbed[index] = ' ';
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == active_quote {
                quote = None;
            }
            continue;
        }
        if ch == '\'' || ch == '"' {
            quote = Some(ch);
            scrubbed[index] = ' ';
        }
    }

    let mut result = Vec::new();
    let mut seen = HashSet::new();
    let mut index = 0usize;
    while index < scrubbed.len() {
        let start = index;
        let has_marker = scrubbed[index] == '@';
        if has_marker {
            index += 1;
            if index >= scrubbed.len() || !is_identifier_start(scrubbed[index]) {
                continue;
            }
        } else if !is_identifier_start(scrubbed[index]) {
            index += 1;
            continue;
        }

        index += 1;
        while index < scrubbed.len() && is_identifier_continue(scrubbed[index]) {
            index += 1;
        }

        if !include_bare && !has_marker {
            continue;
        }

        let raw: String = scrubbed[start..index].iter().collect();
        let name = raw.trim_start_matches('@').to_string();
        if name.is_empty() || is_expression_keyword(&name) {
            continue;
        }

        let before = if start > 0 { scrubbed[start - 1] } else { '\0' };
        if !has_marker && before == '.' {
            continue;
        }

        if !has_marker {
            let mut next = index;
            while next < scrubbed.len() && scrubbed[next].is_whitespace() {
                next += 1;
            }
            if next < scrubbed.len() && scrubbed[next] == '(' {
                continue;
            }
        }

        if seen.insert(name.clone()) {
            result.push(name);
        }
    }

    result
}

pub(super) fn is_identifier_start(ch: char) -> bool {
    ch.is_ascii_alphabetic() || ch == '_' || ch == '#'
}

pub(super) fn is_identifier_continue(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || matches!(ch, '_' | ':' | '#' | '.')
}

pub(super) fn is_expression_keyword(value: &str) -> bool {
    matches!(value, "true" | "false" | "null" | "undefined" | "NaN" | "Infinity")
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum ValueType {
    Integer,
    Double,
    Boolean,
    String,
}

impl ValueType {
    pub(super) fn label(self) -> &'static str {
        match self {
            Self::Integer => "Integer",
            Self::Double => "Double",
            Self::Boolean => "Boolean",
            Self::String => "String",
        }
    }
}

pub(super) fn normalize_value_type(value: &str) -> Option<ValueType> {
    match value.trim().to_lowercase().as_str() {
        "integer" | "int" | "long" | "short" => Some(ValueType::Integer),
        "double" | "float" | "number" | "decimal" => Some(ValueType::Double),
        "boolean" | "bool" => Some(ValueType::Boolean),
        "string" | "text" | "char" | "character" => Some(ValueType::String),
        _ => None,
    }
}

pub(super) fn infer_literal_type(value: &str) -> ValueType {
    let value = value.trim();
    if value.eq_ignore_ascii_case("true") || value.eq_ignore_ascii_case("false") {
        return ValueType::Boolean;
    }
    if is_integer_literal(value) {
        return ValueType::Integer;
    }
    if is_double_literal(value) {
        return ValueType::Double;
    }
    ValueType::String
}

pub(super) fn strip_numeric_sign(value: &str) -> &str {
    value
        .strip_prefix('+')
        .or_else(|| value.strip_prefix('-'))
        .unwrap_or(value)
}

pub(super) fn is_integer_literal(value: &str) -> bool {
    let body = strip_numeric_sign(value);
    !body.is_empty() && body.chars().all(|ch| ch.is_ascii_digit())
}

pub(super) fn is_double_literal(value: &str) -> bool {
    if value.is_empty() || is_integer_literal(value) {
        return false;
    }
    let body = strip_numeric_sign(value);
    if body.is_empty() {
        return false;
    }
    if body.contains('.') || body.contains('e') || body.contains('E') {
        body.parse::<f64>().is_ok()
    } else {
        false
    }
}

pub(super) fn compatible(actual: ValueType, expected: ValueType) -> bool {
    actual == expected || (expected == ValueType::Double && actual == ValueType::Integer)
}

pub(super) fn variable_type(variable: &ValidationVariableDto) -> ValueType {
    normalize_value_type(&variable.type_name)
        .unwrap_or_else(|| infer_literal_type(&variable.expression))
}

pub(super) fn validate_typed_value(
    value: &str,
    expected: ValueType,
    variables: &[ValidationVariableDto],
) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    if trimmed.starts_with('@') {
        let reference = &trimmed[1..];
        if reference.is_empty() || reference.chars().any(char::is_whitespace) {
            return Err("Select or enter a valid variable reference after @.".into());
        }
        let Some(variable) = variables.iter().find(|variable| variable.id == reference) else {
            return Err(format!("Unknown parameter “{reference}”."));
        };
        let actual = variable_type(variable);
        if !compatible(actual, expected) {
            return Err(format!(
                "{reference} is {}, but {} is required.",
                actual.label(),
                expected.label()
            ));
        }
        return Ok(());
    }

    let actual = infer_literal_type(trimmed);
    if compatible(actual, expected) {
        return Ok(());
    }

    let accepted = if expected == ValueType::Double {
        "Double or Integer"
    } else {
        expected.label()
    };
    Err(format!(
        "{} requires a {accepted} literal or parameter.",
        expected.label()
    ))
}

pub(super) fn behavior_source_key(src: &str) -> Option<String> {
    let rest = src.trim().strip_prefix("${")?;
    let end = rest.find('}')?;
    if end == 0 {
        return None;
    }
    let after = &rest[end + 1..];
    if !after.is_empty() && !after.starts_with('/') && !after.starts_with('\\') {
        return None;
    }
    Some(rest[..end].trim().to_uppercase())
}

pub(super) fn normalize_slot_path(value: &str) -> String {
    value.trim().trim_start_matches('/').to_string()
}

pub(super) fn normalize_slot_type(value: &str) -> String {
    value.trim().to_lowercase()
}

pub(super) fn slot_name(slot: &ValidationSlotDto, direction: &str, index: usize) -> String {
    if slot.key.trim().is_empty() {
        format!("{direction} {}", index + 1)
    } else {
        slot.key.clone()
    }
}

pub(super) fn sanitize_problem_id(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '_' | '.' | ':' | '#' | '-') {
            result.push(ch);
        } else if !result.ends_with('-') {
            result.push('-');
        }
    }
    result.trim_matches('-').to_string()
}

pub(super) fn problem(
    id: impl Into<String>,
    severity: impl Into<String>,
    category: impl Into<String>,
    title: impl Into<String>,
    message: impl Into<String>,
) -> EditorProblemDto {
    EditorProblemDto {
        id: id.into(),
        severity: severity.into(),
        category: category.into(),
        title: title.into(),
        message: message.into(),
        ..EditorProblemDto::default()
    }
}

pub(super) fn focus_node(problem: &mut EditorProblemDto, node_id: String) {
    problem.node_id = Some(node_id.clone());
    problem.focus_node_ids = vec![node_id];
}

pub(super) fn severity_rank(value: &str) -> u8 {
    match value {
        "error" => 0,
        "warning" => 1,
        "info" => 2,
        _ => 99,
    }
}
