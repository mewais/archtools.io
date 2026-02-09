#!/usr/bin/env python3
"""
RISC-V Vector Extension Instruction Extractor

Extracts RV32V and RV64V vector instructions from the riscv-opcodes repository.
Follows the exact same pattern as extract_RVG.py, extract_RVB.py, and extract_RVC.py.

Data source:
- https://github.com/riscv/riscv-opcodes/blob/master/extensions/rv_v

Requirements: pip install requests
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

# Import encoding parser (handle both direct execution and module import)
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from encoding_parser import parse_encoding_fields


# ============================================================================
# Configuration
# ============================================================================

OPCODES_URL = "https://raw.githubusercontent.com/riscv/riscv-opcodes/master/extensions/rv_v"

# Path to repo root: rvv/ -> data-extraction/ -> tools/ -> architect.io/
REPO_ROOT = Path(__file__).parent.parent.parent.parent
OUTPUT_JSON = REPO_ROOT / "src" / "data" / "instructions.json"
OUTPUT_REPORT = Path(__file__).parent / "extraction_report_RVV.txt"


# ============================================================================
# Data Models
# ============================================================================

class Instruction:
    """Represents a single RISC-V Vector instruction."""

    def __init__(self, mnemonic: str, extension: str):
        self.mnemonic = mnemonic.upper().strip()
        self.extension = extension.strip()

        # Fields to be filled during extraction
        self.encoding = ""
        self.operands: List[str] = []
        self.operand_types: List[str] = []
        self.format = "Unknown"  # Will be determined from opcode
        self.encoding_fields: List[Dict[str, Any]] = []  # Structured encoding fields

        # Empty description and pseudocode (as required)
        self.description = ""
        self.pseudocode = ""
        self.category = ""

    def to_dict(self) -> Dict[str, Any]:
        """Convert to output dictionary format."""
        result = {
            "mnemonic": self.mnemonic,
            "category": self.category,
            "format": self.format,
            "encoding": self.encoding,
            "description": self.description,
            "operands": self.operands,
            "operandTypes": self.operand_types,
            "extension": self.extension,
            "pseudocode": self.pseudocode,
        }

        # Add encodingFields if available
        if self.encoding_fields:
            result["encodingFields"] = self.encoding_fields

        return result

    def __repr__(self) -> str:
        return f"Instruction({self.mnemonic}, {self.extension})"


class ExtractionStats:
    """Tracks extraction statistics."""

    def __init__(self):
        self.by_extension: Dict[str, List[str]] = {"RV32V": [], "RV64V": []}
        self.total_instructions = 0
        self.rv32v_count = 0
        self.rv64v_count = 0
        self.encoding_quality: Dict[str, int] = {
            "complete": 0,
            "partial": 0,
            "placeholder": 0,
        }

    def add_instruction(self, instr: Instruction):
        """Record instruction statistics."""
        self.by_extension[instr.extension].append(instr.mnemonic)
        self.total_instructions += 1

        if instr.extension == "RV32V":
            self.rv32v_count += 1
        elif instr.extension == "RV64V":
            self.rv64v_count += 1

        # Check encoding quality
        if instr.encoding.count('x') == 32:
            self.encoding_quality["placeholder"] += 1
        elif '0' in instr.encoding or '1' in instr.encoding:
            if instr.encoding.count('x') < 10:
                self.encoding_quality["complete"] += 1
            else:
                self.encoding_quality["partial"] += 1


# ============================================================================
# Parsing Functions
# ============================================================================

def parse_bit_range(encoding_spec: str) -> Tuple[int, int, str]:
    """
    Parse bit range specification from encoding.

    Examples:
        "31..26=0x00" → (31, 26, "000000")
        "6..0=0x57" → (6, 0, "1010111")
        "25=1" → (25, 25, "1")

    Returns:
        (high_bit, low_bit, binary_value)
    """
    # Match patterns like "31..26=0x00" or "25=1"
    match = re.match(r'(\d+)(?:\.\.(\d+))?=(.+)', encoding_spec)
    if not match:
        return (0, 0, "")

    high_bit = int(match.group(1))
    low_bit = int(match.group(2)) if match.group(2) else high_bit
    value_str = match.group(3).strip()

    # Convert value to binary
    if value_str.startswith('0x'):
        # Hexadecimal
        hex_val = int(value_str, 16)
        bit_width = high_bit - low_bit + 1
        binary = format(hex_val, f'0{bit_width}b')
    elif value_str.startswith('0b'):
        # Binary
        binary = value_str[2:]
    else:
        # Decimal
        dec_val = int(value_str)
        bit_width = high_bit - low_bit + 1
        binary = format(dec_val, f'0{bit_width}b')

    return (high_bit, low_bit, binary)


def build_encoding_from_specs(encoding_specs: List[str]) -> str:
    """
    Build 32-bit binary encoding from bit range specifications.

    Example input: ["31..26=0x00", "25=1", "14..12=0x0", "6..0=0x57"]
    Example output: "000000xxxxxxxxxxxxxx000xxxxx1010111"

    Returns:
        32-bit binary encoding with 'x' for variable bits
    """
    # Start with all 'x' (unknown)
    encoding = ['x'] * 32

    # Fill in known bits from encoding specifications
    for spec in encoding_specs:
        high_bit, low_bit, binary = parse_bit_range(spec)

        if not binary:
            continue

        # Fill in bits (MSB first)
        # Bit 31 is at index 0, bit 0 is at index 31
        for i, bit in enumerate(binary):
            bit_pos = high_bit - i
            array_index = 31 - bit_pos
            if 0 <= array_index < 32:
                encoding[array_index] = bit

    return ''.join(encoding)


def parse_operands(operand_string: str) -> Tuple[List[str], List[str]]:
    """
    Parse operands from instruction line.

    Example: "vd vs2 vs1 vm" → (["vd", "vs2", "vs1", "vm"], ["register", "register", "register", "immediate"])

    Returns:
        (operand_list, operand_type_list)
    """
    operands = []
    operand_types = []

    # Split on whitespace
    parts = operand_string.split()

    for part in parts:
        part = part.strip()

        if not part:
            continue

        # Skip encoding specifications (contain '=' or '..')
        if '=' in part or '..' in part:
            continue

        # Normalize operand name
        part_lower = part.lower()

        # Vector registers
        if part_lower in ['vd', 'vs1', 'vs2', 'vs3']:
            operands.append(part_lower)
            operand_types.append('register')
        # Scalar registers
        elif part_lower in ['rd', 'rs1', 'rs2', 'rs3']:
            operands.append(part_lower)
            operand_types.append('register')
        # Floating-point registers
        elif part_lower in ['fd', 'fs1', 'fs2', 'fs3']:
            operands.append(part_lower)
            operand_types.append('register')
        # Immediates
        elif 'imm' in part_lower or 'zimm' in part_lower or 'simm' in part_lower or 'uimm' in part_lower:
            operands.append('imm')
            operand_types.append('immediate')
        # Mask register
        elif part_lower == 'vm':
            operands.append('vm')
            operand_types.append('immediate')

    return (operands, operand_types)


def is_multiply_accumulate(mnemonic: str) -> bool:
    """
    Check if instruction is a multiply-accumulate type.

    These instructions use assembly syntax vd, vs1, vs2 (vs1 before vs2)
    instead of the standard vd, vs2, vs1 order.

    Includes: vmacc, vnmsac, vmadd, vnmsub, vwmacc*, vfmacc*, vfnmacc*, etc.
    """
    base = mnemonic.upper().split('.')[0]
    return bool(re.match(r'V[FW]*N?M(ACC[SU]*|SAC|ADD|SUB)$', base))


def reorder_operands_for_assembly(operands: List[str], format_type: str, mnemonic: str) -> List[str]:
    """
    Reorder operands from encoding field order (MSB→LSB) to RISC-V assembly syntax order.

    The riscv-opcodes file lists fields in encoding order, but assembly syntax uses:
    - Destination first (vd, vs3, rd)
    - Source operands in spec-defined order
    - Mask register (vm) last

    Key distinction for V-Type arithmetic:
    - Standard (vadd, vsub, etc.): vd, vs2, vs1[, vm]
    - Multiply-accumulate (vmacc, etc.): vd, vs1, vs2[, vm]
    """
    if format_type == 'VSETVL-Type':
        # vsetvli rd, rs1, vtypei / vsetivli rd, uimm, vtypei / vsetvl rd, rs1, rs2
        ordered = []
        if 'rd' in operands:
            ordered.append('rd')
        if 'rs1' in operands:
            ordered.append('rs1')
        if 'rs2' in operands:
            ordered.append('rs2')
        imm_count = operands.count('imm')
        for _ in range(imm_count):
            ordered.append('imm')
        return ordered

    elif format_type == 'VLS-Type':
        # Loads:  vd, (rs1)[, rs2/vs2][, vm]
        # Stores: vs3, (rs1)[, rs2/vs2][, vm]
        ordered = []
        if 'vd' in operands:
            ordered.append('vd')
        elif 'vs3' in operands:
            ordered.append('vs3')
        if 'rs1' in operands:
            ordered.append('rs1')
        if 'rs2' in operands:
            ordered.append('rs2')
        if 'vs2' in operands:
            ordered.append('vs2')
        if 'vm' in operands:
            ordered.append('vm')
        return ordered

    elif format_type == 'V-Type':
        ordered = []
        macc = is_multiply_accumulate(mnemonic)

        # Destination first
        if 'vd' in operands:
            ordered.append('vd')
        elif 'vs3' in operands:
            ordered.append('vs3')
        elif 'rd' in operands:
            ordered.append('rd')

        if macc:
            # Multiply-accumulate: vs1/rs1 before vs2
            if 'vs1' in operands:
                ordered.append('vs1')
            elif 'rs1' in operands:
                ordered.append('rs1')
            if 'vs2' in operands:
                ordered.append('vs2')
        else:
            # Standard: vs2 before vs1/rs1
            if 'vs2' in operands:
                ordered.append('vs2')
            if 'vs1' in operands:
                ordered.append('vs1')
            elif 'rs1' in operands:
                ordered.append('rs1')

        # Immediates
        imm_count = operands.count('imm')
        for _ in range(imm_count):
            ordered.append('imm')

        # Mask last
        if 'vm' in operands:
            ordered.append('vm')
        return ordered

    # Unknown format - return as-is
    return operands


def operand_name_to_type(name: str) -> str:
    """Map operand name to its type."""
    if name in ('vd', 'vs1', 'vs2', 'vs3', 'rd', 'rs1', 'rs2', 'rs3',
                'fd', 'fs1', 'fs2', 'fs3'):
        return 'register'
    return 'immediate'


def infer_format_from_opcode(encoding: str, mnemonic: str = "") -> str:
    """
    Infer instruction format from opcode (bits [6:0]) and mnemonic.

    Vector instructions use:
        - 0x57 (0b1010111) = OP-V opcode → V-Type format (vector arithmetic)
        - 0x07 (0b0000111) = LOAD-FP / vector loads → VLS-Type format
        - 0x27 (0b0100111) = STORE-FP / vector stores → VLS-Type format
        - vsetvli, vsetivli, vsetvl → VSETVL-Type format

    Returns:
        Format string ("V-Type", "VLS-Type", "VSETVL-Type", or "Unknown")
    """
    if not encoding or len(encoding) != 32:
        return "Unknown"

    mnemonic_upper = mnemonic.upper()

    # Check for vsetvl* configuration instructions first
    if mnemonic_upper.startswith('VSETV') or mnemonic_upper.startswith('VSETIV'):
        return "VSETVL-Type"

    # Extract bits [6:0] - the rightmost 7 bits
    opcode_bits = encoding[-7:]

    # Check for OP-V (0x57 = 0b1010111) - vector arithmetic
    if opcode_bits == '1010111':
        return "V-Type"

    # Check for LOAD-FP / vector loads (0x07 = 0b0000111)
    if opcode_bits == '0000111':
        return "VLS-Type"

    # Check for STORE-FP / vector stores (0x27 = 0b0100111)
    if opcode_bits == '0100111':
        return "VLS-Type"

    # Unknown opcode - fallback to V-Type for vector instructions
    return "V-Type"


def infer_category(mnemonic: str) -> str:
    """
    Infer instruction category from mnemonic.

    Vector instruction categories:
        - Arithmetic: vadd, vsub, vmul, vdiv, etc.
        - Logical: vand, vor, vxor, etc.
        - Shift: vsll, vsrl, vsra, etc.
        - Load/Store: vle, vse, vlse, vsse, etc.
        - Configuration: vsetvl, vsetvli, vsetivli
        - Comparison: vmseq, vmsne, vmslt, etc.
        - Reduction: vredsum, vredmax, vredmin, etc.
        - Permutation: vrgather, vcompress, vslideup, vslidedown
        - Mask: vmand, vmor, vmxor, vpopc, vfirst
        - Fixed-Point: vsadd, vssub, etc.
        - Floating-Point: vfadd, vfsub, vfmul, vfdiv, etc.
    """
    m = mnemonic.upper()

    # Configuration
    if m.startswith('VSETV'):
        return 'Configuration'

    # Load/Store
    if m.startswith('VL') or m.startswith('VS'):
        # Exclude logical operations
        if not any(x in m for x in ['VSLL', 'VSRL', 'VSRA', 'VLS']):
            return 'Load/Store'

    # Floating-Point
    if m.startswith('VF'):
        return 'Floating-Point'

    # Mask operations
    if m.startswith('VM') and not m.startswith('VMUL'):
        return 'Mask'

    # Reduction
    if m.startswith('VRED') or m.startswith('VWRED') or m.startswith('VFRED'):
        return 'Reduction'

    # Permutation
    if any(x in m for x in ['VRGATHER', 'VCOMPRESS', 'VSLIDE', 'VRGATHER']):
        return 'Permutation'

    # Shift
    if any(x in m for x in ['VSLL', 'VSRL', 'VSRA']):
        return 'Shift'

    # Logical
    if any(x in m for x in ['VAND', 'VOR', 'VXOR', 'VNOT']):
        return 'Logical'

    # Arithmetic (includes mul/div)
    if any(x in m for x in ['VADD', 'VSUB', 'VMUL', 'VDIV', 'VREM', 'VMACC', 'VNMSAC', 'VMADD', 'VNMSUB']):
        return 'Arithmetic'

    # Comparison
    if m.startswith('VMS'):
        return 'Comparison'

    # Fixed-Point
    if any(x in m for x in ['VSADD', 'VSSUB', 'VAADDU', 'VAADD', 'VASUBU', 'VASUB']):
        return 'Fixed-Point'

    # Default
    return 'Vector'


def parse_instruction_line(line: str) -> Optional[Instruction]:
    """
    Parse a single instruction line from rv_v file.

    Format: mnemonic operands encoding_specs
    Example: vadd.vv vd vs2 vs1 vm 31..26=0x00 25=1 14..12=0x0 6..0=0x57

    Returns:
        Instruction object or None if line should be skipped
    """
    line = line.strip()

    # Skip empty lines
    if not line:
        return None

    # Skip comments
    if line.startswith('#'):
        return None

    # Skip pseudo-ops
    if line.startswith('$'):
        return None

    # Split line into parts
    parts = line.split()

    if len(parts) < 2:
        return None

    # First part is mnemonic
    mnemonic = parts[0]

    # Rest is operands and encoding specs
    remainder = parts[1:]

    # Separate operands from encoding specs
    operand_parts = []
    encoding_specs = []

    for part in remainder:
        if '=' in part or '..' in part:
            # This is an encoding spec
            encoding_specs.append(part)
        else:
            # This is an operand
            operand_parts.append(part)

    # Parse operands (types are rebuilt after reordering below)
    operand_string = ' '.join(operand_parts)
    operands, _ = parse_operands(operand_string)

    # Build encoding
    encoding = build_encoding_from_specs(encoding_specs)

    # Create instruction (will be duplicated for RV32V and RV64V later)
    instr = Instruction(mnemonic, "RV32V")
    instr.encoding = encoding
    instr.category = infer_category(mnemonic)
    instr.format = infer_format_from_opcode(encoding, mnemonic)

    # Reorder operands from encoding field order to assembly syntax order
    instr.operands = reorder_operands_for_assembly(operands, instr.format, mnemonic)
    instr.operand_types = [operand_name_to_type(op) for op in instr.operands]

    # Parse encoding into structured fields using vector-specific formats
    instr.encoding_fields = parse_encoding_fields(instr.encoding, instr.format)

    return instr


# ============================================================================
# Main Extraction Logic
# ============================================================================

def fetch_opcodes_file(url: str) -> str:
    """Fetch the rv_v file from GitHub."""
    print(f"Fetching {url}...")
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        print(f"✓ Downloaded {len(response.content):,} bytes")
        return response.text
    except requests.RequestException as e:
        print(f"✗ Failed to fetch: {e}")
        sys.exit(1)


def extract_instructions(opcodes_text: str, stats: ExtractionStats) -> List[Instruction]:
    """
    Extract all vector instructions from rv_v file.

    Returns:
        List of Instruction objects
    """
    print("\n" + "=" * 70)
    print("EXTRACTING INSTRUCTIONS FROM RV_V FILE")
    print("=" * 70)

    lines = opcodes_text.split('\n')
    instructions = []

    for line_num, line in enumerate(lines, 1):
        instr = parse_instruction_line(line)

        if instr:
            instructions.append(instr)
            stats.add_instruction(instr)

            # Progress indicator
            if len(instructions) % 50 == 0 or len(instructions) <= 5:
                print(f"  [{len(instructions)}] {instr.mnemonic}")

    print(f"\n✓ Extracted {len(instructions)} vector instructions")
    print(f"  Encoding quality:")
    print(f"    Complete: {stats.encoding_quality['complete']}")
    print(f"    Partial: {stats.encoding_quality['partial']}")
    print(f"    Placeholder: {stats.encoding_quality['placeholder']}")

    return instructions


def duplicate_to_rv64v(instructions: List[Instruction], stats: ExtractionStats) -> List[Instruction]:
    """
    Duplicate all RV32V instructions to RV64V.
    Follows the same pattern as extract_RVG.py's duplicate_rv32_to_rv64().

    Returns:
        Combined list with both RV32V and RV64V instructions
    """
    print("\n" + "=" * 70)
    print("DUPLICATING RV32V INSTRUCTIONS TO RV64V")
    print("=" * 70)

    rv64v_instructions = []

    for rv32v_instr in instructions:
        # Create RV64V duplicate
        rv64v_instr = Instruction(rv32v_instr.mnemonic, "RV64V")
        rv64v_instr.encoding = rv32v_instr.encoding
        rv64v_instr.operands = rv32v_instr.operands.copy()
        rv64v_instr.operand_types = rv32v_instr.operand_types.copy()
        rv64v_instr.format = rv32v_instr.format
        rv64v_instr.encoding_fields = rv32v_instr.encoding_fields.copy()
        rv64v_instr.category = rv32v_instr.category
        rv64v_instr.description = rv32v_instr.description
        rv64v_instr.pseudocode = rv32v_instr.pseudocode

        rv64v_instructions.append(rv64v_instr)
        stats.add_instruction(rv64v_instr)

    print(f"  RV32V: {stats.rv32v_count} instructions")
    print(f"  RV64V: {stats.rv64v_count} instructions (duplicated)")
    print(f"  Total: {len(instructions) + len(rv64v_instructions)} instructions")

    return instructions + rv64v_instructions


# ============================================================================
# Output Generation
# ============================================================================

def generate_report(stats: ExtractionStats, instructions: List[Instruction]) -> str:
    """Generate comprehensive extraction report."""
    lines = []
    lines.append("=" * 70)
    lines.append("RISC-V VECTOR EXTENSION EXTRACTION REPORT")
    lines.append("=" * 70)
    lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")

    # Overall statistics
    lines.append("OVERALL STATISTICS")
    lines.append("-" * 70)
    lines.append(f"Total instructions extracted: {stats.total_instructions}")
    lines.append(f"Unique mnemonics: {len(set(i.mnemonic for i in instructions))}")
    lines.append("")

    # Extension breakdown
    lines.append("EXTENSION BREAKDOWN")
    lines.append("-" * 70)
    lines.append(f"RV32V: {stats.rv32v_count} instructions")
    lines.append(f"RV64V: {stats.rv64v_count} instructions")
    lines.append("")

    # Encoding quality
    lines.append("ENCODING QUALITY")
    lines.append("-" * 70)
    total = stats.total_instructions
    for quality, count in stats.encoding_quality.items():
        pct = (count / total * 100) if total > 0 else 0
        lines.append(f"{quality.capitalize()}: {count}/{total} ({pct:.1f}%)")
    lines.append("")

    # Sample encodings
    lines.append("SAMPLE ENCODINGS")
    lines.append("-" * 70)
    samples = [i for i in instructions if '0' in i.encoding or '1' in i.encoding][:5]
    for instr in samples:
        lines.append(f"{instr.mnemonic:20s} ({instr.extension}): {instr.encoding}")
    lines.append("")

    # Instructions by extension
    lines.append("INSTRUCTIONS BY EXTENSION")
    lines.append("-" * 70)

    for ext in ["RV32V", "RV64V"]:
        mnemonics = sorted(set(stats.by_extension[ext]))
        lines.append(f"\n{ext}: {len(mnemonics)} unique mnemonics")

        # Show in rows of 8
        for i in range(0, min(len(mnemonics), 40), 8):
            chunk = mnemonics[i:i+8]
            lines.append(f"  {', '.join(chunk)}")

        if len(mnemonics) > 40:
            lines.append(f"  ... and {len(mnemonics) - 40} more")

    lines.append("")
    lines.append("=" * 70)
    lines.append("END REPORT")
    lines.append("=" * 70)

    return '\n'.join(lines)


# ============================================================================
# Main Pipeline
# ============================================================================

def main():
    """Main extraction pipeline."""
    print("=" * 70)
    print("RISC-V VECTOR EXTENSION INSTRUCTION EXTRACTOR")
    print("=" * 70)
    print()

    stats = ExtractionStats()

    # Step 1: Fetch opcodes file
    opcodes_text = fetch_opcodes_file(OPCODES_URL)

    # Step 2: Extract RV32V instructions
    instructions = extract_instructions(opcodes_text, stats)

    if not instructions:
        print("✗ No instructions extracted. Exiting.")
        sys.exit(1)

    # Step 3: Duplicate to RV64V
    all_instructions = duplicate_to_rv64v(instructions, stats)

    # Generate outputs
    print("\n" + "=" * 70)
    print("APPENDING TO EXISTING INSTRUCTIONS")
    print("=" * 70)
    print(f"Target file: {OUTPUT_JSON}")
    print(f"New RVV instructions to add: {len(all_instructions)}")
    print()

    # Load existing instructions if file exists
    existing_instructions = []
    if OUTPUT_JSON.exists():
        print(f"✓ Found existing {OUTPUT_JSON.name}, loading...")
        with open(OUTPUT_JSON, 'r', encoding='utf-8') as f:
            existing_instructions = json.load(f)
        print(f"  Loaded {len(existing_instructions)} existing instructions")
    else:
        print(f"⚠ Warning: {OUTPUT_JSON.name} does not exist!")
        print("  Please run extract_RVG.py first to create the base instruction file.")
        print("  Creating new file with RVV instructions only...")

    # Check for duplicates
    existing_keys = {(instr.get('mnemonic'), instr.get('extension'))
                     for instr in existing_instructions}

    new_instructions = []
    duplicates_found = 0

    for instr in all_instructions:
        key = (instr.mnemonic, instr.extension)
        if key in existing_keys:
            print(f"  ⚠ Skipping duplicate: {instr.mnemonic} ({instr.extension})")
            duplicates_found += 1
        else:
            new_instructions.append(instr.to_dict())
            existing_keys.add(key)

    # Combine existing + new
    combined_instructions = existing_instructions + new_instructions

    # Write JSON
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)

    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(combined_instructions, f, indent=2, ensure_ascii=False)

    print(f"\n✓ Saved {len(combined_instructions)} total instructions to {OUTPUT_JSON}")
    print(f"  Previous count: {len(existing_instructions)}")
    print(f"  Added: {len(new_instructions)}")
    if duplicates_found > 0:
        print(f"  Skipped duplicates: {duplicates_found}")

    # Write report
    report_text = generate_report(stats, all_instructions)

    with open(OUTPUT_REPORT, 'w', encoding='utf-8') as f:
        f.write(report_text)

    print(f"\n✓ Wrote RVV-specific report to {OUTPUT_REPORT}")

    print(f"\n{'=' * 70}")
    print("EXTRACTION COMPLETE")
    print(f"{'=' * 70}")
    print(f"RVV instructions extracted: {len(all_instructions)}")
    print(f"  RV32V: {stats.rv32v_count} instructions")
    print(f"  RV64V: {stats.rv64v_count} instructions")
    print(f"Total instructions in database: {len(combined_instructions)}")
    print(f"Output files:")
    print(f"  - {OUTPUT_JSON}")
    print(f"  - {OUTPUT_REPORT}")


if __name__ == "__main__":
    main()
