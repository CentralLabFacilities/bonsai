use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

use crate::core::model::{DataModelEntryDto, Workflow, WorkflowDto, WorkflowIndex};
use crate::core::scxml::parse_scxml;

use super::library::BehaviorDirectoryMapping;
use super::resolver::resolve_workflow_source_path;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InheritedSlotDeclarationDto {
    pub key: String,
    pub state: String,
    pub path: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowInspectionResult {
    pub content: String,
    pub path: String,
    pub file_name: String,
    pub root_key: Option<String>,
    pub workflow: WorkflowDto,
    pub behavior_exit_events: Vec<String>,
    pub inherited_slots: Vec<InheritedSlotDeclarationDto>,
    pub local_data_model: Vec<DataModelEntryDto>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FileStamp {
    modified: SystemTime,
    len: u64,
}

#[derive(Clone)]
struct CachedInspection {
    stamp: FileStamp,
    result: WorkflowInspectionResult,
}

static INSPECTION_CACHE: OnceLock<Mutex<HashMap<PathBuf, CachedInspection>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<PathBuf, CachedInspection>> {
    INSPECTION_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn file_stamp(path: &Path) -> Option<FileStamp> {
    let metadata = std::fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;
    Some(FileStamp {
        modified,
        len: metadata.len(),
    })
}

pub(crate) fn inspect_workflow_source(
    src: &str,
    directories: &[BehaviorDirectoryMapping],
    current_file_path: Option<&str>,
) -> Result<WorkflowInspectionResult, String> {
    let resolved = resolve_workflow_source_path(src, directories, current_file_path)?;
    let stamp = file_stamp(&resolved.path);

    if let Some(stamp) = stamp.as_ref() {
        let guard = cache()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if let Some(cached) = guard.get(&resolved.path) {
            if &cached.stamp == stamp {
                return Ok(cached.result.clone());
            }
        }
    }

    let content = std::fs::read_to_string(&resolved.path).map_err(|error| {
        format!(
            "Could not read workflow file '{}': {error}",
            resolved.path.display()
        )
    })?;
    let workflow = parse_scxml(&content)?;
    let result = WorkflowInspectionResult {
        file_name: resolved
            .path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default(),
        path: resolved.path.to_string_lossy().to_string(),
        root_key: resolved.root_key,
        behavior_exit_events: collect_behavior_exit_events(&workflow),
        inherited_slots: collect_inherited_slot_declarations(&workflow),
        local_data_model: collect_local_data_model(&workflow),
        workflow: workflow.to_dto(),
        content,
    };

    if let Some(stamp) = stamp {
        let mut guard = cache()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.insert(
            resolved.path,
            CachedInspection {
                stamp,
                result: result.clone(),
            },
        );
    }

    Ok(result)
}

fn collect_behavior_exit_events(workflow: &Workflow) -> Vec<String> {
    let index = WorkflowIndex::new(workflow);
    let mut seen = HashSet::new();
    let mut result = Vec::new();

    for transition in &workflow.transitions {
        let Some(source_state) = index.state(workflow, &transition.source_state_id) else {
            continue;
        };
        if !base_state_name(&source_state.scxml_id).eq_ignore_ascii_case("nop") {
            continue;
        }
        if !transition.target_scxml_id.trim().is_empty() || transition.target_state_id.is_some() {
            continue;
        }

        // Match the editor's historical behavior-exit rule: one outward event
        // per targetless Nop transition, preserving document order.
        if let Some(event) = transition
            .sent_events
            .first()
            .map(String::as_str)
            .map(str::trim)
            .filter(|event| !event.is_empty())
        {
            if seen.insert(event.to_string()) {
                result.push(event.to_string());
            }
        }
    }

    result
}

fn collect_inherited_slot_declarations(
    workflow: &Workflow,
) -> Vec<InheritedSlotDeclarationDto> {
    let mut seen_paths = HashSet::new();
    let mut result = Vec::new();

    for slot in &workflow.slot_declarations {
        if !slot.inherited {
            continue;
        }

        let path = normalize_slot_path(&slot.xpath);
        if path.is_empty() || !seen_paths.insert(path.clone()) {
            continue;
        }

        result.push(InheritedSlotDeclarationDto {
            key: slot.key.clone(),
            state: slot.state.clone(),
            path,
        });
    }

    result
}

fn collect_local_data_model(workflow: &Workflow) -> Vec<DataModelEntryDto> {
    workflow
        .data_model
        .iter()
        .filter(|entry| {
            let id = entry.id.trim();
            !id.is_empty() && id != "#_STATE_PREFIX" && id != "#_SLOTS" && !id.starts_with('_')
        })
        .map(|entry| entry.to_dto())
        .collect()
}

fn base_state_name(value: &str) -> &str {
    value
        .split('#')
        .next()
        .unwrap_or(value)
        .rsplit('.')
        .next()
        .unwrap_or(value)
        .trim()
}

fn normalize_slot_path(value: &str) -> String {
    value.trim().trim_start_matches('/').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::model::{SlotDeclarationDto, StateDto, StateKindDto, TransitionDto};

    #[test]
    fn extracts_forwarded_nop_events_once() {
        let mut workflow = WorkflowDto::default();
        workflow.states.push(StateDto {
            id: "state-1".to_string(),
            scxml_id: "de.unibi.skills.Nop#exit".to_string(),
            label: "Nop".to_string(),
            kind: StateKindDto::Skill,
            full_skill_name: None,
            source: None,
            parent_id: None,
            initial_child_id: None,
            initial_child_scxml_id: None,
            is_initial: false,
            is_final: false,
            events: vec![],
            input_slots: vec![],
            output_slots: vec![],
            parameters: vec![],
            on_entry: vec![],
            on_exit: vec![],
            editor: Default::default(),
        });
        workflow.transitions.push(TransitionDto {
            id: "t-1".to_string(),
            source_state_id: "state-1".to_string(),
            target_state_id: None,
            target_scxml_id: String::new(),
            logical_sources: vec![],
            event: "Nop.success".to_string(),
            condition: String::new(),
            assignments: vec![],
            sent_events: vec!["behavior.success".to_string()],
            target_instance_id: None,
        });
        workflow.transitions.push(TransitionDto {
            id: "t-2".to_string(),
            source_state_id: "state-1".to_string(),
            target_state_id: None,
            target_scxml_id: String::new(),
            logical_sources: vec![],
            event: "Nop.failure".to_string(),
            condition: String::new(),
            assignments: vec![],
            sent_events: vec!["behavior.success".to_string()],
            target_instance_id: None,
        });

        let workflow = Workflow::from_dto(workflow).unwrap();
        assert_eq!(collect_behavior_exit_events(&workflow), vec!["behavior.success"]);
    }

    #[test]
    fn inherited_slot_declarations_are_normalized_and_deduplicated_by_path() {
        let mut workflow = WorkflowDto::default();
        workflow.slot_declarations = vec![
            SlotDeclarationDto {
                key: "Model".to_string(),
                state: "Detect".to_string(),
                xpath: "/pick/model".to_string(),
                inherited: true,
            },
            SlotDeclarationDto {
                key: "ModelAgain".to_string(),
                state: "Other".to_string(),
                xpath: "pick/model".to_string(),
                inherited: true,
            },
        ];

        let workflow = Workflow::from_dto(workflow).unwrap();
        let slots = collect_inherited_slot_declarations(&workflow);
        assert_eq!(slots.len(), 1);
        assert_eq!(slots[0].path, "pick/model");
    }
}
