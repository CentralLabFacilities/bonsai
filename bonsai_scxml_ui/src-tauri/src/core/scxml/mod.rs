mod parser;
mod serializer;
mod xml;

pub(crate) use parser::parse_scxml;
pub(crate) use serializer::serialize_scxml;

#[cfg(test)]
mod tests {
    use super::{parse_scxml, serialize_scxml};
    use crate::core::model::StateKindDto;

    const SAMPLE: &str = r##"<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml"
       xmlns:editor="http://bonsai.cit-ec.uni-bielefeld.de/editor"
       version="1.0"
       initial="ExecSetup">
    <datamodel>
        <data id="answer" expr="'yes'"/>
        <data id="#_SLOTS">
            <slots>
                <slot key="Model" state="vision.Detect#main" xpath="/model"/>
                <inheritSlot key="Speech" state="Talk" xpath="/speech"/>
            </slots>
        </data>
    </datamodel>
    <state id="ExecSetup" initial="Talk">
        <metadata>
            <editor:position x="100" y="200"/>
        </metadata>
        <transition event="Talk.success" target="End"/>
        <state id="Talk">
            <datamodel>
                <data id="text" expr="'Hello'"/>
            </datamodel>
        </state>
    </state>
    <final id="End"/>
</scxml>"##;

    #[test]
    fn parses_core_workflow_semantics() {
        let workflow = parse_scxml(SAMPLE).expect("SCXML should parse");
        assert_eq!(workflow.initial_scxml_state_id.as_deref(), Some("ExecSetup"));
        assert_eq!(workflow.data_model.len(), 1);
        assert_eq!(workflow.slot_declarations.len(), 2);
        assert_eq!(workflow.states.len(), 3);
        assert_eq!(workflow.transitions.len(), 1);

        let compound = workflow
            .states
            .iter()
            .find(|state| state.scxml_id == "ExecSetup")
            .expect("compound state");
        assert_eq!(compound.kind, StateKindDto::Compound);
        assert_eq!(compound.editor.x, 100.0);
        assert_eq!(compound.initial_child_scxml_id.as_deref(), Some("Talk"));
    }

    #[test]
    fn preserves_duplicate_scxml_ids_with_unique_internal_ids() {
        let workflow = parse_scxml(
            r#"<scxml initial="lookAtFace"><parallel id="P"><state id="lookAtFace" initial="lookAtFace"><state id="lookAtFace"/></state></parallel></scxml>"#,
        )
        .expect("SCXML should parse");

        let matching: Vec<_> = workflow
            .states
            .iter()
            .filter(|state| state.scxml_id == "lookAtFace")
            .collect();
        assert_eq!(matching.len(), 2);
        assert_ne!(matching[0].id, matching[1].id);
    }

    #[test]
    fn serializes_a_parsed_workflow() {
        let workflow = parse_scxml(SAMPLE).expect("SCXML should parse");
        let serialized = serialize_scxml(&workflow).expect("workflow should serialize");
        assert!(serialized.contains("initial=\"ExecSetup\""));
        assert!(serialized.contains("<state id=\"ExecSetup\" initial=\"Talk\">"));
        assert!(serialized.contains("<slot key=\"Model\""));
        assert!(serialized.contains("<inheritSlot key=\"Speech\""));
    }

    #[test]
    fn preserves_targetless_behavior_exit_sends() {
        let workflow = parse_scxml(
            r#"<scxml initial="Nop#exit"><state id="Nop#exit"><transition event="Nop.success"><send event="behavior.success"/></transition></state></scxml>"#,
        )
        .expect("SCXML should parse");

        assert_eq!(workflow.transitions.len(), 1);
        let transition = &workflow.transitions[0];
        assert!(transition.target_scxml_id.is_empty());
        assert_eq!(transition.sent_events, vec!["behavior.success"]);

        let serialized = serialize_scxml(&workflow).expect("workflow should serialize");
        assert!(serialized.contains("<send event=\"behavior.success\"/>"));
        assert!(!serialized.contains("target=\"\""));
    }
}
