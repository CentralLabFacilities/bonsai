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
    use std::collections::HashSet;

    use super::*;
    use crate::core::model::TransitionSource;
    use crate::core::scxml::parse_scxml;
    use crate::core::validation::build_active_validation_request;
    use crate::core::validation::types::{
        ActiveValidationRequestDto, ValidationEdgeDto, ValidationEventDto, ValidationNodeDto,
        ValidationNodeOverlayDto, ValidationParameterDto, ValidationSlotDto, ValidationVariableDto,
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
        assert!(problems
            .iter()
            .any(|problem| problem.id == "workflow-no-initial"));
    }

    fn config_request(ignore: Option<&str>, final_states: Option<&str>) -> ValidationRequestDto {
        let mut variables = Vec::new();
        if let Some(value) = ignore {
            variables.push(ValidationVariableDto {
                id: "#_VALIDATE_IGNORE_THESE_STATES".into(),
                expression: value.into(),
                ..Default::default()
            });
        }
        if let Some(value) = final_states {
            variables.push(ValidationVariableDto {
                id: "#_FINAL_STATES".into(),
                expression: value.into(),
                ..Default::default()
            });
        }
        ValidationRequestDto {
            nodes: vec![
                ValidationNodeDto {
                    id: "select-first".into(),
                    label: "Select display".into(),
                    full_skill_name: "choices.select#first".into(),
                    node_type: "custom".into(),
                    is_initial: true,
                    events: vec![ValidationEventDto {
                        id: "success".into(),
                        synthetic: false,
                    }],
                    ..Default::default()
                },
                ValidationNodeDto {
                    id: "action".into(),
                    label: "Select action display".into(),
                    full_skill_name: "choices.selectAction#second".into(),
                    node_type: "custom".into(),
                    events: vec![ValidationEventDto {
                        id: "success".into(),
                        synthetic: false,
                    }],
                    ..Default::default()
                },
                ValidationNodeDto {
                    id: "not-ignored".into(),
                    label: "Other".into(),
                    full_skill_name: "choices.selectActionExtra#third".into(),
                    node_type: "custom".into(),
                    events: vec![ValidationEventDto {
                        id: "success".into(),
                        synthetic: false,
                    }],
                    ..Default::default()
                },
            ],
            global_data_model: variables,
            is_behavior_workflow: true,
            ..Default::default()
        }
    }

    #[test]
    fn semicolon_ignored_names_skip_only_the_configured_transition_checks() {
        for value in [
            "select;selectAction",
            "\" select ; selectAction ; ;select \"",
            "'select;selectAction'",
        ] {
            let problems = validate_editor_graph(&config_request(Some(value), None));
            assert!(!problems.iter().any(|item| item
                .id
                .starts_with("transition-missing-select-first-")
                || item.id.starts_with("transition-missing-action-")));
            assert!(!problems
                .iter()
                .any(|item| item.id == "behavior-dead-end-select-first"
                    || item.id == "behavior-dead-end-action"));
            assert!(problems
                .iter()
                .any(|item| item.id == "transition-missing-not-ignored-fatal"));
            assert!(problems
                .iter()
                .any(|item| item.id == "transition-missing-not-ignored-success"));
            assert!(problems
                .iter()
                .any(|item| item.id == "behavior-exit-missing"));
        }
    }

    #[test]
    fn canonical_uppercase_keys_are_read_even_when_wrong_case_entries_precede_them() {
        let mut request = config_request(Some("'select;selectAction'"), Some("false"));
        request.global_data_model.insert(
            0,
            ValidationVariableDto {
                id: "#_validate_ignore_these_states".into(),
                expression: "''".into(),
                ..Default::default()
            },
        );
        request.global_data_model.insert(
            0,
            ValidationVariableDto {
                id: "#_final_states".into(),
                expression: "true".into(),
                ..Default::default()
            },
        );
        let problems = validate_editor_graph(&request);
        assert!(!problems
            .iter()
            .any(|item| item.id == "behavior-exit-missing"));
        assert!(!problems.iter().any(|item| item
            .id
            .starts_with("transition-missing-select-first-")
            || item.id.starts_with("transition-missing-action-")));
        assert!(problems
            .iter()
            .any(|item| item.id == "transition-missing-not-ignored-fatal"));
    }

    #[test]
    fn ignored_transition_states_still_report_invalid_integer_literals_defaults_and_references() {
        for (expression, default_value) in [
            ("'text'", ""),
            ("\"123\"", ""),
            ("", "'123'"),
            ("@stringCount", ""),
        ] {
            let mut request = config_request(Some("select;selectAction"), Some("false"));
            request.available_data_model.push(ValidationVariableDto {
                id: "stringCount".into(),
                expression: "'123'".into(),
                type_name: "String".into(),
                ..Default::default()
            });
            request.nodes[0].parameters = vec![ValidationParameterDto {
                key: "count".into(),
                type_name: "Integer".into(),
                expression: expression.into(),
                default_value: default_value.into(),
                ..Default::default()
            }];
            let problems = validate_editor_graph(&request);
            let problem = problems
                .iter()
                .find(|problem| problem.id == "parameter-type-select-first-0")
                .expect("Integer mismatch remains a parameter diagnostic");
            assert_eq!(problem.node_id.as_deref(), Some("select-first"));
            assert_eq!(problem.category, "Parameters");
            assert!(!problems
                .iter()
                .any(|problem| problem.id.starts_with("transition-missing-select-first-")));
        }
    }

    #[test]
    fn active_parameter_overlay_type_is_authoritative_and_correction_clears_the_parameter_problem()
    {
        let workflow = parse_scxml(
            r##"<scxml initial="skills.Work#1"><datamodel>
            <data id="#_VALIDATE_IGNORE_THESE_STATES" expr="'Work'"/>
            </datamodel><state id="skills.Work#1"><datamodel>
            <data id="count" expr="'text'" type="String"/>
            </datamodel></state></scxml>"##,
        )
        .unwrap();
        let node_id = workflow.states[0].id.as_str().to_owned();
        let context = |value: &str| ActiveValidationRequestDto {
            node_overlays: vec![ValidationNodeOverlayDto {
                id: node_id.clone(),
                parameters: vec![ValidationParameterDto {
                    key: "count".into(),
                    type_name: "Integer".into(),
                    expression: value.into(),
                    required: true,
                    ..Default::default()
                }],
                ..Default::default()
            }],
            ..Default::default()
        };
        let invalid = validate_editor_graph(&build_active_validation_request(
            &workflow,
            &context("'text'"),
        ));
        assert!(invalid
            .iter()
            .any(|problem| problem.category == "Parameters"
                && problem.node_id.as_ref() == Some(&node_id)));
        assert!(!invalid
            .iter()
            .any(|problem| problem.category == "Transitions"));
        for value in ["0", "7"] {
            let corrected =
                validate_editor_graph(&build_active_validation_request(&workflow, &context(value)));
            assert!(!corrected
                .iter()
                .any(|problem| problem.category == "Parameters"));
        }
    }

    #[test]
    fn absent_empty_and_non_semicolon_names_do_not_disable_validation() {
        for value in [
            None,
            Some(""),
            Some("'; ;'"),
            Some("'select,selectAction'"),
            Some("'selectActionExtraish'"),
            Some("'SELECT'"),
        ] {
            let problems = validate_editor_graph(&config_request(value, None));
            assert!(problems
                .iter()
                .any(|item| item.id == "transition-missing-select-first-fatal"));
            assert!(problems
                .iter()
                .any(|item| item.id == "transition-missing-action-success"));
        }
    }

    #[test]
    fn ignored_qualified_names_instances_labels_and_ids_keep_exact_match_scope() {
        for name in [
            "choices.select",
            "choices.select#first",
            "Select display",
            "select-first",
        ] {
            let problems = validate_editor_graph(&config_request(Some(name), None));
            assert!(!problems
                .iter()
                .any(|item| item.id == "transition-missing-select-first-fatal"));
            assert!(problems
                .iter()
                .any(|item| item.id == "transition-missing-action-fatal"));
        }
        let problems = validate_editor_graph(&config_request(Some("choices.select#other"), None));
        assert!(problems
            .iter()
            .any(|item| item.id == "transition-missing-select-first-fatal"));
    }

    #[test]
    fn final_states_false_disables_terminal_exit_requirements_not_event_coverage() {
        for value in ["false", " false ", "'false'", "\"FALSE\""] {
            let problems = validate_editor_graph(&config_request(None, Some(value)));
            assert!(!problems
                .iter()
                .any(|item| item.id == "behavior-exit-missing"));
            assert!(problems
                .iter()
                .any(|item| item.id == "transition-missing-select-first-fatal"));
            assert!(!problems
                .iter()
                .any(|item| item.id == "behavior-dead-end-select-first"));
            assert!(!problems
                .iter()
                .any(|item| item.category == "Behavior exits"));
        }
        for value in [
            None,
            Some("true"),
            Some(""),
            Some("'falseish'"),
            Some("@false"),
            Some("0"),
        ] {
            assert!(validate_editor_graph(&config_request(None, value))
                .iter()
                .any(|item| item.id == "behavior-exit-missing"));
        }
    }

    #[test]
    fn ignored_states_leave_unrelated_workflow_parameters_slots_and_datamodel_checks_enabled() {
        let mut request = config_request(Some("select;selectAction"), Some("false"));
        request.nodes[0].is_initial = false;
        request.nodes[0].parameters.push(ValidationParameterDto {
            key: "speed".into(),
            type_name: "Integer".into(),
            required: true,
            ..Default::default()
        });
        request.nodes[0].input_slots.push(ValidationSlotDto {
            key: "input".into(),
            type_name: "String".into(),
            ..Default::default()
        });
        request.global_data_model.extend([
            ValidationVariableDto {
                id: "duplicate".into(),
                expression: "1".into(),
                ..Default::default()
            },
            ValidationVariableDto {
                id: "duplicate".into(),
                expression: "2".into(),
                ..Default::default()
            },
        ]);
        let problems = validate_editor_graph(&request);
        assert!(problems.iter().any(|item| item.id == "workflow-no-initial"));
        assert!(problems.iter().any(|item| item.category == "Parameters"));
        assert!(problems.iter().any(|item| item.category == "Slots"));
        assert!(problems
            .iter()
            .any(|item| item.id == "datamodel-duplicate-duplicate"));
        assert!(!problems
            .iter()
            .any(|item| item.id.starts_with("transition-missing-select-first-")));
    }

    #[test]
    fn ignored_source_transition_checks_do_not_hide_a_missing_source_or_another_state() {
        let mut request = config_request(Some("select"), Some("false"));
        request.edges = vec![
            ValidationEdgeDto {
                id: "ignored".into(),
                source: "select-first".into(),
                target: "missing".into(),
                source_handle: "unknown".into(),
                ..Default::default()
            },
            ValidationEdgeDto {
                id: "other".into(),
                source: "action".into(),
                target: "missing".into(),
                source_handle: "unknown".into(),
                ..Default::default()
            },
            ValidationEdgeDto {
                id: "absent".into(),
                source: "missing".into(),
                target: "action".into(),
                source_handle: "unknown".into(),
                ..Default::default()
            },
        ];
        let problems = validate_editor_graph(&request);
        assert!(!problems
            .iter()
            .any(|item| item.id == "transition-missing-target-ignored"
                || item.id == "transition-unknown-event-ignored"));
        assert!(problems
            .iter()
            .any(|item| item.id == "transition-missing-target-other"));
        assert!(problems
            .iter()
            .any(|item| item.id == "transition-missing-source-absent"));
    }

    #[test]
    fn active_imported_datamodel_configs_apply_and_reenable_without_mutating_the_workflow() {
        let mut workflow = parse_scxml(r##"<scxml initial="choices.select#one"><datamodel>
            <data id="#_VALIDATE_IGNORE_THESE_STATES" expr="'select;selectAction'"/>
            <data id="#_FINAL_STATES" expr="false"/>
            </datamodel><state id="choices.select#one"/><state id="choices.selectAction#two"/></scxml>"##).unwrap();
        let before = serde_json::to_value(workflow.to_dto()).unwrap();
        let context = ActiveValidationRequestDto {
            is_behavior_workflow: true,
            ..Default::default()
        };
        let problems = validate_editor_graph(&build_active_validation_request(&workflow, &context));
        assert!(!problems.iter().any(|item| item.category == "Transitions"
            || item.id == "behavior-exit-missing"
            || item.id.starts_with("behavior-dead-end-")));
        assert_eq!(serde_json::to_value(workflow.to_dto()).unwrap(), before);
        workflow.data_model[0].expression = "''".into();
        workflow.data_model[1].expression = "true".into();
        let problems = validate_editor_graph(&build_active_validation_request(&workflow, &context));
        assert!(problems
            .iter()
            .any(|item| item.id.starts_with("transition-missing-")));
        assert!(problems
            .iter()
            .any(|item| item.id == "behavior-exit-missing"));
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
    fn qualified_wildcard_covers_parsed_skill_and_active_api_overlay() {
        let workflow = parse_scxml(
            r#"<scxml initial="speech.Talk#setup">
                <datamodel><data id="attempts" expr="0"/></datamodel>
                <state id="speech.Talk#setup">
                    <metadata><position instance="visual-talk" x="12" y="34"/></metadata>
                    <transition event="Talk.*" cond="false" target="End">
                        <assign location="attempts" expr="1"/>
                    </transition>
                </state>
                <final id="End"/>
            </scxml>"#,
        )
        .unwrap();
        let before = serde_json::to_value(workflow.to_dto()).unwrap();
        let talk_id = workflow.states[0].id.as_str();

        for context in [
            ActiveValidationRequestDto::default(),
            ActiveValidationRequestDto {
                node_overlays: vec![ValidationNodeOverlayDto {
                    id: talk_id.into(),
                    events: vec![
                        ValidationEventDto {
                            id: "success".into(),
                            synthetic: false,
                        },
                        ValidationEventDto {
                            id: "error.not_found".into(),
                            synthetic: false,
                        },
                    ],
                    ..ValidationNodeOverlayDto::default()
                }],
                ..ActiveValidationRequestDto::default()
            },
        ] {
            let request = build_active_validation_request(&workflow, &context);
            let problems = validate_editor_graph(&request);
            assert!(
                problems
                    .iter()
                    .all(|problem| problem.category != "Transitions"),
                "{problems:?}"
            );
            assert_eq!(request.edges[0].event, "Talk.*");
            assert_eq!(request.edges[0].source_handle, "Talk.*");
            assert_eq!(request.edges[0].semantic_source, talk_id);
            assert_eq!(request.edges[0].assignments[0].location, "attempts");
            assert_eq!(request.edges[0].assignments[0].expression, "1");
        }

        assert_eq!(serde_json::to_value(workflow.to_dto()).unwrap(), before);
        assert_eq!(workflow.transitions[0].condition, "false");
        assert_eq!(
            workflow.states[0].editor.positions[0]
                .instance_id
                .as_deref(),
            Some("visual-talk")
        );
    }

    #[test]
    fn partial_wildcard_covers_logical_api_subtype_but_not_fatal() {
        let mut workflow = parse_scxml(
            r#"<scxml initial="ExecSetup">
                <state id="ExecSetup" initial="speech.Talk#setup">
                    <transition event="Talk.error.*" target="End"/>
                    <state id="speech.Talk#setup"/>
                </state>
                <final id="End"/>
            </scxml>"#,
        )
        .unwrap();
        let talk_id = workflow.states[1].id.clone();
        workflow.transitions[0]
            .logical_sources
            .push(TransitionSource {
                state_id: talk_id.clone(),
                handle: "error.*".into(),
            });
        let request = build_active_validation_request(
            &workflow,
            &ActiveValidationRequestDto {
                node_overlays: vec![
                    ValidationNodeOverlayDto {
                        id: workflow.states[0].id.as_str().into(),
                        ..ValidationNodeOverlayDto::default()
                    },
                    ValidationNodeOverlayDto {
                        id: talk_id.as_str().into(),
                        events: vec![
                            ValidationEventDto {
                                id: "error.not_found".into(),
                                synthetic: false,
                            },
                            ValidationEventDto {
                                id: "success".into(),
                                synthetic: false,
                            },
                            ValidationEventDto {
                                id: "error.*".into(),
                                synthetic: true,
                            },
                        ],
                        ..ValidationNodeOverlayDto::default()
                    },
                ],
                ..ActiveValidationRequestDto::default()
            },
        );
        let problems = validate_editor_graph(&request);
        let transition_ids = problems
            .iter()
            .filter(|problem| problem.category == "Transitions")
            .map(|problem| problem.id.clone())
            .collect::<HashSet<_>>();
        assert_eq!(
            transition_ids,
            HashSet::from([
                format!("transition-missing-{}-fatal", talk_id.as_str()),
                format!("transition-missing-{}-success", talk_id.as_str()),
            ])
        );
        assert_eq!(
            workflow.transitions[0].source_state_id,
            workflow.states[0].id
        );
        assert_eq!(workflow.transitions[0].event, "Talk.error.*");
        assert_eq!(workflow.transitions[0].logical_sources[0].handle, "error.*");
    }

    #[test]
    fn descriptor_lists_cover_token_prefixes_without_character_prefixes() {
        let request = ValidationRequestDto {
            nodes: vec![ValidationNodeDto {
                id: "talk".into(),
                node_type: "custom".into(),
                full_skill_name: "speech.Talk#setup".into(),
                is_initial: true,
                events: ["success", "error.not_found.detail", "errorish"]
                    .into_iter()
                    .map(|id| ValidationEventDto {
                        id: id.into(),
                        synthetic: false,
                    })
                    .collect(),
                ..ValidationNodeDto::default()
            }],
            edges: vec![ValidationEdgeDto {
                id: "list".into(),
                source: "talk".into(),
                target: "talk".into(),
                event: " Talk#setup.success\t speech.Talk#setup.error\nTalk.fatal ".into(),
                source_handle: "success error fatal".into(),
                ..ValidationEdgeDto::default()
            }],
            ..ValidationRequestDto::default()
        };
        let problems = validate_editor_graph(&request);
        let transitions = problems
            .iter()
            .filter(|problem| problem.category == "Transitions")
            .collect::<Vec<_>>();
        assert_eq!(transitions.len(), 1, "{transitions:?}");
        assert_eq!(transitions[0].id, "transition-missing-talk-errorish");
    }

    #[test]
    fn unknown_specific_and_partial_descriptors_still_warn() {
        let request = ValidationRequestDto {
            nodes: vec![ValidationNodeDto {
                id: "talk".into(),
                node_type: "custom".into(),
                full_skill_name: "speech.Talk#setup".into(),
                events: vec![ValidationEventDto {
                    id: "success".into(),
                    synthetic: false,
                }],
                ..ValidationNodeDto::default()
            }],
            edges: [
                "success error.not_found",
                "error.*",
                "Talk#other.*",
                "Other.error",
                "talk.*",
            ]
            .into_iter()
            .enumerate()
            .map(|(index, descriptor)| ValidationEdgeDto {
                id: format!("unknown-{index}"),
                source: "talk".into(),
                target: "talk".into(),
                event: descriptor.into(),
                source_handle: descriptor.into(),
                ..ValidationEdgeDto::default()
            })
            .collect(),
            ..ValidationRequestDto::default()
        };
        let problems = validate_editor_graph(&request);
        for index in 0..request.edges.len() {
            assert!(
                problems.iter().any(
                    |problem| problem.id == format!("transition-unknown-event-unknown-{index}")
                ),
                "{problems:?}"
            );
        }
        assert!(problems
            .iter()
            .any(|problem| problem.id == "transition-missing-talk-fatal"));
        assert!(!problems
            .iter()
            .any(|problem| problem.id == "transition-missing-talk-success"));
    }

    #[test]
    fn parsed_descriptor_lists_do_not_create_a_combined_missing_event() {
        let workflow = parse_scxml(
            r#"<scxml initial="speech.Talk#setup">
                <state id="speech.Talk#setup"><transition event="Talk.success Talk.error Talk.fatal" target="End"/></state>
                <final id="End"/>
            </scxml>"#,
        ).unwrap();
        let request =
            build_active_validation_request(&workflow, &ActiveValidationRequestDto::default());
        let problems = validate_editor_graph(&request);
        assert!(
            problems
                .iter()
                .all(|problem| problem.category != "Transitions"),
            "{problems:?}"
        );
        assert_eq!(
            workflow.transitions[0].event,
            "Talk.success Talk.error Talk.fatal"
        );
    }

    #[test]
    fn synthetic_boundary_overlay_does_not_hide_genuine_compound_events() {
        let workflow = parse_scxml(
            r#"<scxml initial="ExecSetup"><state id="ExecSetup" initial="speech.Talk#setup"><state id="speech.Talk#setup"/></state></scxml>"#,
        ).unwrap();
        let compound_id = workflow.states[0].id.as_str();
        let context = ActiveValidationRequestDto {
            node_overlays: vec![ValidationNodeOverlayDto {
                id: compound_id.into(),
                events: vec![
                    ValidationEventDto {
                        id: "imported-visual-exec-Talk.*".into(),
                        synthetic: true,
                    },
                    ValidationEventDto {
                        id: "real_api_exit".into(),
                        synthetic: false,
                    },
                ],
                ..ValidationNodeOverlayDto::default()
            }],
            ..ActiveValidationRequestDto::default()
        };
        let request = build_active_validation_request(&workflow, &context);
        assert!(request.nodes[0].events[0].synthetic);
        let problems = validate_editor_graph(&request);
        assert!(!problems
            .iter()
            .any(|problem| problem.id.contains("imported-visual")));
        assert!(
            problems
                .iter()
                .any(|problem| problem.id
                    == format!("transition-missing-{compound_id}-real_api_exit"))
        );

        let mut unflagged = context;
        unflagged.node_overlays[0].events[0].synthetic = false;
        let problems =
            validate_editor_graph(&build_active_validation_request(&workflow, &unflagged));
        assert!(problems.iter().any(|problem| problem.id
            == format!("transition-missing-{compound_id}-imported-visual-exec-Talk.*")));
    }

    #[test]
    fn nested_skill_instances_and_visual_ids_do_not_cross_cover_exits() {
        let mut workflow = parse_scxml(
            r#"<scxml initial="ExecSetup">
                <state id="ExecSetup" initial="speech.Talk#setup">
                    <transition event="Talk.*" target="End"/>
                    <state id="speech.Talk#setup">
                        <metadata><position instance="Talk#gripper"/></metadata>
                    </state>
                    <state id="Nested" initial="speech.Talk#gripper">
                        <state id="speech.Talk#gripper">
                            <metadata><position instance="Talk#setup"/></metadata>
                            <transition event="Talk#setup.*" target="End"/>
                        </state>
                    </state>
                </state>
                <final id="End"/>
            </scxml>"#,
        )
        .unwrap();
        let setup_id = workflow.states[1].id.clone();
        workflow.transitions[0]
            .logical_sources
            .push(TransitionSource {
                state_id: setup_id,
                handle: "*".into(),
            });
        let talks = workflow
            .states
            .iter()
            .filter(|state| state.label == "Talk")
            .collect::<Vec<_>>();
        let context = ActiveValidationRequestDto {
            node_overlays: std::iter::once(ValidationNodeOverlayDto {
                id: workflow.states[0].id.as_str().into(),
                events: vec![ValidationEventDto {
                    id: "imported-visual-exec-Talk.*".into(),
                    synthetic: true,
                }],
                ..ValidationNodeOverlayDto::default()
            })
            .chain(talks.iter().map(|state| ValidationNodeOverlayDto {
                id: state.id.as_str().into(),
                events: vec![ValidationEventDto {
                    id: "success".into(),
                    synthetic: false,
                }],
                ..ValidationNodeOverlayDto::default()
            }))
            .collect(),
            ..ActiveValidationRequestDto::default()
        };
        let problems = validate_editor_graph(&build_active_validation_request(&workflow, &context));
        assert!(
            !problems.iter().any(|problem| problem
                .id
                .starts_with(&format!("transition-missing-{}-", talks[0].id.as_str()))),
            "{problems:?}"
        );
        for event in ["success", "fatal"] {
            assert!(
                problems.iter().any(|problem| problem.id
                    == format!("transition-missing-{}-{event}", talks[1].id.as_str())),
                "{problems:?}"
            );
        }
        assert!(problems
            .iter()
            .any(|problem| problem.id == "transition-unknown-event-transition-2"));
        assert!(!problems
            .iter()
            .any(|problem| problem.id.contains("imported-visual")));
        assert_eq!(
            workflow.transitions[0].source_state_id,
            workflow.states[0].id
        );
        assert_eq!(workflow.transitions[0].event, "Talk.*");
    }

    #[test]
    fn matching_wildcard_keeps_missing_target_diagnostic() {
        let workflow = parse_scxml(
            r#"<scxml initial="speech.Talk#setup"><state id="speech.Talk#setup"><transition event="Talk.*" target="Missing"/></state></scxml>"#,
        ).unwrap();
        let request =
            build_active_validation_request(&workflow, &ActiveValidationRequestDto::default());
        let problems = validate_editor_graph(&request);
        let transitions = problems
            .iter()
            .filter(|problem| problem.category == "Transitions")
            .collect::<Vec<_>>();
        assert_eq!(transitions.len(), 1, "{transitions:?}");
        assert_eq!(transitions[0].id, "transition-missing-target-transition-1");
        assert_eq!(transitions[0].edge_id.as_deref(), Some("transition-1"));
        assert_eq!(
            transitions[0].node_id.as_deref(),
            Some(workflow.states[0].id.as_str())
        );
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
