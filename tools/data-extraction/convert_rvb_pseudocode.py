#!/usr/bin/env python3
"""
RVB Pseudocode Conversion Script

Applies the Sail-to-C converter to all RVB instructions in the instructions.json file.
Creates a backup before modifying and generates a conversion report.

Usage:
    python3 convert_rvb_pseudocode.py [--dry-run] [--verbose]

Author: Claude Code
Date: 2025-11-23
"""

import json
import sys
import os
from pathlib import Path
from datetime import datetime
import argparse

# Import the converter
from sail_to_c_converter import SailToCConverter


def main():
    """Main conversion script"""
    parser = argparse.ArgumentParser(description='Convert RVB pseudocode from Sail to C style')
    parser.add_argument('--dry-run', action='store_true', help='Show conversions without saving')
    parser.add_argument('--verbose', action='store_true', help='Show detailed conversion info')
    parser.add_argument('--instructions-file', default='/work/mewais/architect.io/src/data/instructions.json',
                        help='Path to instructions.json file')

    args = parser.parse_args()

    # Load instructions
    instructions_path = Path(args.instructions_file)

    if not instructions_path.exists():
        print(f"Error: Instructions file not found: {instructions_path}")
        sys.exit(1)

    print("="*70)
    print("RVB PSEUDOCODE CONVERTER")
    print("="*70)
    print(f"Instructions file: {instructions_path}")
    print(f"Dry run: {args.dry_run}")
    print(f"Verbose: {args.verbose}")
    print()

    # Load JSON
    print("Loading instructions...")
    with open(instructions_path, 'r') as f:
        instructions = json.load(f)

    print(f"Total instructions loaded: {len(instructions)}")

    # Find RVB instructions
    rvb_instructions = [
        (i, instr) for i, instr in enumerate(instructions)
        if 'RV32B' in instr.get('extension', '') or 'RV64B' in instr.get('extension', '')
    ]

    print(f"RVB instructions found: {len(rvb_instructions)}")
    print()

    # Create converter
    converter = SailToCConverter(verbose=args.verbose)

    # Track conversions
    converted_count = 0
    skipped_count = 0
    error_count = 0

    conversion_log = []

    # Process each RVB instruction
    for idx, instr in rvb_instructions:
        mnemonic = instr.get('mnemonic', 'UNKNOWN')
        pseudocode = instr.get('pseudocode', '')

        if not pseudocode or not pseudocode.strip():
            skipped_count += 1
            continue

        # Check if it looks like Sail code (has 'let', 'foreach', 'function', etc.)
        is_sail = any(keyword in pseudocode for keyword in ['let ', 'foreach', 'function ', 'val '])

        if not is_sail:
            skipped_count += 1
            if args.verbose:
                print(f"  [{mnemonic}] Skipping - already C-style or simple")
            continue

        # Convert
        try:
            converted = converter.convert(pseudocode)

            if converted != pseudocode:
                converted_count += 1

                conversion_log.append({
                    'mnemonic': mnemonic,
                    'extension': instr.get('extension', ''),
                    'original': pseudocode,
                    'converted': converted
                })

                # Update the instruction (unless dry run)
                if not args.dry_run:
                    instructions[idx]['pseudocode'] = converted

                if args.verbose:
                    print(f"  [{mnemonic}] Converted successfully")
                    print(f"    Original:\n{pseudocode[:100]}...")
                    print(f"    Converted:\n{converted[:100]}...")
                    print()
            else:
                skipped_count += 1
                if args.verbose:
                    print(f"  [{mnemonic}] No changes needed")

        except Exception as e:
            error_count += 1
            print(f"  [ERROR] {mnemonic}: {e}")
            conversion_log.append({
                'mnemonic': mnemonic,
                'extension': instr.get('extension', ''),
                'error': str(e)
            })

    # Print summary
    print()
    print("="*70)
    print("CONVERSION SUMMARY")
    print("="*70)
    print(f"Total RVB instructions: {len(rvb_instructions)}")
    print(f"Converted: {converted_count}")
    print(f"Skipped: {skipped_count}")
    print(f"Errors: {error_count}")
    print()

    # Save results (unless dry run)
    if not args.dry_run and converted_count > 0:
        # Create backup
        backup_path = instructions_path.with_suffix('.json.backup.' + datetime.now().strftime('%Y%m%d_%H%M%S'))
        print(f"Creating backup: {backup_path}")
        with open(backup_path, 'w') as f:
            json.dump(instructions, f, indent=2)

        # Save updated instructions
        print(f"Saving updated instructions: {instructions_path}")
        with open(instructions_path, 'w') as f:
            json.dump(instructions, f, indent=2)

        # Save conversion report
        report_path = Path(__file__).parent / f"conversion_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        print(f"Saving conversion report: {report_path}")
        with open(report_path, 'w') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'total_rvb': len(rvb_instructions),
                'converted': converted_count,
                'skipped': skipped_count,
                'errors': error_count,
                'conversions': conversion_log
            }, f, indent=2)

        print()
        print("Conversion complete!")
    elif args.dry_run:
        print("DRY RUN - No files modified")
        print()
        print("Sample conversions:")
        for log in conversion_log[:3]:
            if 'error' not in log:
                print(f"\n[{log['mnemonic']}]")
                print("BEFORE:")
                print(log['original'])
                print("\nAFTER:")
                print(log['converted'])
                print()
    else:
        print("No conversions performed")

    print("="*70)


if __name__ == "__main__":
    main()
