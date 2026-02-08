#!/usr/bin/env python3
"""
Convert Python-style pseudocode in instructions_manual.diff to C-style

Converts:
- for (i = 0; i < vl; i++): → for (i = 0; i < vl; i++) {
- if (condition): → if (condition) {
- or → ||
- and → &&
- else: → } else {
- Adds closing braces and semicolons

Author: Claude Code
Date: 2025-11-24
"""

import re
import sys
from pathlib import Path


def convert_python_to_c_style(pseudocode: str) -> str:
    """
    Convert Python-style pseudocode to C-style

    Handles:
    - Colon-based blocks → brace-based blocks
    - or/and keywords → ||/&&
    - Proper semicolon insertion
    - Indentation-based closing braces
    """

    lines = pseudocode.split('\n')
    result = []
    indent_stack = []  # Track indentation levels and their brace status

    for i, line in enumerate(lines):
        # Skip empty lines
        if not line.strip():
            result.append(line)
            continue

        # Measure indentation
        indent = len(line) - len(line.lstrip())
        stripped = line.strip()

        # Close braces for decreased indentation
        while indent_stack and indent < indent_stack[-1][0]:
            prev_indent, needs_brace = indent_stack.pop()
            if needs_brace:
                result.append(' ' * prev_indent + '}')

        # Check for control structures with colons FIRST (before or/and conversion)
        # Use original line for pattern matching (before || conversion)
        if re.search(r'(for|if|while)\s*\([^)]*\)\s*:\s*$', line):
            # Convert or/and keywords to ||/&&
            converted = re.sub(r'\bor\b', '||', line)
            converted = re.sub(r'\band\b', '&&', converted)
            # Control structure with colon - convert to brace
            converted = re.sub(r':\s*$', ' {', converted)
            # Track this indentation level needs closing brace
            indent_stack.append((indent, True))
            result.append(converted)

        # Check for standalone else:
        elif re.match(r'^\s*else\s*:\s*$', line):
            # Close previous if block and open else block
            if indent_stack and indent_stack[-1][1]:
                indent_stack.pop()
                converted = ' ' * indent + '} else {'
                indent_stack.append((indent, True))
            else:
                converted = ' ' * indent + 'else {'
                indent_stack.append((indent, True))
            result.append(converted)

        # Regular statement - add semicolon if needed
        else:
            # Convert or/and keywords to ||/&&
            converted = re.sub(r'\bor\b', '||', line)
            converted = re.sub(r'\band\b', '&&', converted)

            # Add semicolon to assignment statements and other single statements
            # Don't add to lines ending with { or } or comments
            if (not stripped.endswith(('{', '}', '#')) and
                not stripped.startswith('#') and
                '=' in stripped):
                # Check if semicolon already exists
                if not converted.rstrip().endswith(';'):
                    converted = converted.rstrip() + ';'

            result.append(converted)

    # Close any remaining open braces
    while indent_stack:
        indent, needs_brace = indent_stack.pop()
        if needs_brace:
            result.append(' ' * indent + '}')

    return '\n'.join(result)


def process_diff_file(diff_path: Path, output_path: Path = None):
    """
    Process the diff file and convert Python-style pseudocode to C-style

    Args:
        diff_path: Path to instructions_manual.diff
        output_path: Path to output file (default: overwrite original)
    """

    if output_path is None:
        output_path = diff_path

    print("="*70)
    print("DIFF FILE PYTHON-TO-C CONVERSION")
    print("="*70)
    print(f"Input:  {diff_path}")
    print(f"Output: {output_path}")
    print()

    with open(diff_path, 'r') as f:
        content = f.read()

    # Find all pseudocode additions in the diff
    # Pattern: +    "pseudocode": "...",
    pattern = r'(\+\s*"pseudocode":\s*")((?:[^"\\]|\\.)*)(")'

    conversions = 0
    samples = []

    def convert_match(match):
        nonlocal conversions
        prefix = match.group(1)
        pseudocode_escaped = match.group(2)
        suffix = match.group(3)

        # Decode escape sequences
        pseudocode = pseudocode_escaped.replace('\\n', '\n').replace('\\"', '"').replace('\\\\', '\\')

        # Check if it has Python-style syntax
        # Note: Check for colons is the primary indicator, or/and are secondary
        has_python_style = (re.search(r'(for|if|while|else)\s*(\([^)]*\))?\s*:\s*$', pseudocode, re.MULTILINE) or
                           ' or ' in pseudocode or
                           ' and ' in pseudocode)

        if not has_python_style:
            return match.group(0)

        # Convert to C-style
        converted = convert_python_to_c_style(pseudocode)

        # Re-encode escape sequences
        converted_escaped = converted.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')

        # Store sample for reporting
        if conversions < 3:
            samples.append({
                'before': pseudocode,
                'after': converted
            })

        conversions += 1
        return prefix + converted_escaped + suffix

    # Perform conversion
    converted_content = re.sub(pattern, convert_match, content)

    # Write output
    with open(output_path, 'w') as f:
        f.write(converted_content)

    # Print report
    print(f"Total pseudocode fields in diff: {content.count('\"pseudocode\":')}")
    print(f"Fields converted: {conversions}")
    print()

    if samples:
        print("Sample conversions:")
        print("-"*70)
        for i, sample in enumerate(samples, 1):
            print(f"\nSample {i}:")
            print("BEFORE:")
            for line in sample['before'].split('\n')[:5]:
                print(f"  {line}")
            if len(sample['before'].split('\n')) > 5:
                print("  ...")
            print("AFTER:")
            for line in sample['after'].split('\n')[:8]:
                print(f"  {line}")
            if len(sample['after'].split('\n')) > 8:
                print("  ...")

    print()
    print("="*70)
    print(f"Conversion complete! Updated {conversions} pseudocode fields.")
    print("="*70)


if __name__ == "__main__":
    # Default path
    diff_path = Path(__file__).parent.parent.parent / 'src' / 'data' / 'instructions_manual.diff'

    if not diff_path.exists():
        print(f"Error: Diff file not found at {diff_path}")
        sys.exit(1)

    # Create backup
    backup_path = diff_path.with_suffix('.diff.backup')
    import shutil
    shutil.copy(diff_path, backup_path)
    print(f"Created backup: {backup_path}")
    print()

    process_diff_file(diff_path)
