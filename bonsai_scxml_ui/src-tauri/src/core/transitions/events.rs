use std::collections::HashSet;

fn skill_name_candidates(source_skill_name: &str) -> Vec<String> {
    let raw_name = source_skill_name.trim();
    if raw_name.is_empty() {
        return Vec::new();
    }

    let without_instance = raw_name.split('#').next().unwrap_or(raw_name);
    let simple_name = without_instance
        .split('.')
        .filter(|part| !part.is_empty())
        .last()
        .unwrap_or("");

    let mut seen = HashSet::new();
    let mut candidates = [raw_name, without_instance, simple_name]
        .into_iter()
        .filter(|value| !value.is_empty())
        .filter(|value| seen.insert((*value).to_string()))
        .map(str::to_string)
        .collect::<Vec<_>>();

    candidates.sort_by_key(|value| std::cmp::Reverse(value.len()));
    candidates
}

pub(crate) fn normalize_exit_token<'a>(raw_event: &'a str, source_skill_name: &str) -> &'a str {
    let event_name = raw_event.trim();
    let mut candidates = skill_name_candidates(source_skill_name);
    if let Some((qualified_name, instance)) = source_skill_name.trim().split_once('#') {
        let simple_name = qualified_name.rsplit('.').next().unwrap_or(qualified_name);
        candidates.push(format!("{simple_name}#{instance}"));
    }

    for source_name in candidates {
        if let Some(suffix) = event_name
            .strip_prefix(source_name.as_str())
            .and_then(|suffix| suffix.strip_prefix('.'))
        {
            return suffix.trim();
        }
    }

    // Validation must not strip a different owner's/instance's qualification,
    // unlike the permissive legacy transition_exit_token fallback below.
    event_name
}

pub(crate) fn event_descriptor_matches(descriptor: &str, event: &str) -> bool {
    let descriptor = descriptor.trim();
    let event = event.trim();
    if descriptor.is_empty() || event.is_empty() {
        return false;
    }
    if descriptor == "*" {
        return true;
    }

    // SCXML descriptors match dot-separated token prefixes. A trailing .*
    // denotes the same namespace, not a character glob or just one subtype.
    let prefix = descriptor.strip_suffix(".*").unwrap_or(descriptor);
    !prefix.is_empty()
        && (event == prefix
            || event
                .strip_prefix(prefix)
                .is_some_and(|suffix| suffix.starts_with('.')))
}

pub(crate) fn transition_exit_token(raw_event: &str, source_skill_name: &str) -> String {
    let event_name = raw_event.trim();
    if event_name.is_empty() {
        return "success".into();
    }
    if event_name == "*" {
        return "*".into();
    }

    for source_name in skill_name_candidates(source_skill_name) {
        let prefix = format!("{source_name}.");
        if let Some(suffix) = event_name.strip_prefix(&prefix) {
            return if suffix.trim().is_empty() {
                "success".into()
            } else {
                suffix.trim().to_string()
            };
        }
    }

    let parts = event_name
        .split('.')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if let Some(index) = parts
        .iter()
        .position(|part| matches!(*part, "success" | "error" | "fatal"))
    {
        return parts[index..].join(".");
    }

    event_name.to_string()
}

pub(crate) fn scxml_transition_event(exit_token: &str, source_skill_name: &str) -> String {
    let token = if exit_token.trim().is_empty() {
        "success"
    } else {
        exit_token.trim()
    };
    let source_without_instance = source_skill_name.split('#').next().unwrap_or("");
    let skill_base_name = source_without_instance
        .split('.')
        .filter(|part| !part.is_empty())
        .last()
        .unwrap_or(source_without_instance);

    if skill_base_name.is_empty() {
        return token.to_string();
    }

    if token == skill_base_name || token.starts_with(&format!("{skill_base_name}.")) {
        return token.to_string();
    }

    format!("{skill_base_name}.{token}")
}

#[cfg(test)]
mod tests {
    use super::{
        event_descriptor_matches, normalize_exit_token, scxml_transition_event,
        transition_exit_token,
    };

    #[test]
    fn validation_normalization_strips_only_known_owner_qualification() {
        for descriptor in [
            "speech.Talk#setup.error.not_found",
            "speech.Talk.error.not_found",
            "Talk#setup.error.not_found",
            "Talk.error.not_found",
        ] {
            assert_eq!(
                normalize_exit_token(descriptor, "speech.Talk#setup"),
                "error.not_found"
            );
        }
        for descriptor in [
            "Talk#other.*",
            "Other.error",
            "visual-talk.*",
            "error.not_found",
        ] {
            assert_eq!(
                normalize_exit_token(descriptor, "speech.Talk#setup"),
                descriptor
            );
        }
        assert_eq!(normalize_exit_token(" Talk.* ", "speech.Talk#setup"), "*");
        assert_eq!(normalize_exit_token("", "speech.Talk#setup"), "");
        assert_eq!(normalize_exit_token("Talk.*", ""), "Talk.*");
        assert_eq!(
            transition_exit_token("Other.error", "speech.Talk#setup"),
            "error"
        );
    }

    #[test]
    fn validation_descriptors_match_scxml_token_namespaces() {
        for (descriptor, event) in [
            ("*", "fatal"),
            ("error", "error.not_found"),
            ("error.*", "error"),
            ("error.*", "error.not_found.detail"),
            ("error.not_found", "error.not_found.detail"),
        ] {
            assert!(
                event_descriptor_matches(descriptor, event),
                "{descriptor} -> {event}"
            );
        }
        for (descriptor, event) in [
            ("", "success"),
            ("*", ""),
            ("error", "errorish"),
            ("error.*", "fatal"),
            ("error.not_found", "error"),
            ("error*", "error.not_found"),
        ] {
            assert!(
                !event_descriptor_matches(descriptor, event),
                "{descriptor} -> {event}"
            );
        }
    }

    #[test]
    fn extracts_exit_tokens_without_losing_subtypes_or_wildcards() {
        assert_eq!(
            transition_exit_token(
                "SetupPlanningScene.success",
                "planning.SetupPlanningScene#main"
            ),
            "success"
        );
        assert_eq!(
            transition_exit_token("GraspEntity.error.not_grasped", "GraspEntity"),
            "error.not_grasped"
        );
        assert_eq!(transition_exit_token("Talk.*", "Talk"), "*");
        assert_eq!(
            transition_exit_token("success.maybe", "Other"),
            "success.maybe"
        );
    }

    #[test]
    fn builds_scxml_event_from_exit_token() {
        assert_eq!(
            scxml_transition_event("error.not_found", "vision.Detect#main"),
            "Detect.error.not_found"
        );
        assert_eq!(scxml_transition_event("*", "Talk"), "Talk.*");
    }
}
