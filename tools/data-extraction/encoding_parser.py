#!/usr/bin/env python3
"""
RISC-V Encoding Field Parser

Parses binary encoding patterns into structured field metadata for use across all
extraction scripts. This centralizes the logic for breaking down encodings into
their component fields (opcode, rd, rs1, rs2, funct3, funct7, immediates, etc.).

Usage:
    from encoding_parser import parse_encoding_fields

    encoding = "0000100xxxxxxxxxx000xxxxx0111011"
    format_type = "R-Type"
    fields = parse_encoding_fields(encoding, format_type)
    # Returns list of EncodingField objects with name, startBit, endBit, value, etc.
"""

from typing import List, Dict, Any, Optional


class EncodingField:
    """Represents a single field in an instruction encoding."""

    def __init__(
        self,
        name: str,
        start_bit: int,
        end_bit: int,
        value: str,
        description: str,
        category: str
    ):
        self.name = name
        self.start_bit = start_bit
        self.end_bit = end_bit
        self.value = value
        self.description = description
        self.category = category

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "name": self.name,
            "startBit": self.start_bit,
            "endBit": self.end_bit,
            "value": self.value,
            "description": self.description,
            "category": self.category
        }

    def __repr__(self) -> str:
        return f"EncodingField({self.name}, [{self.start_bit}:{self.end_bit}], {self.value})"


# ============================================================================
# Format-Specific Field Definitions
# ============================================================================

# Standard 32-bit instruction formats
STANDARD_32BIT_FORMATS = {
    "R-Type": [
        # Bit positions: MSB (31) to LSB (0)
        # Format: funct7[31:25] rs2[24:20] rs1[19:15] funct3[14:12] rd[11:7] opcode[6:0]
        (25, 31, "funct7", "Function code 7", "funct"),
        (20, 24, "rs2", "Source register 2", "rs2"),
        (15, 19, "rs1", "Source register 1", "rs1"),
        (12, 14, "funct3", "Function code 3", "funct"),
        (7, 11, "rd", "Destination register", "rd"),
        (0, 6, "opcode", "Operation code", "opcode"),
    ],
    "R4-Type": [
        # Format: rs3[31:27] fmt[26:25] rs2[24:20] rs1[19:15] rm[14:12] rd[11:7] opcode[6:0]
        (27, 31, "rs3", "Source register 3", "rs3"),
        (25, 26, "fmt", "Format field (2 bits)", "funct"),
        (20, 24, "rs2", "Source register 2", "rs2"),
        (15, 19, "rs1", "Source register 1", "rs1"),
        (12, 14, "rm", "Rounding mode (3 bits)", "rm"),  # Fixed: was "funct", should be "rm"
        (7, 11, "rd", "Destination register", "rd"),
        (0, 6, "opcode", "Operation code", "opcode"),
    ],
    "R-Atomic": [
        # Format for atomic instructions (LR, SC, AMO*)
        # funct5[31:27] aq[26] rl[25] rs2[24:20] rs1[19:15] funct3[14:12] rd[11:7] opcode[6:0]
        (27, 31, "funct5", "AMO function code (5 bits)", "funct"),
        (26, 26, "aq", "Acquire ordering bit", "aq"),
        (25, 25, "rl", "Release ordering bit", "rl"),
        (20, 24, "rs2", "Source register 2 (0 for LR)", "rs2"),
        (15, 19, "rs1", "Base address register", "rs1"),
        (12, 14, "funct3", "Width: 010=W, 011=D", "funct"),
        (7, 11, "rd", "Destination register", "rd"),
        (0, 6, "opcode", "Operation code (0101111)", "opcode"),
    ],
    "FENCE-Type": [
        # Format for FENCE instruction
        # fm[31:28] pred[27:24] succ[23:20] rs1[19:15] funct3[14:12] rd[11:7] opcode[6:0]
        (28, 31, "fm", "Fence mode (4 bits)", "funct"),
        (24, 27, "pred", "Predecessor set (IORW)", "pred"),
        (20, 23, "succ", "Successor set (IORW)", "succ"),
        (15, 19, "rs1", "Source register (usually 0)", "rs1"),
        (12, 14, "funct3", "Function code", "funct"),
        (7, 11, "rd", "Destination register (usually 0)", "rd"),
        (0, 6, "opcode", "Operation code (0001111)", "opcode"),
    ],
    "I-Type": [
        # Format: imm[31:20] rs1[19:15] funct3[14:12] rd[11:7] opcode[6:0]
        (20, 31, "imm[11:0]", "Immediate value [11:0]", "immediate"),
        (15, 19, "rs1", "Source register 1", "rs1"),
        (12, 14, "funct3", "Function code (3 bits)", "funct"),
        (7, 11, "rd", "Destination register", "rd"),
        (0, 6, "opcode", "Operation code", "opcode"),
    ],
    "S-Type": [
        # Format: imm[31:25] rs2[24:20] rs1[19:15] funct3[14:12] imm[11:7] opcode[6:0]
        (25, 31, "imm[11:5]", "Immediate value [11:5]", "immediate"),
        (20, 24, "rs2", "Source register 2 (data)", "rs2"),
        (15, 19, "rs1", "Source register 1 (base)", "rs1"),
        (12, 14, "funct3", "Width selector (3 bits)", "funct"),
        (7, 11, "imm[4:0]", "Immediate value [4:0]", "immediate"),
        (0, 6, "opcode", "Operation code", "opcode"),
    ],
    "B-Type": [
        # Format: imm[12|10:5] rs2[24:20] rs1[19:15] funct3[14:12] imm[4:1|11] opcode[6:0]
        (31, 31, "imm[12]", "Immediate bit [12] (sign)", "immediate"),
        (25, 30, "imm[10:5]", "Immediate bits [10:5]", "immediate"),
        (20, 24, "rs2", "Source register 2", "rs2"),
        (15, 19, "rs1", "Source register 1", "rs1"),
        (12, 14, "funct3", "Branch condition (3 bits)", "funct"),
        (8, 11, "imm[4:1]", "Immediate bits [4:1]", "immediate"),
        (7, 7, "imm[11]", "Immediate bit [11]", "immediate"),
        (0, 6, "opcode", "Operation code", "opcode"),
    ],
    "U-Type": [
        # Format: imm[31:12] rd[11:7] opcode[6:0]
        (12, 31, "imm[31:12]", "Immediate value [31:12]", "immediate"),
        (7, 11, "rd", "Destination register", "rd"),
        (0, 6, "opcode", "Operation code", "opcode"),
    ],
    "J-Type": [
        # Format: imm[20|10:1|11|19:12] rd[11:7] opcode[6:0]
        (31, 31, "imm[20]", "Immediate bit [20] (sign)", "immediate"),
        (21, 30, "imm[10:1]", "Immediate bits [10:1]", "immediate"),
        (20, 20, "imm[11]", "Immediate bit [11]", "immediate"),
        (12, 19, "imm[19:12]", "Immediate bits [19:12]", "immediate"),
        (7, 11, "rd", "Destination register", "rd"),
        (0, 6, "opcode", "Operation code", "opcode"),
    ],
    # CSR instruction formats (Zicsr extension)
    "CSR-Type": [
        # Format: csr[31:20] rs1[19:15] funct3[14:12] rd[11:7] opcode[6:0]
        # Used by: CSRRW, CSRRS, CSRRC (register source)
        (20, 31, "csr", "CSR address", "csr"),
        (15, 19, "rs1", "Source register 1", "rs1"),
        (12, 14, "funct3", "Function code (3 bits)", "funct"),
        (7, 11, "rd", "Destination register", "rd"),
        (0, 6, "opcode", "Operation code", "opcode"),
    ],
    "CSRI-Type": [
        # Format: csr[31:20] uimm[19:15] funct3[14:12] rd[11:7] opcode[6:0]
        # Used by: CSRRWI, CSRRSI, CSRRCI (immediate source)
        (20, 31, "csr", "CSR address", "csr"),
        (15, 19, "uimm", "5-bit unsigned immediate", "immediate"),
        (12, 14, "funct3", "Function code (3 bits)", "funct"),
        (7, 11, "rd", "Destination register", "rd"),
        (0, 6, "opcode", "Operation code", "opcode"),
    ],
    # Vector instruction formats (RVV extension)
    "V-Type": [
        # Standard vector format: funct6[31:26] vm[25] vs2[24:20] vs1[19:15] funct3[14:12] vd[11:7] opcode[6:0]
        # Used by: most vector arithmetic instructions
        (26, 31, "funct6", "Vector function code (6 bits)", "funct"),
        (25, 25, "vm", "Vector mask bit (0=masked, 1=unmasked)", "vm"),
        (20, 24, "vs2", "Vector source register 2", "rs2"),
        (15, 19, "vs1", "Vector source register 1 / scalar rs1", "rs1"),
        (12, 14, "funct3", "Vector width encoding", "funct"),
        (7, 11, "vd", "Vector destination register", "rd"),
        (0, 6, "opcode", "Operation code", "opcode"),
    ],
    "VLS-Type": [
        # Vector load/store format: nf[31:29] mew[28] mop[27:26] vm[25] rs2/vs2[24:20] rs1[19:15] width[14:12] vd/vs3[11:7] opcode[6:0]
        # Used by: vector load/store instructions
        (29, 31, "nf", "Number of fields (NFIELDS-1)", "funct"),
        (28, 28, "mew", "Extended memory width", "funct"),
        (26, 27, "mop", "Memory operation (unit/strided/indexed)", "funct"),
        (25, 25, "vm", "Vector mask bit", "vm"),
        (20, 24, "rs2/vs2", "Stride/index register", "rs2"),
        (15, 19, "rs1", "Base address register", "rs1"),
        (12, 14, "width", "Element width", "funct"),
        (7, 11, "vd/vs3", "Vector destination/source register", "rd"),
        (0, 6, "opcode", "Operation code", "opcode"),
    ],
    "VSETVL-Type": [
        # Vector configuration format: funct1[31] zimm[30:20] rs1[19:15] funct3[14:12] rd[11:7] opcode[6:0]
        # Used by: vsetvli, vsetivli, vsetvl
        (31, 31, "funct1", "Fixed bit", "funct"),
        (20, 30, "zimm", "Vector type immediate (vtype)", "immediate"),
        (15, 19, "rs1/uimm", "AVL source register or immediate", "rs1"),
        (12, 14, "funct3", "Function code", "funct"),
        (7, 11, "rd", "Destination register (new vl)", "rd"),
        (0, 6, "opcode", "Operation code", "opcode"),
    ],
}

# Compressed 16-bit instruction formats
COMPRESSED_16BIT_FORMATS = {
    "CR-Type": [
        # Format: funct4[15:12] rd/rs1[11:7] rs2[6:2] op[1:0]
        # CORRECTION: This is funct4 (4 bits), not funct3!
        (12, 15, "funct4", "Function code (4 bits)", "funct"),
        (7, 11, "rd/rs1", "Dest/source register (5-bit)", "rd"),
        (2, 6, "rs2", "Source register 2 (5-bit)", "rs2"),
        (0, 1, "op", "Opcode quadrant", "opcode"),
    ],
    "CI-Type": [
        # Format: funct3[15:13] imm[12] rd/rs1[11:7] imm[6:2] op[1:0]
        (13, 15, "funct3", "Function code (3 bits)", "funct"),
        (12, 12, "imm[5]/nzimm[5]", "Immediate bit [5] or other", "immediate"),
        (7, 11, "rd/rs1", "Dest/source register (5-bit)", "rd"),
        (2, 6, "imm[4:0]/nzimm[4:0]", "Immediate bits [4:0]", "immediate"),
        (0, 1, "op", "Opcode quadrant", "opcode"),
    ],
    "CSS-Type": [
        # Format: funct3[15:13] imm[12:7] rs2[6:2] op[1:0]
        (13, 15, "funct3", "Function code (3 bits)", "funct"),
        (7, 12, "imm[5:0]/uimm", "Immediate (6 bits, scaled)", "immediate"),
        (2, 6, "rs2", "Source register 2 (5-bit)", "rs2"),
        (0, 1, "op", "Opcode quadrant", "opcode"),
    ],
    "CIW-Type": [
        # Format: funct3[15:13] imm[12:5] rd'[4:2] op[1:0]
        # CORRECTION: rd' is only 3 bits (x8-x15)
        (13, 15, "funct3", "Function code (3 bits)", "funct"),
        (5, 12, "nzuimm[9:2]", "Non-zero immediate [9:2]", "immediate"),
        (2, 4, "rd'", "Dest register (3-bit, x8-x15)", "rd"),
        (0, 1, "op", "Opcode quadrant", "opcode"),
    ],
    "CL-Type": [
        # Format: funct3[15:13] imm[12:10] rs1'[9:7] imm[6:5] rd'[4:2] op[1:0]
        # CORRECTION: Both rd' and rs1' are 3 bits each
        (13, 15, "funct3", "Function code (3 bits)", "funct"),
        (10, 12, "imm[5:3]/uimm[5:3]", "Immediate bits [5:3]", "immediate"),
        (7, 9, "rs1'", "Base register (3-bit, x8-x15)", "rs1"),
        (5, 6, "imm[7:6]/uimm[2:1]", "Immediate bits (varies)", "immediate"),
        (2, 4, "rd'", "Dest register (3-bit, x8-x15)", "rd"),
        (0, 1, "op", "Opcode quadrant", "opcode"),
    ],
    "CS-Type": [
        # Format: funct3[15:13] imm[12:10] rs1'[9:7] imm[6:5] rs2'[4:2] op[1:0]
        # CORRECTION: Both rs1' and rs2' are 3 bits each
        (13, 15, "funct3", "Function code (3 bits)", "funct"),
        (10, 12, "imm[5:3]/uimm[5:3]", "Immediate bits [5:3]", "immediate"),
        (7, 9, "rs1'", "Base register (3-bit, x8-x15)", "rs1"),
        (5, 6, "imm[7:6]/uimm[2:1]", "Immediate bits (varies)", "immediate"),
        (2, 4, "rs2'", "Source register (3-bit, x8-x15)", "rs2"),
        (0, 1, "op", "Opcode quadrant", "opcode"),
    ],
    "CA-Type": [
        # Format: funct6[15:10] rd'/rs1'[9:7] funct2[6:5] rs2'[4:2] op[1:0]
        # CORRECTION: This has funct6 (6 bits) + funct2 (2 bits), not funct4!
        # This is what makes C.ADDW and similar instructions work correctly
        (10, 15, "funct6", "Function code (6 bits)", "funct"),
        (7, 9, "rd'/rs1'", "Dest/source reg (3-bit, x8-x15)", "rd"),
        (5, 6, "funct2", "Function code (2 bits)", "funct"),
        (2, 4, "rs2'", "Source reg 2 (3-bit, x8-x15)", "rs2"),
        (0, 1, "op", "Opcode quadrant", "opcode"),
    ],
    "CB-Type": [
        # Format: funct3[15:13] offset/imm[12:10] rs1'[9:7] offset/imm[6:2] op[1:0]
        (13, 15, "funct3", "Function code (3 bits)", "funct"),
        (10, 12, "offset[8:6]/imm[5:3]", "Offset/immediate high", "immediate"),
        (7, 9, "rs1'", "Source register (3-bit, x8-x15)", "rs1"),
        (2, 6, "offset[5:1]/imm[2:0|7:6]", "Offset/immediate low", "immediate"),
        (0, 1, "op", "Opcode quadrant", "opcode"),
    ],
    "CJ-Type": [
        # Format: funct3[15:13] jump_target[12:2] op[1:0]
        (13, 15, "funct3", "Function code (3 bits)", "funct"),
        (2, 12, "jump_target[11:1]", "Jump offset (11 bits)", "immediate"),
        (0, 1, "op", "Opcode quadrant", "opcode"),
    ],
}

# Merge all formats
ALL_FORMATS = {**STANDARD_32BIT_FORMATS, **COMPRESSED_16BIT_FORMATS}


# ============================================================================
# Field Extraction Functions
# ============================================================================

def extract_field_value(encoding: str, start_bit: int, end_bit: int) -> str:
    """
    Extract field value from binary encoding pattern.

    Args:
        encoding: Binary pattern string (MSB first, e.g., "0000100xxxxxxxxxx000xxxxx0111011")
        start_bit: Starting bit position (LSB = 0)
        end_bit: Ending bit position (inclusive)

    Returns:
        Field value as string of 0/1/x characters

    Examples:
        encoding = "0000100xxxxxxxxxx000xxxxx0111011"  # 32 bits
        extract_field_value(encoding, 0, 6) -> "0111011"  # opcode [6:0]
        extract_field_value(encoding, 7, 11) -> "xxxxx"   # rd [11:7]
    """
    # Convert bit positions to string indices (reverse order)
    # Bit 0 is rightmost character, bit 31 is leftmost
    encoding_len = len(encoding)

    # Calculate string positions (MSB first = left to right)
    # start_bit = 0 -> rightmost position = len-1
    # end_bit = 6 -> position len-7
    start_idx = encoding_len - 1 - end_bit
    end_idx = encoding_len - 1 - start_bit

    # Extract substring (inclusive)
    return encoding[start_idx:end_idx + 1]


def parse_encoding_fields(encoding: str, format_type: str) -> List[Dict[str, Any]]:
    """
    Parse binary encoding into structured field metadata.

    Args:
        encoding: Binary pattern (e.g., "0000100xxxxxxxxxx000xxxxx0111011" for 32-bit,
                                      or "1001xxxxxxxxxx10" for 16-bit compressed)
        format_type: Instruction format (e.g., "R-Type", "I-Type", "CR-Type", "CI-Type")

    Returns:
        List of field dictionaries with keys:
            - name: Field name (e.g., "opcode", "rd", "rs1")
            - startBit: Starting bit position (LSB = 0)
            - endBit: Ending bit position (inclusive)
            - value: Field value from encoding ("0", "1", "x" for variable)
            - description: Human-readable field description
            - category: Field category (opcode, rd, rs1, rs2, rs3, funct, immediate)

    Returns empty list if format is not recognized or encoding is invalid.

    Examples:
        # 32-bit R-Type: ADD.UW rd, rs1, rs2
        encoding = "0000100xxxxxxxxxx000xxxxx0111011"
        fields = parse_encoding_fields(encoding, "R-Type")
        # Returns 6 fields: funct7, rs2, rs1, funct3, rd, opcode

        # 16-bit CR-Type: C.ADD rd, rs2
        encoding = "1001xxxxxxxxxx10"
        fields = parse_encoding_fields(encoding, "CR-Type")
        # Returns 4 fields: funct4, rd/rs1, rs2, op
    """
    # Validate encoding
    if not encoding:
        return []

    # Remove any whitespace
    encoding = encoding.replace(" ", "").replace("\n", "")

    # Validate encoding characters
    if not all(c in "01x" for c in encoding):
        return []

    # Determine encoding length
    encoding_len = len(encoding)

    # Normalize format type (handle variations)
    format_type = format_type.strip()

    # Handle case-insensitive format matching (e.g., "R-type" → "R-Type")
    # Try to match with capitalized version first
    format_normalized = format_type
    if format_type not in ALL_FORMATS:
        # Try capitalizing the first letter of each word (e.g., "r-type" → "R-Type")
        parts = format_type.split('-')
        if len(parts) == 2:
            format_normalized = f"{parts[0].upper()}-{parts[1].capitalize()}"

    # Handle "C-Type" as generic fallback for compressed instructions
    if format_normalized == "C-Type":
        # Try to infer more specific compressed format based on encoding length
        if encoding_len == 16:
            # Generic 16-bit compressed - use CR-Type as default
            format_normalized = "CR-Type"
        else:
            return []

    # Look up format definition
    if format_normalized not in ALL_FORMATS:
        # Unknown format - return empty list
        return []

    format_type = format_normalized

    format_definition = ALL_FORMATS[format_type]

    # Validate encoding length matches format
    expected_len = 32 if format_type in STANDARD_32BIT_FORMATS else 16
    if encoding_len != expected_len:
        # Length mismatch - return empty list
        return []

    # Extract fields
    fields = []

    for start_bit, end_bit, name, description, category in format_definition:
        # Extract field value from encoding
        value = extract_field_value(encoding, start_bit, end_bit)

        # Create field object
        field = EncodingField(
            name=name,
            start_bit=start_bit,
            end_bit=end_bit,
            value=value,
            description=description,
            category=category
        )

        fields.append(field.to_dict())

    return fields


def validate_encoding_fields(fields: List[Dict[str, Any]], encoding: str) -> bool:
    """
    Validate that parsed encoding fields are correct.

    Checks:
    - No overlapping bit ranges
    - No gaps in coverage
    - Field values match encoding
    - Bit ranges are valid

    Args:
        fields: List of field dictionaries from parse_encoding_fields()
        encoding: Original binary encoding string

    Returns:
        True if valid, False otherwise
    """
    if not fields:
        return False

    encoding_len = len(encoding)

    # Create a bit coverage map
    bit_coverage = [False] * encoding_len

    for field in fields:
        start_bit = field["startBit"]
        end_bit = field["endBit"]
        value = field["value"]

        # Validate bit range
        if start_bit < 0 or end_bit >= encoding_len or start_bit > end_bit:
            return False

        # Check for overlaps
        for bit in range(start_bit, end_bit + 1):
            if bit_coverage[bit]:
                return False  # Overlap detected
            bit_coverage[bit] = True

        # Validate field value matches encoding
        expected_value = extract_field_value(encoding, start_bit, end_bit)
        if value != expected_value:
            return False

    # Check for complete coverage
    if not all(bit_coverage):
        return False

    return True


# ============================================================================
# Utility Functions
# ============================================================================

def get_supported_formats() -> List[str]:
    """Get list of all supported instruction formats."""
    return list(ALL_FORMATS.keys())


def is_compressed_format(format_type: str) -> bool:
    """Check if format is a compressed (16-bit) instruction format."""
    return format_type in COMPRESSED_16BIT_FORMATS


def is_standard_format(format_type: str) -> bool:
    """Check if format is a standard (32-bit) instruction format."""
    return format_type in STANDARD_32BIT_FORMATS


# ============================================================================
# Command-Line Interface (for testing)
# ============================================================================

if __name__ == "__main__":
    import sys
    import json

    # Test cases
    test_cases = [
        # Standard 32-bit formats
        ("0000100xxxxxxxxxx000xxxxx0111011", "R-Type", "ADD.UW (RV64B)"),
        ("xxxxxxxxxxxxxxxxxxxxxxxxx0110111", "U-Type", "LUI"),
        ("xxxxxxxxxxxxxxxxxxxxxxxxx1101111", "J-Type", "JAL"),
        ("xxxxxxxxxxxxxxxxxxxx000xxxxx10011", "I-Type", "ADDI"),

        # Compressed 16-bit formats
        ("1001xxxxxxxxxx10", "CR-Type", "C.ADD"),
        ("000xxxxxxxxxxxxxxxxx00", "CIW-Type", "C.ADDI4SPN"),
        ("101xxxxxxxxxxxxxxxxx01", "CJ-Type", "C.J"),
    ]

    print("=" * 80)
    print("RISC-V Encoding Field Parser - Test Suite")
    print("=" * 80)

    for encoding, format_type, name in test_cases:
        print(f"\n{name}:")
        print(f"  Format: {format_type}")
        print(f"  Encoding: {encoding}")

        fields = parse_encoding_fields(encoding, format_type)

        if fields:
            print(f"  Fields ({len(fields)}):")
            for field in fields:
                print(f"    - {field['name']:15s} [{field['startBit']:2d}:{field['endBit']:2d}] = {field['value']:15s} ({field['description']})")

            # Validate
            is_valid = validate_encoding_fields(fields, encoding)
            print(f"  Validation: {'✓ PASS' if is_valid else '✗ FAIL'}")
        else:
            print("  ✗ Failed to parse encoding")

    print("\n" + "=" * 80)
    print(f"Supported formats ({len(get_supported_formats())}):")
    for fmt in sorted(get_supported_formats()):
        fmt_type = "16-bit" if is_compressed_format(fmt) else "32-bit"
        print(f"  - {fmt:15s} ({fmt_type})")
