use super::helpers::{focus_node, node_label, problem};
use super::index::ValidationIndex;
use super::types::{EditorProblemDto, ValidationNodeDto, ValidationRequestDto};

pub(super) fn validate_workflow(
    request: &ValidationRequestDto,
    index: &ValidationIndex<'_>,
    problems: &mut Vec<EditorProblemDto>,
) {
    let root_nodes: Vec<&ValidationNodeDto> = request
        .nodes
        .iter()
        .filter(|node| {
            node.parent_id.is_none()
                && node.node_type != "slot"
                && node.node_type != "parallelLane"
        })
        .collect();

    if !root_nodes.is_empty() {
        let initial_nodes: Vec<&ValidationNodeDto> = root_nodes
            .iter()
            .copied()
            .filter(|node| node.is_initial)
            .collect();

        if initial_nodes.is_empty() {
            problems.push(problem(
                "workflow-no-initial",
                "warning",
                "Workflow",
                "No initial state",
                "No root state is marked as initial.",
            ));
        } else if initial_nodes.len() > 1 {
            for node in initial_nodes {
                let mut item = problem(
                    format!("workflow-multiple-initial-{}", node.id),
                    "error",
                    "Workflow",
                    "Multiple initial states",
                    format!("{} is one of multiple initial states.", node_label(node)),
                );
                focus_node(&mut item, node.id.clone());
                item.detail_tab = Some("allgemein".into());
                item.mode = Some("event".into());
                problems.push(item);
            }
        }
    }

    for compound in request
        .nodes
        .iter()
        .filter(|node| node.node_type == "compound" && !node.is_collapsed)
    {
        let children: Vec<&ValidationNodeDto> = index
            .children_by_parent
            .get(compound.id.as_str())
            .into_iter()
            .flatten()
            .copied()
            .filter(|node| {
                node.node_type != "slot"
                    && node.node_type != "parallelLane"
                    && !node.is_reference
            })
            .collect();
        let initial_children: Vec<&ValidationNodeDto> = children
            .iter()
            .copied()
            .filter(|node| node.is_initial)
            .collect();

        if children.is_empty() {
            let mut item = problem(
                format!("compound-empty-{}", compound.id),
                "error",
                "Workflow",
                "Compound needs an initial state",
                format!(
                    "{} does not contain a state that can be initial.",
                    node_label(compound)
                ),
            );
            focus_node(&mut item, compound.id.clone());
            item.detail_tab = Some("allgemein".into());
            item.mode = Some("event".into());
            problems.push(item);
            continue;
        }

        if initial_children.len() != 1 {
            let mut item = problem(
                format!("compound-initial-{}", compound.id),
                "error",
                "Workflow",
                "Compound needs one initial state",
                format!(
                    "{} must have exactly one initial child state.",
                    node_label(compound)
                ),
            );
            item.node_id = Some(compound.id.clone());
            item.detail_tab = Some("allgemein".into());
            item.mode = Some("event".into());
            item.focus_node_ids = std::iter::once(compound.id.clone())
                .chain(initial_children.iter().map(|node| node.id.clone()))
                .collect();
            problems.push(item);
        }
    }
}
