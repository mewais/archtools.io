#!/usr/bin/env python3
"""
Pseudocode Formatting Utility

Formats C/C++-style and Sail-style pseudocode for improved readability.
Adds proper indentation, whitespace, and line breaks while preserving semantics.
"""

import re
from typing import List


class PseudocodeFormatter:
    """Base class for pseudocode formatting."""

    @staticmethod
    def detect_format(code: str) -> str:
        """
        Detect pseudocode format type.

        Returns:
            'sail', 'c-like', 'expansion', or 'unknown'
        """
        if not code or not code.strip():
            return 'unknown'

        # Sail indicators
        sail_patterns = [
            r'\blet\s+\w+\s*:\s*\w+',  # let x : type
            r'\bforeach\s*\(',          # foreach loops
            r'\bfunction\s+\w+',         # function definitions
            r'\bval\s+\w+\s*:',          # val declarations
            r'X\(',                       # X(rs1) register access
            r'\bthen\b',                  # if-then-else
        ]

        for pattern in sail_patterns:
            if re.search(pattern, code):
                return 'sail'

        # Expansion indicator (compressed instructions)
        if code.strip().startswith('C.') and '→' in code or 'expands to' in code.lower():
            return 'expansion'

        # Default to C-like
        return 'c-like'


class CFormatter:
    """Formats C/C++-style pseudocode."""

    def format(self, code: str) -> str:
        """
        Format C/C++ style pseudocode.

        Transformations:
        - Add newlines after semicolons
        - Add spacing around operators
        - Indent control flow blocks
        - Preserve bit-slice notation
        """
        if not code or not code.strip():
            return code

        # Split by semicolons but preserve them
        # Avoid splitting inside brackets (e.g., M[x[rs1]][7:0])
        lines = self._split_by_semicolon(code)

        # Format each line
        formatted_lines = []
        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Add spacing around operators (but preserve bit slices)
            line = self._add_operator_spacing(line)

            formatted_lines.append(line)

        # Handle multi-line if statements
        result = self._format_control_flow(formatted_lines)

        return result

    def _split_by_semicolon(self, code: str) -> List[str]:
        """
        Split code by semicolons, respecting nested brackets.
        """
        lines = []
        current = []
        bracket_depth = 0

        for char in code:
            if char in '[({':
                bracket_depth += 1
            elif char in '])}':
                bracket_depth -= 1
            elif char == ';' and bracket_depth == 0:
                current.append(char)
                lines.append(''.join(current).strip())
                current = []
                continue

            current.append(char)

        # Add remaining content
        if current:
            remainder = ''.join(current).strip()
            if remainder:
                lines.append(remainder)

        return lines

    def _add_operator_spacing(self, line: str) -> str:
        """Add spacing around operators, preserving bit slices."""

        # Don't add spaces inside brackets
        # Use a more careful approach

        # Add spaces around assignment operators
        line = re.sub(r'([^\s<>=!])=([^\s=])', r'\1 = \2', line)

        # Add spaces around comparison operators
        line = re.sub(r'([^\s<>])([<>]=?|[!=]=)([^\s])', r'\1 \2 \3', line)

        # Add spaces around arithmetic operators (but not in bit slices)
        # Be careful with [31:0] notation
        line = re.sub(r'([^\s\[\:])(\+)([^\s])', r'\1 \2 \3', line)
        line = re.sub(r'([^\s])(-)([^\s])', r'\1 \2 \3', line)

        # Add spaces around logical operators
        line = re.sub(r'([^\s])(&{1,2}|(\|{1,2})|(\^))([^\s])', r'\1 \2 \5', line)

        # Clean up multiple spaces
        line = re.sub(r'\s+', ' ', line)

        return line

    def _format_control_flow(self, lines: List[str]) -> str:
        """
        Format if statements and loops with proper indentation.
        """
        result = []
        indent = 0

        for line in lines:
            # Check if this is an if statement
            if line.startswith('if'):
                # Single-line if: if (cond) statement
                if not line.endswith('{'):
                    result.append(line)
                else:
                    result.append(line)
                    indent += 1
            elif line.startswith('for'):
                result.append(line)
                if line.endswith('{'):
                    indent += 1
            elif line.strip() == '}':
                indent = max(0, indent - 1)
                result.append('  ' * indent + line)
            else:
                result.append('  ' * indent + line if indent > 0 else line)

        return '\n'.join(result)


class SailFormatter:
    """Formats Sail-style pseudocode."""

    def format(self, code: str) -> str:
        """
        Format Sail style pseudocode.

        Transformations:
        - Ensure consistent indentation in blocks
        - Add newlines after let bindings
        - Format foreach loops with proper indentation
        - Format if-then-else expressions
        """
        if not code or not code.strip():
            return code

        # Sail pseudocode is often already partially formatted
        # Focus on ensuring consistent indentation

        lines = code.split('\n')
        formatted = []
        indent_level = 0

        for line in lines:
            stripped = line.strip()

            if not stripped:
                continue

            # Detect closing braces
            if stripped.startswith('}'):
                indent_level = max(0, indent_level - 1)

            # Add indented line
            if stripped:
                formatted.append('  ' * indent_level + stripped)

            # Detect opening braces
            if stripped.endswith('{'):
                indent_level += 1

            # Indent after 'then' in multi-line if expressions
            # (But not if entire if-then-else is on one line)
            if 'then' in stripped and 'else' not in stripped and ';' not in stripped:
                # This is a multi-line then clause
                indent_level += 1

            # Dedent after 'else' keyword
            if stripped.startswith('else') and not stripped.endswith('{'):
                indent_level = max(0, indent_level - 1)

        return '\n'.join(formatted)


class PseudocodeFormatterFactory:
    """Factory to create appropriate formatter based on code type."""

    @staticmethod
    def format(code: str) -> str:
        """
        Auto-detect format and apply appropriate formatter.

        Args:
            code: Raw pseudocode string

        Returns:
            Formatted pseudocode string
        """
        if not code or not code.strip():
            return code

        # Detect format
        format_type = PseudocodeFormatter.detect_format(code)

        if format_type == 'sail':
            formatter = SailFormatter()
            return formatter.format(code)
        elif format_type == 'c-like':
            formatter = CFormatter()
            return formatter.format(code)
        else:
            # Unknown or expansion - return as-is
            return code


# Convenience function for use in extraction scripts
def format_pseudocode(code: str, format_hint: str = None) -> str:
    """
    Format pseudocode with optional format hint.

    Args:
        code: Raw pseudocode string
        format_hint: Optional hint ('sail', 'c-like', or None for auto-detect)

    Returns:
        Formatted pseudocode string
    """
    if not code or not code.strip():
        return code

    if format_hint == 'sail':
        formatter = SailFormatter()
        return formatter.format(code)
    elif format_hint == 'c-like':
        formatter = CFormatter()
        return formatter.format(code)
    else:
        # Auto-detect
        return PseudocodeFormatterFactory.format(code)


# Example usage and testing
if __name__ == '__main__':
    # Test C-like formatting
    c_code = "t =pc+4; pc=(x[rs1]+sext(offset))&∼1; x[rd]=t"
    print("C-like Before:")
    print(c_code)
    print("\nC-like After:")
    print(format_pseudocode(c_code, 'c-like'))

    print("\n" + "=" * 70 + "\n")

    # Test Sail formatting
    sail_code = """let rs1_val = X(rs1);
let rs2_val = X(rs2);
let output : xlenbits = 0;
foreach (i from 0 to (xlen - 1) by 1) {
output = if ((rs2_val >> i) & 1)
then output ^ (rs1_val << i);
else output;
}
X[rd] = output"""

    print("Sail Before:")
    print(sail_code)
    print("\nSail After:")
    print(format_pseudocode(sail_code, 'sail'))
