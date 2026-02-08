#!/usr/bin/env python3
"""
RISC-V Pseudoinstruction Extractor

Extracts pseudoinstructions from the RISC-V Assembly Manual (Table 5)
and generates a structured JSON database.

Source: https://github.com/riscv-non-isa/riscv-asm-manual/blob/main/src/asm-manual.adoc
"""

import re
import json
import requests
from typing import List, Dict, Set
from pathlib import Path


class PseudoinstructionExtractor:
    """Extracts and processes RISC-V pseudoinstructions."""

    # ADOC source URL
    SOURCE_URL = "https://raw.githubusercontent.com/riscv-non-isa/riscv-asm-manual/main/src/asm-manual.adoc"

    # Extension inference patterns
    # Check most specific patterns first (half, then quad, double, single)
    EXTENSION_PATTERNS = {
        r'^(flh|fsh)': ['RV32Zfh', 'RV64Zfh'],  # Half-precision load/store
        r'\.(h|x\.h)$': ['RV32Zfh', 'RV64Zfh'],  # Half-precision operations (suffix)
        r'^(flq|fsq)': ['RV32Q', 'RV64Q'],      # Quad-precision load/store
        r'\.(q|x\.q)$': ['RV32Q', 'RV64Q'],      # Quad-precision operations (suffix)
        r'^(fld|fsd)': ['RV32D', 'RV64D'],      # Double-precision load/store
        r'\.(d|x\.d)$': ['RV32D', 'RV64D'],      # Double-precision operations (suffix)
        r'^(flw|fsw)': ['RV32F', 'RV64F'],      # Single-precision load/store
        r'\.(s|x\.s)$': ['RV32F', 'RV64F'],      # Single-precision operations (suffix)
        r'^f': ['RV32F', 'RV64F'],              # Generic float (fallback)
        r'^(mul|div|rem)': ['RV32M', 'RV64M'],  # Multiply/Divide
        r'^(lr|sc|amo)': ['RV32A', 'RV64A'],    # Atomic
    }

    def __init__(self):
        self.pseudoinstructions: List[Dict] = []
        self.stats = {
            'total': 0,
            'rv32_only': 0,
            'rv64_only': 0,
            'both': 0,
            'skipped': 0,
            'by_extension': {}
        }

    def fetch_source(self) -> str:
        """Fetch the ADOC file from GitHub."""
        print(f"Fetching source from {self.SOURCE_URL}...")
        response = requests.get(self.SOURCE_URL, timeout=30)
        response.raise_for_status()
        print(f"✓ Fetched {len(response.text)} bytes")
        return response.text

    def extract_table(self, content: str) -> List[List[str]]:
        """Extract Table 5 (Pseudoinstructions) from ADOC content."""
        print("\nExtracting pseudoinstruction table...")

        # Find the pseudoinstruction table section (it has "Pseudo Instructions" title)
        # The table has 4 columns: Pseudoinstruction, Base Instruction(s), Meaning, Comment
        # Each column starts with | but can span multiple lines
        table_pattern = r'\.Pseudo Instructions.*?\[cols="[^"]*"\]\s*\|===\s*\n(.*?)\n\|==='

        match = re.search(table_pattern, content, re.DOTALL | re.IGNORECASE)
        if not match:
            raise ValueError("Could not find pseudoinstruction table in ADOC file")

        table_content = match.group(1)

        # Parse rows - In AsciiDoc, each | starts a new cell
        # Cells can span multiple lines until the next | or empty line
        # Empty lines separate rows
        rows = []
        current_row = []
        current_cell = []

        lines = table_content.split('\n')
        i = 0

        while i < len(lines):
            line = lines[i].strip()

            # Empty line signals end of a row
            if not line:
                # Finish current cell
                if current_cell:
                    current_row.append(' '.join(current_cell))
                    current_cell = []
                # Save row if valid
                if current_row and len(current_row) >= 3:
                    rows.append(current_row)
                current_row = []
                i += 1
                continue

            # Line starting with | contains one or more cells
            if line.startswith('|'):
                # Parse all cells in this line (each | starts a new cell)
                # Need to carefully split by | while respecting {...} blocks
                parts = []
                current_part = ''
                brace_depth = 0

                for char in line[1:]:  # Skip leading |
                    if char == '{':
                        brace_depth += 1
                        current_part += char
                    elif char == '}':
                        brace_depth -= 1
                        current_part += char
                    elif char == '|' and brace_depth == 0:
                        # New cell
                        parts.append(current_part.strip())
                        current_part = ''
                    else:
                        current_part += char

                # Add last part
                if current_part or not parts:  # Handle case where line ends with |
                    parts.append(current_part.strip())

                # Filter out empty parts
                parts = [p for p in parts if p]

                # Decide how to handle this line:
                # If we have multiple parts AND no current_cell, this is a complete row on one line
                # If we have one part OR current_cell exists, continue building cells
                if len(parts) >= 3 and not current_cell and not current_row:
                    # Complete row on one line - save it directly
                    rows.append(parts)
                    i += 1
                else:
                    # Process each part as a cell (multi-line format)
                    for part in parts:
                        # If we have a pending cell, save it first
                        if current_cell:
                            current_row.append(' '.join(current_cell))
                            current_cell = []
                        # Start new cell with this part
                        current_cell.append(part)
                    i += 1
            else:
                # Continuation line for current cell
                if current_cell or current_row:
                    current_cell.append(line)
                i += 1

        # Handle any remaining cell/row at end of table
        if current_cell:
            current_row.append(' '.join(current_cell))
        if current_row and len(current_row) >= 3:
            rows.append(current_row)

        print(f"✓ Extracted {len(rows)} raw table rows")
        return rows

    def clean_adoc_formatting(self, text: str) -> str:
        """Remove AsciiDoc formatting from text."""
        # Remove formatting markers
        text = re.sub(r'\*([^*]+)\*', r'\1', text)  # Bold
        text = re.sub(r'_([^_]+)_', r'\1', text)    # Italic
        text = re.sub(r'\+([^+]+)\+', r'\1', text)  # Monospace
        text = re.sub(r'`([^`]+)`', r'\1', text)    # Code
        text = re.sub(r'\{[^}]+\}', '', text)       # Attributes

        # Clean up whitespace
        text = ' '.join(text.split())
        return text.strip()

    def expand_shorthand(self, instruction: str) -> List[str]:
        """Expand shorthand notation like l{b|h|w|d} into separate instructions."""
        # Pattern: prefix{opt1|opt2|opt3}suffix
        # Need to handle escaped backslash (like l{b\|h\|w\|d})
        pattern = r'([a-z]*)(\{[^}]+\})([a-z\s]*)'

        match = re.search(pattern, instruction)
        if not match:
            return [instruction]

        prefix = match.group(1)
        options_str = match.group(2)[1:-1]  # Remove { }
        suffix = match.group(3)

        # Split by | but handle escaped backslashes (\|)
        # First remove all backslashes (they're just ADOC escaping)
        options_str = options_str.replace('\\', '')
        # Now split by |
        options = [opt.strip() for opt in options_str.split('|')]

        # Generate all combinations
        expanded = []
        for opt in options:
            new_inst = instruction.replace(match.group(0), f"{prefix}{opt}{suffix}")
            # Recursively expand in case of nested shorthands
            expanded.extend(self.expand_shorthand(new_inst))

        return expanded

    def infer_extensions(self, base_instructions: List[str]) -> Set[str]:
        """Infer required RISC-V extensions from base instructions."""
        extensions = set()
        has_base_only = False

        for inst in base_instructions:
            # Extract mnemonic (first word)
            mnemonic = inst.split()[0] if inst.split() else ''

            # Check patterns - find the FIRST match (patterns are ordered by specificity)
            matched = False
            for pattern, exts in self.EXTENSION_PATTERNS.items():
                if re.match(pattern, mnemonic):
                    extensions.update(exts)
                    matched = True
                    break

            # Track if we found any base-only instruction
            if not matched:
                has_base_only = True

        # Only add base integer if we have NO extension-specific instructions
        # or if we have at least one base-only instruction
        if not extensions or has_base_only:
            extensions.add('RV32I')
            extensions.add('RV64I')

        return extensions

    def substitute_xlen(self, text: str, variant: int) -> str:
        """Substitute XLEN with actual value (32 or 64)."""
        if 'XLEN' in text:
            return text.replace('XLEN', str(variant))
        return text

    def normalize_symbol_placeholders(self, text: str) -> str:
        """Normalize symbol placeholders to standard names."""
        # Common substitutions
        substitutions = {
            r'\bsymbol\[31:12\]': 'symbol[31:12]',
            r'\bsymbol\[11:0\]': 'symbol[11:0]',
            r'\bsymbol\b(?!\[)': 'symbol',
        }

        for pattern, replacement in substitutions.items():
            text = re.sub(pattern, replacement, text)

        return text

    def extract_mnemonic(self, instruction: str) -> str:
        """Extract mnemonic (instruction name) from full instruction syntax."""
        # Split on whitespace and take the first token
        # Examples:
        #   "la rd, symbol" -> "la"
        #   "li rd, immediate" -> "li"
        #   "nop" -> "nop"
        parts = instruction.split()
        if not parts:
            return instruction.upper()

        mnemonic = parts[0].strip()
        # Convert to uppercase for consistency
        return mnemonic.upper()

    def determine_variant_support(self, pseudo: str, base_insts: List[str]) -> List[int]:
        """Determine if pseudoinstruction supports RV32, RV64, or both."""
        # Check for XLEN dependency
        all_text = pseudo + ' ' + ' '.join(base_insts)

        if 'XLEN' in all_text:
            return [32, 64]  # Needs expansion for both

        # Check if we have BOTH lw and ld in the same instruction sequence (@GOT case)
        # This indicates we need separate RV32 and RV64 variants
        has_lw = any('lw ' in inst for inst in base_insts)
        has_ld = any('ld ' in inst for inst in base_insts)

        if has_lw and has_ld:
            return [32, 64]  # Need to split variants

        # Check for 64-bit specific instructions
        has_64bit = any(
            re.search(r'\b(ld|sd|lwu|addiw|slliw|srliw|sraiw)', inst)
            for inst in base_insts
        )

        if has_64bit:
            return [64]

        # Check for 32-bit specific patterns
        # Most pseudoinstructions work on both unless they use 64-bit ops
        return [32, 64]

    def process_row(self, row: List[str]) -> None:
        """Process a single table row into pseudoinstructions."""
        if len(row) < 3:
            return

        # Table has 4 columns: Pseudoinstruction, Base Instruction(s), Meaning, Comment
        # We use first 3 columns
        # IMPORTANT: Expand shorthands BEFORE cleaning ADOC formatting,
        # because clean_adoc_formatting removes {...} which we need for shorthand expansion
        pseudo_expanded = self.expand_shorthand(row[0])

        # Clean ADOC formatting from columns we'll use
        meaning = self.clean_adoc_formatting(row[2])

        # Skip header row (check before cleaning)
        if 'Pseudoinstruction' in row[0] or 'Base Instruction' in row[1]:
            return

        # Skip entries with "Myriad sequences"
        if 'myriad' in row[1].lower():
            self.stats['skipped'] += 1
            return

        # Parse base instructions (may be multiple, separated by newlines, semicolons, or +)
        base_parts = [b.strip() for b in re.split(r'[;\n+]', row[1]) if b.strip()]

        # If pseudoinstruction has shorthands, we need to expand both pseudo and base consistently
        # For example: l{b|h|w|d} rd, symbol should produce 4 pseudoinstructions,
        # each with corresponding base instructions
        if len(pseudo_expanded) > 1:
            # Multiple expansions - need to match them up
            # The shorthands should appear in both pseudo and base in the same positions
            for i, pseudo in enumerate(pseudo_expanded):
                pseudo = self.clean_adoc_formatting(pseudo).strip()

                # Expand each base part for this specific index
                base_instructions = []
                for base_part in base_parts:
                    # Get all expansions of this base part
                    base_expanded = self.expand_shorthand(base_part)
                    # If we have multiple expansions, use the one matching this index
                    # Otherwise use the single expansion for all
                    if len(base_expanded) > 1 and i < len(base_expanded):
                        base_inst = self.clean_adoc_formatting(base_expanded[i]).strip()
                        if base_inst:
                            base_instructions.append(base_inst)
                    elif len(base_expanded) == 1:
                        base_inst = self.clean_adoc_formatting(base_expanded[0]).strip()
                        if base_inst:
                            base_instructions.append(base_inst)

                self._create_pseudo_entry(pseudo, base_instructions, meaning)
        else:
            # No shorthand expansion needed, process normally
            pseudo = self.clean_adoc_formatting(pseudo_expanded[0]).strip()

            base_instructions = []
            for base_part in base_parts:
                # Still expand in case base has shorthands but pseudo doesn't
                for expanded_base in self.expand_shorthand(base_part):
                    base_inst = self.clean_adoc_formatting(expanded_base).strip()
                    if base_inst:
                        base_instructions.append(base_inst)

            self._create_pseudo_entry(pseudo, base_instructions, meaning)

    def _create_pseudo_entry(self, pseudo: str, base_instructions: List[str], meaning: str) -> None:
        """Create pseudoinstruction entry with given parameters."""
        # Normalize placeholders
        base_instructions = [
            self.normalize_symbol_placeholders(b) for b in base_instructions
        ]

        # Determine variant support
        variants = self.determine_variant_support(pseudo, base_instructions)

        # Create entries for each variant
        for variant in variants:
            # Substitute XLEN if needed
            variant_pseudo = self.substitute_xlen(pseudo, variant)
            variant_bases = [self.substitute_xlen(b, variant) for b in base_instructions]

            # Filter base instructions by variant
            # For RV32, exclude 64-bit specific instructions (ld, sd, lwu, etc.)
            # For RV64, exclude 32-bit specific instructions (lw when ld is present)
            if variant == 32:
                # Keep instructions that don't use 64-bit operations
                # If we have both lw and ld, keep only lw for RV32
                filtered_bases = []
                for inst in variant_bases:
                    # Skip ld if we also have lw (GOT case)
                    if 'ld ' in inst and any('lw ' in other for other in variant_bases):
                        continue
                    # Skip other 64-bit instructions
                    if not re.search(r'\b(ld|sd|lwu|addiw|slliw|srliw|sraiw)\b', inst):
                        filtered_bases.append(inst)
                variant_bases = filtered_bases
            else:  # variant == 64
                # Keep instructions that don't use 32-bit specific operations
                # If we have both lw and ld, keep only ld for RV64
                filtered_bases = []
                for inst in variant_bases:
                    # Skip lw if we also have ld (GOT case)
                    if 'lw ' in inst and any('ld ' in other for other in variant_bases):
                        continue
                    filtered_bases.append(inst)
                variant_bases = filtered_bases

            # Infer extensions
            extensions = self.infer_extensions(variant_bases)

            # Filter extensions by variant
            if variant == 32:
                extensions = {e for e in extensions if 'RV32' in e}
            else:
                extensions = {e for e in extensions if 'RV64' in e}

            # Extract mnemonic from pseudoinstruction
            mnemonic = self.extract_mnemonic(variant_pseudo)

            # Create entry
            entry = {
                'mnemonic': mnemonic,
                'pseudoinstruction': variant_pseudo,
                'format': 'Pseudo',
                'baseInstructions': variant_bases,
                'description': meaning,
                'requiredExtensions': sorted(list(extensions))
            }

            self.pseudoinstructions.append(entry)

            # Update stats
            self.stats['total'] += 1
            if len(variants) == 1:
                if variant == 32:
                    self.stats['rv32_only'] += 1
                else:
                    self.stats['rv64_only'] += 1
            else:
                self.stats['both'] += 1

            for ext in extensions:
                self.stats['by_extension'][ext] = self.stats['by_extension'].get(ext, 0) + 1

    def extract(self) -> List[Dict]:
        """Main extraction process."""
        # Fetch source
        content = self.fetch_source()

        # Extract table
        rows = self.extract_table(content)

        # Process each row
        print("\nProcessing pseudoinstructions...")
        for row in rows:
            self.process_row(row)

        print(f"✓ Processed {self.stats['total']} pseudoinstructions")
        return self.pseudoinstructions

    def generate_report(self, output_path: Path) -> None:
        """Generate extraction report."""
        print(f"\nGenerating report: {output_path}")

        with open(output_path, 'w') as f:
            f.write("=" * 80 + "\n")
            f.write("RISC-V PSEUDOINSTRUCTION EXTRACTION REPORT\n")
            f.write("=" * 80 + "\n\n")

            f.write(f"Total pseudoinstructions extracted: {self.stats['total']}\n")
            f.write(f"  - RV32 only: {self.stats['rv32_only']}\n")
            f.write(f"  - RV64 only: {self.stats['rv64_only']}\n")
            f.write(f"  - Both RV32/RV64: {self.stats['both']}\n")
            f.write(f"  - Skipped (myriad sequences): {self.stats['skipped']}\n\n")

            f.write("Breakdown by Extension:\n")
            for ext, count in sorted(self.stats['by_extension'].items()):
                f.write(f"  - {ext}: {count}\n")

            f.write("\n" + "=" * 80 + "\n")
            f.write("SAMPLE ENTRIES\n")
            f.write("=" * 80 + "\n\n")

            # Show first 10 entries
            for i, entry in enumerate(self.pseudoinstructions[:10], 1):
                f.write(f"{i}. {entry['mnemonic']} - {entry['pseudoinstruction']}\n")
                f.write(f"   Format: {entry['format']}\n")
                f.write(f"   Base: {', '.join(entry['baseInstructions'])}\n")
                f.write(f"   Description: {entry['description']}\n")
                f.write(f"   Extensions: {', '.join(entry['requiredExtensions'])}\n\n")

            f.write("=" * 80 + "\n")
            f.write("VERIFICATION\n")
            f.write("=" * 80 + "\n\n")

            # Verify some key pseudoinstructions
            key_instructions = ['nop', 'mv', 'li', 'la', 'j', 'jr', 'ret', 'call']
            f.write("Key pseudoinstructions found:\n")
            for key in key_instructions:
                found = [p for p in self.pseudoinstructions if p['pseudoinstruction'].startswith(key + ' ') or p['pseudoinstruction'] == key]
                if found:
                    f.write(f"  ✓ {key}: {len(found)} variant(s)\n")
                else:
                    f.write(f"  ✗ {key}: NOT FOUND\n")

        print("✓ Report generated")


def main():
    """Main entry point."""
    print("=" * 80)
    print("RISC-V Pseudoinstruction Extractor")
    print("=" * 80)

    # Setup paths
    script_dir = Path(__file__).parent
    project_dir = script_dir.parent
    output_json = project_dir / 'src' / 'data' / 'pseudoinstructions.json'
    report_file = script_dir / 'extraction_report_pseudo.txt'

    # Create output directory if needed
    output_json.parent.mkdir(parents=True, exist_ok=True)

    # Extract pseudoinstructions
    extractor = PseudoinstructionExtractor()
    pseudoinstructions = extractor.extract()

    # Save JSON
    print(f"\nSaving JSON to: {output_json}")
    with open(output_json, 'w') as f:
        json.dump(pseudoinstructions, f, indent=2)
    print(f"✓ Saved {len(pseudoinstructions)} pseudoinstructions")

    # Generate report
    extractor.generate_report(report_file)

    print("\n" + "=" * 80)
    print("EXTRACTION COMPLETE")
    print("=" * 80)
    print(f"JSON output: {output_json}")
    print(f"Report: {report_file}")


if __name__ == '__main__':
    main()
