#!/usr/bin/env python3
"""
Scans .kt AND .java source files under a given directory, extracts the
Javadoc/KDoc comment (/** ... */) directly above each class declaration,
and writes the results to a JSON file mapping fully-qualified class name
-> description.

Usage:
    python3 extract_descriptions.py <skills_source_root> <output_json_path>

Example:
    python3 extract_descriptions.py \
        bonsai_skills/src/main/java/de/unibi/citec/clf/bonsai/skills \
        bonsai_scxml_web/src/main/resources/skillDescriptions.json
"""

import json
import re
import sys
from pathlib import Path

# Matches the package declaration at the top of a .kt or .java file
PACKAGE_RE = re.compile(r'^\s*package\s+([\w.]+)\s*;?', re.MULTILINE)

# Matches a Javadoc/KDoc comment block immediately followed by a class
# declaration. Handles both Kotlin (class Foo : Bar) and Java
# (public class Foo extends Bar implements Baz) style declarations.
# Allows optional annotations (e.g. @Deprecated) and modifiers between
# the comment and "class".
CLASS_BLOCK_RE = re.compile(
    r'/\*\*(?P<doc>.*?)\*/'                          # Javadoc/KDoc comment content
    r'(?P<between>(?:\s*@\w+(?:\([^)]*\))?)*\s*)'    # optional class annotations
    r'\s*(?:public\s+|private\s+|protected\s+|internal\s+)?'
    r'(?:abstract\s+|open\s+|final\s+|sealed\s+|static\s+|data\s+)*'
    r'class\s+(?P<name>\w+)',
    re.DOTALL
)

SENTENCE_END_RE = re.compile(r'[.!?:]$')


def clean_doc(raw_doc: str) -> str:
    """
    Clean up a raw Javadoc/KDoc comment body:
    - strip the leading '*' from each line
    - stop collecting once a doc tag (@author, @param, ...) is reached
    - stop at structured sections like "Options:", "Slots:",
      "ExitTokens:", or a "<pre>" block, since those are better
      parsed separately (e.g. into params/events) rather than
      dumped into the description text
    - group consecutive non-empty lines into paragraphs (paragraphs are
      separated by blank lines in the original comment)
    - if a paragraph doesn't end with sentence-ending punctuation,
      append a period, so paragraphs don't run together when joined
    - join all paragraphs into a single, whitespace-normalized string
    """
    lines = raw_doc.split('\n')

    paragraphs = []
    current_paragraph = []

    def flush_paragraph():
        if not current_paragraph:
            return
        text = ' '.join(current_paragraph)
        text = re.sub(r'\s+', ' ', text).strip()
        if text and not SENTENCE_END_RE.search(text):
            text += '.'
        paragraphs.append(text)
        current_paragraph.clear()

    stop = False
    for line in lines:
        line = line.strip()

        # Strip leading '*' from doc comment lines
        if line.startswith('*'):
            line = line[1:].strip()

        # Stop collecting body text once a doc tag is reached
        if re.match(r'^@\w+', line):
            stop = True
            break

        # Stop at known structured sections
        if re.match(r'^(Options:|Slots:|ExitTokens:|<pre>)', line, re.IGNORECASE):
            stop = True
            break

        if line == '':
            # blank line -> paragraph boundary
            flush_paragraph()
        else:
            current_paragraph.append(line)

    if not stop:
        flush_paragraph()
    else:
        flush_paragraph()

    return ' '.join(p for p in paragraphs if p)


def extract_from_file(path: Path) -> dict:
    """Extract {fully_qualified_class_name: description} from one source file."""
    try:
        content = path.read_text(encoding='utf-8')
    except Exception as e:
        print(f"[WARN] Could not read {path}: {e}", file=sys.stderr)
        return {}

    pkg_match = PACKAGE_RE.search(content)
    if not pkg_match:
        return {}
    package = pkg_match.group(1)

    result = {}
    for m in CLASS_BLOCK_RE.finditer(content):
        raw_doc = m.group('doc')
        class_name = m.group('name')
        description = clean_doc(raw_doc)
        if not description:
            continue
        full_name = f"{package}.{class_name}"
        result[full_name] = description

    return result


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)

    src_root = Path(sys.argv[1])
    out_path = Path(sys.argv[2])

    if not src_root.exists():
        print(f"[ERROR] Source directory does not exist: {src_root}", file=sys.stderr)
        sys.exit(1)

    source_files = list(src_root.rglob('*.kt')) + list(src_root.rglob('*.java'))
    print(f"Scanning {len(source_files)} source files "
          f"({sum(1 for f in source_files if f.suffix == '.kt')} .kt, "
          f"{sum(1 for f in source_files if f.suffix == '.java')} .java)...")

    all_descriptions = {}
    for src_file in source_files:
        descs = extract_from_file(src_file)
        all_descriptions.update(descs)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(all_descriptions, ensure_ascii=False, indent=2),
        encoding='utf-8'
    )

    print(f"Done. Extracted descriptions for {len(all_descriptions)} skills -> {out_path}")


if __name__ == '__main__':
    main()