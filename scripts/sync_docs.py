"""Sincroniza y procesa los documentos markdown de docs/aprendices/ hacia frontend/public/docs/aprendices/

Garantiza que la fuente de verdad única sea siempre docs/aprendices/*.md.
Genera un manifiesto estructurado (guides_manifest.json) para que Angular
pueda mostrar pestañas, tablas interactivas con botones de copiar prompt y
la documentación completa sin duplicación manual.
"""
import os
import shutil
import re
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DOCS = os.path.join(ROOT, "docs", "aprendices")
DEST_DIR = os.path.join(ROOT, "frontend", "public", "docs", "aprendices")


def extract_table_rows(markdown_table_text):
    rows = []
    lines = markdown_table_text.strip().split("\n")
    for line in lines:
        line = line.strip()
        if not line.startswith("|") or line.startswith("|---"):
            continue
        cols = [c.strip() for c in line.split("|")[1:-1]]
        if cols and cols[0].lower() in ("intención", "intencion"):
            continue  # header
        if len(cols) >= 4:
            # clean code blocks from prompt
            prompt_clean = cols[1].strip("`").strip()
            rows.append({
                "intention": cols[0],
                "prompt": prompt_clean,
                "capability": cols[2],
                "outcome": cols[3],
            })
    return rows


def extract_labs(markdown_d_text):
    labs = []
    lab_blocks = re.split(r'\n### (Laboratorio \d+ [^\n]+)\n', markdown_d_text)
    if len(lab_blocks) > 1:
        for i in range(1, len(lab_blocks), 2):
            lab_title = lab_blocks[i].strip()
            lab_body = lab_blocks[i+1].strip()
            
            # Extract prompt from code block or prompt label
            prompt_match = re.search(r'```(?:prompt|text)?\s*\n(.*?)\n```', lab_body, re.DOTALL)
            prompt = prompt_match.group(1).strip() if prompt_match else ""
            
            # Extract fields
            obj_m = re.search(r'\*\*Objetivo:\*\*\s*([^\n]+)', lab_body)
            ctx_m = re.search(r'\*\*Contexto:\*\*\s*([^\n]+)', lab_body)
            prep_m = re.search(r'\*\*Preparación:\*\*\s*([^\n]+)', lab_body)
            ref_m = re.search(r'\*\*Pregunta de reflexión:\*\*|\*\*Reflexión:\*\*\s*([^\n]+)', lab_body)
            crit_m = re.search(r'\*\*Criterio de éxito:\*\*\s*([^\n]+)', lab_body)
            
            num_m = re.search(r'Laboratorio (\d+)', lab_title)
            lab_num = int(num_m.group(1)) if num_m else len(labs) + 1

            labs.append({
                "number": lab_num,
                "title": lab_title,
                "prompt": prompt,
                "objective": obj_m.group(1).strip() if obj_m else "",
                "context": ctx_m.group(1).strip() if ctx_m else "",
                "preparation": prep_m.group(1).strip() if prep_m else "",
                "reflection": ref_m.group(1).strip() if ref_m and ref_m.group(1) else "",
                "successCriteria": crit_m.group(1).strip() if crit_m else "",
                "fullContent": lab_body,
            })
    return labs


def parse_version_guide(filepath, version_id):
    with open(filepath, encoding="utf-8") as f:
        text = f.read()

    # Extract title
    title_m = re.search(r'^# ([^\n]+)', text)
    title = title_m.group(1).strip() if title_m else f"Agent {version_id}"

    # Extract sections A through H
    sections = {}
    sec_matches = list(re.finditer(r'\n## ([A-H])\. ([^\n]+)\n', text))
    for idx, match in enumerate(sec_matches):
        sec_letter = match.group(1)
        start_pos = match.end()
        end_pos = sec_matches[idx+1].start() if idx + 1 < len(sec_matches) else len(text)
        sections[sec_letter] = {
            "title": match.group(2).strip(),
            "content": text[start_pos:end_pos].strip()
        }

    # Parse section C table
    intents = []
    if "C" in sections:
        intents = extract_table_rows(sections["C"]["content"])

    # Parse section D labs
    labs = []
    if "D" in sections:
        labs = extract_labs(sections["D"]["content"])

    return {
        "versionId": version_id,
        "title": title,
        "filename": os.path.basename(filepath),
        "whatItDoes": sections.get("A", {}).get("content", ""),
        "beforeStarting": sections.get("B", {}).get("content", ""),
        "intents": intents,
        "labs": labs,
        "whatItDoesNotDo": sections.get("E", {}).get("content", ""),
        "runtimeInspector": sections.get("F", {}).get("content", ""),
        "frequentErrors": sections.get("G", {}).get("content", ""),
        "challenge": sections.get("H", {}).get("content", ""),
        "fullMarkdown": text,
    }


def sync():
    os.makedirs(DEST_DIR, exist_ok=True)
    manifest = {
        "versions": {},
        "extraDocs": {},
    }

    version_files = {
        "v1": "agent-v1-tool-calling.md",
        "v2": "agent-v2-agent-loop.md",
        "v3": "agent-v3-state-memory.md",
        "v4": "agent-v4-planning.md",
    }

    extra_files = [
        "README.md",
        "catalogo-herramientas.md",
        "guia-runtime-inspector.md",
        "troubleshooting.md",
    ]

    # Process versions
    for v_id, filename in version_files.items():
        src_path = os.path.join(SRC_DOCS, filename)
        dest_path = os.path.join(DEST_DIR, filename)
        shutil.copy2(src_path, dest_path)
        manifest["versions"][v_id] = parse_version_guide(src_path, v_id)

    # Process extra docs
    for filename in extra_files:
        src_path = os.path.join(SRC_DOCS, filename)
        dest_path = os.path.join(DEST_DIR, filename)
        shutil.copy2(src_path, dest_path)
        with open(src_path, encoding="utf-8") as f:
            manifest["extraDocs"][filename] = f.read()

    manifest_path = os.path.join(DEST_DIR, "guides_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"Sincronizados {len(version_files) + len(extra_files)} documentos Markdown y generado guides_manifest.json en:")
    print(f" -> {DEST_DIR}")


if __name__ == "__main__":
    sync()
