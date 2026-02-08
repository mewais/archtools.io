#!/usr/bin/env python3
"""
Sail-to-C Pseudocode Converter for RISC-V Instructions

Converts Sail-style pseudocode (used in RVB instructions) to C-style pseudocode
(used in RVG and RVV instructions) for consistency in the instruction database.

This converter handles:
- Function definitions with inlining
- foreach loops -> for loops (inc/dec variants)
- if-then-else -> ternary operators or if-else blocks
- Sail register syntax -> C array syntax
- Binary literals and type annotations

Author: Claude Code
Date: 2025-11-23
"""

import re
from typing import Dict
from dataclasses import dataclass


@dataclass
class FunctionDef:
    """Represents a parsed Sail function definition"""
    name: str
    param: str
    body: str


class SailToCConverter:
    """
    Converts Sail-style pseudocode to C-style pseudocode.

    Simple and maintainable converter for common Sail patterns in RVB instructions.
    """

    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.functions: Dict[str, FunctionDef] = {}

    def log(self, message: str) -> None:
        """Print debug messages if verbose mode is enabled"""
        if self.verbose:
            print(f"[DEBUG] {message}")

    def convert(self, sail_pseudocode: str) -> str:
        """
        Main conversion method

        Args:
            sail_pseudocode: Sail-style pseudocode string

        Returns:
            C-style pseudocode string
        """
        if not sail_pseudocode or not sail_pseudocode.strip():
            return sail_pseudocode

        try:
            self.functions = {}
            code = sail_pseudocode

            # Step 1: Extract function definitions
            code = self._extract_functions(code)

            # Step 2: Inline functions
            code = self._inline_functions(code)

            # Step 3: Convert Sail syntax
            code = self._convert_syntax(code)

            # Step 4: Format output
            code = self._format_output(code)

            return code

        except Exception as e:
            self.log(f"Conversion failed: {e}")
            if self.verbose:
                import traceback
                traceback.print_exc()
            return sail_pseudocode

    def _extract_functions(self, code: str) -> str:
        """Extract function definitions for later inlining"""
        pattern = r'(?:val\s+(\w+)\s*:.*?\n)?function\s+(\w+)\s+(\w+)\s*=\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}'

        def extract(match):
            val_name = match.group(1)
            func_name = match.group(2)
            param = match.group(3)
            body = match.group(4).strip()

            name = val_name if val_name else func_name
            self.functions[name] = FunctionDef(name=name, param=param, body=body)
            self.log(f"Extracted function: {name}({param})")

            return ""  # Remove from code

        return re.sub(pattern, extract, code, flags=re.MULTILINE | re.DOTALL).strip()

    def _inline_functions(self, code: str) -> str:
        """Inline function calls by extracting them to separate statements before the usage"""
        for func_name, func_def in self.functions.items():
            # Find all function calls and their context (full lines containing them)
            lines = code.split('\n')
            new_lines = []

            for line in lines:
                # Check if this line contains a function call
                pattern = rf'\b{func_name}\s*\(([^)]+)\)'
                match = re.search(pattern, line)

                if match:
                    arg = match.group(1).strip()
                    body = func_def.body

                    # Replace parameter with argument
                    if func_def.param:
                        body = re.sub(rf'\b{func_def.param}\b', arg, body)

                    # Convert function body to inline block
                    result_var = f"{func_name.lower()}_result"
                    func_lines = []

                    # Parse the body to find loops and returns
                    body_lines = body.split('\n')
                    i = 0
                    has_loop = False
                    loop_body = []
                    init_value = '-1'

                    while i < len(body_lines):
                        body_line = body_lines[i].strip()
                        if not body_line:
                            i += 1
                            continue

                        # Convert foreach loops
                        body_line = self._convert_foreach_line(body_line)

                        # Check if this is a for/foreach loop
                        if body_line.startswith('for (') or body_line.startswith('foreach'):
                            has_loop = True
                            loop_header = body_line
                            # Start collecting loop body
                            loop_body = [loop_header + ' {']
                            i += 1
                            continue

                        # Handle if...then return(value) inside loop
                        if 'if' in body_line and 'return' in body_line:
                            m = re.search(r'if\s+(.+?)\s+then\s+return\s*\(([^)]+)\)', body_line)
                            if m:
                                cond = m.group(1).strip()
                                ret_val = m.group(2).strip()
                                # Clean up condition
                                cond = re.sub(r'\[(\w+\[\w+\])\]', r'\1', cond)
                                cond = cond.replace('0b1', '1').replace('0b0', '0')
                                if has_loop:
                                    loop_body.append(f"    if ({cond}) {{")
                                    loop_body.append(f"        {result_var} = {ret_val};")
                                    loop_body.append(f"        break;")
                                    loop_body.append(f"    }}")
                                else:
                                    func_lines.append(f"if ({cond}) {{")
                                    func_lines.append(f"    {result_var} = {ret_val};")
                                    func_lines.append(f"}}")
                                i += 1
                                continue

                        # Handle standalone return
                        if 'return' in body_line:
                            ret_val = re.sub(r'.*return\s+(.+);?', r'\1', body_line).strip()
                            init_value = ret_val
                            i += 1
                            continue

                        i += 1

                    # Close the loop if we have one
                    if has_loop:
                        loop_body.append('}')
                        # Initialize before loop
                        func_lines.insert(0, f"{result_var} = {init_value};")
                        func_lines.extend(loop_body)
                    else:
                        # No loop, just initialize
                        func_lines.insert(0, f"{result_var} = {init_value};")

                    # Add all function lines before the current line
                    new_lines.extend(func_lines)

                    # Replace the function call with the result variable
                    modified_line = re.sub(pattern, result_var, line)
                    new_lines.append(modified_line)
                else:
                    new_lines.append(line)

            code = '\n'.join(new_lines)

        return code

    def _convert_foreach_line(self, line: str) -> str:
        """Convert a foreach statement to for loop"""

        # Pattern 1: foreach (i from (start) to end by step in dec)
        m = re.match(r'foreach\s*\((\w+)\s+from\s+\(([^)]+)\)\s+to\s+(\d+)(?:\s+by\s+(\d+))?\s+in\s+dec\)', line)
        if m:
            var, start, end, step = m.group(1), m.group(2), m.group(3), m.group(4) or '1'
            op = '--' if step == '1' else f'-= {step}'
            return f"for ({var} = {start}; {var} >= {end}; {var}{op})"

        # Pattern 2: foreach (i from start to (end) by step in dec) - decreasing
        # Note: "from 0 to (xlen-1) in dec" means iterate from xlen-1 down to 0
        m = re.match(r'foreach\s*\((\w+)\s+from\s+(\d+)\s+to\s+\(([^)]+)\)(?:\s+by\s+(\d+))?\s+in\s+dec\)', line)
        if m:
            var, start, end, step = m.group(1), m.group(2), m.group(3), m.group(4) or '1'
            op = '--' if step == '1' else f'-= {step}'
            # Swap start and end for decreasing loops
            return f"for ({var} = {end}; {var} >= {start}; {var}{op})"

        # Pattern 3: foreach (i from start to (end) by step in inc)
        m = re.match(r'foreach\s*\((\w+)\s+from\s+(\d+)\s+to\s+\(([^)]+)\)(?:\s+by\s+(\d+))?\s+in\s+inc\)', line)
        if m:
            var, start, end, step = m.group(1), m.group(2), m.group(3), m.group(4) or '1'
            op = '++' if step == '1' else f'+= {step}'
            return f"for ({var} = {start}; {var} <= {end}; {var}{op})"

        # Pattern 4: foreach (i from start to (end) by step) - default increasing
        m = re.match(r'foreach\s*\((\w+)\s+from\s+(\d+)\s+to\s+\(([^)]+)\)(?:\s+by\s+(\d+))?\s*\)', line)
        if m:
            var, start, end, step = m.group(1), m.group(2), m.group(3), m.group(4) or '1'
            op = '++' if step == '1' else f'+= {step}'
            return f"for ({var} = {start}; {var} <= {end}; {var}{op})"

        # Pattern 5: foreach (i from start to end by step in dec) - both nums
        m = re.match(r'foreach\s*\((\w+)\s+from\s+(\d+)\s+to\s+(\d+)(?:\s+by\s+(\d+))?\s+in\s+dec\)', line)
        if m:
            var, start, end, step = m.group(1), m.group(2), m.group(3), m.group(4) or '1'
            op = '--' if step == '1' else f'-= {step}'
            return f"for ({var} = {start}; {var} >= {end}; {var}{op})"

        return line

    def _convert_syntax(self, code: str) -> str:
        """Convert Sail syntax to C syntax"""

        # Convert foreach loops (for non-function code) - preserve braces
        lines = []
        for line in code.split('\n'):
            converted = self._convert_foreach_line(line)
            # If the line has a trailing brace, preserve it
            if line.strip().endswith('{') and not converted.endswith('{'):
                converted += ' {'
            lines.append(converted)
        code = '\n'.join(lines)

        # Convert if-then-else (multiline)
        code = re.sub(
            r'if\s+([^\n]+)\s*\n\s*then\s+([^\n]+)\s*\n\s*else\s+([^\n;]+)',
            r'(\1) ? \2 : \3',
            code,
            flags=re.MULTILINE
        )

        # Convert if-then-else (inline) - but not when else is ()
        code = re.sub(
            r'if\s+([^t\n]+?)\s+then\s+([^e]+?)\s+else\s+\(\s*\);?',
            r'if (\1) { \2; }',
            code
        )

        # Convert remaining if-then-else to ternary
        code = re.sub(
            r'if\s+([^t\n]+?)\s+then\s+([^e]+?)\s+else\s+([^;\n]+)',
            r'(\1) ? \2 : \3',
            code
        )

        # Remove 'let' keyword
        code = re.sub(r'\blet\s+(\w+)\s*:\s*\w+\s*=', r'\1 =', code)
        code = re.sub(r'\blet\s+', '', code)

        # Convert registers
        code = re.sub(r'\bX\((\w+)\)', r'x[\1]', code)
        code = re.sub(r'\bX\[(\w+)\]', r'x[\1]', code)

        # Remove extra brackets
        code = re.sub(r'\[(\w+\[\w+\])\]', r'\1', code)

        # Convert binary literals
        code = re.sub(r'0b1\b', '1', code)
        code = re.sub(r'0b0\b', '0', code)

        # Convert bit slicing to comments
        code = re.sub(r'(\w+)\[(\d+)\.\.(\d+)\]', r'\1 /* bits \2..\3 */', code)

        # Remove else ()
        code = re.sub(r'else\s*\(\s*\)', '', code)
        code = re.sub(r':\s*\(\s*\)', '', code)  # From ternary

        # Remove type declarations
        code = re.sub(r'val\s+\w+\s*:.*?(?=\n|$)', '', code, flags=re.MULTILINE)

        return code

    def _format_output(self, code: str) -> str:
        """Clean up formatting and add proper indentation"""
        lines = []
        indent_level = 0

        input_lines = code.split('\n')

        for line in input_lines:
            line = line.rstrip()
            if not line or not line.strip():
                continue

            stripped = line.strip()

            # Skip orphan variable references (just a variable name on its own line)
            if re.match(r'^[a-z_]+_result$', stripped):
                continue

            # Decrease indent for closing braces
            if stripped.startswith('}'):
                indent_level = max(0, indent_level - 1)

            # Calculate proper indentation
            indented_line = '    ' * indent_level + stripped

            # Add semicolons to statements that need them
            # Don't add to: for loops, if statements, braces, or already-semicoloned lines
            needs_semicolon = (
                not stripped.endswith((';', '{', '}')) and
                not stripped.startswith(('for ', 'if ', 'else', 'while ')) and
                not re.match(r'^\}', stripped) and
                ('=' in stripped or stripped in ('break', 'continue'))
            )

            if needs_semicolon:
                indented_line += ';'

            # Track opening braces
            if stripped.endswith('{'):
                indent_level += 1

            lines.append(indented_line)

        # Remove duplicate semicolons
        result = '\n'.join(lines)
        result = re.sub(r';;+', ';', result)

        return result


def test_converter():
    """Test suite for Sail-to-C converter"""

    print("="*70)
    print("SAIL-TO-C CONVERTER TEST SUITE")
    print("="*70)

    tests = [
        ("CLZ", """val HighestSetBit : forall ('N : Int), 'N >= 0. bits('N) -> int
function HighestSetBit x = {
foreach (i from (xlen - 1) to 0 by 1 in dec)
if [x[i]] == 0b1 then return(i) else ();
return -1;
}
let rs = X(rs);
X[rd] = (xlen - 1) - HighestSetBit(rs);"""),

        ("ANDN", """X(rd) = X(rs1) & ~X(rs2);"""),

        ("ROL", """let shamt = if xlen == 32
then X(rs2)[4..0]
else X(rs2)[5..0];
let result = (X(rs1) << shamt) | (X(rs1) >> (xlen - shamt));
X(rd) = result;"""),

        ("CLMUL", """let rs1_val = X(rs1);
let rs2_val = X(rs2);
let output : xlenbits = 0;
foreach (i from 0 to (xlen - 1) by 1) {
output = if ((rs2_val >> i) & 1)
then output ^ (rs1_val << i)
else output;
}
X[rd] = output"""),

        ("CTZ", """val LowestSetBit : forall ('N : Int), 'N >= 0. bits('N) -> int
function LowestSetBit x = {
foreach (i from 0 to (xlen - 1) by 1 in dec)
if [x[i]] == 0b1 then return(i) else ();
return xlen;
}
let rs = X(rs);
X[rd] = LowestSetBit(rs);"""),

        ("CPOP", """let bitcount = 0;
let rs = X(rs);
foreach (i from 0 to (xlen - 1) in inc)
if rs[i] == 0b1 then bitcount = bitcount + 1 else ();
X[rd] = bitcount"""),
    ]

    for name, sail_code in tests:
        print(f"\n[TEST] {name}")
        print("-" * 70)
        converter = SailToCConverter(verbose=False)
        c_code = converter.convert(sail_code)
        print("INPUT (Sail):")
        print(sail_code)
        print("\nOUTPUT (C):")
        print(c_code)
        print()

    print("="*70)
    print("TEST SUITE COMPLETE")
    print("="*70)


if __name__ == "__main__":
    test_converter()
