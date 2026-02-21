use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

// ── ArchitectureGraph schema ────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchitectureGraph {
    pub version: i64,
    pub level: i64,
    pub direction: String,
    #[serde(default)]
    pub description: String,
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    #[serde(default)]
    pub groups: Vec<GraphGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(rename = "type")]
    pub edge_type: String,
    #[serde(default)]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphGroup {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
}

// ── AnalysisFindings schema ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisFindings {
    pub version: i64,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub stats: FindingsStats,
    pub findings: Vec<Finding>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FindingsStats {
    #[serde(default)]
    pub total: usize,
    #[serde(default)]
    pub by_severity: HashMap<String, usize>,
    #[serde(default)]
    pub by_category: HashMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    #[serde(default)]
    pub id: String,
    pub title: String,
    pub severity: String,
    pub category: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub locations: Vec<FindingLocation>,
    #[serde(default)]
    pub suggestion: String,
    #[serde(default)]
    pub effort: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FindingLocation {
    pub file: String,
    #[serde(default)]
    pub line_start: Option<i64>,
    #[serde(default)]
    pub line_end: Option<i64>,
    #[serde(default)]
    pub snippet: Option<String>,
}

// ── Validation warnings ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct ValidationWarning {
    pub message: String,
}

// ── Parse results ───────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ParsedGraph {
    pub graph: ArchitectureGraph,
    pub warnings: Vec<ValidationWarning>,
}

#[derive(Debug, Clone)]
pub struct ParsedFindings {
    pub findings: AnalysisFindings,
    pub warnings: Vec<ValidationWarning>,
}

// ── JSON extraction ─────────────────────────────────────────────────

/// Extract the first JSON code block from raw AI output.
pub fn extract_json_block(raw: &str) -> Option<String> {
    let start_marker = "```json";
    let end_marker = "```";

    let start = raw.find(start_marker)?;
    let content_start = start + start_marker.len();
    let rest = &raw[content_start..];
    let end = rest.find(end_marker)?;
    let json = rest[..end].trim();

    if json.is_empty() {
        None
    } else {
        Some(json.to_string())
    }
}

/// Strip trailing commas from JSON (common AI output error).
fn strip_trailing_commas(json: &str) -> String {
    let mut result = String::with_capacity(json.len());
    let mut in_string = false;
    let mut escape_next = false;
    let chars: Vec<char> = json.chars().collect();

    for i in 0..chars.len() {
        let ch = chars[i];

        if escape_next {
            escape_next = false;
            result.push(ch);
            continue;
        }

        if ch == '\\' && in_string {
            escape_next = true;
            result.push(ch);
            continue;
        }

        if ch == '"' {
            in_string = !in_string;
            result.push(ch);
            continue;
        }

        if in_string {
            result.push(ch);
            continue;
        }

        // Check if this comma is followed only by whitespace and then ] or }
        if ch == ',' {
            let rest = &chars[i + 1..];
            let next_non_ws = rest.iter().find(|c| !c.is_whitespace());
            if matches!(next_non_ws, Some(']') | Some('}')) {
                // Skip this trailing comma
                continue;
            }
        }

        result.push(ch);
    }

    result
}

// ── Graph parsing and validation ────────────────────────────────────

/// Parse and validate an ArchitectureGraph from raw AI output.
pub fn parse_graph(raw: &str) -> Result<ParsedGraph, String> {
    let json_str = extract_json_block(raw)
        .ok_or_else(|| "no JSON code block found in output".to_string())?;

    let graph: ArchitectureGraph = serde_json::from_str(&json_str).or_else(|_| {
        // Retry with trailing comma stripping
        let cleaned = strip_trailing_commas(&json_str);
        serde_json::from_str(&cleaned)
    }).map_err(|e| format!("invalid ArchitectureGraph JSON: {e}"))?;

    let mut warnings = Vec::new();

    // Validate node IDs match level pattern
    let level_prefix = format!("L{}_", graph.level);
    let node_ids: HashSet<&str> = graph.nodes.iter().map(|n| n.id.as_str()).collect();

    if node_ids.len() != graph.nodes.len() {
        warnings.push(ValidationWarning {
            message: "duplicate node IDs detected".to_string(),
        });
    }

    for node in &graph.nodes {
        if !node.id.starts_with(&level_prefix) {
            warnings.push(ValidationWarning {
                message: format!(
                    "node '{}' does not match expected prefix '{}'",
                    node.id, level_prefix
                ),
            });
        }
    }

    // Validate edge references
    for edge in &graph.edges {
        if !node_ids.contains(edge.source.as_str()) {
            warnings.push(ValidationWarning {
                message: format!("edge source '{}' references unknown node", edge.source),
            });
        }
        if !node_ids.contains(edge.target.as_str()) {
            warnings.push(ValidationWarning {
                message: format!("edge target '{}' references unknown node", edge.target),
            });
        }
    }

    // Validate group references
    let group_ids: HashSet<&str> = graph.groups.iter().map(|g| g.id.as_str()).collect();
    for node in &graph.nodes {
        if let Some(ref group) = node.group {
            if !group_ids.contains(group.as_str()) {
                warnings.push(ValidationWarning {
                    message: format!(
                        "node '{}' references unknown group '{}'",
                        node.id, group
                    ),
                });
            }
        }
    }

    Ok(ParsedGraph { graph, warnings })
}

// ── Findings parsing and validation ─────────────────────────────────

/// Generate a stable finding ID: F_{preset}_{sha256(title)[:8]}
fn generate_finding_id(preset_name: &str, title: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::Hasher;

    // Use a fast hash for ID generation (not cryptographic, but stable and sufficient
    // for dedup within a single analysis run).
    let mut hasher = DefaultHasher::new();
    hasher.write(title.as_bytes());
    let hash = hasher.finish();
    let short = format!("{:016x}", hash);

    // Extract preset short name (first segment before any slash or space)
    let short_name = preset_name
        .split(|c: char| c == '/' || c == ' ')
        .next()
        .unwrap_or("unknown")
        .to_lowercase();

    format!("F_{}_{}", short_name, &short[..8])
}

/// Recompute stats from the findings array (never trust AI stats).
fn compute_stats(findings: &[Finding]) -> FindingsStats {
    let mut by_severity: HashMap<String, usize> = HashMap::new();
    let mut by_category: HashMap<String, usize> = HashMap::new();

    for finding in findings {
        *by_severity.entry(finding.severity.clone()).or_insert(0) += 1;
        *by_category.entry(finding.category.clone()).or_insert(0) += 1;
    }

    FindingsStats {
        total: findings.len(),
        by_severity,
        by_category,
    }
}

/// Parse and validate AnalysisFindings from raw AI output.
pub fn parse_findings(raw: &str, preset_name: &str) -> Result<ParsedFindings, String> {
    let json_str = extract_json_block(raw)
        .ok_or_else(|| "no JSON code block found in output".to_string())?;

    let mut findings: AnalysisFindings = serde_json::from_str(&json_str).or_else(|_| {
        let cleaned = strip_trailing_commas(&json_str);
        serde_json::from_str(&cleaned)
    }).map_err(|e| format!("invalid AnalysisFindings JSON: {e}"))?;

    let mut warnings = Vec::new();

    // Generate stable IDs for each finding
    for finding in &mut findings.findings {
        finding.id = generate_finding_id(preset_name, &finding.title);
    }

    // Validate severity values
    let valid_severities = ["critical", "high", "medium", "low", "info"];
    for finding in &findings.findings {
        if !valid_severities.contains(&finding.severity.as_str()) {
            warnings.push(ValidationWarning {
                message: format!(
                    "finding '{}' has invalid severity '{}'",
                    finding.title, finding.severity
                ),
            });
        }
    }

    // Always recompute stats from actual findings
    findings.stats = compute_stats(&findings.findings);

    Ok(ParsedFindings { findings, warnings })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_json_block() {
        let input = "Here is the result:\n```json\n{\"version\": 1}\n```\nDone.";
        let result = extract_json_block(input);
        assert_eq!(result, Some("{\"version\": 1}".to_string()));
    }

    #[test]
    fn test_extract_json_block_none() {
        let input = "No JSON here.";
        assert_eq!(extract_json_block(input), None);
    }

    #[test]
    fn test_strip_trailing_commas() {
        let input = r#"{"nodes": ["a", "b",], "edges": [1, 2,]}"#;
        let cleaned = strip_trailing_commas(input);
        assert_eq!(cleaned, r#"{"nodes": ["a", "b"], "edges": [1, 2]}"#);
    }

    #[test]
    fn test_strip_trailing_commas_in_string() {
        // Commas inside strings should not be stripped
        let input = r#"{"text": "hello, world,", "arr": [1,]}"#;
        let cleaned = strip_trailing_commas(input);
        assert_eq!(cleaned, r#"{"text": "hello, world,", "arr": [1]}"#);
    }

    #[test]
    fn test_parse_graph() {
        let raw = r#"Here is the architecture:
```json
{
  "version": 1,
  "level": 1,
  "direction": "top-down",
  "description": "Test graph",
  "nodes": [
    {"id": "L1_app", "label": "App", "type": "service", "group": "backend"},
    {"id": "L1_db", "label": "Database", "type": "database", "group": "backend"}
  ],
  "edges": [
    {"source": "L1_app", "target": "L1_db", "label": "queries", "type": "dependency"}
  ],
  "groups": [
    {"id": "backend", "label": "Backend"}
  ]
}
```
Done."#;
        let result = parse_graph(raw).unwrap();
        assert_eq!(result.graph.nodes.len(), 2);
        assert_eq!(result.graph.edges.len(), 1);
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn test_parse_graph_with_warnings() {
        let raw = r#"```json
{
  "version": 1,
  "level": 1,
  "direction": "top-down",
  "nodes": [
    {"id": "L1_app", "label": "App", "type": "service"},
    {"id": "L2_wrong", "label": "Wrong", "type": "module"}
  ],
  "edges": [
    {"source": "L1_app", "target": "L1_missing", "type": "dependency"}
  ],
  "groups": []
}
```"#;
        let result = parse_graph(raw).unwrap();
        // L2_wrong has wrong prefix for level 1
        assert!(result.warnings.iter().any(|w| w.message.contains("L2_wrong")));
        // L1_missing is referenced but doesn't exist
        assert!(result.warnings.iter().any(|w| w.message.contains("L1_missing")));
    }

    #[test]
    fn test_parse_graph_trailing_commas() {
        let raw = r#"```json
{
  "version": 1,
  "level": 1,
  "direction": "top-down",
  "nodes": [
    {"id": "L1_app", "label": "App", "type": "service"},
  ],
  "edges": [],
  "groups": [],
}
```"#;
        let result = parse_graph(raw);
        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_findings() {
        let raw = r#"```json
{
  "version": 1,
  "summary": "Found 2 issues",
  "stats": {"total": 999},
  "findings": [
    {
      "title": "SQL injection risk",
      "severity": "high",
      "category": "security/injection",
      "description": "Unsanitized input",
      "locations": [{"file": "src/db.rs", "line_start": 42}],
      "suggestion": "Use parameterized queries",
      "effort": "small"
    },
    {
      "title": "Missing auth check",
      "severity": "medium",
      "category": "security/authorization",
      "description": "No auth on endpoint",
      "locations": [],
      "suggestion": "Add middleware",
      "effort": "medium"
    }
  ]
}
```"#;
        let result = parse_findings(raw, "security").unwrap();
        let findings = &result.findings;

        // Stats should be recomputed, not trust AI's "999"
        assert_eq!(findings.stats.total, 2);
        assert_eq!(findings.stats.by_severity.get("high"), Some(&1));
        assert_eq!(findings.stats.by_severity.get("medium"), Some(&1));
        assert_eq!(findings.stats.by_category.get("security/injection"), Some(&1));

        // IDs should be generated
        assert!(findings.findings[0].id.starts_with("F_security_"));
        assert!(findings.findings[1].id.starts_with("F_security_"));
        assert_ne!(findings.findings[0].id, findings.findings[1].id);
    }

    #[test]
    fn test_finding_id_stability() {
        let id1 = generate_finding_id("security", "SQL injection risk");
        let id2 = generate_finding_id("security", "SQL injection risk");
        assert_eq!(id1, id2);

        let id3 = generate_finding_id("security", "Different title");
        assert_ne!(id1, id3);
    }
}
