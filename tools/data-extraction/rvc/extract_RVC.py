#!/usr/bin/env python3
"""
RISC-V C Extension Instruction Extractor

Extracts RV32C and RV64C compressed instructions from the official RISC-V ISA manual.
Uses EDN (Extensible Data Notation) files for encoding information and ADOC files for descriptions.

Data sources:
- Encodings: https://github.com/riscv/riscv-isa-manual/blob/main/src/images/bytefield/rvc-instr-quad*.edn
- Descriptions: https://github.com/msyksphinz-self/riscv-isadoc/blob/master/source/rvc.adoc

Requirements: pip install requests beautifulsoup4 lxml
"""

import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import requests
from bs4 import BeautifulSoup

# Import encoding parser (handle both direct execution and module import)
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from encoding_parser import parse_encoding_fields


# ============================================================================
# Configuration
# ============================================================================

# EDN files containing encoding information
EDN_URLS = [
    "https://raw.githubusercontent.com/riscv/riscv-isa-manual/main/src/images/bytefield/rvc-instr-quad0.edn",
    "https://raw.githubusercontent.com/riscv/riscv-isa-manual/main/src/images/bytefield/rvc-instr-quad1.edn",
    "https://raw.githubusercontent.com/riscv/riscv-isa-manual/main/src/images/bytefield/rvc-instr-quad2.edn",
]

# ADOC file containing descriptions and pseudocode
ADOC_URL = "https://raw.githubusercontent.com/msyksphinz-self/riscv-isadoc/master/source/rvc.adoc"

# Path to repo root: rvc/ -> data-extraction/ -> tools/ -> architect.io/
REPO_ROOT = Path(__file__).parent.parent.parent.parent
OUTPUT_JSON = REPO_ROOT / "src" / "data" / "instructions.json"
OUTPUT_REPORT = Path(__file__).parent / "extraction_report_RVC.txt"


# ============================================================================
# Data Models
# ============================================================================

class Instruction:
    """Represents a single RISC-V C extension instruction."""

    def __init__(self, mnemonic: str, extension: str):
        self.mnemonic = mnemonic.upper().strip()
        self.extension = extension.strip()

        # Fields to be filled during extraction
        self.encoding = ""
        self.operands: List[str] = []
        self.operand_types: List[str] = []
        self.format = ""
        self.encoding_fields: List[Dict[str, Any]] = []  # Structured encoding fields

        # Description and pseudocode
        self.description = ""
        self.pseudocode = ""
        self.category = ""

        # Expansion field (only for compressed instructions)
        self.expansion = ""

        # Raw encoding boxes from EDN
        self.encoding_boxes: List[Dict[str, Any]] = []

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

        # Only include expansion field if it exists and is non-empty
        if self.expansion:
            result["expansion"] = self.expansion

        # Add encodingFields if available
        if self.encoding_fields:
            result["encodingFields"] = self.encoding_fields

        return result

    def __repr__(self) -> str:
        return f"Instruction({self.mnemonic}, {self.extension})"


class ExtractionStats:
    """Tracks extraction statistics."""

    def __init__(self):
        self.by_extension: Dict[str, List[str]] = {"RV32C": [], "RV64C": []}
        self.total_instructions = 0
        self.rv32c_count = 0
        self.rv64c_count = 0
        self.field_completeness: Dict[str, int] = {
            "mnemonic": 0,
            "extension": 0,
            "operands": 0,
            "description": 0,
            "pseudocode": 0,
            "encoding": 0,
            "format": 0,
        }
        self.warnings: List[str] = []
        self.errors: List[str] = []

    def record_instruction(self, instr: Instruction):
        """Record an instruction in the stats."""
        self.total_instructions += 1

        if "RV32C" in instr.extension:
            self.rv32c_count += 1
            self.by_extension["RV32C"].append(instr.mnemonic)

        if "RV64C" in instr.extension:
            self.rv64c_count += 1
            self.by_extension["RV64C"].append(instr.mnemonic)

        # Track field completeness
        if instr.mnemonic:
            self.field_completeness["mnemonic"] += 1
        if instr.extension:
            self.field_completeness["extension"] += 1
        if instr.operands:
            self.field_completeness["operands"] += 1
        if instr.description:
            self.field_completeness["description"] += 1
        if instr.pseudocode:
            self.field_completeness["pseudocode"] += 1
        if instr.encoding:
            self.field_completeness["encoding"] += 1
        if instr.format:
            self.field_completeness["format"] += 1


# ============================================================================
# EDN Parsing Functions
# ============================================================================

def fetch_edn_file(url: str) -> str:
    """Fetch an EDN file from a URL."""
    print(f"Fetching {url}...")
    response = requests.get(url)
    response.raise_for_status()
    return response.text


def parse_instruction_line(line: str) -> Optional[Dict[str, Any]]:
    """Parse a single instruction line from the EDN file."""
    # Look for lines with instruction mnemonics (C.XXX pattern)
    mnemonic_match = re.search(r'C\.[A-Z0-9]+', line)
    if not mnemonic_match:
        # Check for special cases like "Illegal instruction" or "Reserved"
        if "Illegal" in line or "Reserved" in line:
            return {"type": "skip", "reason": "Illegal/Reserved"}
        return None

    mnemonic = mnemonic_match.group(0)

    # Check for variant markers (RV32) or (RV64)
    variant = "RV32C/RV64C"  # Default to both
    if "(RV32)" in line:
        variant = "RV32C"
    elif "(RV64)" in line:
        variant = "RV64C"

    # Note: Some instructions like ADDIW and LDSP have special markers like "(RV64; RES, rd=0)"
    # These should be marked as RV64C even though they say "RV64"
    if "RV64" in line and "RV32" not in line:
        variant = "RV64C"

    return {
        "type": "instruction",
        "mnemonic": mnemonic,
        "variant": variant,
        "raw_line": line.strip()
    }


def parse_edn_file(edn_text: str) -> List[Instruction]:
    """Parse an EDN file and extract instructions."""
    lines = edn_text.split('\n')
    instructions = []
    current_encoding = []

    for i, line in enumerate(lines):
        line = line.strip()

        # Skip configuration lines
        if line.startswith('(def') or line.startswith('(defattrs') or 'draw-column-headers' in line:
            continue

        # Check if this is a draw-box line
        if line.startswith('(draw-box'):
            # Check if it contains an instruction mnemonic
            parsed = parse_instruction_line(line)

            if parsed:
                if parsed["type"] == "skip":
                    current_encoding = []
                elif parsed["type"] == "instruction":
                    # Create instruction object
                    instr = Instruction(parsed["mnemonic"], parsed["variant"])
                    instr.encoding_boxes = current_encoding.copy()
                    instructions.append(instr)
                    current_encoding = []
            else:
                # This is an encoding box (field specification)
                # Extract the field name and span
                field_match = re.search(r'"([^"]+)"', line)
                span_match = re.search(r':span (\d+)', line)

                if field_match:
                    field_name = field_match.group(1)
                    span = int(span_match.group(1)) if span_match else 1

                    # Skip label boxes (these are visual elements, not encoding bits)
                    # Label boxes have :borders {} and large spans (3, 6, 7)
                    # We detect them by looking for :borders in the line
                    if ':borders' in line:
                        # This is a label box, skip it
                        continue

                    current_encoding.append({"field": field_name, "bits": span})

    return instructions


def build_encoding_pattern(encoding_boxes: List[Dict[str, Any]]) -> str:
    """Build a 16-bit encoding pattern from encoding boxes.

    Encoding boxes are in MSB-first order (bit 15 to bit 0).
    We build the pattern from left to right.
    """
    pattern = ""

    for box in encoding_boxes:
        field = box["field"]
        bits = box["bits"]

        # Check if this is a fixed bit pattern (like "000", "01", "10", "0", "1", etc.)
        if re.match(r'^[01]+$', field):
            # If the field is a single bit repeated, replicate it
            if len(field) == 1:
                pattern += field * bits
            else:
                # Multi-bit pattern like "000" or "01"
                pattern += field
        else:
            # This is a variable field (register, immediate, etc.)
            pattern += 'x' * bits

    # Ensure the pattern is 16 bits
    if len(pattern) != 16:
        # Something went wrong, return placeholder
        return "?" * 16

    return pattern


def extract_operands_from_boxes(encoding_boxes: List[Dict[str, Any]]) -> Tuple[List[str], List[str]]:
    """Extract operands and their types from encoding boxes."""
    operands = []
    operand_types = []

    for box in encoding_boxes:
        field = box["field"]

        # Skip fixed bit patterns
        if re.match(r'^[01]+$', field):
            continue

        # Normalize field name
        field_lower = field.lower()

        # Extract operand based on field name
        if 'rd' in field_lower:
            if 'rd' not in operands:
                operands.append('rd')
                operand_types.append('register')
        elif 'rs1' in field_lower:
            if 'rs1' not in operands:
                operands.append('rs1')
                operand_types.append('register')
        elif 'rs2' in field_lower:
            if 'rs2' not in operands:
                operands.append('rs2')
                operand_types.append('register')
        elif 'imm' in field_lower or 'uimm' in field_lower or 'nzimm' in field_lower or 'nzuimm' in field_lower:
            if 'imm' not in operands:
                operands.append('imm')
                operand_types.append('immediate')

    return operands, operand_types


# ============================================================================
# ADOC Parsing Functions
# ============================================================================

def fetch_adoc_file(url: str) -> str:
    """Fetch an ADOC file from a URL."""
    print(f"Fetching {url}...")
    response = requests.get(url)
    response.raise_for_status()
    return response.text


def parse_adoc_instruction(adoc_text: str, mnemonic: str) -> Dict[str, str]:
    """Parse description, format, pseudocode, and expansion for a specific instruction from ADOC."""
    # Normalize mnemonic for search (lowercase)
    search_mnemonic = mnemonic.lower()

    # Find the instruction section
    pattern = rf'===\s+{re.escape(search_mnemonic)}\s*\n'
    match = re.search(pattern, adoc_text, re.IGNORECASE)

    if not match:
        return {"description": "", "format": "", "pseudocode": "", "expansion": ""}

    # Extract the section (until the next === or end of file)
    start = match.end()
    next_section = re.search(r'\n===\s+', adoc_text[start:])
    end = start + next_section.start() if next_section else len(adoc_text)
    section = adoc_text[start:end]

    # Extract description
    description = ""
    desc_match = re.search(r'Description::\s*\n(.*?)(?:\n\n|\nImplementation:|\nExpansion:|\nFormat:)', section, re.DOTALL)
    if desc_match:
        description = desc_match.group(1).strip()
        # Clean up asciidoc formatting
        description = re.sub(r'\n+', ' ', description)
        description = re.sub(r'\s+', ' ', description)

    # Extract expansion (shows what the compressed instruction expands to)
    expansion = ""
    expansion_match = re.search(r'Expansion::\s*\n--\s*\n\s*(.+?)\s*\n--', section, re.DOTALL)
    if expansion_match:
        expansion = expansion_match.group(1).strip()
        # Clean up asciidoc formatting
        expansion = re.sub(r'\n+', ' ', expansion)
        expansion = re.sub(r'\s+', ' ', expansion)

    # IMPORTANT: DO NOT extract Format:: field from ADOC
    # The Format:: field in ADOC files contains instruction syntax (e.g., "c.add rd,rs2'")
    # rather than format types (e.g., "CR-Type", "CI-Type"). We rely on the format type
    # inferred by build_encoding_pattern() and the categorization logic which correctly
    # determines compressed instruction format types.
    #
    # Extracting Format:: from ADOC would OVERWRITE the correctly inferred format with syntax.
    #
    # format_match = re.search(...)  # REMOVED - do not extract Format::
    format_str = ""  # Leave empty - format was inferred during encoding building

    # Extract pseudocode (Implementation section)
    pseudocode = ""
    pseudo_match = re.search(r'Implementation::\s*\n--\s*\n\s*(.+?)\s*\n--', section, re.DOTALL)
    if pseudo_match:
        pseudocode = pseudo_match.group(1).strip()
        # Clean up formatting
        pseudocode = re.sub(r'\n+', '\n', pseudocode)

    return {
        "description": description,
        "format": format_str,
        "pseudocode": pseudocode,
        "expansion": expansion
    }


# ============================================================================
# Category Assignment
# ============================================================================

CATEGORY_MAP = {
    # Load/Store
    "C.LW": "Load/Store",
    "C.LD": "Load/Store",
    "C.LQ": "Load/Store",
    "C.FLD": "Load/Store",
    "C.FLW": "Load/Store",
    "C.SW": "Load/Store",
    "C.SD": "Load/Store",
    "C.SQ": "Load/Store",
    "C.FSD": "Load/Store",
    "C.FSW": "Load/Store",
    "C.LWSP": "Load/Store",
    "C.LDSP": "Load/Store",
    "C.LQSP": "Load/Store",
    "C.FLDSP": "Load/Store",
    "C.FLWSP": "Load/Store",
    "C.SWSP": "Load/Store",
    "C.SDSP": "Load/Store",
    "C.SQSP": "Load/Store",
    "C.FSDSP": "Load/Store",
    "C.FSWSP": "Load/Store",

    # Arithmetic
    "C.ADDI": "Arithmetic",
    "C.ADDIW": "Arithmetic",
    "C.ADDI16SP": "Arithmetic",
    "C.ADDI4SPN": "Arithmetic",
    "C.LI": "Arithmetic",
    "C.LUI": "Arithmetic",
    "C.ADD": "Arithmetic",
    "C.ADDW": "Arithmetic",
    "C.SUB": "Arithmetic",
    "C.SUBW": "Arithmetic",
    "C.MV": "Arithmetic",

    # Logical
    "C.ANDI": "Logical",
    "C.AND": "Logical",
    "C.OR": "Logical",
    "C.XOR": "Logical",

    # Shift
    "C.SLLI": "Shift",
    "C.SRLI": "Shift",
    "C.SRAI": "Shift",

    # Control Transfer
    "C.J": "Control Transfer",
    "C.JAL": "Control Transfer",
    "C.JR": "Control Transfer",
    "C.JALR": "Control Transfer",
    "C.BEQZ": "Control Transfer",
    "C.BNEZ": "Control Transfer",

    # System
    "C.EBREAK": "System",
    "C.NOP": "System",
}


def assign_category(mnemonic: str) -> str:
    """Assign a category to an instruction based on its mnemonic."""
    return CATEGORY_MAP.get(mnemonic, "Other")


def infer_compressed_format(encoding_boxes: List[Dict[str, Any]], operands: List[str], mnemonic: str) -> str:
    """
    Infer compressed instruction format type from encoding boxes and operands.

    Returns format types like: CR-Type, CI-Type, CSS-Type, CIW-Type, CL-Type, CS-Type, CA-Type, CB-Type, CJ-Type

    Based on RISC-V compressed instruction formats (16-bit).
    """
    # Count operands
    has_rd = 'rd' in operands
    has_rs1 = 'rs1' in operands
    has_rs2 = 'rs2' in operands
    has_imm = 'imm' in operands

    # Check for special compressed register notation (rd', rs2')
    # These appear in encoding boxes with prime characters: ' (ASCII), ʹ (U+02B9), ′ (U+2032), or _p suffix
    has_prime = any(
        "'" in box.get("field", "") or
        "ʹ" in box.get("field", "") or
        "′" in box.get("field", "") or
        "_p" in box.get("field", "")
        for box in encoding_boxes
    )

    # CM-Type: Code size reduction (Zcmp/Zcmt extensions)
    if mnemonic.startswith('CM.'):
        if 'PUSH' in mnemonic or 'POP' in mnemonic:
            return 'CM-Type (Stack)'
        if 'MV' in mnemonic:
            return 'CM-Type (Move)'
        if 'JALT' in mnemonic or 'JT' in mnemonic:
            return 'CM-Type (Jump)'
        return 'CM-Type'

    # CJ-Type: Jump (C.J, C.JAL) - only immediate, no registers
    if has_imm and not has_rd and not has_rs1 and not has_rs2:
        return 'CJ-Type'

    # CB-Type: Conditional branch (C.BEQZ, C.BNEZ) - rs1' + immediate
    if mnemonic in ['C.BEQZ', 'C.BNEZ']:
        return 'CB-Type'

    # CR-Type: Two register operands, no immediate (C.MV, C.ADD, C.JR, C.JALR)
    if not has_imm and ((has_rd and has_rs2) or (has_rd and has_rs1)):
        # Exclude prime registers (those are CA-Type)
        if not has_prime:
            return 'CR-Type'

    # CA-Type: Arithmetic with compressed registers (C.SUB, C.XOR, C.OR, C.AND, C.SUBW, C.ADDW)
    if has_prime and not has_imm:
        return 'CA-Type'

    # CL-Type: Load (C.LW, C.LD, C.LQ, C.FLW, C.FLD) - rd' + rs1' + immediate
    # Loads always have rd, rs1 (base), and immediate (offset)
    # IMPORTANT: Check this BEFORE CI-Type to avoid false matches
    if has_rd and has_rs1 and has_imm and mnemonic.startswith('C.L') and not mnemonic.endswith('SP'):
        return 'CL-Type'

    # CS-Type: Store (C.SW, C.SD, C.SQ, C.FSW, C.FSD) - rs2' + rs1' + immediate
    # Stores always have rs2 (data), rs1 (base), and immediate (offset)
    # IMPORTANT: Check this BEFORE other types to avoid false matches
    if has_rs2 and has_rs1 and has_imm and mnemonic.startswith('C.S') and not mnemonic.endswith('SP'):
        return 'CS-Type'

    # CSS-Type: Stack-relative store (C.SWSP, C.SDSP, C.SQSP, C.FSDSP, C.FSWSP)
    if 'SP' in mnemonic and mnemonic.endswith('SP') and has_rs2:
        return 'CSS-Type'

    # CIW-Type: Wide immediate (C.ADDI4SPN) - rd' + immediate, no rs1
    # Check this BEFORE CI-Type because it's more specific
    if has_imm and has_rd and not has_rs1 and not has_rs2:
        if 'ADDI4SPN' in mnemonic:
            return 'CIW-Type'

    # CI-Type: One register + immediate (C.ADDI, C.LI, C.LUI, C.SLLI, C.LWSP, C.LDSP, C.LQSP)
    # This is a catch-all for register+immediate that doesn't match more specific types above
    if has_imm and (has_rd or has_rs1) and not has_rs2:
        # Stack loads (LWSP, LDSP, etc.) are also CI-Type
        return 'CI-Type'

    # Default to generic C-Type
    return 'C-Type'


# ============================================================================
# Instruction Duplication
# ============================================================================

def duplicate_shared_instructions(instructions: List[Instruction]) -> List[Instruction]:
    """
    Duplicate instructions marked as RV32C/RV64C into separate RV32C and RV64C entries.
    Similar to RV64 duplication in extract_RVG.py.

    This ensures that:
    - RV32C-only instructions remain as RV32C
    - RV64C-only instructions remain as RV64C
    - Shared instructions (RV32C/RV64C) become TWO entries: one RV32C + one RV64C
    """
    import copy

    result = []
    shared_count = 0
    rv32c_only_count = 0
    rv64c_only_count = 0

    print("\n" + "=" * 70)
    print("DUPLICATING SHARED INSTRUCTIONS")
    print("=" * 70)

    for instr in instructions:
        if instr.extension == "RV32C/RV64C":
            # Create RV32C version
            rv32c_instr = copy.deepcopy(instr)
            rv32c_instr.extension = "RV32C"
            result.append(rv32c_instr)

            # Create RV64C version
            rv64c_instr = copy.deepcopy(instr)
            rv64c_instr.extension = "RV64C"
            result.append(rv64c_instr)

            shared_count += 1
        elif instr.extension == "RV32C":
            # RV32C-only - keep as is
            result.append(instr)
            rv32c_only_count += 1
        elif instr.extension == "RV64C":
            # RV64C-only - keep as is
            result.append(instr)
            rv64c_only_count += 1
        else:
            # Unknown extension - keep as is (shouldn't happen)
            result.append(instr)

    # Count final totals
    rv32c_total = rv32c_only_count + shared_count
    rv64c_total = rv64c_only_count + shared_count

    print(f"  RV32C-only instructions: {rv32c_only_count}")
    print(f"  RV64C-only instructions: {rv64c_only_count}")
    print(f"  Shared instructions (RV32C/RV64C): {shared_count}")
    print(f"  → Created {shared_count * 2} entries ({shared_count} RV32C + {shared_count} RV64C)")
    print(f"\n  Final counts:")
    print(f"    RV32C: {rv32c_total} instructions ({rv32c_only_count} only + {shared_count} from shared)")
    print(f"    RV64C: {rv64c_total} instructions ({rv64c_only_count} only + {shared_count} from shared)")
    print(f"  Total instructions after duplication: {len(result)}")

    return result


# ============================================================================
# Main Extraction Logic
# ============================================================================

def extract_all_instructions(stats: ExtractionStats) -> List[Instruction]:
    """Extract all RVC instructions from EDN and ADOC files."""
    all_instructions = []

    # Step 1: Extract from EDN files
    print("\n" + "=" * 80)
    print("STEP 1: Extracting instructions from EDN files")
    print("=" * 80)

    for url in EDN_URLS:
        edn_text = fetch_edn_file(url)
        instructions = parse_edn_file(edn_text)
        all_instructions.extend(instructions)
        print(f"  Found {len(instructions)} instructions in {url.split('/')[-1]}")

    print(f"\nTotal instructions found: {len(all_instructions)}")

    # Step 2: Build encodings and extract operands
    print("\n" + "=" * 80)
    print("STEP 2: Building encoding patterns and extracting operands")
    print("=" * 80)

    for instr in all_instructions:
        instr.encoding = build_encoding_pattern(instr.encoding_boxes)
        instr.operands, instr.operand_types = extract_operands_from_boxes(instr.encoding_boxes)
        instr.category = assign_category(instr.mnemonic)
        # Infer format type from encoding and operands
        instr.format = infer_compressed_format(instr.encoding_boxes, instr.operands, instr.mnemonic)
        # Parse encoding into structured fields
        instr.encoding_fields = parse_encoding_fields(instr.encoding, instr.format)

    # Step 3: Enrich with ADOC data
    print("\n" + "=" * 80)
    print("STEP 3: Enriching with descriptions and pseudocode from ADOC")
    print("=" * 80)

    adoc_text = fetch_adoc_file(ADOC_URL)

    enriched_count = 0
    expansion_count = 0
    for instr in all_instructions:
        adoc_data = parse_adoc_instruction(adoc_text, instr.mnemonic)

        if adoc_data["description"]:
            instr.description = adoc_data["description"]
            enriched_count += 1

        # DO NOT overwrite format - it was correctly inferred during encoding building
        # The format from ADOC is syntax, not a format type
        # if adoc_data["format"]:
        #     instr.format = adoc_data["format"]

        if adoc_data["pseudocode"]:
            # Special case: C.NOP has "None" in ADOC, which should be empty
            if adoc_data["pseudocode"] == "None" and instr.mnemonic == "C.NOP":
                instr.pseudocode = ""
            else:
                instr.pseudocode = adoc_data["pseudocode"]

        if adoc_data["expansion"]:
            instr.expansion = adoc_data["expansion"]
            expansion_count += 1

    print(f"  Enriched {enriched_count}/{len(all_instructions)} instructions with ADOC data")
    print(f"  Found expansion field for {expansion_count}/{len(all_instructions)} instructions")

    # Step 4: Record stats
    for instr in all_instructions:
        stats.record_instruction(instr)

    return all_instructions


# ============================================================================
# Output Generation
# ============================================================================

def generate_json_output(instructions: List[Instruction], output_path: Path):
    """Generate JSON output file by appending to existing instructions.json."""
    print("\n" + "=" * 80)
    print("APPENDING TO EXISTING INSTRUCTIONS")
    print("=" * 80)
    print(f"Target file: {output_path}")
    print(f"New RVC instructions to add: {len(instructions)}")
    print()

    # Load existing instructions if file exists
    existing_instructions = []
    if output_path.exists():
        print(f"✓ Found existing {output_path.name}, loading...")
        with open(output_path, 'r', encoding='utf-8') as f:
            existing_instructions = json.load(f)
        print(f"  Loaded {len(existing_instructions)} existing instructions")
    else:
        print(f"⚠ Warning: {output_path.name} does not exist!")
        print("  Please run extract_RVG.py and extract_RVB.py first.")
        print("  Creating new file with RVC instructions only...")

    # Check for duplicates
    existing_keys = {(instr.get('mnemonic'), instr.get('extension'))
                     for instr in existing_instructions}

    new_instructions = []
    duplicates_found = 0

    for instr in instructions:
        key = (instr.mnemonic, instr.extension)
        if key in existing_keys:
            print(f"  ⚠ Skipping duplicate: {instr.mnemonic} ({instr.extension})")
            duplicates_found += 1
        else:
            new_instructions.append(instr.to_dict())
            existing_keys.add(key)

    # Combine existing + new
    combined_instructions = existing_instructions + new_instructions

    # Write to file
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(combined_instructions, f, indent=2, ensure_ascii=False)

    print(f"\n✓ Saved {len(combined_instructions)} total instructions to {output_path}")
    print(f"  Previous count: {len(existing_instructions)}")
    print(f"  Added: {len(new_instructions)}")
    if duplicates_found > 0:
        print(f"  Skipped duplicates: {duplicates_found}")


def generate_report(stats: ExtractionStats, instructions: List[Instruction], output_path: Path):
    """Generate extraction report."""
    print("\n" + "=" * 80)
    print(f"Generating extraction report: {output_path}")
    print("=" * 80)

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("=" * 80 + "\n")
        f.write("RISC-V C Extension Instruction Extraction Report\n")
        f.write("=" * 80 + "\n")
        f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Total Instructions: {stats.total_instructions}\n")
        f.write("\n")

        # Breakdown by extension
        f.write("Extension Breakdown:\n")
        f.write("-" * 80 + "\n")
        f.write(f"  RV32C: {stats.rv32c_count} instructions\n")
        f.write(f"  RV64C: {stats.rv64c_count} instructions\n")
        f.write("\n")

        # Field completeness
        f.write("Field Completeness:\n")
        f.write("-" * 80 + "\n")
        total = stats.total_instructions
        for field, count in stats.field_completeness.items():
            pct = (count / total * 100) if total > 0 else 0
            f.write(f"  {field:15s}: {count:3d}/{total:3d} ({pct:5.1f}%)\n")
        f.write("\n")

        # Instructions by extension
        f.write("Instructions by Extension:\n")
        f.write("-" * 80 + "\n")
        for ext in ["RV32C", "RV64C"]:
            f.write(f"\n{ext} ({len(stats.by_extension[ext])} instructions):\n")
            for mnemonic in sorted(set(stats.by_extension[ext])):
                f.write(f"  - {mnemonic}\n")
        f.write("\n")

        # Warnings and errors
        if stats.warnings:
            f.write("Warnings:\n")
            f.write("-" * 80 + "\n")
            for warning in stats.warnings:
                f.write(f"  ⚠ {warning}\n")
            f.write("\n")

        if stats.errors:
            f.write("Errors:\n")
            f.write("-" * 80 + "\n")
            for error in stats.errors:
                f.write(f"  ✗ {error}\n")
            f.write("\n")

        # Sample instructions
        f.write("Sample Instructions (first 5):\n")
        f.write("-" * 80 + "\n")
        for instr in sorted(instructions, key=lambda x: x.mnemonic)[:5]:
            f.write(f"\n{instr.mnemonic} ({instr.extension}):\n")
            f.write(f"  Format: {instr.format}\n")
            f.write(f"  Encoding: {instr.encoding}\n")
            f.write(f"  Category: {instr.category}\n")
            f.write(f"  Operands: {', '.join(instr.operands)}\n")
            f.write(f"  Description: {instr.description[:100]}...\n" if len(instr.description) > 100 else f"  Description: {instr.description}\n")

    print(f"✓ Wrote extraction report to {output_path}")


# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    """Main entry point."""
    print("=" * 80)
    print("RISC-V C Extension Instruction Extractor")
    print("=" * 80)
    print()

    stats = ExtractionStats()

    try:
        # Extract all instructions
        instructions = extract_all_instructions(stats)

        # Duplicate shared instructions (RV32C/RV64C → RV32C + RV64C)
        instructions = duplicate_shared_instructions(instructions)

        # Re-calculate stats after duplication
        stats = ExtractionStats()
        for instr in instructions:
            stats.record_instruction(instr)

        # Generate outputs
        generate_json_output(instructions, OUTPUT_JSON)
        generate_report(stats, instructions, OUTPUT_REPORT)

        print("\n" + "=" * 80)
        print("EXTRACTION COMPLETE")
        print("=" * 80)
        print(f"✓ RVC instructions extracted: {stats.total_instructions}")
        print(f"  RV32C: {stats.rv32c_count} instructions")
        print(f"  RV64C: {stats.rv64c_count} instructions")
        print(f"✓ Output files:")
        print(f"  - {OUTPUT_JSON} (appended)")
        print(f"  - {OUTPUT_REPORT}")

        return 0

    except Exception as e:
        print(f"\n✗ FATAL ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
