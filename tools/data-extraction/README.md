# RISC-V Instruction Data Extraction Tools

This directory contains tools for extracting RISC-V instruction metadata from official specifications and generating the `instructions.json` database.

---

## Overview

The extraction pipeline generates a comprehensive database of 1,312 RISC-V instructions across 26 extensions with:
- Instruction encodings
- Descriptions
- Pseudocode (C-style, unified format)
- Operand information
- Educational examples

**Pipeline Output**: `/work/mewais/architect.io/src/data/instructions.json`

---

## Complete Generation Pipeline

To regenerate `instructions.json` from scratch:

```bash
cd /work/mewais/architect.io/tools/data-extraction

# Step 1: Remove existing instructions.json
rm ../../src/data/instructions.json

# Step 2: Run extractions (creates and appends to instructions.json)
python3 -m rvg.extract_RVG      # Base ISA: 413 instructions
python3 -m rvb.extract_RVB      # Bit manipulation: 75 instructions
python3 -m rvc.extract_RVC      # Compressed: 74 instructions
python3 -m rvv.extract_RVV      # Vector: 750 instructions

# Step 3: Move to correct location
mv src/data/instructions.json ../../src/data/instructions.json

# Step 4: Convert RVB from Sail to C-style
python3 convert_rvb_pseudocode.py --instructions-file ../../src/data/instructions.json

# Step 5: Apply manual pseudocode additions from diff
python3 apply_pseudocode_final.py

# Step 6: Fix remaining Sail-style instructions
python3 fix_sail_instructions.py

# Step 7: Verify results
python3 inspect_pseudocode.py
```

**Expected Final State**:
- Total instructions: 1,312
- With pseudocode: 1,310 (99.8%)
- Without pseudocode: 2 (both C.NOP - intentionally simple)
- Sail-style patterns: 0 (100% C-style)

---

## Directory Structure

```
data-extraction/
├── rvg/
│   ├── extract_RVG.py          # Base ISA extractor (I, M, A, F, D, Q, Zfh, etc.)
│   └── __init__.py
├── rvb/
│   ├── extract_RVB.py          # Bit manipulation extractor
│   └── __init__.py
├── rvc/
│   ├── extract_RVC.py          # Compressed instructions extractor
│   └── __init__.py
├── rvv/
│   ├── extract_RVV.py          # Vector extension extractor
│   └── __init__.py
├── pseudoinstructions/
│   ├── extract_pseudo.py       # Pseudoinstruction extractor
│   └── __init__.py
├── encoding_parser.py          # Shared encoding field parser
├── pseudocode_formatter.py     # Pseudocode formatting utilities
├── sail_to_c_converter.py      # Sail → C-style converter engine
├── convert_rvb_pseudocode.py   # RVB conversion script
├── apply_pseudocode_final.py   # Apply pseudocode from manual diff
├── fix_sail_instructions.py    # Fix remaining Sail patterns
├── inspect_pseudocode.py       # Verification and inspection tool
└── README.md                   # This file
```

---

## Tool Descriptions

### 1. Extraction Scripts

#### `rvg/extract_RVG.py`
Extracts base ISA instructions (RV32/64 I, M, A, F, D, Q, Zfh, Zicsr, Zifencei, Zawrs).

**Data Sources**:
- Encodings: Official RISC-V ISA manual
- Descriptions/Pseudocode: msyksphinz community documentation

**Output**: 413 instructions in C-style pseudocode

#### `rvb/extract_RVB.py`
Extracts bit manipulation extension instructions.

**Data Sources**:
- Encodings: Official RISC-V bitmanip spec
- Pseudocode: Official spec (Sail format)

**Output**: 75 instructions in Sail format (converted to C-style in Step 4)

#### `rvc/extract_RVC.py`
Extracts compressed (16-bit) instructions.

**Data Sources**:
- Encodings: Official RISC-V ISA manual
- Pseudocode: Expansion definitions

**Output**: 74 instructions

#### `rvv/extract_RVV.py`
Extracts vector extension instruction encodings.

**Data Sources**:
- Encodings: riscv-opcodes repository

**Output**: 750 instructions (encodings only; pseudocode added in Step 5)

**Note**: RVV pseudocode is manually curated and applied via the manual diff.

---

### 2. Conversion & Processing Tools

#### `sail_to_c_converter.py`
Engine for converting Sail-style pseudocode to C-style.

**Sail Syntax Patterns Converted**:
- `let x = value` → `x = value`
- `X(rs1)` → `x[rs1]`
- `foreach (i from a to b by s)` → `for (i = a; i <= b; i += s)`
- `if x then y else z` → `(x) ? y : z`
- Type annotations removed: `val x : bits(32)` → `x`

**Usage**: Called by `convert_rvb_pseudocode.py`

#### `convert_rvb_pseudocode.py`
Applies Sail-to-C conversion to RVB instructions.

**Usage**:
```bash
python3 convert_rvb_pseudocode.py --instructions-file ../../src/data/instructions.json [--verbose]
```

**Results**: Converts 56 out of 75 RVB instructions (19 already C-style)

#### `apply_pseudocode_final.py`
Applies pseudocode from `instructions_manual.diff` to empty pseudocode fields.

**Features**:
- Multi-instruction hunk handling
- Cross-hunk encoding tracking
- JSON escape sequence decoding
- Selective application (only to empty fields)

**Usage**:
```bash
python3 apply_pseudocode_final.py
```

**Results**: Applies 818 pseudocode additions (primarily RVV and other manually curated entries)

#### `fix_sail_instructions.py`
Manually fixes the 5 remaining Sail-style instructions that the converter can't handle.

**Instructions Fixed**:
- CLMULH (RV32B, RV64B) - Complex `foreach` patterns
- CPOPW (RV64B) - Unusual increment syntax
- CTZ (RV32B, RV64B) - Decrement loop with function inlining

**Usage**:
```bash
python3 fix_sail_instructions.py
```

---

### 3. Verification Tools

#### `inspect_pseudocode.py`
Interactive inspection and verification tool.

**Usage**:
```bash
# Show statistics
python3 inspect_pseudocode.py

# Show specific instruction
python3 inspect_pseudocode.py FENCE.TSO

# List instructions missing pseudocode
python3 inspect_pseudocode.py --missing

# Show random sample
python3 inspect_pseudocode.py --sample 10
```

**Output Example**:
```
================================================================================
PSEUDOCODE COVERAGE STATISTICS
================================================================================

Total instructions:      1312
With pseudocode:         1310 (99.8%)
Without pseudocode:      2 (0.2%)
```

---

## Data Sources

### Primary Sources
1. **RISC-V ISA Manual**: https://github.com/riscv/riscv-isa-manual
   - Official instruction encodings
   - Authoritative specifications

2. **msyksphinz Community Docs**: https://msyksphinz-self.github.io/riscv-isadoc
   - C-style pseudocode
   - Educational descriptions

3. **riscv-opcodes**: https://github.com/riscv/riscv-opcodes
   - Encoding definitions
   - Used for RVV

4. **Manual Additions**: `src/data/instructions_manual.diff`
   - Hand-written pseudocode for complex instructions
   - RVV pseudocode (not extracted from sources)
   - Edge case fixes

### Pseudocode Philosophy

**Goal**: Unified C-style pseudocode for educational clarity

**Why C-style over Sail**:
- More accessible to students
- Familiar syntax for most programmers
- Easier to parse for code generation
- Consistent across all extensions

**Sail Format** (official RISC-V spec language):
```
let rs1_val = X(rs1);
foreach (i from 0 to (xlen - 1) by 1) {
    output = if ((rs2_val >> i) & 1) then output ^ (rs1_val << i) else output;
}
```

**C-style Format** (our target):
```c
rs1_val = x[rs1];
for (i = 0; i <= xlen - 1; i++) {
    output = (((rs2_val >> i) & 1)) ? output ^ (rs1_val << i) : output;
}
```

---

## Pipeline Details

### Step 1: Extraction (RVG, RVB, RVC, RVV)

Each extractor:
1. Fetches data from authoritative sources
2. Parses encoding fields
3. Extracts descriptions and pseudocode
4. Generates JSON instruction objects
5. Appends to `instructions.json`

**Merge Strategy**: Each script appends to the existing file, allowing sequential execution.

### Step 2: Sail-to-C Conversion

The `sail_to_c_converter.py` engine:
1. Extracts function definitions
2. Inlines function calls
3. Converts Sail syntax to C-style
4. Normalizes register access (`X(rs1)` → `x[rs1]`)
5. Formats output

**Coverage**: Handles 56 out of 75 RVB instructions automatically.

### Step 3: Manual Diff Application

The `apply_pseudocode_final.py` script:
1. Parses unified diff file (`instructions_manual.diff`)
2. Builds encoding map across all hunks
3. Extracts pseudocode changes
4. Applies only to empty pseudocode fields
5. Saves updated JSON

**Key Challenge**: Multiple instructions per hunk, encodings outside hunk context.

### Step 4: Sail Pattern Fixes

The `fix_sail_instructions.py` script applies hardcoded fixes for edge cases the converter can't handle:
- Complex `foreach` patterns with unusual bounds
- Function definitions with inlining issues
- Decrement loops

---

## Extension Coverage

| Extension | Count | Description |
|-----------|-------|-------------|
| RV32I | 42 | Base integer instructions (32-bit) |
| RV64I | 57 | Base integer instructions (64-bit) |
| RV32M | 8 | Integer multiply/divide (32-bit) |
| RV64M | 13 | Integer multiply/divide (64-bit) |
| RV32A | 11 | Atomic instructions (32-bit) |
| RV64A | 22 | Atomic instructions (64-bit) |
| RV32F | 26 | Single-precision floating-point |
| RV64F | 30 | Single-precision floating-point (64-bit) |
| RV32D | 26 | Double-precision floating-point |
| RV64D | 32 | Double-precision floating-point (64-bit) |
| RV32Q | 28 | Quad-precision floating-point |
| RV64Q | 32 | Quad-precision floating-point (64-bit) |
| RV32B | 32 | Bit manipulation (32-bit) |
| RV64B | 43 | Bit manipulation (64-bit) |
| RV32C | 37 | Compressed instructions (32-bit) |
| RV64C | 37 | Compressed instructions (64-bit) |
| RV32V | 375 | Vector operations (32-bit) |
| RV64V | 375 | Vector operations (64-bit) |
| RV32Zfh | 32 | Half-precision float (32-bit) |
| RV64Zfh | 36 | Half-precision float (64-bit) |
| RV32Zicsr | 6 | CSR instructions |
| RV64Zicsr | 6 | CSR instructions |
| RV32Zifencei | 1 | Instruction fence |
| RV64Zifencei | 1 | Instruction fence |
| RV32Zawrs | 2 | Wait-on-reservation-set |
| RV64Zawrs | 2 | Wait-on-reservation-set |

**Total**: 1,312 instructions across 26 extensions

---

## Dependencies

### Python Version
- Python 3.6+ (f-strings, type hints)

### Standard Library
- `json` - JSON parsing
- `re` - Regular expressions
- `pathlib` - Path handling
- `typing` - Type annotations

### External Libraries
```bash
pip install requests beautifulsoup4 lxml
```

---

## Troubleshooting

### Extraction Fails

**Problem**: Network errors during extraction

**Solution**:
```bash
# Check source URLs are accessible
curl -I https://github.com/riscv/riscv-isa-manual
curl -I https://msyksphinz-self.github.io/riscv-isadoc
```

### Import Errors

**Problem**: `ImportError: attempted relative import with no known parent package`

**Solution**: Always run from tools directory using module syntax:
```bash
cd /work/mewais/architect.io/tools
python3 -m data-extraction.rvg.extract_RVG  # ✓ Correct
python3 rvg/extract_RVG.py                  # ✗ Wrong
```

### Wrong Output Path

**Problem**: Scripts write to `tools/data-extraction/src/data/instructions.json`

**Solution**: Move file after extraction:
```bash
mv tools/data-extraction/src/data/instructions.json src/data/instructions.json
```

### Incomplete Pseudocode

**Problem**: Some instructions missing pseudocode after pipeline

**Solution**:
1. Check `instructions_manual.diff` includes all needed additions
2. Re-run `apply_pseudocode_final.py`
3. Verify with `inspect_pseudocode.py --missing`

---

## Key Files

### Input Files
- `src/data/instructions_manual.diff` - Manual pseudocode additions/corrections
- External web sources (RISC-V specs, community docs)

### Output Files
- `src/data/instructions.json` - Final instruction database (1,312 instructions)
- `src/data/pseudoinstructions.json` - Assembler pseudo-instructions (~40)

### Generated Reports (not committed)
- `rvg/extraction_report_RVG.txt`
- `rvb/extraction_report_RVB.txt`
- `rvc/extraction_report_RVC.txt`
- `rvv/extraction_report_RVV.txt`
- `conversion_report_*.json`

---

## Design Philosophy

### 1. Separation of Concerns
Each tool has one job:
- Extractors: Get data from sources
- Converters: Transform syntax
- Appliers: Merge manual additions
- Fixers: Handle edge cases
- Inspectors: Verify results

### 2. Idempotency
Running the pipeline multiple times produces the same result. Each step checks current state before applying changes.

### 3. Traceability
All changes are traceable:
- Extractions: Link to source URLs
- Conversions: Show before/after
- Manual additions: Tracked in diff file
- Fixes: Hardcoded with documentation

### 4. Automation First
98%+ of instructions processed automatically. Manual intervention only for edge cases that can't be algorithmically handled.

---

## Future Improvements

1. **Enhanced Sail Parser**: Handle more edge cases automatically
2. **Unified Diff Updates**: Script to add new manual entries to diff file
3. **Source Tracking**: Add metadata for pseudocode provenance
4. **Verification Suite**: Automated testing of pseudocode validity
5. **Additional Extensions**: Support for new RISC-V extensions (Crypto, Hypervisor, etc.)

---

## License

Part of the Architect.io educational platform. See main repository for license details.
