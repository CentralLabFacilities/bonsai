use super::behavior::{validate_behavior_exits, validate_behavior_sources};
use super::datamodel::validate_datamodel;
use super::helpers::severity_rank;
use super::index::ValidationIndex;
use super::parameters::validate_parameters;
use super::slots::validate_slots;
use super::transitions::validate_transitions;
use super::types::{EditorProblemDto, ValidationRequestDto};
use super::workflow::validate_workflow;

pub(crate) fn validate_editor_graph(request: &ValidationRequestDto) -> Vec<EditorProblemDto> {
    let index = ValidationIndex::new(request);
    let mut problems = Vec::new();

    validate_workflow(request, &index, &mut problems);
    validate_datamodel(request, &index, &mut problems);
    validate_transitions(request, &index, &mut problems);
    validate_parameters(request, &mut problems);
    validate_behavior_sources(request, &mut problems);
    validate_behavior_exits(request, &index, &mut problems);
    validate_slots(request, &mut problems);

    problems.sort_by(|a, b| {
        severity_rank(&a.severity)
            .cmp(&severity_rank(&b.severity))
            .then_with(|| a.category.to_lowercase().cmp(&b.category.to_lowercase()))
            .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
    });

    problems
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::validation::types::{
        ValidationEdgeDto, ValidationEventDto, ValidationNodeDto, ValidationSlotDto,
    };

    #[test]
    fn reports_missing_root_initial() {
        let request = ValidationRequestDto {
            nodes: vec![ValidationNodeDto {
                id: "a".into(),
                node_type: "custom".into(),
                ..ValidationNodeDto::default()
            }],
            ..ValidationRequestDto::default()
        };

        let problems = validate_editor_graph(&request);
        assert!(problems.iter().any(|problem| problem.id == "workflow-no-initial"));
    }

    #[test]
    fn wildcard_covers_exposed_events() {
        let request = ValidationRequestDto {
            nodes: vec![ValidationNodeDto {
                id: "a".into(),
                node_type: "custom".into(),
                is_initial: true,
                events: vec![ValidationEventDto {
                    id: "success".into(),
                    synthetic: false,
                }],
                ..ValidationNodeDto::default()
            }],
            edges: vec![ValidationEdgeDto {
                id: "e".into(),
                source: "a".into(),
                target: "a".into(),
                event: "*".into(),
                source_handle: "*".into(),
                ..ValidationEdgeDto::default()
            }],
            ..ValidationRequestDto::default()
        };

        let problems = validate_editor_graph(&request);
        assert!(!problems
            .iter()
            .any(|problem| problem.id.starts_with("transition-missing-a-")));
    }


    #[test]
    fn reports_missing_slot_writer_once_per_path() {
        let request = ValidationRequestDto {
            nodes: vec![
                ValidationNodeDto {
                    id: "reader-a".into(),
                    node_type: "custom".into(),
                    is_initial: true,
                    input_slots: vec![
                        ValidationSlotDto {
                            key: "one".into(),
                            type_name: "String".into(),
                            path: "/shared".into(),
                        },
                        ValidationSlotDto {
                            key: "two".into(),
                            type_name: "String".into(),
                            path: "/shared".into(),
                        },
                    ],
                    ..ValidationNodeDto::default()
                },
                ValidationNodeDto {
                    id: "reader-b".into(),
                    node_type: "custom".into(),
                    input_slots: vec![ValidationSlotDto {
                        key: "three".into(),
                        type_name: "String".into(),
                        path: "/shared".into(),
                    }],
                    ..ValidationNodeDto::default()
                },
            ],
            ..ValidationRequestDto::default()
        };

        let problems = validate_editor_graph(&request);
        let missing_writer = problems
            .iter()
            .filter(|problem| problem.id == "slot-no-writer-shared")
            .collect::<Vec<_>>();

        assert_eq!(missing_writer.len(), 1);
        assert_eq!(missing_writer[0].slot_path.as_deref(), Some("/shared"));
        assert!(missing_writer[0].node_id.is_none());
        assert!(missing_writer[0].focus_node_ids.is_empty());
        assert_eq!(
            missing_writer[0].message,
            "/shared is being read but has no writer."
        );
    }

    #[test]
    fn inherited_slot_with_ancestor_writer_is_valid() {
        let request = ValidationRequestDto {
            nodes: vec![ValidationNodeDto {
                id: "reader".into(),
                node_type: "custom".into(),
                is_initial: true,
                input_slots: vec![ValidationSlotDto {
                    key: "model".into(),
                    type_name: "Model".into(),
                    path: "/pick/model".into(),
                }],
                ..ValidationNodeDto::default()
            }],
            inherited_slot_paths: vec!["/pick/model".into()],
            ancestor_writer_slot_paths: vec!["pick/model".into()],
            ..ValidationRequestDto::default()
        };

        let problems = validate_editor_graph(&request);
        assert!(!problems
            .iter()
            .any(|problem| problem.id.starts_with("slot-no-writer-")));
    }
}
