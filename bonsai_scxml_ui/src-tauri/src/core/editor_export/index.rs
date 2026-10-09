use std::collections::{HashMap, HashSet};

use super::{
    helpers::state_name,
    types::{EditorExportNodeDto, EditorExportRequestDto},
};

pub(super) struct ExportIndex<'a> {
    pub(super) nodes_by_id: HashMap<&'a str, &'a EditorExportNodeDto>,
    flattened_lanes: HashMap<&'a str, &'a str>,
    effective_children_by_parent: HashMap<String, Vec<&'a EditorExportNodeDto>>,
}

impl<'a> ExportIndex<'a> {
    pub(super) fn new(request: &'a EditorExportRequestDto) -> Self {
        let nodes_by_id = request
            .nodes
            .iter()
            .map(|node| (node.id.as_str(), node))
            .collect::<HashMap<_, _>>();

        let mut children_by_parent: HashMap<&str, Vec<&EditorExportNodeDto>> = HashMap::new();
        for node in &request.nodes {
            if let Some(parent_id) = node.parent_id.as_deref() {
                children_by_parent.entry(parent_id).or_default().push(node);
            }
        }

        let mut flattened_lanes = HashMap::new();
        for node in &request.nodes {
            if node.node_type != "parallelLane" {
                continue;
            }
            let children = children_by_parent
                .get(node.id.as_str())
                .map(Vec::as_slice)
                .unwrap_or(&[]);
            if children.len() != 1 {
                continue;
            }
            let child = children[0];
            let lane_name = state_name(node);
            let child_name = state_name(child);
            if !lane_name.is_empty() && lane_name == child_name {
                flattened_lanes.insert(node.id.as_str(), child.id.as_str());
            }
        }

        let mut index = Self {
            nodes_by_id,
            flattened_lanes,
            effective_children_by_parent: HashMap::new(),
        };
        for node in &request.nodes {
            if index.is_flattened_lane(&node.id) {
                continue;
            }
            if let Some(parent_id) = index.effective_parent_id(node) {
                index
                    .effective_children_by_parent
                    .entry(parent_id)
                    .or_default()
                    .push(node);
            }
        }
        index
    }

    pub(super) fn is_flattened_lane(&self, node_id: &str) -> bool {
        self.flattened_lanes.contains_key(node_id)
    }

    pub(super) fn semantic_state_id(&self, node_id: &str) -> String {
        let mut current = node_id;
        let mut visited = HashSet::new();
        while let Some(child_id) = self.flattened_lanes.get(current).copied() {
            if !visited.insert(current) {
                break;
            }
            current = child_id;
        }
        current.to_string()
    }

    pub(super) fn effective_parent_id(&self, node: &EditorExportNodeDto) -> Option<String> {
        let mut parent_id = node.parent_id.as_deref()?;
        let mut visited = HashSet::new();
        while self.is_flattened_lane(parent_id) {
            if !visited.insert(parent_id) {
                return None;
            }
            parent_id = self.nodes_by_id.get(parent_id)?.parent_id.as_deref()?;
        }
        Some(parent_id.to_string())
    }

    pub(super) fn effective_children(&self, parent_id: &str) -> &[&'a EditorExportNodeDto] {
        self.effective_children_by_parent
            .get(parent_id)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    pub(super) fn is_inside_container(&self, node_id: &str, container_id: &str) -> bool {
        node_id == container_id || self.is_strict_descendant(node_id, container_id)
    }

    pub(super) fn is_strict_descendant(&self, node_id: &str, ancestor_id: &str) -> bool {
        let mut current = self.nodes_by_id.get(node_id).copied();
        let mut visited = HashSet::new();
        while let Some(node) = current {
            let Some(parent_id) = node.parent_id.as_deref() else {
                return false;
            };
            if !visited.insert(parent_id) {
                return false;
            }
            if parent_id == ancestor_id {
                return true;
            }
            current = self.nodes_by_id.get(parent_id).copied();
        }
        false
    }

    /// Resolve the single semantic owner for an editor transition.
    ///
    /// A transition that leaves nested containers belongs to the outermost
    /// Compound/Parallel boundary it exits.  Older exporter code inspected
    /// every container independently, which meant the same editor edge could
    /// be emitted once for each exited ancestor and therefore reuse the same
    /// transition id multiple times.
    pub(super) fn transition_owner_id(&self, source_id: &str, target_id: &str) -> Option<&'a str> {
        let source = self.nodes_by_id.get(source_id).copied()?;
        let mut owner = source.id.as_str();
        let mut parent_id = source.parent_id.as_deref();
        let mut visited = HashSet::new();

        while let Some(id) = parent_id {
            if !visited.insert(id) {
                return None;
            }

            let parent = self.nodes_by_id.get(id).copied()?;
            if matches!(parent.node_type.as_str(), "compound" | "parallel")
                && !self.is_inside_container(target_id, id)
            {
                owner = parent.id.as_str();
            }
            parent_id = parent.parent_id.as_deref();
        }

        Some(owner)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(id: &str, parent: Option<&str>, node_type: &str, name: &str) -> EditorExportNodeDto {
        EditorExportNodeDto {
            id: id.into(),
            parent_id: parent.map(str::to_string),
            node_type: node_type.into(),
            full_skill_name: name.into(),
            label: name.into(),
            ..Default::default()
        }
    }

    #[test]
    fn effective_children_keep_request_order_across_nested_flattened_lanes() {
        let request = EditorExportRequestDto {
            nodes: vec![
                node("leaf", Some("inner"), "custom", "Shared"),
                node("root", None, "parallel", "Root"),
                node("regular", Some("root"), "custom", "Regular"),
                node("outer", Some("root"), "parallelLane", "Shared"),
                node("inner", Some("outer"), "parallelLane", "Shared"),
                node("dangling", Some("missing"), "custom", "Dangling"),
                node("cycle-a", Some("cycle-b"), "parallelLane", "Cycle"),
                node("cycle-b", Some("cycle-a"), "parallelLane", "Cycle"),
            ],
            ..Default::default()
        };
        let index = ExportIndex::new(&request);
        assert_eq!(index.semantic_state_id("outer"), "leaf");
        assert_eq!(
            index.effective_parent_id(&request.nodes[0]).as_deref(),
            Some("root")
        );
        assert_eq!(
            index
                .effective_children("root")
                .iter()
                .map(|node| node.id.as_str())
                .collect::<Vec<_>>(),
            ["leaf", "regular"]
        );
        assert_eq!(index.effective_children("missing")[0].id, "dangling");
        assert!(index.effective_children("inner").is_empty());
        assert!(index.effective_children("unknown").is_empty());
        assert_eq!(index.effective_parent_id(&request.nodes[6]), None);
        assert!(index.effective_children("cycle-a").is_empty());
    }

    #[test]
    fn effective_children_preserve_duplicate_instances_and_last_wins_id_lookup() {
        let request = EditorExportRequestDto {
            nodes: vec![
                node("duplicate", Some("root"), "custom", "First"),
                node("duplicate", Some("other"), "custom", "Last"),
            ],
            ..Default::default()
        };
        let index = ExportIndex::new(&request);
        assert_eq!(index.effective_children("root")[0].label, "First");
        assert_eq!(index.effective_children("other")[0].label, "Last");
        assert_eq!(index.nodes_by_id["duplicate"].label, "Last");
    }
}
