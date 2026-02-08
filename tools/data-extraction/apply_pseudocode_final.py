#!/usr/bin/env python3
"""
Robust parser for unified diff files containing multiple instructions per hunk.

Extracts pseudocode changes from a unified diff of a JSON instruction database
and applies them to the target JSON file.

Key features:
- Handles multiple instruction objects within a single hunk
- Tracks encoding field as unique identifier for each instruction
- Only extracts changes from empty ("") to non-empty pseudocode
- Properly handles JSON escape sequences
- Applies changes only to instructions with currently empty pseudocode
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Tuple, Optional


class DiffParser:
    """Parser for unified diff files with multiple instructions per hunk."""

    def __init__(self, diff_path: Path):
        self.diff_path = diff_path
        self.pseudocode_changes: Dict[str, str] = {}
        # Encoding/operand changes keyed by (mnemonic, extension)
        self.encoding_changes: Dict[Tuple[str, str], str] = {}
        self.operand_changes: Dict[Tuple[str, str], List[str]] = {}

    def parse(self) -> Dict[str, str]:
        """
        Parse the diff file and extract pseudocode, encoding, and operand changes.

        The challenge: A single instruction may be modified in multiple hunks.
        For example:
          - Hunk 1: changes description (contains encoding)
          - Hunk 2: changes pseudocode (no encoding shown)

        We need to track line numbers and look back to find the encoding.

        Returns:
            Dictionary mapping encoding -> new pseudocode content
        """
        with open(self.diff_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        # Build maps of line number -> encoding and line number -> (mnemonic, extension)
        encoding_map, instruction_map = self._build_encoding_map(lines)

        # Parse hunks for changes
        i = 0
        while i < len(lines):
            line = lines[i]

            # Look for hunk headers
            if line.startswith('@@'):
                i = self._parse_hunk(lines, encoding_map, instruction_map, i)
            else:
                i += 1

        return self.pseudocode_changes

    def _build_encoding_map(self, lines: List[str]) -> Tuple[Dict[int, str], Dict[int, Tuple[str, str]]]:
        """
        Build maps of line number -> encoding and line number -> (mnemonic, extension).

        This allows us to look up which encoding/instruction is associated with a given line.
        """
        encoding_map: Dict[int, str] = {}
        instruction_map: Dict[int, Tuple[str, str]] = {}
        current_encoding: Optional[str] = None
        current_mnemonic: Optional[str] = None
        current_extension: Optional[str] = None
        current_line_num = 0

        for i, line in enumerate(lines):
            # Track hunk headers to extract line numbers
            if line.startswith('@@'):
                # Parse the line number from hunk header
                # Format: @@ -old_start,old_count +new_start,new_count @@
                match = re.match(r'@@ -(\d+),?\d* \+(\d+),?\d* @@', line)
                if match:
                    current_line_num = int(match.group(2))  # Use new file line number
                continue

            # Update line number for added/context lines (not removed lines)
            if not line.startswith('-'):
                current_line_num += 1

            # Track encoding
            encoding_match = re.search(r'"encoding":\s*"([01x]+)"', line)
            if encoding_match:
                current_encoding = encoding_match.group(1)

            # Track mnemonic
            mnemonic_match = re.search(r'"mnemonic":\s*"([^"]+)"', line)
            if mnemonic_match:
                current_mnemonic = mnemonic_match.group(1)

            # Track extension
            extension_match = re.search(r'"extension":\s*"([^"]+)"', line)
            if extension_match:
                current_extension = extension_match.group(1)

            # Associate this line with current encoding
            if current_encoding:
                encoding_map[i] = current_encoding

            # Associate this line with current instruction
            if current_mnemonic and current_extension:
                instruction_map[i] = (current_mnemonic, current_extension)

        return encoding_map, instruction_map

    def _parse_hunk(self, lines: List[str], encoding_map: Dict[int, str],
                     instruction_map: Dict[int, Tuple[str, str]], hunk_start: int) -> int:
        """
        Parse a single hunk and extract pseudocode, encoding, and operand changes.

        Uses encoding_map to look up which encoding each line belongs to.
        Uses instruction_map to look up which instruction each line belongs to.

        Returns:
            Index of the next line to process
        """
        removed_pseudocode: Optional[str] = None
        removed_line_idx: Optional[int] = None
        removed_encoding: Optional[str] = None
        removed_encoding_idx: Optional[int] = None
        removed_operands: Optional[str] = None
        removed_operands_idx: Optional[int] = None

        i = hunk_start + 1
        while i < len(lines):
            line = lines[i]

            # Stop at the next hunk header
            if line.startswith('@@'):
                return i

            # Detect removed pseudocode line
            if line.startswith('-') and '"pseudocode":' in line:
                removed_pseudocode = self._extract_json_string_value(line, 'pseudocode')
                removed_line_idx = i
                i += 1
                continue

            # Detect removed encoding line
            if line.startswith('-') and '"encoding":' in line:
                removed_encoding = self._extract_json_string_value(line, 'encoding')
                removed_encoding_idx = i
                i += 1
                continue

            # Detect removed operands line
            if line.startswith('-') and '"operands":' in line:
                removed_operands = line
                removed_operands_idx = i
                i += 1
                continue

            # Detect added encoding line (encoding fix)
            if line.startswith('+') and '"encoding":' in line:
                added_encoding = self._extract_json_string_value(line, 'encoding')

                if removed_encoding is not None and added_encoding != removed_encoding:
                    # Find instruction for this change
                    instr_key = None
                    for j in range(i - 1, max(0, i - 100), -1):
                        if j in instruction_map:
                            instr_key = instruction_map[j]
                            break

                    if instr_key:
                        self.encoding_changes[instr_key] = added_encoding
                        print(f"  Found encoding fix for {instr_key[0]} ({instr_key[1]})")

                removed_encoding = None
                removed_encoding_idx = None
                i += 1
                continue

            # Detect added operands line (operand fix)
            if line.startswith('+') and '"operands":' in line:
                if removed_operands is not None:
                    # Parse operands array from added line
                    operands_match = re.search(r'"operands":\s*\[(.*?)\]', line)
                    if operands_match:
                        operands_str = operands_match.group(1)
                        operands = [s.strip().strip('"') for s in operands_str.split(',') if s.strip()]

                        # Find instruction for this change
                        instr_key = None
                        for j in range(i - 1, max(0, i - 100), -1):
                            if j in instruction_map:
                                instr_key = instruction_map[j]
                                break

                        if instr_key and operands:
                            self.operand_changes[instr_key] = operands
                            print(f"  Found operand fix for {instr_key[0]} ({instr_key[1]})")

                removed_operands = None
                removed_operands_idx = None
                i += 1
                continue

            # Detect added pseudocode line
            if line.startswith('+') and '"pseudocode":' in line:
                added_pseudocode = self._extract_json_string_value(line, 'pseudocode')

                # Only record if:
                # 1. We have a removed pseudocode (indicates a change)
                # 2. Removed was empty and added is non-empty
                # 3. We can find the encoding
                if (removed_pseudocode is not None and
                    removed_pseudocode == "" and
                    added_pseudocode != ""):

                    # Try to find encoding from the removed line first
                    encoding = encoding_map.get(removed_line_idx)

                    # If not found, try the current line
                    if not encoding:
                        encoding = encoding_map.get(i)

                    # If still not found, search backwards
                    if not encoding:
                        for j in range(i - 1, max(0, i - 100), -1):
                            if j in encoding_map:
                                encoding = encoding_map[j]
                                break

                    if encoding:
                        # Decode JSON escape sequences
                        decoded_pseudocode = self._decode_json_string(added_pseudocode)
                        self.pseudocode_changes[encoding] = decoded_pseudocode

                        print(f"  Found change for encoding {encoding[:20]}...")
                    else:
                        print(f"  WARNING: Could not find encoding for pseudocode change at line {i}")

                # Reset for next potential change
                removed_pseudocode = None
                removed_line_idx = None

                i += 1
                continue

            i += 1

        return i

    @staticmethod
    def _extract_json_string_value(line: str, key: str) -> str:
        """
        Extract a JSON string value from a line.

        Handles escaped quotes within the string value.

        Args:
            line: Line containing the JSON key-value pair
            key: The key name (e.g., 'pseudocode')

        Returns:
            The string value (still JSON-escaped)
        """
        # Find the key in the line
        pattern = rf'"{key}":\s*"'
        match = re.search(pattern, line)
        if not match:
            return ""

        # Start position after the opening quote
        start = match.end()

        # Find the closing quote, handling escaped quotes
        i = start
        while i < len(line):
            if line[i] == '\\':
                # Skip the next character (it's escaped)
                i += 2
                continue
            elif line[i] == '"':
                # Found the closing quote
                return line[start:i]
            else:
                i += 1

        # If we get here, we didn't find a closing quote
        return ""

    @staticmethod
    def _decode_json_string(s: str) -> str:
        """
        Decode JSON escape sequences in a string.

        Handles: \\n, \\t, \\r, \\", \\\\, etc.
        """
        # Common JSON escape sequences
        s = s.replace('\\n', '\n')
        s = s.replace('\\t', '\t')
        s = s.replace('\\r', '\r')
        s = s.replace('\\"', '"')
        s = s.replace('\\\\', '\\')
        return s


class PseudocodeApplier:
    """Applies pseudocode, encoding, and operand changes to the instructions JSON file."""

    def __init__(self, json_path: Path):
        self.json_path = json_path
        self.instructions: List[dict] = []

    def load(self) -> None:
        """Load the instructions JSON file."""
        with open(self.json_path, 'r', encoding='utf-8') as f:
            self.instructions = json.load(f)
        print(f"Loaded {len(self.instructions)} instructions from {self.json_path}")

    def apply_changes(self, changes: Dict[str, str]) -> int:
        """
        Apply pseudocode changes to instructions.

        Only updates instructions where:
        1. The encoding matches
        2. The current pseudocode is empty

        Args:
            changes: Dictionary mapping encoding -> new pseudocode

        Returns:
            Number of instructions updated
        """
        updated_count = 0

        for instruction in self.instructions:
            encoding = instruction.get('encoding', '')
            current_pseudocode = instruction.get('pseudocode', '')

            # Check if we have a change for this encoding
            if encoding in changes:
                # Only apply if current pseudocode is empty
                if current_pseudocode == "":
                    instruction['pseudocode'] = changes[encoding]
                    updated_count += 1
                    print(f"  Updated {instruction.get('mnemonic', 'UNKNOWN')}: {encoding[:20]}...")
                else:
                    print(f"  Skipped {instruction.get('mnemonic', 'UNKNOWN')} (already has pseudocode)")

        return updated_count

    def apply_encoding_changes(self, encoding_changes: Dict[Tuple[str, str], str]) -> int:
        """
        Apply encoding fixes to instructions.

        Args:
            encoding_changes: Dictionary mapping (mnemonic, extension) -> new encoding

        Returns:
            Number of instructions updated
        """
        updated_count = 0

        for instruction in self.instructions:
            mnemonic = instruction.get('mnemonic', '')
            extension = instruction.get('extension', '')
            key = (mnemonic, extension)

            if key in encoding_changes:
                old_encoding = instruction.get('encoding', '')
                new_encoding = encoding_changes[key]
                instruction['encoding'] = new_encoding
                updated_count += 1
                print(f"  Fixed encoding for {mnemonic} ({extension}): {old_encoding[:20]}... -> {new_encoding[:20]}...")

        return updated_count

    def apply_operand_changes(self, operand_changes: Dict[Tuple[str, str], List[str]]) -> int:
        """
        Apply operand fixes to instructions.

        Args:
            operand_changes: Dictionary mapping (mnemonic, extension) -> new operands list

        Returns:
            Number of instructions updated
        """
        updated_count = 0

        for instruction in self.instructions:
            mnemonic = instruction.get('mnemonic', '')
            extension = instruction.get('extension', '')
            key = (mnemonic, extension)

            if key in operand_changes:
                old_operands = instruction.get('operands', [])
                new_operands = operand_changes[key]
                instruction['operands'] = new_operands
                updated_count += 1
                print(f"  Fixed operands for {mnemonic} ({extension}): {old_operands} -> {new_operands}")

        return updated_count

    def save(self) -> None:
        """Save the modified instructions back to the JSON file."""
        with open(self.json_path, 'w', encoding='utf-8') as f:
            json.dump(self.instructions, f, indent=2, ensure_ascii=False)
        print(f"Saved changes to {self.json_path}")


def main():
    """Main execution function."""

    # Define paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent
    diff_path = project_root / 'src' / 'data' / 'instructions_manual.diff'
    json_path = project_root / 'src' / 'data' / 'instructions.json'

    print("=" * 80)
    print("RISC-V Instruction Diff Parser and Applier")
    print("(Pseudocode, Encoding, and Operand fixes)")
    print("=" * 80)
    print()

    # Validate input files
    if not diff_path.exists():
        print(f"ERROR: Diff file not found: {diff_path}")
        return 1

    if not json_path.exists():
        print(f"ERROR: JSON file not found: {json_path}")
        return 1

    # Step 1: Parse the diff file
    print("Step 1: Parsing diff file...")
    print(f"  Diff file: {diff_path}")
    print()

    parser = DiffParser(diff_path)
    pseudocode_changes = parser.parse()
    encoding_changes = parser.encoding_changes
    operand_changes = parser.operand_changes

    print()
    print(f"Extracted from diff file:")
    print(f"  - {len(pseudocode_changes)} pseudocode changes")
    print(f"  - {len(encoding_changes)} encoding fixes")
    print(f"  - {len(operand_changes)} operand fixes")
    print()

    total_changes = len(pseudocode_changes) + len(encoding_changes) + len(operand_changes)
    if total_changes == 0:
        print("No changes found. Exiting.")
        return 0

    # Step 2: Load instructions JSON
    print("Step 2: Loading instructions JSON...")
    print(f"  JSON file: {json_path}")
    print()

    applier = PseudocodeApplier(json_path)
    applier.load()
    print()

    # Step 3: Apply changes
    print("Step 3: Applying changes...")
    print()

    pseudocode_updated = applier.apply_changes(pseudocode_changes)
    encoding_updated = applier.apply_encoding_changes(encoding_changes)
    operand_updated = applier.apply_operand_changes(operand_changes)

    total_updated = pseudocode_updated + encoding_updated + operand_updated

    print()
    print(f"Updated {total_updated} instructions:")
    print(f"  - {pseudocode_updated} pseudocode updates")
    print(f"  - {encoding_updated} encoding fixes")
    print(f"  - {operand_updated} operand fixes")
    print()

    # Step 4: Save changes
    if total_updated > 0:
        print("Step 4: Saving changes...")
        applier.save()
        print()
        print("=" * 80)
        print(f"SUCCESS: Applied {total_updated} changes")
        print("=" * 80)
    else:
        print("No instructions were updated")

    return 0


if __name__ == '__main__':
    exit(main())
