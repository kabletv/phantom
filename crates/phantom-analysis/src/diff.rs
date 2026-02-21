use crate::parser::ArchitectureGraph;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphDiff {
    pub added_nodes: Vec<String>,
    pub removed_nodes: Vec<String>,
    pub modified_nodes: Vec<ModifiedNode>,
    pub added_edges: Vec<EdgeRef>,
    pub removed_edges: Vec<EdgeRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModifiedNode {
    pub id: String,
    pub changes: Vec<NodeChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum NodeChange {
    LabelChanged { old: String, new: String },
    TypeChanged { old: String, new: String },
    GroupChanged { old: Option<String>, new: Option<String> },
    EdgesChanged,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct EdgeRef {
    pub source: String,
    pub target: String,
    pub label: Option<String>,
    pub edge_type: String,
}

/// Compare two ArchitectureGraph instances and produce a diff.
///
/// Identity is based on node ID. Two nodes with the same ID across graphs
/// are considered the same node. A node is "modified" if its label, type,
/// group, or connected edges differ.
pub fn diff_graphs(base: &ArchitectureGraph, branch: &ArchitectureGraph) -> GraphDiff {
    // Build node maps
    let base_nodes: HashMap<&str, &crate::parser::GraphNode> =
        base.nodes.iter().map(|n| (n.id.as_str(), n)).collect();
    let branch_nodes: HashMap<&str, &crate::parser::GraphNode> =
        branch.nodes.iter().map(|n| (n.id.as_str(), n)).collect();

    let base_ids: HashSet<&str> = base_nodes.keys().copied().collect();
    let branch_ids: HashSet<&str> = branch_nodes.keys().copied().collect();

    // Added / removed nodes
    let added_nodes: Vec<String> = branch_ids
        .difference(&base_ids)
        .map(|s| s.to_string())
        .collect();

    let removed_nodes: Vec<String> = base_ids
        .difference(&branch_ids)
        .map(|s| s.to_string())
        .collect();

    // Build per-node edge sets for detecting edge changes on shared nodes
    let base_node_edges = build_node_edge_sets(&base.edges);
    let branch_node_edges = build_node_edge_sets(&branch.edges);

    // Modified nodes (in intersection)
    let mut modified_nodes = Vec::new();
    for id in base_ids.intersection(&branch_ids) {
        let base_node = base_nodes[id];
        let branch_node = branch_nodes[id];

        let mut changes = Vec::new();

        if base_node.label != branch_node.label {
            changes.push(NodeChange::LabelChanged {
                old: base_node.label.clone(),
                new: branch_node.label.clone(),
            });
        }

        if base_node.node_type != branch_node.node_type {
            changes.push(NodeChange::TypeChanged {
                old: base_node.node_type.clone(),
                new: branch_node.node_type.clone(),
            });
        }

        if base_node.group != branch_node.group {
            changes.push(NodeChange::GroupChanged {
                old: base_node.group.clone(),
                new: branch_node.group.clone(),
            });
        }

        // Compare connected edges for this node
        let base_edges = base_node_edges.get(id).cloned().unwrap_or_default();
        let branch_edges = branch_node_edges.get(id).cloned().unwrap_or_default();
        if base_edges != branch_edges {
            changes.push(NodeChange::EdgesChanged);
        }

        if !changes.is_empty() {
            modified_nodes.push(ModifiedNode {
                id: id.to_string(),
                changes,
            });
        }
    }

    // Global edge diff
    let base_edge_set: HashSet<EdgeRef> = base.edges.iter().map(edge_to_ref).collect();
    let branch_edge_set: HashSet<EdgeRef> = branch.edges.iter().map(edge_to_ref).collect();

    let added_edges: Vec<EdgeRef> = branch_edge_set
        .difference(&base_edge_set)
        .cloned()
        .collect();

    let removed_edges: Vec<EdgeRef> = base_edge_set
        .difference(&branch_edge_set)
        .cloned()
        .collect();

    GraphDiff {
        added_nodes,
        removed_nodes,
        modified_nodes,
        added_edges,
        removed_edges,
    }
}

fn edge_to_ref(edge: &crate::parser::GraphEdge) -> EdgeRef {
    EdgeRef {
        source: edge.source.clone(),
        target: edge.target.clone(),
        label: edge.label.clone(),
        edge_type: edge.edge_type.clone(),
    }
}

/// Build a map from node_id -> set of (source, target, label) tuples for edges
/// connected to that node.
fn build_node_edge_sets(
    edges: &[crate::parser::GraphEdge],
) -> HashMap<&str, HashSet<(String, String, Option<String>)>> {
    let mut map: HashMap<&str, HashSet<(String, String, Option<String>)>> = HashMap::new();

    for edge in edges {
        let tuple = (
            edge.source.clone(),
            edge.target.clone(),
            edge.label.clone(),
        );
        map.entry(edge.source.as_str())
            .or_default()
            .insert(tuple.clone());
        map.entry(edge.target.as_str())
            .or_default()
            .insert(tuple);
    }

    map
}

/// Convenience: parse a JSON string into an ArchitectureGraph for diffing.
pub fn parse_graph_json(json: &str) -> Result<ArchitectureGraph, String> {
    serde_json::from_str(json).map_err(|e| format!("invalid graph JSON: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::{GraphEdge, GraphGroup, GraphNode};

    fn make_node(id: &str, label: &str, node_type: &str, group: Option<&str>) -> GraphNode {
        GraphNode {
            id: id.to_string(),
            label: label.to_string(),
            node_type: node_type.to_string(),
            group: group.map(|s| s.to_string()),
            metadata: None,
        }
    }

    fn make_edge(source: &str, target: &str, edge_type: &str, label: Option<&str>) -> GraphEdge {
        GraphEdge {
            source: source.to_string(),
            target: target.to_string(),
            edge_type: edge_type.to_string(),
            label: label.map(|s| s.to_string()),
            metadata: None,
        }
    }

    #[test]
    fn test_diff_added_and_removed() {
        let base = ArchitectureGraph {
            version: 1,
            level: 1,
            direction: "top-down".to_string(),
            description: String::new(),
            nodes: vec![
                make_node("L1_a", "A", "service", None),
                make_node("L1_b", "B", "service", None),
            ],
            edges: vec![make_edge("L1_a", "L1_b", "dependency", None)],
            groups: vec![],
        };

        let branch = ArchitectureGraph {
            version: 1,
            level: 1,
            direction: "top-down".to_string(),
            description: String::new(),
            nodes: vec![
                make_node("L1_a", "A", "service", None),
                make_node("L1_c", "C", "service", None),
            ],
            edges: vec![make_edge("L1_a", "L1_c", "dependency", None)],
            groups: vec![],
        };

        let diff = diff_graphs(&base, &branch);
        assert!(diff.added_nodes.contains(&"L1_c".to_string()));
        assert!(diff.removed_nodes.contains(&"L1_b".to_string()));
        assert_eq!(diff.added_edges.len(), 1);
        assert_eq!(diff.removed_edges.len(), 1);
    }

    #[test]
    fn test_diff_modified_label() {
        let base = ArchitectureGraph {
            version: 1,
            level: 1,
            direction: "top-down".to_string(),
            description: String::new(),
            nodes: vec![make_node("L1_a", "Old Label", "service", None)],
            edges: vec![],
            groups: vec![],
        };

        let branch = ArchitectureGraph {
            version: 1,
            level: 1,
            direction: "top-down".to_string(),
            description: String::new(),
            nodes: vec![make_node("L1_a", "New Label", "service", None)],
            edges: vec![],
            groups: vec![],
        };

        let diff = diff_graphs(&base, &branch);
        assert!(diff.added_nodes.is_empty());
        assert!(diff.removed_nodes.is_empty());
        assert_eq!(diff.modified_nodes.len(), 1);
        assert_eq!(diff.modified_nodes[0].id, "L1_a");
        assert!(matches!(
            &diff.modified_nodes[0].changes[0],
            NodeChange::LabelChanged { old, new } if old == "Old Label" && new == "New Label"
        ));
    }

    #[test]
    fn test_diff_modified_group() {
        let base = ArchitectureGraph {
            version: 1,
            level: 1,
            direction: "top-down".to_string(),
            description: String::new(),
            nodes: vec![make_node("L1_a", "A", "service", Some("backend"))],
            edges: vec![],
            groups: vec![
                GraphGroup { id: "backend".to_string(), label: "Backend".to_string(), description: None },
            ],
        };

        let branch = ArchitectureGraph {
            version: 1,
            level: 1,
            direction: "top-down".to_string(),
            description: String::new(),
            nodes: vec![make_node("L1_a", "A", "service", Some("frontend"))],
            edges: vec![],
            groups: vec![
                GraphGroup { id: "frontend".to_string(), label: "Frontend".to_string(), description: None },
            ],
        };

        let diff = diff_graphs(&base, &branch);
        assert_eq!(diff.modified_nodes.len(), 1);
        assert!(matches!(
            &diff.modified_nodes[0].changes[0],
            NodeChange::GroupChanged { old: Some(o), new: Some(n) } if o == "backend" && n == "frontend"
        ));
    }

    #[test]
    fn test_diff_edges_changed() {
        let base = ArchitectureGraph {
            version: 1,
            level: 1,
            direction: "top-down".to_string(),
            description: String::new(),
            nodes: vec![
                make_node("L1_a", "A", "service", None),
                make_node("L1_b", "B", "service", None),
                make_node("L1_c", "C", "service", None),
            ],
            edges: vec![make_edge("L1_a", "L1_b", "dependency", None)],
            groups: vec![],
        };

        let branch = ArchitectureGraph {
            version: 1,
            level: 1,
            direction: "top-down".to_string(),
            description: String::new(),
            nodes: vec![
                make_node("L1_a", "A", "service", None),
                make_node("L1_b", "B", "service", None),
                make_node("L1_c", "C", "service", None),
            ],
            edges: vec![
                make_edge("L1_a", "L1_b", "dependency", None),
                make_edge("L1_a", "L1_c", "dataflow", Some("new edge")),
            ],
            groups: vec![],
        };

        let diff = diff_graphs(&base, &branch);
        // L1_a and L1_c have changed edges
        let modified_ids: HashSet<&str> = diff.modified_nodes.iter().map(|m| m.id.as_str()).collect();
        assert!(modified_ids.contains("L1_a"));
        assert!(modified_ids.contains("L1_c"));
    }

    #[test]
    fn test_diff_unchanged() {
        let graph = ArchitectureGraph {
            version: 1,
            level: 1,
            direction: "top-down".to_string(),
            description: String::new(),
            nodes: vec![
                make_node("L1_a", "A", "service", None),
                make_node("L1_b", "B", "service", None),
            ],
            edges: vec![make_edge("L1_a", "L1_b", "dependency", None)],
            groups: vec![],
        };

        let diff = diff_graphs(&graph, &graph);
        assert!(diff.added_nodes.is_empty());
        assert!(diff.removed_nodes.is_empty());
        assert!(diff.modified_nodes.is_empty());
        assert!(diff.added_edges.is_empty());
        assert!(diff.removed_edges.is_empty());
    }

    #[test]
    fn test_parse_graph_json() {
        let json = r#"{
            "version": 1,
            "level": 1,
            "direction": "top-down",
            "nodes": [{"id": "L1_x", "label": "X", "type": "service"}],
            "edges": [],
            "groups": []
        }"#;
        let graph = parse_graph_json(json).unwrap();
        assert_eq!(graph.nodes.len(), 1);
        assert_eq!(graph.nodes[0].id, "L1_x");
    }
}
