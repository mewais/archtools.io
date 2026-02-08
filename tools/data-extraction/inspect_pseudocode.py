#!/usr/bin/env python3
"""
Quick inspection tool for pseudocode in instructions.json

Usage:
    python3 inspect_pseudocode.py                    # Show statistics
    python3 inspect_pseudocode.py <mnemonic>         # Show specific instruction
    python3 inspect_pseudocode.py --missing          # List missing pseudocode
    python3 inspect_pseudocode.py --sample 10        # Show 10 random examples
"""

import json
import sys
import random
from pathlib import Path


def load_instructions():
    """Load the instructions JSON file."""
    project_root = Path(__file__).parent.parent.parent
    json_path = project_root / 'src' / 'data' / 'instructions.json'

    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def show_statistics(instructions):
    """Display statistics about pseudocode coverage."""
    total = len(instructions)
    with_pseudocode = sum(1 for inst in instructions if inst.get('pseudocode', '').strip())
    without_pseudocode = total - with_pseudocode

    print("=" * 80)
    print("PSEUDOCODE COVERAGE STATISTICS")
    print("=" * 80)
    print(f"\nTotal instructions:      {total}")
    print(f"With pseudocode:         {with_pseudocode} ({100*with_pseudocode/total:.1f}%)")
    print(f"Without pseudocode:      {without_pseudocode} ({100*without_pseudocode/total:.1f}%)")
    print("\n" + "=" * 80)


def show_instruction(instructions, mnemonic):
    """Display a specific instruction's pseudocode."""
    matches = [inst for inst in instructions if inst['mnemonic'].upper() == mnemonic.upper()]

    if not matches:
        print(f"No instruction found with mnemonic: {mnemonic}")
        return

    for inst in matches:
        print("=" * 80)
        print(f"Instruction: {inst['mnemonic']}")
        print("=" * 80)
        print(f"Category:    {inst.get('category', 'N/A')}")
        print(f"Format:      {inst.get('format', 'N/A')}")
        print(f"Extension:   {inst.get('extension', 'N/A')}")
        print(f"Encoding:    {inst.get('encoding', 'N/A')}")
        print(f"\nDescription:\n{inst.get('description', 'N/A')}")
        print(f"\nPseudocode:")
        pseudocode = inst.get('pseudocode', '')
        if pseudocode:
            print(pseudocode)
        else:
            print("(No pseudocode available)")
        print("=" * 80)
        print()


def show_missing(instructions):
    """List all instructions missing pseudocode."""
    missing = [inst for inst in instructions if not inst.get('pseudocode', '').strip()]

    print("=" * 80)
    print(f"INSTRUCTIONS MISSING PSEUDOCODE ({len(missing)} total)")
    print("=" * 80)

    if missing:
        for inst in missing:
            print(f"\n{inst['mnemonic']:15} | {inst.get('extension', 'N/A'):10} | {inst.get('encoding', 'N/A')[:30]}")
            print(f"  Description: {inst.get('description', 'N/A')[:70]}...")
    else:
        print("\nAll instructions have pseudocode!")

    print("=" * 80)


def show_samples(instructions, count=10):
    """Show random sample of instructions with pseudocode."""
    with_code = [inst for inst in instructions if inst.get('pseudocode', '').strip()]
    samples = random.sample(with_code, min(count, len(with_code)))

    print("=" * 80)
    print(f"RANDOM SAMPLE ({count} instructions)")
    print("=" * 80)

    for inst in samples:
        pseudocode = inst.get('pseudocode', '')
        preview = pseudocode[:60].replace('\n', ' ') + '...' if len(pseudocode) > 60 else pseudocode.replace('\n', ' ')
        print(f"\n{inst['mnemonic']:15} | {inst.get('extension', 'N/A'):10}")
        print(f"  {preview}")

    print("\n" + "=" * 80)


def main():
    """Main entry point."""
    instructions = load_instructions()

    if len(sys.argv) == 1:
        # No arguments - show statistics
        show_statistics(instructions)

    elif sys.argv[1] == '--missing':
        # Show missing pseudocode
        show_missing(instructions)

    elif sys.argv[1] == '--sample':
        # Show random samples
        count = int(sys.argv[2]) if len(sys.argv) > 2 else 10
        show_samples(instructions, count)

    elif sys.argv[1] in ['--help', '-h']:
        # Show help
        print(__doc__)

    else:
        # Show specific instruction
        mnemonic = sys.argv[1]
        show_instruction(instructions, mnemonic)


if __name__ == '__main__':
    main()
