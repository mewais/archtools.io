#!/usr/bin/env python3
"""
RISC-V Instruction Extractor (Complete Rewrite)

Extracts instruction encodings from the official RISC-V ISA manual HTML
and enriches with descriptions from secondary sources.

Based on actual HTML structure analysis from:
https://github.com/riscv/riscv-isa-manual/releases/download/riscv-isa-release-f09c89d-2025-10-24/riscv-unprivileged.html

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
from bs4 import BeautifulSoup, Tag

# Import encoding parser (handle both direct execution and module import)
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from encoding_parser import parse_encoding_fields


# ============================================================================
# Configuration
# ============================================================================

OFFICIAL_ISA_URL = "https://github.com/riscv/riscv-isa-manual/releases/download/riscv-isa-release-f09c89d-2025-10-24/riscv-unprivileged.html"
SECONDARY_BASE_URL = "https://msyksphinz-self.github.io/riscv-isadoc/html/"
TERTIARY_BASE_URL = "https://raw.githubusercontent.com/msyksphinz-self/riscv-isadoc/master/source/"

# Path to repo root: rvg/ -> data-extraction/ -> tools/ -> architect.io/
REPO_ROOT = Path(__file__).parent.parent.parent.parent
OUTPUT_JSON = REPO_ROOT / "src" / "data" / "instructions.json"
OUTPUT_REPORT = Path(__file__).parent / "extraction_report_RVG.txt"

# Extensions to duplicate from RV32 to RV64
# Main extensions: I, M, A, F, D, Q
# Z extensions: Zfh, Zawrs
# Note: Zicsr and Zifencei are already duplicated during extraction (they have RV32/RV64 headers)
DUPLICATABLE_EXTENSIONS = {"I", "M", "A", "F", "D", "Q", "Zfh", "Zawrs"}

# NOTE: We no longer use pattern matching to determine RV64-only instructions.
# The table structure already tells us which instructions belong where through
# the "in addition to RV32X" flag in extension headers.

# Secondary/Tertiary source URL mapping (extension → URL)
# Secondary = HTML pages, Tertiary = .adoc source files
# Extensions not in this map will have empty description/pseudocode/example fields
SECONDARY_SOURCE_URLS = {
    # HTML sources (secondary)
    "I": ("html", f"{SECONDARY_BASE_URL}rvi.html"),
    "M": ("html", f"{SECONDARY_BASE_URL}rvm.html"),
    "A": ("html", f"{SECONDARY_BASE_URL}rva.html"),
    "F": ("html", f"{SECONDARY_BASE_URL}rvfd.html"),
    "D": ("html", f"{SECONDARY_BASE_URL}rvfd.html"),
    "Zicsr": ("html", f"{SECONDARY_BASE_URL}rvi.html"),  # CSR instructions in rvi.html
    "Zifencei": ("html", f"{SECONDARY_BASE_URL}rvi.html"),  # fence.i in rvi.html

    # .adoc sources (tertiary) - for extensions without HTML pages
    "Q": None,  # No source available for Q extension
    "Zfh": ("adoc", f"{TERTIARY_BASE_URL}rv_zfh.adoc"),
    "Zawrs": None,  # TODO: Check if rv_zawrs.adoc exists
}


# ============================================================================
# Data Models
# ============================================================================

class Instruction:
    """Represents a single RISC-V instruction with full encoding."""

    def __init__(self, mnemonic: str, extension: str):
        self.mnemonic = mnemonic.upper().strip()
        self.extension = extension.strip()

        # Encoding fields
        self.encoding = "x" * 32  # 32-bit binary encoding
        self.operands: List[str] = []
        self.operand_types: List[str] = []
        self.format = ""
        self.encoding_fields: List[Dict[str, Any]] = []  # Structured encoding fields

        # Enrichment fields (empty until Step 2)
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
        return f"Instruction({self.mnemonic}, {self.extension}, {self.format})"


class ExtractionStats:
    """Tracks extraction statistics."""

    def __init__(self):
        self.by_extension: Dict[str, List[str]] = {}
        self.total_tables = 0
        self.total_instructions = 0
        self.encoding_quality: Dict[str, int] = {
            "complete": 0,    # Has actual opcode bits
            "partial": 0,     # Has some bits
            "placeholder": 0  # All 'x'
        }
        self.enrichment: Dict[str, int] = {
            "complete": 0,
            "partial": 0,
            "none": 0
        }
        self.no_operands: List[str] = []
        self.rv64_duplications: Dict[str, Dict[str, int]] = {}

    def add_instruction(self, instr: Instruction):
        """Record instruction statistics."""
        if instr.extension not in self.by_extension:
            self.by_extension[instr.extension] = []
        self.by_extension[instr.extension].append(instr.mnemonic)
        self.total_instructions += 1

        # Check encoding quality
        if instr.encoding.count('x') == 32:
            self.encoding_quality["placeholder"] += 1
        elif '0' in instr.encoding or '1' in instr.encoding:
            if instr.encoding.count('x') < 10:
                self.encoding_quality["complete"] += 1
            else:
                self.encoding_quality["partial"] += 1

        # Track instructions with no operands
        if not instr.operands:
            self.no_operands.append(f"{instr.mnemonic} ({instr.extension})")


# ============================================================================
# Field Parsing Utilities
# ============================================================================

def get_field_bit_width(field_text: str, colspan: int) -> int:
    """
    Determine exact bit width from field specification.

    Uses field semantics first, then colspan as fallback.
    """
    field_lower = field_text.lower().strip()

    # Standard register fields (5 bits)
    if field_lower in ['rd', 'rs1', 'rs2', 'rs3']:
        return 5

    # Rounding mode field (3 bits) - used in floating-point instructions
    if field_lower == 'rm':
        return 3

    # Atomic instruction ordering bits (1 bit each)
    # These appear in RV32A/RV64A atomic instructions (LR, SC, AMO*)
    if field_lower in ['aq', 'rl']:
        return 1

    # FENCE instruction fields (4 bits each)
    # fm = fence mode, pred = predecessor set (IORW), succ = successor set (IORW)
    if field_lower in ['fm', 'pred', 'succ']:
        return 4

    # Function code fields
    if field_lower == 'funct2':
        return 2
    if field_lower == 'funct3' or re.match(r'^[01]{3}$', field_text):
        return 3
    if field_lower == 'funct7' or re.match(r'^[01]{7}$', field_text):
        return 7

    # Opcode (always 7 bits, appears at end)
    if field_lower == 'opcode' or re.match(r'^[01]{7}$', field_text):
        return 7

    # Shift amount (context-dependent)
    if 'shamt' in field_lower:
        # Check for RV64 6-bit shamt
        if '[5:0]' in field_text or colspan >= 3:
            return 6
        return 5

    # Parse bit slice notation (e.g., imm[31:12], imm[12|10:5])
    if '[' in field_text:
        return parse_bit_slice_width(field_text)

    # Binary literals
    if re.match(r'^[01]+$', field_text):
        return len(field_text)

    # Fallback: estimate from colspan (rough approximation)
    # 15 columns = 32 bits → ~2.13 bits/column
    # But actual mapping varies by position
    colspan_mapping = {
        1: 2,
        2: 5,
        3: 6,
        4: 7,
        5: 10,
        6: 12,
        10: 20,
        15: 32
    }
    return colspan_mapping.get(colspan, max(2, int(colspan * 2.13)))


def parse_bit_slice_width(field_text: str) -> int:
    """
    Parse bit width from slice notation.

    Examples:
        imm[31:12] → 20 bits
        imm[11:0] → 12 bits
        imm[12|10:5] → 1 + 6 = 7 bits
        imm[20|10:1|11|19:12] → 1 + 10 + 1 + 8 = 20 bits
    """
    # Extract content between brackets
    match = re.search(r'\[([^\]]+)\]', field_text)
    if not match:
        return 12  # Default for unknown immediates

    slice_spec = match.group(1)
    total_bits = 0

    # Split by | (bit concatenation)
    parts = slice_spec.split('|')

    for part in parts:
        if ':' in part:
            # Range: high:low
            high, low = part.split(':')
            total_bits += int(high) - int(low) + 1
        else:
            # Single bit
            total_bits += 1

    return total_bits


def extract_operand_name(field_text: str) -> Optional[str]:
    """
    Extract operand name from field specification.

    Examples:
        rd → rd
        rs1 → rs1
        imm[11:0] → imm
        csr → csr
        funct3 → None (not an operand)
    """
    field_lower = field_text.lower().strip()

    # Register operands
    if field_lower in ['rd', 'rs1', 'rs2', 'rs3']:
        return field_lower

    # CSR operand (Control and Status Register)
    if field_lower == 'csr':
        return 'csr'

    # Immediate operands
    if 'imm' in field_lower:
        return 'imm'

    # Shift amount
    if 'shamt' in field_lower:
        return 'shamt'

    # Not an operand (funct codes, opcode, etc.)
    return None


def is_binary_literal(text: str) -> bool:
    """
    Check if text is a binary literal (fixed encoding bits).

    Accepts 2+ binary digits to handle:
    - 2-bit format field (fmt) in R4-type FP instructions: 00, 01, 10, 11
    - 3-bit funct3 fields
    - 5-bit funct5 fields (atomic instructions)
    - 7-bit opcode and funct7 fields
    """
    text = text.strip()
    return bool(re.match(r'^[01]{2,}$', text))


def get_special_format_for_mnemonic(mnemonic: str) -> Optional[str]:
    """
    Determine if instruction requires a specialized format based on mnemonic.

    Returns:
        Format name if instruction needs special handling, None otherwise.
    """
    mnemonic_upper = mnemonic.upper()

    # Atomic instructions (A extension): LR, SC, AMO*
    if (mnemonic_upper.startswith('LR.') or
        mnemonic_upper.startswith('SC.') or
        mnemonic_upper.startswith('AMO')):
        return 'R-Atomic'

    # FENCE instructions
    if mnemonic_upper in ['FENCE', 'FENCE.I', 'FENCE.TSO', 'PAUSE']:
        return 'FENCE-Type'

    # R4-type: Fused multiply-add instructions (FMADD, FMSUB, FNMADD, FNMSUB)
    if any(mnemonic_upper.startswith(prefix) for prefix in ['FMADD', 'FMSUB', 'FNMADD', 'FNMSUB']):
        return 'R4-Type'

    return None


def infer_format_from_fields(fields: List[Dict[str, Any]], mnemonic: str = "") -> str:
    """
    Infer instruction format (R/I/S/B/U/J/CSR/CSRI) from field pattern.

    Field names from HTML tables may include bit ranges like 'imm[11:0]',
    so we check if the field name contains the key substring.
    """
    # First check for special formats based on mnemonic
    special_format = get_special_format_for_mnemonic(mnemonic)
    if special_format:
        return special_format

    field_names = [f.get('name', '').lower() for f in fields]

    # Check for CSR field (Control and Status Register instructions)
    has_csr = any('csr' in name for name in field_names)

    # CSR-Type: csr, rd, rs1, funct3, opcode (CSRRW, CSRRS, CSRRC)
    # CSRI-Type: csr, rd, uimm/imm, funct3, opcode (CSRRWI, CSRRSI, CSRRCI)
    if has_csr:
        has_rs1 = 'rs1' in field_names
        has_imm = any('imm' in name for name in field_names)
        if has_rs1 and not has_imm:
            return 'CSR-Type'
        else:
            return 'CSRI-Type'

    # U-type: imm[31:12], rd, opcode
    if any('imm[31:12]' in str(f) for f in fields):
        return 'U-type'

    # J-type: imm[20|...], rd, opcode (JAL)
    if any('20|10:1' in str(f) or '20|19:12' in str(f) for f in fields):
        return 'J-type'

    # Check for register operands (exact match for registers)
    has_rd = 'rd' in field_names
    has_rs1 = 'rs1' in field_names
    has_rs2 = 'rs2' in field_names

    # Check for immediate fields (substring match since names can be 'imm[11:0]', etc.)
    has_imm = any('imm' in name or 'shamt' in name for name in field_names)

    # B-type: rs1, rs2, imm (branches)
    # Check first - distinguished from S by immediate format pattern
    if has_rs1 and has_rs2 and any('12|10:5' in str(f) for f in fields):
        return 'B-type'

    # S-type: rs1, rs2, imm (stores) - no rd
    if has_rs1 and has_rs2 and has_imm and not has_rd:
        return 'S-type'

    # R-type: rd, rs1, rs2, funct3, funct7, opcode - no imm
    if has_rd and has_rs1 and has_rs2 and not has_imm:
        return 'R-type'

    # I-type: rd, rs1, imm - no rs2
    if has_rd and has_rs1 and has_imm and not has_rs2:
        return 'I-type'

    # Default fallback - try to infer from what we have
    if has_imm:
        if has_rd and not has_rs2:
            return 'I-type'
        if has_rs2 and not has_rd:
            return 'S-type'

    return 'R-type'


def reorder_operands_for_assembly(operands: List[str], format_type: str) -> List[str]:
    """
    Reorder operands to match RISC-V assembly syntax.

    Assembly order is always: destination first, sources second, immediate last
    - R-type: rd, rs1, rs2
    - I-type: rd, rs1, imm
    - S-type: rs2, rs1, imm (stores: value, base, offset)
    - B-type: rs1, rs2, imm (branches: compare1, compare2, target)
    - U-type: rd, imm
    - J-type: rd, imm
    """
    ordered = []

    # R-type: rd, rs1, rs2, rs3
    if format_type == 'R-type':
        if 'rd' in operands:
            ordered.append('rd')
        if 'rs1' in operands:
            ordered.append('rs1')
        if 'rs2' in operands:
            ordered.append('rs2')
        if 'rs3' in operands:
            ordered.append('rs3')
        return ordered

    # I-type: rd, rs1, imm/shamt
    # CSR instructions (also I-type): rd, csr, rs1 or rd, csr, imm
    elif format_type == 'I-type':
        if 'rd' in operands:
            ordered.append('rd')
        # CSR operand comes before rs1/imm for CSR instructions
        if 'csr' in operands:
            ordered.append('csr')
        if 'rs1' in operands:
            ordered.append('rs1')
        # Add immediate or shamt (whichever is present)
        for op in operands:
            if op in ['imm', 'shamt']:
                ordered.append(op)
        return ordered

    # S-type: rs2, rs1, imm (stores: value, base, offset)
    elif format_type == 'S-type':
        if 'rs2' in operands:
            ordered.append('rs2')
        if 'rs1' in operands:
            ordered.append('rs1')
        if 'imm' in operands:
            ordered.append('imm')
        return ordered

    # B-type: rs1, rs2, imm (branches: compare1, compare2, target)
    elif format_type == 'B-type':
        if 'rs1' in operands:
            ordered.append('rs1')
        if 'rs2' in operands:
            ordered.append('rs2')
        if 'imm' in operands:
            ordered.append('imm')
        return ordered

    # U-type: rd, imm
    elif format_type == 'U-type':
        if 'rd' in operands:
            ordered.append('rd')
        if 'imm' in operands:
            ordered.append('imm')
        return ordered

    # J-type: rd, imm
    elif format_type == 'J-type':
        if 'rd' in operands:
            ordered.append('rd')
        if 'imm' in operands:
            ordered.append('imm')
        return ordered

    # CSR-Type: rd, csr, rs1 (CSRRW, CSRRS, CSRRC)
    elif format_type == 'CSR-Type':
        if 'rd' in operands:
            ordered.append('rd')
        if 'csr' in operands:
            ordered.append('csr')
        if 'rs1' in operands:
            ordered.append('rs1')
        return ordered

    # CSRI-Type: rd, csr, imm (CSRRWI, CSRRSI, CSRRCI)
    elif format_type == 'CSRI-Type':
        if 'rd' in operands:
            ordered.append('rd')
        if 'csr' in operands:
            ordered.append('csr')
        if 'imm' in operands:
            ordered.append('imm')
        return ordered

    # R4-Type: rd, rs1, rs2, rs3 (Fused multiply-add instructions)
    elif format_type == 'R4-Type':
        if 'rd' in operands:
            ordered.append('rd')
        if 'rs1' in operands:
            ordered.append('rs1')
        if 'rs2' in operands:
            ordered.append('rs2')
        if 'rs3' in operands:
            ordered.append('rs3')
        return ordered

    # Default: return as-is
    return operands


# ============================================================================
# Extension Header Parsing
# ============================================================================

def parse_extension_name(header_cell: Tag) -> str:
    """
    Parse extension name from header cell, handling <em> tags.

    Examples:
        <strong>RV32I Base Instruction Set</strong> → "I"
        <strong>RV32/RV64 <em>Zifencei</em> Standard Extension</strong> → "Zifencei"
    """
    # Try to find <em> tag first (for Z extensions)
    em_tag = header_cell.find('em')
    if em_tag:
        return em_tag.get_text().strip()

    # Otherwise parse from text
    header_text = header_cell.get_text()

    # Handle "RV32/RV64 Zxxx" format
    if 'RV32/RV64' in header_text:
        # Extract after "RV32/RV64"
        parts = header_text.split('RV32/RV64')
        if len(parts) > 1:
            # Get first word after RV32/RV64
            name = parts[1].strip().split()[0]
            # Clean up any formatting
            name = re.sub(r'[^A-Za-z0-9]', '', name)
            if name:
                return name

    # Extract extension letter(s) from RV32X or RV64X
    match = re.search(r'RV(?:32|64)([A-Z][a-z]*)', header_text)
    if match:
        return match.group(1)

    # Try to find Z-extension pattern
    match = re.search(r'(Z[a-z]+)', header_text)
    if match:
        return match.group(1)

    # Fallback: try to extract first uppercase letter sequence
    match = re.search(r'([A-Z][a-z]*)', header_text)
    if match:
        return match.group(1)

    return "Unknown"


def parse_extension_header(header_cell: Tag) -> Tuple[str, str, bool]:
    """
    Parse extension header like 'RV32I Base Instruction Set'.

    Returns:
        (extension_name, rv_variant, is_additional)

    Examples:
        "RV32I Base Instruction Set" → ("I", "RV32", False)
        "RV64I Base Instruction Set (in addition to RV32I)" → ("I", "RV64", True)
        "RV32M Standard Extension" → ("M", "RV32", False)
        "RV32/RV64 Zifencei Standard Extension" → ("Zifencei", "RV32/RV64", False)
    """
    header_text = header_cell.get_text()

    # Check for "in addition to" flag
    is_additional = 'in addition to' in header_text.lower()

    # Extract RV variant
    rv_variant = 'RV32'  # Default
    if 'RV32/RV64' in header_text:
        rv_variant = 'RV32/RV64'
    elif 'RV64' in header_text:
        rv_variant = 'RV64'
    elif 'RV32' in header_text:
        rv_variant = 'RV32'

    # Parse extension name
    extension = parse_extension_name(header_cell)

    return (extension, rv_variant, is_additional)


# ============================================================================
# Instruction Row Parsing
# ============================================================================

def build_encoding_from_cells(cells: List[Tag]) -> Tuple[str, List[str], List[Dict[str, Any]]]:
    """
    Build 32-bit encoding string from table cells.

    Returns:
        (encoding_string, operand_list, field_info)
    """
    encoding_bits = []
    operands = []
    fields = []

    # Process all cells except last (mnemonic)
    for cell in cells[:-1]:
        colspan = int(cell.get('colspan', 1))
        # Get text from <code> tag if present, else from cell
        code_tag = cell.find('code')
        text = code_tag.get_text(strip=True) if code_tag else cell.get_text(strip=True)

        # Skip empty cells (can occur in some table layouts)
        if not text:
            continue

        # Determine bit width
        bit_width = get_field_bit_width(text, colspan)

        # Check if fixed binary value or variable field
        if is_binary_literal(text):
            # Fixed bits (opcode, funct3, funct7)
            encoding_bits.append(text)
            fields.append({
                'type': 'fixed',
                'value': text,
                'bits': len(text),
                'name': 'opcode' if len(cells) - cells.index(cell) <= 2 else 'funct'
            })
        else:
            # Variable field (register, immediate)
            encoding_bits.append('x' * bit_width)

            # Extract operand if applicable
            operand_name = extract_operand_name(text)
            if operand_name and operand_name not in operands:
                operands.append(operand_name)

            fields.append({
                'type': 'variable',
                'name': text,
                'bits': bit_width
            })

    # Join all bits (MSB to LSB, left to right)
    encoding = ''.join(encoding_bits)

    # Ensure exactly 32 bits (pad or truncate)
    if len(encoding) < 32:
        encoding = encoding + 'x' * (32 - len(encoding))
    elif len(encoding) > 32:
        # Try to adjust variable fields
        encoding = encoding[:32]

    return (encoding, operands, fields)


def parse_instruction_row(row: Tag, current_extension: str, rv_variant: str) -> Optional[Instruction]:
    """
    Parse a single instruction row from encoding table.

    Returns:
        Instruction object or None if not a valid instruction row
    """
    cells = row.find_all('td')

    if len(cells) < 3:
        return None

    # Last cell should contain mnemonic
    mnemonic_cell = cells[-1]
    code_tag = mnemonic_cell.find('code')
    if not code_tag:
        return None

    mnemonic_text = code_tag.get_text(strip=True)

    # Filter out format definition rows
    if '-type' in mnemonic_text.lower():
        return None

    # Filter out empty or header-like mnemonics
    if len(mnemonic_text) < 2 or not re.match(r'^[A-Z]', mnemonic_text):
        return None

    # Clean mnemonic (remove anchor IDs, etc.)
    mnemonic = re.sub(r'\s+', ' ', mnemonic_text).strip()

    # Build full extension name
    extension_full = f"{rv_variant}{current_extension}"

    # Create instruction
    instr = Instruction(mnemonic, extension_full)

    # Build encoding
    encoding, operands, fields = build_encoding_from_cells(cells)
    instr.encoding = encoding

    # Infer format first (needed for operand reordering)
    # Pass mnemonic to detect special formats (Atomic, FENCE, R4-type)
    instr.format = infer_format_from_fields(fields, mnemonic)

    # Parse encoding into structured fields
    instr.encoding_fields = parse_encoding_fields(instr.encoding, instr.format)

    # Reorder operands to match assembly syntax
    instr.operands = reorder_operands_for_assembly(operands, instr.format)

    # Infer operand types
    instr.operand_types = []
    for op in instr.operands:
        if op in ['rd', 'rs1', 'rs2', 'rs3']:
            instr.operand_types.append('register')
        elif op == 'csr':
            instr.operand_types.append('csr')
        elif op in ['imm', 'shamt']:
            instr.operand_types.append('immediate')
        else:
            instr.operand_types.append('register')

    return instr


# ============================================================================
# RV64 Duplication Logic
# ============================================================================

def duplicate_rv32_to_rv64(all_instructions: List[Instruction], stats: ExtractionStats) -> List[Instruction]:
    """
    After extraction, duplicate RV32 instructions for RV64 variants.

    This ensures RV64A includes all RV32A instructions plus its own RV64-specific ones.
    """
    duplicates = []

    print("\n" + "=" * 70)
    print("DUPLICATING RV32 INSTRUCTIONS TO RV64")
    print("=" * 70)

    for ext_letter in DUPLICATABLE_EXTENSIONS:
        rv32_ext = f"RV32{ext_letter}"
        rv64_ext = f"RV64{ext_letter}"

        # Find all RV32 instructions for this extension
        rv32_instructions = [i for i in all_instructions if i.extension == rv32_ext]

        # Find existing RV64-specific instructions
        rv64_specific = [i for i in all_instructions if i.extension == rv64_ext]

        if rv32_instructions:
            print(f"\n  {ext_letter} Extension:")
            print(f"    RV32{ext_letter}: {len(rv32_instructions)} instructions")
            print(f"    RV64{ext_letter} (specific): {len(rv64_specific)} instructions")

            # Duplicate ALL RV32 instructions to RV64 (no filtering)
            duplicated_count = 0
            duplicated_mnemonics = []

            for rv32_instr in rv32_instructions:
                # Create RV64 duplicate (trust table structure - it already separated correctly)
                rv64_instr = Instruction(rv32_instr.mnemonic, rv64_ext)
                rv64_instr.encoding = rv32_instr.encoding
                rv64_instr.operands = rv32_instr.operands.copy()
                rv64_instr.operand_types = rv32_instr.operand_types.copy()
                rv64_instr.format = rv32_instr.format
                rv64_instr.encoding_fields = rv32_instr.encoding_fields.copy()
                duplicates.append(rv64_instr)
                duplicated_count += 1
                duplicated_mnemonics.append(rv32_instr.mnemonic)

            print(f"    → Duplicated {duplicated_count} instructions to RV64{ext_letter}")
            print(f"    → RV64{ext_letter} total: {len(rv64_specific) + duplicated_count} instructions")

            # Show which instructions were duplicated
            if duplicated_mnemonics:
                print(f"    → Duplicated mnemonics: {', '.join(sorted(set(duplicated_mnemonics)))}")

            # Track for reporting
            stats.rv64_duplications[ext_letter] = {
                'rv32_count': len(rv32_instructions),
                'rv64_specific': len(rv64_specific),
                'duplicated': duplicated_count,
                'total': len(rv64_specific) + duplicated_count,
                'duplicated_mnemonics': sorted(set(duplicated_mnemonics)),
                'skipped_mnemonics': []  # No longer skipping any instructions
            }

    print(f"\n✓ Created {len(duplicates)} RV64 duplicates")
    return all_instructions + duplicates


# ============================================================================
# Table Extraction
# ============================================================================

def extract_instructions_from_html(html_content: str, stats: ExtractionStats) -> List[Instruction]:
    """
    Extract all instructions from ISA manual HTML.

    Parses encoding tables with structure:
        <table>
            <tr><td colspan="15"><strong>RV32I Base Instruction Set</strong></td></tr>
            <tr><td>imm[31:12]</td><td>rd</td><td>0110111</td><td>LUI</td></tr>
            ...
        </table>
    """
    print("\n" + "=" * 70)
    print("EXTRACTING INSTRUCTIONS FROM OFFICIAL ISA MANUAL")
    print("=" * 70)

    soup = BeautifulSoup(html_content, 'lxml')

    # Find all tables
    tables = soup.find_all('table', class_='tableblock')
    print(f"Found {len(tables)} tables in document")

    all_instructions = []
    current_extension = None
    current_rv_variant = None
    is_additional = False

    for table_idx, table in enumerate(tables):
        rows = table.find_all('tr')
        if not rows:
            continue

        # Debug: Print table index for tables we care about
        if table_idx >= 324 and table_idx <= 330:
            print(f"\n  [DEBUG] Processing table {table_idx}...")
            # Check first row
            if rows:
                first_row_cells = rows[0].find_all('td')
                if first_row_cells:
                    print(f"    First row: {len(first_row_cells)} cells")
                    if len(first_row_cells) == 1:
                        print(f"    Colspan: {first_row_cells[0].get('colspan')}")
                        print(f"    Text: {first_row_cells[0].get_text()[:100]}")

        # Process each row, checking if it's a header or instruction
        for row in rows:
            # Check for both <td> and <th> cells (some tables use <th> for headers)
            cells = row.find_all(['td', 'th'])
            if not cells:
                continue

            # Check if this row is an extension header
            # Headers can have colspan="15" OR colspan="8" (for some Zfh tables)
            colspan = cells[0].get('colspan') if cells else None
            is_header_row = (len(cells) == 1 and colspan in ['15', '8'])

            if is_header_row:
                # This is a full-width row - check if it's a header
                # Check both inside tags and direct text for extension names
                cell_text = cells[0].get_text(strip=True)
                strong_tag = cells[0].find('strong')

                # Get header text (either from <strong> tag or direct text)
                header_text = strong_tag.get_text(strip=True) if strong_tag else cell_text

                # Check if this is an instruction encoding table
                # Be more lenient - look for "Extension" or "Instruction" keywords
                if 'Extension' in header_text or 'Instruction' in header_text:
                    current_extension, current_rv_variant, is_additional = parse_extension_header(cells[0])

                    # Debug: print full header and parsing result
                    print(f"\n  Table {table_idx + 1}, Row header:")
                    print(f"    Header text: '{header_text}'")
                    print(f"    Parsed as: Extension={current_extension}, Variant={current_rv_variant}, Additional={is_additional}")

                    stats.total_tables += 1
                else:
                    # Not an instruction table - print what we're skipping
                    print(f"\n  Table {table_idx + 1}, SKIPPED header:")
                    print(f"    Text: '{header_text}'")
                continue  # Skip header rows, don't parse as instructions

            # Skip if no current extension set
            if not current_extension:
                continue

            # Parse this row as an instruction
            instr = parse_instruction_row(row, current_extension, current_rv_variant)
            if instr:
                all_instructions.append(instr)
                stats.add_instruction(instr)

                # Handle RV32/RV64 variant (both at once)
                if current_rv_variant == 'RV32/RV64':
                    # Create both RV32 and RV64 versions
                    rv64_instr = Instruction(instr.mnemonic, f"RV64{current_extension}")
                    rv64_instr.encoding = instr.encoding
                    rv64_instr.operands = instr.operands.copy()
                    rv64_instr.operand_types = instr.operand_types.copy()
                    rv64_instr.format = instr.format
                    rv64_instr.encoding_fields = instr.encoding_fields.copy()

                    # Update original to RV32
                    instr.extension = f"RV32{current_extension}"

                    all_instructions.append(rv64_instr)
                    stats.add_instruction(rv64_instr)

    print(f"\n✓ Extracted {len(all_instructions)} initial instructions")
    print(f"  Encoding quality:")
    print(f"    Complete: {stats.encoding_quality['complete']}")
    print(f"    Partial: {stats.encoding_quality['partial']}")
    print(f"    Placeholder: {stats.encoding_quality['placeholder']}")

    return all_instructions


# ============================================================================
# Secondary Source Enrichment (Placeholder)
# ============================================================================

def infer_category(mnemonic: str) -> str:
    """Infer instruction category from mnemonic."""
    m = mnemonic.upper()

    if any(x in m for x in ['ADD', 'SUB', 'ADDI', 'SUBI']) and 'AMO' not in m:
        return 'Arithmetic'
    elif any(x in m for x in ['MUL', 'DIV', 'REM']):
        return 'Multiply/Divide'
    elif any(x in m for x in ['AND', 'OR', 'XOR', 'NOT']) and 'AMO' not in m:
        return 'Logical'
    elif any(x in m for x in ['SLL', 'SRL', 'SRA', 'SLT']):
        return 'Shift/Compare'
    elif m.startswith('L') and not m.startswith('LUI') and 'AMO' not in m:
        return 'Load'
    elif m.startswith('S') and not m.startswith('SUB') and 'AMO' not in m:
        return 'Store'
    elif m.startswith('B') and m not in ['BCLR', 'BEXT', 'BINV', 'BSET']:
        return 'Branch'
    elif m.startswith('J') or m in ['JAL', 'JALR']:
        return 'Jump'
    elif m in ['LUI', 'AUIPC']:
        return 'Upper Immediate'
    elif 'FENCE' in m:
        return 'Synchronization'
    elif any(x in m for x in ['ECALL', 'EBREAK', 'MRET', 'SRET', 'WFI']):
        return 'System'
    elif m.startswith('F') or '.' in m:
        return 'Floating Point'
    elif 'AMO' in m or m.startswith('LR') or m.startswith('SC'):
        return 'Atomic'
    elif m.startswith('C.'):
        return 'Compressed'
    else:
        return 'Other'


# ============================================================================
# Secondary Source Parsing
# ============================================================================

# Cache for parsed secondary source pages (URL → BeautifulSoup or raw text)
_secondary_source_cache: Dict[str, Optional[BeautifulSoup]] = {}
_adoc_source_cache: Dict[str, Optional[str]] = {}


def fetch_secondary_source(url: str) -> Optional[BeautifulSoup]:
    """
    Fetch and parse a secondary source HTML page.
    Results are cached to avoid redundant fetches.

    Returns:
        BeautifulSoup object or None if fetch failed
    """
    if url in _secondary_source_cache:
        return _secondary_source_cache[url]

    try:
        print(f"  Fetching {url}...")
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'lxml')
        _secondary_source_cache[url] = soup
        return soup
    except Exception as e:
        print(f"  WARNING: Failed to fetch {url}: {e}")
        _secondary_source_cache[url] = None
        return None


def extract_from_secondary_source(mnemonic: str, url: str) -> Tuple[str, str]:
    """
    Extract description and pseudocode from secondary source.

    Args:
        mnemonic: Instruction mnemonic (e.g., "ADD", "LUI")
        url: URL of secondary source HTML page

    Returns:
        (description, pseudocode) tuple. Empty strings if not found.
    """
    soup = fetch_secondary_source(url)
    if not soup:
        return ("", "")

    # Normalize mnemonic to lowercase for anchor search (secondary source uses lowercase)
    mnemonic_lower = mnemonic.lower()

    # Find the section for this instruction
    section = soup.find('section', id=mnemonic_lower)
    if not section:
        # Try with dots converted to hyphens (e.g., "fence.i" → "fence-i")
        mnemonic_alt = mnemonic_lower.replace('.', '-')
        section = soup.find('section', id=mnemonic_alt)

    if not section:
        return ("", "")

    # Find the field list (dl element)
    field_list = section.find('dl', class_='field-list')
    if not field_list:
        return ("", "")

    description = ""
    pseudocode = ""

    # Extract fields from dt/dd pairs
    for dt in field_list.find_all('dt'):
        field_name = dt.get_text(strip=True)
        dd = dt.find_next_sibling('dd')
        if not dd:
            continue

        field_value = dd.get_text(strip=True)

        if field_name == 'Description':
            description = field_value
        elif field_name == 'Implementation':
            pseudocode = field_value

    return (description, pseudocode)


def extract_from_adoc_source(mnemonic: str, url: str) -> Tuple[str, str]:
    """
    Extract description and pseudocode from .adoc source file.

    Args:
        mnemonic: Instruction mnemonic (e.g., "FADD.H", "WRS.STO")
        url: URL of .adoc source file

    Returns:
        (description, pseudocode) tuple. Empty strings if not found.
    """
    # Check cache first
    if url in _adoc_source_cache:
        content = _adoc_source_cache[url]
        if content is None:
            return ("", "")
    else:
        # Fetch and cache
        try:
            print(f"  Fetching {url}...")
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            content = response.text
            _adoc_source_cache[url] = content
        except Exception as e:
            print(f"  WARNING: Failed to fetch {url}: {e}")
            _adoc_source_cache[url] = None
            return ("", "")

    # Normalize mnemonic to lowercase for searching
    mnemonic_lower = mnemonic.lower()

    # Find the instruction section (e.g., "=== fadd.h")
    section_pattern = rf'^===\s+{re.escape(mnemonic_lower)}\s*$'
    lines = content.split('\n')

    section_start = None
    for i, line in enumerate(lines):
        if re.match(section_pattern, line, re.IGNORECASE):
            section_start = i
            break

    if section_start is None:
        return ("", "")

    # Extract content until next section (=== or ==)
    section_end = len(lines)
    for i in range(section_start + 1, len(lines)):
        if lines[i].startswith('===') or lines[i].startswith('=='):
            section_end = i
            break

    section_lines = lines[section_start:section_end]

    description = ""
    pseudocode = ""

    # Parse the section
    i = 0
    while i < len(section_lines):
        line = section_lines[i].strip()

        # Look for field markers
        if line.startswith('[field]'):
            # Next line should be field name
            i += 1
            if i < len(section_lines):
                field_name = section_lines[i].strip()
                i += 1

                # Collect content until next field or section
                field_content = []
                while i < len(section_lines):
                    if section_lines[i].startswith('[field]') or section_lines[i].startswith('==='):
                        break
                    field_content.append(section_lines[i])
                    i += 1

                content_text = '\n'.join(field_content).strip()

                if field_name == 'Description':
                    description = content_text
                elif field_name == 'Implementation':
                    pseudocode = content_text
        else:
            i += 1

    # If the above approach didn't work, try AsciiDoc :: format
    if not description and not pseudocode:
        section_text = '\n'.join(section_lines)

        # Look for Description:: (AsciiDoc format)
        desc_match = re.search(r'Description::\s*\n(.+?)(?=\n\s*(?:Implementation::|Format::|===|$))', section_text, re.DOTALL | re.IGNORECASE)
        if desc_match:
            description = desc_match.group(1).strip()

        # Look for Implementation:: (AsciiDoc format)
        impl_match = re.search(r'Implementation::\s*\n(.+?)(?=\n\s*(?:Format::|===|$))', section_text, re.DOTALL | re.IGNORECASE)
        if impl_match:
            pseudocode = impl_match.group(1).strip()

    # Clean up AsciiDoc formatting (-- delimiters, brackets, etc.)
    description = re.sub(r'^--\s*\n', '', description, flags=re.MULTILINE).strip()
    description = re.sub(r'\n--\s*$', '', description, flags=re.MULTILINE).strip()
    pseudocode = re.sub(r'^--\s*\n', '', pseudocode, flags=re.MULTILINE).strip()
    pseudocode = re.sub(r'\n--\s*$', '', pseudocode, flags=re.MULTILINE).strip()

    return (description, pseudocode)


def get_source_urls_for_extension(extension: str) -> List[Tuple[str, str]]:
    """
    Get list of (source_type, url) tuples to try for this extension.
    Returns URLs in priority order (specific variant first, then base).

    Args:
        extension: Full extension name (e.g., "RV64I", "RV32M", "RV32/RV64Zicsr")

    Returns:
        List of (source_type, url) tuples to try in order
    """
    urls_to_try = []

    # Extract base extension letter
    if extension.startswith('RV32') or extension.startswith('RV64'):
        base_ext = extension[4:]  # Remove "RV32" or "RV64"
    elif extension.startswith('RV32/RV64'):
        base_ext = extension[9:]  # Remove "RV32/RV64"
    else:
        base_ext = extension

    # For RV64-specific extensions, try RV64-specific pages first (HTML then .adoc)
    if extension.startswith('RV64') and base_ext in ['I', 'M', 'A', 'F', 'D', 'Zfh']:
        # Try HTML page first
        rv64_html = f"{SECONDARY_BASE_URL}rv64{base_ext.lower()}.html"
        urls_to_try.append(("html", rv64_html))

        # Also try .adoc source (some RV64 pages might not have HTML)
        rv64_adoc = f"{TERTIARY_BASE_URL}rv64{base_ext.lower()}.adoc"
        urls_to_try.append(("adoc", rv64_adoc))

    # Then try the base extension source (works for both RV32 and RV64 common instructions)
    source_info = SECONDARY_SOURCE_URLS.get(base_ext)
    if source_info:
        urls_to_try.append(source_info)

    return urls_to_try


def enrich_instruction(instr: Instruction) -> bool:
    """
    Enrich instruction with category and secondary source data.

    Returns:
        True if secondary source was found and used, False otherwise
    """
    # Infer category from mnemonic
    instr.category = infer_category(instr.mnemonic)

    # Get list of sources to try (RV64-specific first, then base)
    sources_to_try = get_source_urls_for_extension(instr.extension)

    if not sources_to_try:
        # No source available - leave empty
        instr.description = ""
        instr.pseudocode = ""
        return False

    # Try each source in order until we find data
    for source_type, url in sources_to_try:
        # Attempt to fetch from appropriate source
        if source_type == "html":
            description, pseudocode = extract_from_secondary_source(instr.mnemonic, url)
        elif source_type == "adoc":
            description, pseudocode = extract_from_adoc_source(instr.mnemonic, url)
        else:
            description, pseudocode = ("", "")

        # If we found data, use it
        if description or pseudocode:
            instr.description = description
            instr.pseudocode = pseudocode
            return True

    # No data found in any source - leave empty
    instr.description = ""
    instr.pseudocode = ""
    return False


def enrich_all_instructions(instructions: List[Instruction], stats: ExtractionStats) -> None:
    """Enrich all instructions with categories and secondary source data (Step 2)."""
    print("\n" + "=" * 70)
    print("ENRICHING INSTRUCTIONS (Step 2: Categories + Secondary Sources)")
    print("=" * 70)

    # Process unique mnemonics only
    processed = {}
    enriched_count = 0
    failed_count = 0

    for idx, instr in enumerate(instructions, 1):
        if instr.mnemonic in processed:
            # Copy from already processed
            ref = processed[instr.mnemonic]
            instr.category = ref.category
            instr.description = ref.description
            instr.pseudocode = ref.pseudocode
        else:
            if idx <= 10 or idx % 50 == 0:
                print(f"  [{idx}/{len(instructions)}] {instr.mnemonic}...")
            found = enrich_instruction(instr)
            processed[instr.mnemonic] = instr
            if found:
                enriched_count += 1
                stats.enrichment["secondary"] = stats.enrichment.get("secondary", 0) + 1
            else:
                failed_count += 1
                stats.enrichment["none"] += 1

    print(f"\n✓ Enriched {len(instructions)} instructions")
    print(f"  Secondary source data found: {enriched_count} unique mnemonics")
    print(f"  No secondary source: {failed_count} unique mnemonics (fields left empty)")


def replace_xlen_in_instructions(instructions: List[Instruction]) -> None:
    """
    Replace XLEN with appropriate value (32 or 64) in all instruction fields.
    This runs AFTER enrichment so each RV32/RV64 duplicate gets the correct value.
    """
    print("\n" + "=" * 70)
    print("REPLACING XLEN WITH VARIANT-SPECIFIC VALUES")
    print("=" * 70)

    replaced_count = 0

    for instr in instructions:
        # Determine XLEN value from extension
        if instr.extension.startswith('RV32'):
            xlen_value = "32"
        elif instr.extension.startswith('RV64'):
            xlen_value = "64"
        else:
            # Unknown variant, skip
            continue

        # Check if any field contains XLEN
        has_xlen = any("XLEN" in field for field in [instr.description, instr.pseudocode])

        if has_xlen:
            # Replace XLEN with the appropriate value
            instr.description = re.sub(r'\bXLEN\b', xlen_value, instr.description)
            instr.pseudocode = re.sub(r'\bXLEN\b', xlen_value, instr.pseudocode)
            replaced_count += 1

    print(f"✓ Replaced XLEN in {replaced_count} instructions")


# ============================================================================
# Report Generation
# ============================================================================

def generate_report(stats: ExtractionStats, instructions: List[Instruction]) -> str:
    """Generate comprehensive extraction report."""
    lines = []
    lines.append("=" * 70)
    lines.append("RISC-V INSTRUCTION EXTRACTION REPORT")
    lines.append("=" * 70)
    lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")

    # Overall statistics
    lines.append("OVERALL STATISTICS")
    lines.append("-" * 70)
    lines.append(f"Total tables processed: {stats.total_tables}")
    lines.append(f"Total instructions extracted: {stats.total_instructions}")
    lines.append(f"Unique mnemonics: {len(set(i.mnemonic for i in instructions))}")
    lines.append("")

    # RV64 Duplication Statistics
    if stats.rv64_duplications:
        lines.append("\nRV64 DUPLICATION STATISTICS")
        lines.append("-" * 70)
        for ext, counts in stats.rv64_duplications.items():
            lines.append(f"\n{ext} Extension:")
            lines.append(f"  RV32{ext}: {counts['rv32_count']} instructions")
            lines.append(f"  RV64{ext} (specific only): {counts['rv64_specific']} instructions")
            lines.append(f"  Duplicated from RV32: {counts['duplicated']} instructions")
            lines.append(f"  RV64{ext} TOTAL: {counts['total']} instructions")

            # Show duplicated mnemonics
            if 'duplicated_mnemonics' in counts and counts['duplicated_mnemonics']:
                lines.append(f"\n  Duplicated mnemonics:")
                for i in range(0, len(counts['duplicated_mnemonics']), 8):
                    chunk = counts['duplicated_mnemonics'][i:i+8]
                    lines.append(f"    {', '.join(chunk)}")

            # Show skipped (RV64-only) mnemonics
            if 'skipped_mnemonics' in counts and counts['skipped_mnemonics']:
                lines.append(f"\n  Skipped (RV64-only) mnemonics:")
                for i in range(0, len(counts['skipped_mnemonics']), 8):
                    chunk = counts['skipped_mnemonics'][i:i+8]
                    lines.append(f"    {', '.join(chunk)}")
        lines.append("")

    # By extension
    lines.append("\nINSTRUCTIONS BY EXTENSION")
    lines.append("-" * 70)

    for ext in sorted(stats.by_extension.keys()):
        mnemonics = stats.by_extension[ext]
        unique = sorted(set(mnemonics))
        lines.append(f"\n{ext}: {len(mnemonics)} instructions ({len(unique)} unique)")

        # Show mnemonics in rows of 10
        for i in range(0, len(unique), 10):
            chunk = unique[i:i+10]
            lines.append(f"  {', '.join(chunk)}")

    lines.append("")

    # Encoding quality
    lines.append("\nENCODING QUALITY")
    lines.append("-" * 70)
    total = stats.total_instructions
    for quality, count in stats.encoding_quality.items():
        pct = (count / total * 100) if total > 0 else 0
        lines.append(f"{quality.capitalize()}: {count}/{total} ({pct:.1f}%)")
    lines.append("")

    # Sample encodings
    lines.append("\nSAMPLE ENCODINGS")
    lines.append("-" * 70)
    samples = [i for i in instructions if '0' in i.encoding or '1' in i.encoding][:10]
    for instr in samples:
        lines.append(f"{instr.mnemonic:10s} ({instr.format:7s}): {instr.encoding}")
    lines.append("")

    # Field completeness
    lines.append("\nFIELD COMPLETENESS")
    lines.append("-" * 70)
    fields = ['mnemonic', 'extension', 'encoding', 'format', 'category',
              'description', 'pseudocode', 'example', 'operands']

    for field in fields:
        count = sum(1 for i in instructions if getattr(i, field, None))
        pct = (count / total * 100) if total > 0 else 0
        lines.append(f"{field:12s}: {count}/{total} ({pct:.1f}%)")

    # Instructions with no operands
    lines.append("\n\nINSTRUCTIONS WITH NO OPERANDS")
    lines.append("-" * 70)
    lines.append(f"Total: {len(stats.no_operands)} ({len(stats.no_operands)/total*100:.1f}%)")
    lines.append("\nThese are typically system/fence instructions with no variable fields:")
    for instr_name in sorted(set(stats.no_operands))[:20]:
        lines.append(f"  {instr_name}")
    if len(stats.no_operands) > 20:
        lines.append(f"  ... and {len(stats.no_operands) - 20} more")

    lines.append("")
    lines.append("=" * 70)
    lines.append("END REPORT")
    lines.append("=" * 70)

    return '\n'.join(lines)


# ============================================================================
# Main Pipeline
# ============================================================================

def fetch_html(url: str) -> str:
    """Fetch HTML content from URL."""
    print(f"Fetching {url}...")
    try:
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        print(f"✓ Downloaded {len(response.content):,} bytes")
        return response.text
    except requests.RequestException as e:
        print(f"✗ Failed to fetch: {e}")
        sys.exit(1)


def main():
    """Main extraction pipeline."""
    print("=" * 70)
    print("RISC-V INSTRUCTION EXTRACTOR")
    print("=" * 70)
    print()

    stats = ExtractionStats()

    # Fetch official manual
    html_content = fetch_html(OFFICIAL_ISA_URL)

    # Step 1: Extract instructions
    instructions = extract_instructions_from_html(html_content, stats)

    if not instructions:
        print("✗ No instructions extracted. Exiting.")
        sys.exit(1)

    # Step 2: Duplicate RV32 to RV64
    instructions = duplicate_rv32_to_rv64(instructions, stats)

    # Step 3: Enrich with categories and secondary sources
    enrich_all_instructions(instructions, stats)

    # Step 4: Replace XLEN with variant-specific values (32 or 64)
    replace_xlen_in_instructions(instructions)

    # Generate outputs
    print("\n" + "=" * 70)
    print("GENERATING OUTPUTS")
    print("=" * 70)

    # Write JSON
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    json_data = [instr.to_dict() for instr in instructions]

    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, indent=2, ensure_ascii=False)

    print(f"✓ Wrote {len(instructions)} instructions to {OUTPUT_JSON}")

    # Write report
    report_text = generate_report(stats, instructions)

    with open(OUTPUT_REPORT, 'w', encoding='utf-8') as f:
        f.write(report_text)

    print(f"✓ Wrote report to {OUTPUT_REPORT}")

    print("\n" + "=" * 70)
    print("EXTRACTION COMPLETE")
    print("=" * 70)
    print(f"Total instructions: {len(instructions)}")
    print(f"Output files:")
    print(f"  - {OUTPUT_JSON}")
    print(f"  - {OUTPUT_REPORT}")


if __name__ == "__main__":
    main()
