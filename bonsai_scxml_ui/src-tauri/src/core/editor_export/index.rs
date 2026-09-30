use std::collections::{HashMap, HashSet};

use super::{helpers::state_name, types::{EditorExportNodeDto, EditorExportRequestDto}};

pub(super) struct ExportIndex<'a> {
    nodes: &'a [EditorExportNodeDto],
    pub(super) nodes_by_id: HashMap<&'a str, &'a EditorExportNodeDto>,
    flattened_lanes: HashMap<&'a str, &'a str>,
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

        Self {
            nodes: &request.nodes,
            nodes_by_id,
            flattened_lanes,
        }
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

    pub(super) fn effective_children(&self, parent_id: &str) -> Vec<&'a EditorExportNodeDto> {
        self.nodes
            .iter()
            .filter(|node| {
                !self.is_flattened_lane(&node.id)
                    && self.effective_parent_id(node).as_deref() == Some(parent_id)
            })
            .collect()
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

    pub(super) fn nearest_container_ancestor(
        &self,
        node: &EditorExportNodeDto,
    ) -> Option<&'a str> {
        let mut parent_id = node.parent_id.as_deref();
        let mut visited = HashSet::new();
        while let Some(id) = parent_id {
            if !visited.insert(id) {
                return None;
            }
            let parent = self.nodes_by_id.get(id).copied()?;
            if matches!(parent.node_type.as_str(), "compound" | "parallel") {
                return Some(parent.id.as_str());
            }
            parent_id = parent.parent_id.as_deref();
        }
        None
    }
}
