use super::types::{
    RuntimeDataSampleDto, RuntimeEntryDto, RuntimeLogDto, RuntimeParameterSampleDto,
    RuntimeSlotSampleDto, RuntimeStepDto,
};

#[derive(Debug, Clone)]
struct RequestedSlot {
    key: String,
    direction: String,
}

#[derive(Debug, Clone, Copy)]
struct LogLine<'a> {
    timestamp: &'a str,
    component: &'a str,
    message: &'a str,
}

fn normalize(value: &str) -> String {
    value.trim().to_string()
}

fn parse_log_line(line: &str) -> Option<LogLine<'_>> {
    if line.len() < 9 {
        return None;
    }

    let timestamp = line.get(..8)?;
    let bytes = timestamp.as_bytes();
    if bytes.len() != 8 || bytes[2] != b':' || bytes[5] != b':' {
        return None;
    }

    let rest = line.get(8..)?.trim_start();
    let level_end = rest.find(char::is_whitespace)?;
    let after_level = rest.get(level_end..)?.trim_start();
    let component_end = after_level.find(':')?;
    let component = after_level.get(..component_end)?.trim();
    let message = after_level.get(component_end + 1..)?.trim_start();

    if component.is_empty() {
        return None;
    }

    Some(LogLine {
        timestamp,
        component,
        message,
    })
}

fn quoted_values(value: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut remaining = value;

    while let Some(start) = remaining.find('"') {
        let after_start = &remaining[start + 1..];
        let Some(end) = after_start.find('"') else {
            break;
        };
        result.push(after_start[..end].to_string());
        remaining = &after_start[end + 1..];
    }

    result
}

fn parse_requested_slot(message: &str) -> Option<RequestedSlot> {
    let rest = message.strip_prefix("Requested slot")?.trim_start();
    let quoted = quoted_values(rest);
    let key = quoted.first()?.trim();
    if key.is_empty() {
        return None;
    }

    let dir_index = rest.rfind("dir:")?;
    let direction = rest.get(dir_index + 4..)?.trim();
    let direction = direction
        .split_whitespace()
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_uppercase();

    if direction.is_empty() {
        return None;
    }

    Some(RequestedSlot {
        key: key.to_string(),
        direction,
    })
}

fn requested_slot_key(requested_slots: &[RequestedSlot], kind: &str) -> String {
    let accepts = |direction: &str| match kind {
        "write" => direction == "OUT" || direction == "BI",
        _ => direction == "IN" || direction == "BI",
    };

    let matching: Vec<&RequestedSlot> = requested_slots
        .iter()
        .filter(|slot| accepts(slot.direction.as_str()))
        .collect();

    if matching.len() == 1 {
        return matching[0].key.clone();
    }
    if requested_slots.len() == 1 {
        return requested_slots[0].key.clone();
    }
    String::new()
}

fn parse_data_change(message: &str) -> Option<(String, String, String)> {
    let rest = message.strip_prefix("data id:")?;
    let changed_marker = " changed to:";
    let changed_index = rest.rfind(changed_marker)?;
    let before_change = rest[..changed_index].trim();
    let value = rest[changed_index + changed_marker.len()..].trim();

    let expr_marker = " with expr=";
    if let Some(expr_index) = before_change.find(expr_marker) {
        let key = before_change[..expr_index].trim();
        let expr = before_change[expr_index + expr_marker.len()..].trim();
        return Some((key.to_string(), expr.to_string(), value.to_string()));
    }

    Some((
        before_change.to_string(),
        String::new(),
        value.to_string(),
    ))
}

fn parse_assignment(message: &str) -> Option<(String, String)> {
    let rest = message.strip_prefix("ASSIGN ## Name:")?;
    let marker = " VALUE OF:'";
    let marker_index = rest.find(marker)?;
    let key = rest[..marker_index].trim();
    let value_part = &rest[marker_index + marker.len()..];
    let expression = value_part.strip_suffix('\'').unwrap_or(value_part);

    if key.is_empty() {
        return None;
    }

    Some((key.to_string(), expression.to_string()))
}

fn parse_object_slot(message: &str) -> Option<(&str, &str)> {
    let (operation, rest) = if let Some(rest) = message.strip_prefix("recall object of type ") {
        ("recall", rest)
    } else if let Some(rest) = message.strip_prefix("memorized object of type ") {
        ("memorized", rest)
    } else {
        return None;
    };

    let separator = rest.find(':')?;
    let value = rest.get(separator + 1..)?.trim_start();
    Some((operation, value))
}

fn parse_transition(message: &str) -> Option<(String, String, String)> {
    let rest = message.strip_prefix("onTransition:")?.trim_start();
    let quoted = quoted_values(rest);
    if quoted.len() < 3 {
        return None;
    }

    Some((
        normalize(&quoted[0]),
        normalize(&quoted[1]),
        normalize(&quoted[2]),
    ))
}

pub(crate) fn parse_runtime_log(text: &str) -> RuntimeLogDto {
    let mut result = RuntimeLogDto::default();
    let mut current_entry_state = String::new();
    let mut current_invocation_state = String::new();
    let mut current_runner_state = String::new();
    let mut requested_slots: Vec<RequestedSlot> = Vec::new();

    for (line_index, raw_line) in text.lines().enumerate() {
        let line_number = line_index + 1;
        let Some(line) = parse_log_line(raw_line.trim_end_matches('\r')) else {
            continue;
        };

        if line.component.eq_ignore_ascii_case("SkillStateMachine") {
            if let Some(state) = line.message.strip_prefix("OnEntry:") {
                current_entry_state = normalize(state);
                if result.first_entry.is_none() {
                    result.first_entry = Some(RuntimeEntryDto {
                        timestamp: line.timestamp.to_string(),
                        state: current_entry_state.clone(),
                        line: line_number,
                    });
                }
            }

            if let Some((key, expr, value)) = parse_data_change(line.message) {
                if key.starts_with('#') {
                    result.parameter_samples.push(RuntimeParameterSampleDto {
                        timestamp: line.timestamp.to_string(),
                        line: line_number,
                        state: current_entry_state.clone(),
                        key,
                        expr,
                        value,
                    });
                }
            }

            if let Some((key, expression)) = parse_assignment(line.message) {
                if !key.contains('@') {
                    result.data_samples.push(RuntimeDataSampleDto {
                        timestamp: line.timestamp.to_string(),
                        line: line_number,
                        state: current_entry_state.clone(),
                        key,
                        expr: expression.clone(),
                        value: expression,
                        kind: "assign".to_string(),
                    });
                }
            }

            if let Some(state) = line.message.strip_prefix("INVOKE ###") {
                current_invocation_state = normalize(state);
                current_runner_state.clone_from(&current_invocation_state);
                requested_slots.clear();
            }

            if let Some((source, target, event)) = parse_transition(line.message) {
                result.steps.push(RuntimeStepDto {
                    timestamp: line.timestamp.to_string(),
                    source,
                    target,
                    event,
                    line: line_number,
                });
            }

            continue;
        }

        if line.component.eq_ignore_ascii_case("SkillRunner") {
            if let Some(arrow_index) = line.message.find(" -> ") {
                current_runner_state = normalize(&line.message[..arrow_index]);
            }
            continue;
        }

        if line.component.eq_ignore_ascii_case("SkillConfigurator") {
            if let Some(slot) = parse_requested_slot(line.message) {
                requested_slots.push(slot);
            }
            continue;
        }

        if line.component.eq_ignore_ascii_case("ObjectSlot") {
            if let Some((operation, value)) = parse_object_slot(line.message) {
                let kind = if operation == "memorized" { "write" } else { "read" };
                let state = if current_runner_state.is_empty() {
                    current_invocation_state.clone()
                } else {
                    current_runner_state.clone()
                };
                result.slot_samples.push(RuntimeSlotSampleDto {
                    timestamp: line.timestamp.to_string(),
                    line: line_number,
                    state,
                    value: value.to_string(),
                    kind: kind.to_string(),
                    operation: operation.to_string(),
                    slot_key: requested_slot_key(&requested_slots, kind),
                });
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::parse_runtime_log;

    #[test]
    fn parses_transition_entry_and_parameter_value() {
        let log = concat!(
            "12:00:00 INFO SkillStateMachine: OnEntry: demo.Skill#main\n",
            "12:00:01 INFO SkillStateMachine: data id:#_WRITE with expr=@test_val changed to:0\n",
            "12:00:02 INFO SkillStateMachine: onTransition: \"demo.Skill#main\" --> \"demo.Next#main\" event: \"Skill.success\"\n",
        );

        let parsed = parse_runtime_log(log);
        assert_eq!(parsed.first_entry.as_ref().unwrap().state, "demo.Skill#main");
        assert_eq!(parsed.parameter_samples.len(), 1);
        assert_eq!(parsed.parameter_samples[0].key, "#_WRITE");
        assert_eq!(parsed.parameter_samples[0].expr, "@test_val");
        assert_eq!(parsed.parameter_samples[0].value, "0");
        assert_eq!(parsed.steps.len(), 1);
        assert_eq!(parsed.steps[0].target, "demo.Next#main");
    }

    #[test]
    fn parses_slot_observations_and_assignment() {
        let log = concat!(
            "12:00:00 INFO SkillStateMachine: OnEntry: slots.SlotIO#A\n",
            "12:00:01 INFO SkillStateMachine: INVOKE ### slots.SlotIO#A\n",
            "12:00:01 INFO SkillConfigurator: Requested slot \"Model\" foo dir: OUT\n",
            "12:00:02 INFO ObjectSlot: memorized object of type java.lang.String: hello\n",
            "12:00:03 INFO SkillStateMachine: ASSIGN ## Name:test VALUE OF:'1 + 2'\n",
        );

        let parsed = parse_runtime_log(log);
        assert_eq!(parsed.slot_samples.len(), 1);
        assert_eq!(parsed.slot_samples[0].kind, "write");
        assert_eq!(parsed.slot_samples[0].slot_key, "Model");
        assert_eq!(parsed.slot_samples[0].value, "hello");
        assert_eq!(parsed.data_samples.len(), 1);
        assert_eq!(parsed.data_samples[0].key, "test");
        assert_eq!(parsed.data_samples[0].expr, "1 + 2");
    }

    #[test]
    fn leaves_ambiguous_slot_key_empty() {
        let log = concat!(
            "12:00:00 INFO SkillStateMachine: INVOKE ### slots.SlotIO#A\n",
            "12:00:01 INFO SkillConfigurator: Requested slot \"A\" foo dir: OUT\n",
            "12:00:01 INFO SkillConfigurator: Requested slot \"B\" foo dir: OUT\n",
            "12:00:02 INFO ObjectSlot: memorized object of type java.lang.String: hello\n",
        );

        let parsed = parse_runtime_log(log);
        assert_eq!(parsed.slot_samples.len(), 1);
        assert_eq!(parsed.slot_samples[0].slot_key, "");
    }
}
