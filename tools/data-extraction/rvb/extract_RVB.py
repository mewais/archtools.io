#!/usr/bin/env python3
"""
RISC-V B Extension Instruction Extractor

Extracts RV32B and RV64B instructions from the official RISC-V ISA manual.
Focuses on section 29.4 table (43 instructions).

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

# Path to repo root: rvb/ -> data-extraction/ -> tools/ -> architect.io/
REPO_ROOT = Path(__file__).parent.parent.parent.parent
OUTPUT_JSON = REPO_ROOT / "src" / "data" / "instructions.json"
OUTPUT_REPORT = Path(__file__).parent / "extraction_report_RVB.txt"

# Target section for B extension (section 29.4)
TARGET_SECTION_NUMBER = "29.4"
EXPECTED_INSTRUCTION_COUNT = 43

# Enable verbose logging for specific instructions (for debugging)
VERBOSE_INSTRUCTIONS = ['REV8']  # Add instruction mnemonics here to see debug output


# ============================================================================
# Data Models
# ============================================================================

class Instruction:
    """Represents a single RISC-V B extension instruction."""

    def __init__(self, mnemonic: str, extension: str):
        self.mnemonic = mnemonic.upper().strip()
        self.extension = extension.strip()

        # Fields to be filled during extraction
        self.encoding = ""  # Will be enriched later
        self.operands: List[str] = []
        self.operand_types: List[str] = []
        self.format = ""  # Will be enriched later
        self.encoding_fields: List[Dict[str, Any]] = []  # Structured encoding fields

        # Description and pseudocode from anchor links
        self.description = ""
        self.pseudocode = ""
        self.category = ""

        # Anchor link for detail extraction
        self.anchor_link = ""

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
        self.by_extension: Dict[str, List[str]] = {"RV32B": [], "RV64B": []}
        self.total_instructions = 0
        self.rv32b_count = 0
        self.rv64b_count = 0
        self.both_count = 0
        self.field_completeness: Dict[str, int] = {
            "mnemonic": 0,
            "extension": 0,
            "operands": 0,
            "description": 0,
            "pseudocode": 0,
            "category": 0,
            "encoding": 0,
            "format": 0,
        }
        self.sample_instructions: List[Instruction] = []
        self.enrichment_stats: Dict[str, int] = {
            "complete_encoding": 0,
            "partial_encoding": 0,
            "no_encoding": 0,
        }

    def add_instruction(self, instr: Instruction):
        """Record instruction statistics."""
        self.by_extension[instr.extension].append(instr.mnemonic)
        self.total_instructions += 1

        if instr.extension == "RV32B":
            self.rv32b_count += 1
        elif instr.extension == "RV64B":
            self.rv64b_count += 1

        # Save first 5 for samples
        if len(self.sample_instructions) < 5:
            self.sample_instructions.append(instr)

    def update_field_completeness(self, instructions: List[Instruction]):
        """Count completeness of each field."""
        for instr in instructions:
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
            if instr.category:
                self.field_completeness["category"] += 1
            if instr.encoding:
                self.field_completeness["encoding"] += 1
            if instr.format:
                self.field_completeness["format"] += 1

            # Track encoding quality
            if instr.encoding and instr.encoding.strip():
                # Check if encoding contains actual data (not just empty or 'x' placeholders)
                if any(c in instr.encoding for c in '01'):
                    self.enrichment_stats["complete_encoding"] += 1
                elif instr.encoding != "":
                    self.enrichment_stats["partial_encoding"] += 1
                else:
                    self.enrichment_stats["no_encoding"] += 1
            else:
                self.enrichment_stats["no_encoding"] += 1


# ============================================================================
# Wavedrom to Binary Encoding Converter
# ============================================================================

def parse_wavedrom_to_binary(wavedrom_text: str) -> str:
    """
    Convert wavedrom encoding to 32-bit binary pattern.

    Wavedrom format example:
    {reg:[
        { bits:  7, name: 0x33, attr: ['OP'] },
        { bits:  5, name: 'rd', type: 2},
        { bits:  3, name: 0x7, attr: ['ANDN']},
        { bits:  5, name: 'rs1', type: 2},
        { bits:  5, name: 'rs2', type: 2},
        { bits:  7, name: 0x20, attr: ['ANDN'] },
    ]}

    Output: "0100000xxxxxxxxxx111xxxxx0110011"

    Args:
        wavedrom_text: Raw wavedrom text from .adoc file

    Returns:
        32-bit binary encoding pattern with 'x' for variable fields
    """
    import json

    # Extract the JSON structure from wavedrom text
    # Pattern: {reg:[ ... ]} - need to match the FULL array including nested brackets
    # Use a more robust pattern that matches balanced brackets
    match = re.search(r'\{reg:\s*\[(.+)\]\s*\}', wavedrom_text, re.DOTALL)
    if not match:
        return ""

    reg_content = match.group(1)

    # Parse each field entry
    # Format: { bits: N, name: VALUE, ... }
    field_pattern = r'\{\s*bits:\s*(\d+),\s*name:\s*([^,}]+?)(?:,\s*[^}]*)?\}'
    fields = re.findall(field_pattern, reg_content, re.DOTALL)

    if not fields:
        return ""

    # Build binary pattern from LSB to MSB (fields are in reverse order in wavedrom)
    binary_parts = []

    for bits_str, name_str in fields:
        bits = int(bits_str)
        name = name_str.strip().strip("'\"")

        # Check if it's a fixed value (hex number like 0x33) or variable (like 'rd', 'rs1')
        if name.startswith('0x') or name.startswith('0X'):
            # Convert hex to binary
            hex_val = int(name, 16)
            binary = format(hex_val, f'0{bits}b')
            binary_parts.append(binary)
        elif name.isdigit():
            # Decimal number
            decimal_val = int(name)
            binary = format(decimal_val, f'0{bits}b')
            binary_parts.append(binary)
        else:
            # Variable field - use 'x' for each bit
            binary_parts.append('x' * bits)

    # Reverse to get MSB-first order
    binary_parts.reverse()

    # Combine into 32-bit pattern
    encoding = ''.join(binary_parts)

    # Validate length
    if len(encoding) != 32:
        print(f"  WARNING: Encoding length is {len(encoding)}, expected 32 bits")
        # Pad or truncate if needed
        if len(encoding) < 32:
            encoding = encoding.ljust(32, 'x')
        elif len(encoding) > 32:
            encoding = encoding[:32]

    return encoding


# ============================================================================
# Operand Parsing Utilities
# ============================================================================

def parse_mnemonic_and_operands(operand_string: str) -> Tuple[str, List[str]]:
    """
    Parse mnemonic and operands from table cell.

    Examples:
        "add.uwrd,rs1,rs2" → ("add.uw", ["rd", "rs1", "rs2"])
        "clzrd,rs" → ("clz", ["rd", "rs"])
        "rorrd,rs1,rs2" → ("ror", ["rd", "rs1", "rs2"])

    The HTML format is: mnemonic + operands with no space separator,
    where mnemonic ends before the first operand register (rd, rs, etc.)

    Returns:
        (mnemonic, operand_list)
    """
    operand_string = operand_string.strip()

    # Strategy: Find where the mnemonic ends by looking for operand pattern
    # Mnemonic can include dots (e.g., "add.uw") but ends before rd/rs
    match = re.match(r'^([a-z][a-z0-9._]*)(rd|rs)', operand_string, re.IGNORECASE)

    if not match:
        # Fallback: no clear pattern, split on comma/space
        parts = re.split(r'[,\s]+', operand_string)
        parts = [p.strip() for p in parts if p.strip()]
        if not parts:
            return ("", [])
        return (parts[0], parts[1:])

    # Extract mnemonic and remainder
    mnemonic = match.group(1)
    remainder = operand_string[len(mnemonic):]

    # Split remainder on commas
    operands = [op.strip() for op in remainder.split(',') if op.strip()]

    # Normalize operand names: rs → rs1 (for consistency with encoding fields)
    normalized = []
    for op in operands:
        if op.lower() == 'rs':
            normalized.append('rs1')
        else:
            normalized.append(op)

    return (mnemonic, normalized)


def infer_operand_types(operands: List[str]) -> List[str]:
    """
    Infer operand types from operand names.

    Rules:
        - rd, rs, rs1, rs2, rs3 → "register"
        - imm → "immediate"
        - shamt → "immediate"
    """
    types = []

    for op in operands:
        op_lower = op.lower()

        if op_lower in ['rd', 'rs', 'rs1', 'rs2', 'rs3']:
            types.append('register')
        elif 'imm' in op_lower:
            types.append('immediate')
        elif 'shamt' in op_lower:
            types.append('immediate')
        else:
            # Default to register
            types.append('register')

    return types


def infer_category(mnemonic: str) -> str:
    """
    Infer instruction category from mnemonic.

    IMPORTANT: This is the ONLY place where pattern matching is used.
    Pattern matching is used here for CATEGORIZATION only, NOT for:
    - Deciding which instructions to include/exclude
    - Filtering instructions
    - Selecting instructions from tables

    All instructions come directly from the official ISA manual tables.
    This function only assigns a human-readable category label for UI purposes.

    B extension categories:
        - Bit Manipulation
        - Bit Rotation
        - Bit Counting
        - Logical Operations
        - Arithmetic
        - Shift
    """
    m = mnemonic.upper()

    # Rotation instructions
    if any(x in m for x in ['ROL', 'ROR', 'RORI']):
        return 'Bit Rotation'

    # Counting/leading operations
    if any(x in m for x in ['CLZ', 'CTZ', 'CPOP', 'SEXT']):
        return 'Bit Counting'

    # Logical operations
    if any(x in m for x in ['ANDN', 'ORN', 'XNOR']):
        return 'Logical'

    # Min/Max
    if any(x in m for x in ['MIN', 'MAX', 'MINU', 'MAXU']):
        return 'Arithmetic'

    # Bit manipulation
    if any(x in m for x in ['BCLR', 'BEXT', 'BINV', 'BSET', 'REV', 'ORC', 'PACK', 'ZIP', 'UNZIP']):
        return 'Bit Manipulation'

    # Shift operations
    if any(x in m for x in ['SH', 'SHFL', 'UNSHFL']):
        return 'Shift'

    # Default
    return 'Bit Manipulation'


def infer_format_from_operands(operands: List[str], encoding: str) -> str:
    """
    Infer instruction format type from operands and encoding pattern.

    All B extension instructions use standard RISC-V formats:
        - R-Type: rd, rs1, rs2 (3 registers)
        - I-Type: rd, rs1, imm (2 registers + immediate)
        - R4-Type: rd, rs1, rs2, rs3 (4 registers, rare)

    Args:
        operands: List of operand names
        encoding: Binary encoding pattern (32 bits with 0/1/x)

    Returns:
        Format type string (e.g., "R-Type", "I-Type")
    """
    operand_count = len(operands)

    # Check for immediate operands
    has_immediate = any('imm' in op.lower() or 'shamt' in op.lower() for op in operands)

    # R4-Type: 4 register operands (very rare)
    if operand_count == 4:
        return 'R4-Type'

    # I-Type: rd, rs1, imm (or rd, rs1, shamt)
    if operand_count == 3 and has_immediate:
        return 'I-Type'

    # R-Type: rd, rs1, rs2 (3 register operands, no immediate)
    if operand_count == 3 and not has_immediate:
        return 'R-Type'

    # I-Type with 2 operands: rd, imm (like LUI) - rare in B extension
    if operand_count == 2 and has_immediate:
        return 'I-Type'

    # R-Type with 2 operands: rd, rs (like CLZ, CTZ)
    if operand_count == 2 and not has_immediate:
        return 'R-Type'

    # Default to R-Type for B extension
    return 'R-Type'


# ============================================================================
# Section 29.4 Table Extraction
# ============================================================================

def find_section_29_4_table(soup: BeautifulSoup) -> Optional[Tag]:
    """
    Find the section 29.4 table containing the 43 B extension instructions.

    Returns:
        Table element or None if not found
    """
    print(f"\n{'=' * 70}")
    print("LOCATING SECTION 29.4 TABLE")
    print(f"{'=' * 70}")

    # Find section with id containing "29.4" or text "29.4"
    # Try multiple strategies

    # Strategy 1: Find by section number in heading
    for heading in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
        heading_text = heading.get_text(strip=True)
        if '29.4' in heading_text or 'Table 31' in heading_text:
            print(f"  Found section heading: '{heading_text}'")

            # Find the next table after this heading
            next_table = heading.find_next('table', class_='tableblock')
            if next_table:
                print(f"  ✓ Found table after section 29.4 heading")
                return next_table

    # Strategy 2: Find by table caption
    for table in soup.find_all('table', class_='tableblock'):
        caption = table.find('caption')
        if caption:
            caption_text = caption.get_text(strip=True)
            if 'Table 31' in caption_text or 'B-extension' in caption_text:
                print(f"  ✓ Found table by caption: '{caption_text}'")
                return table

    # Strategy 3: Find table with specific structure (RV32 checkbox, RV64 checkbox, Mnemonic, Description columns)
    for table in soup.find_all('table', class_='tableblock'):
        # Check header row
        header_row = table.find('tr')
        if header_row:
            headers = header_row.find_all(['th', 'td'])
            if len(headers) >= 4:
                # Check if headers match expected pattern
                header_texts = [h.get_text(strip=True) for h in headers[:4]]

                # Look for RV32/RV64 pattern
                if any('RV32' in text for text in header_texts) and any('RV64' in text for text in header_texts):
                    print(f"  ✓ Found table with RV32/RV64 headers")
                    return table

    print(f"  ✗ Could not find section 29.4 table")
    return None


def extract_instructions_from_table(table: Tag, soup: BeautifulSoup, stats: ExtractionStats) -> List[Instruction]:
    """
    Extract instructions from section 29.4 table.

    Table structure (43 rows):
        Row 0: Headers (RV32, RV64, Mnemonic, Description)
        Rows 1-43: Instructions with checkboxes and data

    Returns:
        List of Instruction objects
    """
    print(f"\n{'=' * 70}")
    print("EXTRACTING INSTRUCTIONS FROM TABLE")
    print(f"{'=' * 70}")

    instructions = []
    rows = table.find_all('tr')

    print(f"  Found {len(rows)} rows in table")

    # Skip header row
    data_rows = rows[1:] if len(rows) > 1 else rows

    instruction_count = 0

    for row_idx, row in enumerate(data_rows):
        cells = row.find_all(['td', 'th'])

        if len(cells) < 4:
            # Skip incomplete rows
            continue

        # Column 0: RV32 checkbox (✓ or empty)
        # Column 1: RV64 checkbox (✓ or empty)
        # Column 2: Mnemonic + operands
        # Column 3: Description (contains anchor link)

        rv32_cell = cells[0].get_text(strip=True)
        rv64_cell = cells[1].get_text(strip=True)
        mnemonic_cell = cells[2]
        description_cell = cells[3]

        # Check if RV32 or RV64 is checked
        is_rv32 = '✓' in rv32_cell or 'X' in rv32_cell or rv32_cell.strip() != ''
        is_rv64 = '✓' in rv64_cell or 'X' in rv64_cell or rv64_cell.strip() != ''

        # Get mnemonic text
        mnemonic_text = mnemonic_cell.get_text(strip=True)

        # Skip if no mnemonic
        if not mnemonic_text or len(mnemonic_text) < 2:
            continue

        # Parse mnemonic and operands
        mnemonic, operands = parse_mnemonic_and_operands(mnemonic_text)

        # Get anchor link from description cell
        anchor_link = ""
        anchor_tag = description_cell.find('a')
        if anchor_tag and anchor_tag.get('href'):
            anchor_link = anchor_tag.get('href')

        # Create instruction(s) based on checkboxes
        created_instructions = []

        if is_rv32:
            instr = Instruction(mnemonic, "RV32B")
            instr.operands = operands
            instr.operand_types = infer_operand_types(operands)
            instr.anchor_link = anchor_link
            instr.category = infer_category(mnemonic)
            # Infer format from operands (encoding will be added later in enrichment)
            instr.format = infer_format_from_operands(operands, "")
            created_instructions.append(instr)
            stats.add_instruction(instr)

        if is_rv64:
            instr = Instruction(mnemonic, "RV64B")
            instr.operands = operands
            instr.operand_types = infer_operand_types(operands)
            instr.anchor_link = anchor_link
            instr.category = infer_category(mnemonic)
            # Infer format from operands (encoding will be added later in enrichment)
            instr.format = infer_format_from_operands(operands, "")
            created_instructions.append(instr)
            stats.add_instruction(instr)

        if is_rv32 and is_rv64:
            stats.both_count += 1

        instructions.extend(created_instructions)
        instruction_count += 1

        # Progress indicator
        if instruction_count % 10 == 0 or instruction_count <= 5:
            print(f"  [{instruction_count}] {mnemonic} → RV32B: {is_rv32}, RV64B: {is_rv64}")

    print(f"\n✓ Extracted {instruction_count} unique mnemonics → {len(instructions)} total instructions")
    print(f"  RV32B: {stats.rv32b_count}")
    print(f"  RV64B: {stats.rv64b_count}")
    print(f"  Both: {stats.both_count}")

    return instructions


# ============================================================================
# Secondary Source Enrichment
# ============================================================================

# Secondary source URLs for B extension
SECONDARY_BASE_URL = "https://msyksphinz-self.github.io/riscv-isadoc/html/"
TERTIARY_BASE_URL = "https://raw.githubusercontent.com/msyksphinz-self/riscv-isadoc/master/source/"

# Cache for parsed secondary source pages
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


def extract_from_secondary_html(mnemonic: str, url: str) -> Tuple[str, str, str]:
    """
    Extract encoding, format, and description from secondary HTML source.

    NOTE: This function extracts raw wavedrom text from HTML.
    The wavedrom will be converted to binary in enrich_from_secondary_source().

    Args:
        mnemonic: Instruction mnemonic (e.g., "ADD.UW", "ANDN")
        url: URL of secondary source HTML page

    Returns:
        (encoding, format, description) tuple. Empty strings if not found.
        Encoding may contain wavedrom text which will be converted later.
    """
    soup = fetch_secondary_source(url)
    if not soup:
        return ("", "", "")

    # Normalize mnemonic to lowercase for anchor search
    mnemonic_lower = mnemonic.lower()
    # Replace dots with hyphens (e.g., "add.uw" → "add-uw")
    mnemonic_normalized = mnemonic_lower.replace('.', '-')

    # Find the section for this instruction
    section = soup.find('section', id=mnemonic_normalized)
    if not section:
        # Try without normalization
        section = soup.find('section', id=mnemonic_lower)

    if not section:
        return ("", "", "")

    # Find the field list (dl element)
    field_list = section.find('dl', class_='field-list')
    if not field_list:
        return ("", "", "")

    encoding = ""
    format_type = ""
    description = ""

    # Extract fields from dt/dd pairs
    for dt in field_list.find_all('dt'):
        field_name = dt.get_text(strip=True)
        dd = dt.find_next_sibling('dd')
        if not dd:
            continue

        # For encoding, we need to preserve the raw text (may contain wavedrom)
        if field_name == 'Encoding' or field_name == 'Binary':
            # Get the raw HTML content to preserve wavedrom structure
            encoding = dd.get_text()
        elif field_name == 'Format':
            format_type = dd.get_text(strip=True)
        elif field_name == 'Description':
            description = dd.get_text(strip=True)

    return (encoding, format_type, description)


def extract_from_adoc_source(mnemonic: str, extension: str, url: str, verbose: bool = False) -> Tuple[str, str, str]:
    """
    Extract encoding, format, and description from .adoc source file.

    Args:
        mnemonic: Instruction mnemonic
        extension: Instruction extension (RV32B or RV64B) for variant-specific encoding
        url: URL of .adoc source file
        verbose: Enable verbose logging for debugging

    Returns:
        (encoding, format, description) tuple. Empty strings if not found.
    """
    # Check cache first
    if url in _adoc_source_cache:
        content = _adoc_source_cache[url]
        if content is None:
            return ("", "", "")
    else:
        # Fetch and cache
        try:
            if verbose:
                print(f"  [VERBOSE] Fetching {url}...")
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            content = response.text
            _adoc_source_cache[url] = content
            if verbose:
                print(f"  [VERBOSE] Downloaded {len(content)} bytes")
        except Exception as e:
            print(f"  WARNING: Failed to fetch {url}: {e}")
            _adoc_source_cache[url] = None
            return ("", "", "")

    # Normalize mnemonic to lowercase for searching
    mnemonic_lower = mnemonic.lower()

    if verbose:
        print(f"  [VERBOSE] Searching for '{mnemonic_lower}' in .adoc file...")

    # Try multiple section heading patterns
    section_patterns = [
        rf'^===\s+{re.escape(mnemonic_lower)}\s*$',  # === cpopw
        rf'^===\s+{re.escape(mnemonic_lower.replace(".", "-"))}\s*$',  # Handle dots
        rf'^===\s+{re.escape(mnemonic_lower.upper())}\s*$',  # === CPOPW
        # Fallback: heading might be on same line as previous field (e.g., "Implementation::=== sext.b")
        rf'===\s+{re.escape(mnemonic_lower)}\s*$',  # Anywhere on line
    ]

    lines = content.split('\n')
    section_start = None

    for pattern in section_patterns:
        for i, line in enumerate(lines):
            if re.search(pattern, line, re.IGNORECASE):
                section_start = i
                if verbose:
                    print(f"  [VERBOSE] Found section at line {i}: {line.strip()}")
                break
        if section_start is not None:
            break

    if section_start is None:
        if verbose:
            print(f"  [VERBOSE] Section not found for '{mnemonic_lower}'")
            # Show all === headings for debugging
            headings = [l.strip() for l in lines if l.startswith('===')]
            print(f"  [VERBOSE] Available headings: {headings[:10]}...")
        return ("", "", "")

    # Extract content until next section
    section_end = len(lines)
    for i in range(section_start + 1, len(lines)):
        if lines[i].startswith('===') or lines[i].startswith('=='):
            section_end = i
            break

    section_text = '\n'.join(lines[section_start:section_end])

    if verbose:
        print(f"  [VERBOSE] Section length: {len(section_text)} chars")

    encoding = ""
    format_type = ""
    description = ""

    # Look for variant-specific encoding first (RV32 vs RV64), then fall back to generic Encoding::
    # This must be extracted before Format to avoid wavedrom being included in Format
    enc_match = None

    # Determine which variant-specific encoding to look for
    if extension.startswith('RV32'):
        # Try RV32-specific encoding first
        enc_match = re.search(r'Encoding\s*\(RV32\)::\s*\n(.+?)(?=\n\s*(?:Format::|Description::|Implementation::|Encoding|===|$))',
                             section_text, re.DOTALL | re.IGNORECASE)
        if enc_match and verbose:
            print(f"  [VERBOSE] Found RV32-specific Encoding")
    elif extension.startswith('RV64'):
        # Try RV64-specific encoding first
        enc_match = re.search(r'Encoding\s*\(RV64\)::\s*\n(.+?)(?=\n\s*(?:Format::|Description::|Implementation::|Encoding|===|$))',
                             section_text, re.DOTALL | re.IGNORECASE)
        if enc_match and verbose:
            print(f"  [VERBOSE] Found RV64-specific Encoding")

    # If variant-specific encoding not found, fall back to generic Encoding::
    if not enc_match:
        enc_match = re.search(r'(?:Encoding|Binary)::\s*\n(.+?)(?=\n\s*(?:Format::|Description::|Implementation::|===|$))',
                             section_text, re.DOTALL | re.IGNORECASE)
        if enc_match and verbose:
            print(f"  [VERBOSE] Found generic Encoding")

    if enc_match:
        encoding = enc_match.group(1).strip()
        if verbose:
            print(f"  [VERBOSE] Found Encoding: {encoding[:100]}...")
    else:
        # If no Encoding:: label, look for wavedrom block after Format::
        # Pattern: [wavedrom, , svg] .... {reg:[...]} ....
        wavedrom_match = re.search(r'\[wavedrom[^\]]*\]\s*\.+\s*(\{reg:\[.+?\]\})\s*\.+', section_text, re.DOTALL | re.IGNORECASE)
        if wavedrom_match:
            # Found unlabeled wavedrom - extract it as encoding
            encoding = wavedrom_match.group(0)
            if verbose:
                print(f"  [VERBOSE] Found unlabeled wavedrom: {encoding[:100]}...")

    # IMPORTANT: DO NOT extract Format:: field from ADOC
    # The Format:: field in ADOC files often contains instruction syntax (e.g., "add.uw rd, rs1, rs2")
    # rather than format types (e.g., "R-Type"). We rely on the format type inferred by the main
    # extraction pipeline (extract_unified.py) which correctly determines R-Type, I-Type, etc.
    # based on opcode and operand analysis.
    #
    # Extracting Format:: from ADOC would OVERWRITE the correctly inferred format with syntax,
    # breaking the format field for UI display.
    #
    # format_match = re.search(...)  # REMOVED - do not extract Format::
    format_type = ""  # Leave empty - will use inferred format from main pipeline

    # Look for Description::
    desc_match = re.search(r'Description::\s*\n(.+?)(?=\n\s*(?:Format::|Encoding::|Implementation::|===|$))', section_text, re.DOTALL | re.IGNORECASE)
    if desc_match:
        description = desc_match.group(1).strip()
        if verbose:
            print(f"  [VERBOSE] Found Description: {description[:50]}...")

    # Clean up AsciiDoc formatting (block delimiters)
    # Remove block delimiters (--) at start and end
    encoding = re.sub(r'^--\s*\n', '', encoding, flags=re.MULTILINE).strip()
    encoding = re.sub(r'\n--\s*$', '', encoding, flags=re.MULTILINE).strip()

    format_type = re.sub(r'^--\s*\n', '', format_type, flags=re.MULTILINE).strip()
    format_type = re.sub(r'\n--\s*$', '', format_type, flags=re.MULTILINE).strip()
    # Also remove inline -- delimiters (e.g., "-- rev8 rd, rs --")
    format_type = re.sub(r'^--\s*', '', format_type).strip()
    format_type = re.sub(r'\s*--$', '', format_type).strip()

    description = re.sub(r'^--\s*\n', '', description, flags=re.MULTILINE).strip()
    description = re.sub(r'\n--\s*$', '', description, flags=re.MULTILINE).strip()

    return (encoding, format_type, description)


def enrich_from_secondary_source(instr: Instruction, verbose: bool = False) -> bool:
    """
    Enrich instruction with encoding and format from secondary sources.

    Args:
        instr: Instruction to enrich
        verbose: Enable verbose logging for debugging

    Returns:
        True if any data was found, False otherwise
    """
    # Try multiple URL strategies
    urls_to_try = [
        # Try RVB-specific HTML page first
        ("html", f"{SECONDARY_BASE_URL}rvb.html"),
        # Try RV32B-specific page
        ("html", f"{SECONDARY_BASE_URL}rv32b.html"),
        # Try RV64B-specific page
        ("html", f"{SECONDARY_BASE_URL}rv64b.html"),
        # Try .adoc source as fallback
        ("adoc", f"{TERTIARY_BASE_URL}rv_b.adoc"),
        ("adoc", f"{TERTIARY_BASE_URL}rvb.adoc"),
    ]

    for source_type, url in urls_to_try:
        if source_type == "html":
            encoding, format_type, description = extract_from_secondary_html(instr.mnemonic, url)
        elif source_type == "adoc":
            encoding, format_type, description = extract_from_adoc_source(instr.mnemonic, instr.extension, url, verbose=verbose)
        else:
            encoding, format_type, description = ("", "", "")

        # If we found data, use it
        if encoding or format_type:
            # Convert wavedrom encoding to binary pattern
            if encoding and 'wavedrom' in encoding.lower():
                binary_encoding = parse_wavedrom_to_binary(encoding)
                if binary_encoding:
                    if verbose:
                        print(f"  [VERBOSE] Converted wavedrom to binary: {binary_encoding}")
                    instr.encoding = binary_encoding
                else:
                    # Keep raw wavedrom if conversion failed
                    instr.encoding = encoding
            elif encoding:
                instr.encoding = encoding

            # DO NOT overwrite format - it was correctly inferred by the main pipeline
            # The format_type from ADOC is often syntax, not a format type
            # if format_type:
            #     instr.format = format_type

            # Update description if we found a better one
            if description and not instr.description:
                instr.description = description

            return True

    # No data found
    return False


# ============================================================================
# Detail Extraction from Anchor Links
# ============================================================================

def extract_details_from_anchor(anchor_link: str, soup: BeautifulSoup) -> Tuple[str, str]:
    """
    Extract description and pseudocode from anchor link section.

    Args:
        anchor_link: Anchor href (e.g., "#insns-add_uw")
        soup: BeautifulSoup object of the entire HTML document

    Returns:
        (description, pseudocode) tuple
    """
    if not anchor_link:
        return ("", "")

    # Remove leading # from anchor
    anchor_id = anchor_link.lstrip('#')

    # Find the section with this ID
    section = soup.find(id=anchor_id)

    if not section:
        # Try finding by name attribute (older HTML)
        section = soup.find(attrs={'name': anchor_id})

    if not section:
        return ("", "")

    description = ""
    pseudocode = ""

    # Get all siblings until next section heading
    current = section.find_next_sibling()
    content_elements = []

    while current:
        # Stop at next section heading or instruction anchor
        if current.name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
            break
        if current.get('id') and current.get('id').startswith('insns-'):
            break

        content_elements.append(current)
        current = current.find_next_sibling()

    # Extract description from dlist elements
    for elem in content_elements:
        if elem.name == 'div' and 'dlist' in elem.get('class', []):
            # Check if this dlist contains "Description"
            text = elem.get_text()
            if 'Description' in text:
                # Extract the description part
                # Structure is typically: "Description<text>"
                parts = text.split('Description', 1)
                if len(parts) > 1:
                    desc_text = parts[1].strip()
                    # Remove other field labels that might appear after
                    for label in ['Included in', 'Pseudoinstruction', 'Synopsis', 'Operation']:
                        if label in desc_text:
                            desc_text = desc_text.split(label)[0].strip()
                    if desc_text and not description:  # Only take first description
                        description = desc_text

    # Extract code blocks for pseudocode (from listingblock divs)
    # IMPORTANT: Preserve whitespace and formatting in pseudocode
    for elem in content_elements:
        if elem.name == 'div' and 'listingblock' in elem.get('class', []):
            pre = elem.find('pre')
            if pre:
                # Use default get_text() which handles whitespace correctly
                # The HTML uses <span> tags with whitespace, get_text() collapses them properly
                pseudocode_raw = pre.get_text()
                # Clean up excessive whitespace and normalize line breaks
                lines = pseudocode_raw.split('\n')
                # Remove excessive spaces on each line
                cleaned_lines = [' '.join(line.split()) for line in lines]
                # Remove empty lines but preserve structure
                cleaned_lines = [line for line in cleaned_lines if line.strip()]
                # Join with \n to preserve line structure
                pseudocode = '\n'.join(cleaned_lines)
                break  # Take first code block

    # Fallback: try paragraphs if no dlist description found
    if not description:
        paragraphs = []
        for elem in content_elements:
            if elem.name == 'p':
                paragraphs.append(elem.get_text(strip=True))
            elif elem.name == 'div' and 'paragraph' in elem.get('class', []):
                p = elem.find('p')
                if p:
                    paragraphs.append(p.get_text(strip=True))
        if paragraphs:
            description = ' '.join(paragraphs)

    return (description, pseudocode)


def enrich_instructions_with_details(instructions: List[Instruction], soup: BeautifulSoup) -> None:
    """
    Enrich all instructions with description, pseudocode, encoding, and format.

    Step 1: Extract from anchor links (description/pseudocode)
    Step 2: Enrich from secondary sources (encoding/format)
    """
    print(f"\n{'=' * 70}")
    print("ENRICHING INSTRUCTIONS WITH DETAILS")
    print(f"{'=' * 70}")

    # Step 1: Process anchor links for description/pseudocode
    print("\nStep 1: Extracting from anchor links (description/pseudocode)...")
    processed_anchors = {}
    anchor_enriched_count = 0

    for idx, instr in enumerate(instructions, 1):
        anchor = instr.anchor_link

        if not anchor:
            continue

        if anchor in processed_anchors:
            # Reuse previously extracted data
            desc, pseudo = processed_anchors[anchor]
            instr.description = desc
            instr.pseudocode = pseudo
        else:
            # Extract details
            desc, pseudo = extract_details_from_anchor(anchor, soup)
            instr.description = desc
            instr.pseudocode = pseudo
            processed_anchors[anchor] = (desc, pseudo)

            if desc or pseudo:
                anchor_enriched_count += 1

            # Progress indicator
            if idx <= 10 or idx % 10 == 0:
                status = "✓" if (desc or pseudo) else "✗"
                print(f"  [{idx}/{len(instructions)}] {status} {instr.mnemonic}")

    print(f"\n✓ Enriched {anchor_enriched_count} unique instructions from anchor links")

    # Step 2: Enrich from secondary sources (encoding/format)
    print(f"\n{'=' * 70}")
    print("Step 2: Enriching from secondary sources (encoding/format)...")
    print(f"{'=' * 70}")

    # IMPORTANT: Process by mnemonic+extension key to handle variant-specific encodings
    # Some instructions (like REV8) have different encodings for RV32B vs RV64B
    # We must NOT copy encodings between variants - each must be enriched independently
    processed_instructions = {}
    secondary_enriched_count = 0
    secondary_failed_count = 0
    failed_mnemonics = []

    for idx, instr in enumerate(instructions, 1):
        # Create a unique key that includes BOTH mnemonic AND extension
        key = f"{instr.mnemonic}|{instr.extension}"

        if key in processed_instructions:
            # This exact mnemonic+extension pair was already processed - reuse results
            ref = processed_instructions[key]
            if ref.encoding:
                instr.encoding = ref.encoding
            if ref.format:
                instr.format = ref.format
        else:
            # This is a new mnemonic+extension pair - enrich it specifically for this variant
            # Enable verbose mode for debugging specific instructions
            verbose = instr.mnemonic.upper() in VERBOSE_INSTRUCTIONS

            if verbose:
                print(f"\n[DEBUG {instr.mnemonic}] Processing {instr.extension} variant")

            found = enrich_from_secondary_source(instr, verbose=verbose)
            processed_instructions[key] = instr

            if found:
                secondary_enriched_count += 1
                if verbose:
                    print(f"[DEBUG {instr.mnemonic}] Encoding for {instr.extension}: {instr.encoding}")
            else:
                secondary_failed_count += 1
                failed_mnemonics.append(f"{instr.mnemonic} ({instr.extension})")
                if verbose:
                    print(f"[DEBUG {instr.mnemonic}] Failed to find encoding for {instr.extension}")

            # Progress indicator every 10 instructions
            if idx % 10 == 0 or idx <= 5:
                status = "✓" if found else "✗"
                print(f"  [{idx}/{len(instructions)}] {status} {instr.mnemonic} ({instr.extension})")

    print(f"\n✓ Enriched {secondary_enriched_count} unique mnemonic+extension pairs from secondary sources")
    print(f"  Failed to find secondary source data: {secondary_failed_count} pairs")
    if failed_mnemonics:
        print(f"  Failed: {', '.join(sorted(set(failed_mnemonics)))}")

    # Step 3: Parse encodings into structured fields
    print(f"\n{'=' * 70}")
    print("Step 3: Parsing encodings into structured fields...")
    print(f"{'=' * 70}")

    parsed_count = 0
    for instr in instructions:
        if instr.encoding and instr.format:
            instr.encoding_fields = parse_encoding_fields(instr.encoding, instr.format)
            if instr.encoding_fields:
                parsed_count += 1

    print(f"\n✓ Parsed {parsed_count}/{len(instructions)} instruction encodings into structured fields")


# ============================================================================
# Report Generation
# ============================================================================

def generate_report(stats: ExtractionStats, instructions: List[Instruction]) -> str:
    """Generate comprehensive extraction report."""
    lines = []
    lines.append("=" * 70)
    lines.append("RISC-V B EXTENSION EXTRACTION REPORT")
    lines.append("=" * 70)
    lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")

    # Overall statistics
    lines.append("OVERALL STATISTICS")
    lines.append("-" * 70)
    lines.append(f"Target instruction count: {EXPECTED_INSTRUCTION_COUNT}")
    lines.append(f"Total instructions extracted: {stats.total_instructions}")
    lines.append(f"Unique mnemonics: {len(set(i.mnemonic for i in instructions))}")
    lines.append("")

    # Extension breakdown
    lines.append("EXTENSION BREAKDOWN")
    lines.append("-" * 70)
    lines.append(f"RV32B: {stats.rv32b_count} instructions")
    lines.append(f"RV64B: {stats.rv64b_count} instructions")
    lines.append(f"In both RV32B and RV64B: {stats.both_count} instructions")
    lines.append("")

    # Update field completeness
    stats.update_field_completeness(instructions)

    # Field completeness
    lines.append("FIELD COMPLETENESS")
    lines.append("-" * 70)
    for field, count in stats.field_completeness.items():
        pct = (count / stats.total_instructions * 100) if stats.total_instructions > 0 else 0
        lines.append(f"{field:12s}: {count}/{stats.total_instructions} ({pct:.1f}%)")
    lines.append("")

    # Enrichment statistics
    lines.append("ENRICHMENT STATISTICS")
    lines.append("-" * 70)
    lines.append("Secondary source enrichment (encoding/format):")
    for quality, count in stats.enrichment_stats.items():
        pct = (count / stats.total_instructions * 100) if stats.total_instructions > 0 else 0
        lines.append(f"  {quality.replace('_', ' ').title():20s}: {count}/{stats.total_instructions} ({pct:.1f}%)")
    lines.append("")

    # Sample instructions (with enriched data)
    lines.append("SAMPLE ENRICHED INSTRUCTIONS")
    lines.append("-" * 70)
    for instr in stats.sample_instructions:
        lines.append(f"\nMnemonic: {instr.mnemonic}")
        lines.append(f"Extension: {instr.extension}")
        lines.append(f"Format: {instr.format if instr.format else '(empty)'}")
        lines.append(f"Encoding: {instr.encoding[:50] + '...' if len(instr.encoding) > 50 else instr.encoding if instr.encoding else '(empty)'}")
        lines.append(f"Operands: {', '.join(instr.operands) if instr.operands else 'none'}")
        lines.append(f"Category: {instr.category}")
        lines.append(f"Description: {instr.description[:100]}..." if len(instr.description) > 100 else f"Description: {instr.description}")
    lines.append("")

    # Instructions by extension
    lines.append("INSTRUCTIONS BY EXTENSION")
    lines.append("-" * 70)

    for ext in ["RV32B", "RV64B"]:
        mnemonics = sorted(set(stats.by_extension[ext]))
        lines.append(f"\n{ext}: {len(mnemonics)} unique mnemonics")

        # Show in rows of 10
        for i in range(0, len(mnemonics), 10):
            chunk = mnemonics[i:i+10]
            lines.append(f"  {', '.join(chunk)}")

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


def replace_xlen_in_instructions(instructions: List[Instruction]):
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


def main():
    """Main extraction pipeline."""
    print("=" * 70)
    print("RISC-V B EXTENSION INSTRUCTION EXTRACTOR")
    print("=" * 70)
    print()

    stats = ExtractionStats()

    # Fetch official manual
    html_content = fetch_html(OFFICIAL_ISA_URL)

    # Parse HTML
    soup = BeautifulSoup(html_content, 'lxml')

    # Step 1: Find section 29.4 table
    table = find_section_29_4_table(soup)

    if not table:
        print("✗ Could not find section 29.4 table. Exiting.")
        sys.exit(1)

    # Step 2: Extract instructions from table
    instructions = extract_instructions_from_table(table, soup, stats)

    if not instructions:
        print("✗ No instructions extracted. Exiting.")
        sys.exit(1)

    # Step 3: Enrich with details from anchor links
    enrich_instructions_with_details(instructions, soup)

    # Step 4: Replace XLEN with variant-specific values (32 or 64)
    replace_xlen_in_instructions(instructions)

    # Generate outputs
    print(f"\n{'=' * 70}")
    print("APPENDING TO EXISTING INSTRUCTIONS")
    print(f"{'=' * 70}")
    print(f"Target file: {OUTPUT_JSON}")
    print(f"New RVB instructions to add: {len(instructions)}")
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
        print("  Creating new file with RVB instructions only...")

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

    # Write JSON
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)

    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(combined_instructions, f, indent=2, ensure_ascii=False)

    print(f"\n✓ Saved {len(combined_instructions)} total instructions to {OUTPUT_JSON}")
    print(f"  Previous count: {len(existing_instructions)}")
    print(f"  Added: {len(new_instructions)}")
    if duplicates_found > 0:
        print(f"  Skipped duplicates: {duplicates_found}")

    # Write report (RVB-specific)
    report_text = generate_report(stats, instructions)

    with open(OUTPUT_REPORT, 'w', encoding='utf-8') as f:
        f.write(report_text)

    print(f"\n✓ Wrote RVB-specific report to {OUTPUT_REPORT}")

    print(f"\n{'=' * 70}")
    print("EXTRACTION COMPLETE")
    print(f"{'=' * 70}")
    print(f"RVB instructions extracted: {len(instructions)}")
    print(f"Total instructions in database: {len(combined_instructions)}")
    print(f"Output files:")
    print(f"  - {OUTPUT_JSON}")
    print(f"  - {OUTPUT_REPORT}")


if __name__ == "__main__":
    main()
