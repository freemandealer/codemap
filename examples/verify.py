"""Check this design package's example; this is not the CodeMap product validator."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
import sys
from urllib.parse import urlsplit

try:
    from jsonschema import Draft202012Validator
except ImportError:
    raise SystemExit("需要 jsonschema；请按 examples/minifs/README.md 在独立环境安装。")


ROOT = Path(__file__).resolve().parents[1]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check_example():
    schema = json.loads((ROOT / "schemas/codemap.schema.json").read_text())
    data = json.loads((ROOT / "examples/minifs/map.codemap.json").read_text())
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(data)
    tables = {}
    for name in ("entities", "nodes", "ports", "relations", "flows", "evidence", "snippets"):
        table = {item["id"]: item for item in data[name]}
        require(len(table) == len(data[name]), f"{name}: 重复 ID")
        tables[name] = table

    def lookup(table, key):
        require(key in tables[table], f"{table}: 引用不存在 {key}")
        return tables[table][key]

    def refs(table, keys):
        for key in keys:
            lookup(table, key)

    nodes = tables["nodes"]
    roots = [node["id"] for node in nodes.values() if node["parentId"] is None]
    require(roots == [data["rootNodeId"]], "必须存在唯一且匹配的根")
    ancestors = {}
    for node_id in nodes:
        chain = []
        current = node_id
        while current is not None:
            require(current not in chain, f"父子环: {node_id}")
            chain.append(current)
            current = lookup("nodes", current)["parentId"]
        require(chain[-1] == data["rootNodeId"], f"孤立节点: {node_id}")
        require(len(chain) <= 32, f"超过样例深度预算: {node_id}")
        ancestors[node_id] = chain

    for node in nodes.values():
        refs("entities", node["entityIds"])
        refs("evidence", node["evidenceIds"])
        refs("snippets", node["snippetIds"])
    refs("nodes", data["primaryPath"])
    refs("entities", data["scope"]["entryEntityIds"])

    for entity in tables["entities"].values():
        canonical = lookup("nodes", entity["canonicalNodeId"])
        require(entity["id"] in canonical["entityIds"], f"规范节点未引用实体: {entity['id']}")
        refs("evidence", entity["evidenceIds"])
    for port in tables["ports"].values():
        entity = lookup("entities", port["entityId"])
        if "detailNodeId" in port:
            detail = lookup("nodes", port["detailNodeId"])
            require(entity["canonicalNodeId"] in ancestors[detail["id"]], f"端口跨越规范子树: {port['id']}")
    for relation in tables["relations"].values():
        for side in ("source", "target"):
            entity_id = relation[side + "EntityId"]
            lookup("entities", entity_id)
            if side + "PortId" in relation:
                port = lookup("ports", relation[side + "PortId"])
                require(port["entityId"] == entity_id, f"端口归属错误: {relation['id']}")
        refs("evidence", relation["evidenceIds"])
    for flow in tables["flows"].values():
        owner = flow["ownerNodeId"]
        lookup("nodes", owner)
        for endpoint in ("fromNodeId", "toNodeId"):
            target = lookup("nodes", flow[endpoint])
            require(owner in ancestors[target["id"]][1:], f"流程端点不在所属单元内: {flow['id']}")
        refs("evidence", flow["evidenceIds"])

    snapshot = data["snapshot"]
    if "repositoryUrl" in snapshot:
        url = urlsplit(snapshot["repositoryUrl"])
        require(url.scheme == "https" and not url.username and not url.password, "仓库 URL 无效或含凭据")
    contents = {}
    for file in snapshot["files"]:
        relative = file["path"]
        path = PurePosixPath(relative)
        require(not path.is_absolute() and ".." not in path.parts and "\\" not in relative and ":" not in relative, f"非法路径: {relative}")
        resolved = (ROOT / relative).resolve()
        require(resolved.is_relative_to(ROOT), f"文件越界: {relative}")
        require(relative not in contents, f"重复文件: {relative}")
        raw = resolved.read_bytes()
        require(hashlib.sha256(raw).hexdigest() == file["sha256"], f"文件指纹不一致: {relative}")
        contents[relative] = raw.decode("utf-8").splitlines()
    for evidence in tables["evidence"].values():
        require(evidence["snapshotId"] == snapshot["id"], f"证据混用快照: {evidence['id']}")
        require(evidence["path"] in contents, f"证据文件不在快照中: {evidence['id']}")
        require(1 <= evidence["startLine"] <= evidence["endLine"] <= len(contents[evidence["path"]]), f"证据行越界: {evidence['id']}")
    source_segments = 0
    omission_segments = 0
    for snippet in tables["snippets"].values():
        evidence = lookup("evidence", snippet["evidenceId"])
        cursor = evidence["startLine"]
        for segment in snippet["segments"]:
            start, end = segment["startLine"], segment["endLine"]
            require(cursor == start and start <= end <= evidence["endLine"], f"片段区间未连续划分证据: {snippet['id']}")
            if segment["kind"] == "source":
                expected = "\n".join(contents[evidence["path"]][start - 1:end])
                require(segment["text"] == expected, f"片段原文不一致: {snippet['id']}:{start}")
                source_segments += 1
            else:
                omission_segments += 1
            cursor = end + 1
        require(cursor == evidence["endLine"] + 1, f"片段未覆盖完整证据范围: {snippet['id']}")
    return {
        "schema": "passed",
        "references_and_tree": "passed",
        "source_hashes_and_ranges": "passed",
        "snippet_text_and_partition": "passed",
        "counts": {name: len(table) for name, table in tables.items()},
        "source_segments": source_segments,
        "omission_segments": omission_segments,
        "limit": "仅核验设计样例的结构与源码一致性，不验证自然语言解释、交互或性能。",
    }


if __name__ == "__main__":
    try:
        print(json.dumps(check_example(), ensure_ascii=False, indent=2))
    except (ValueError, OSError, KeyError) as error:
        print(f"样例核验失败: {error}", file=sys.stderr)
        raise SystemExit(1)
