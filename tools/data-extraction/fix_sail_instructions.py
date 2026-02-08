#!/usr/bin/env python3
"""
Fix the 5 remaining Sail-style instructions manually.
"""

import json

def fix_sail_instructions():
    """Apply manual fixes for 5 Sail-style instructions."""

    instructions_file = '/work/mewais/architect.io/src/data/instructions.json'

    with open(instructions_file, 'r') as f:
        instructions = json.load(f)

    # Define fixes by encoding (unique identifier)
    fixes = {
        '0000101xxxxxxxxxx011xxxxx0110011': {
            'old': 'foreach (i from 1 to xlen by 1)',
            'new': """rs1_val = x[rs1];
rs2_val = x[rs2];
output = 0;
for (i = 1; i <= xlen; i++) {
    output = (((rs2_val >> i) & 1)) ? output ^ (rs1_val >> (xlen - i)) : output;
}
x[rd] = output"""
        },
        '011000000010xxxxx001xxxxx0011011': {
            'old': 'foreach (i from 0 to 31 in inc)',
            'new': """bitcount = 0;
val = x[rs];
for (i = 0; i <= 31; i++) {
    if (val[i] == 1) bitcount = bitcount + 1;
}
x[rd] = bitcount"""
        },
        '011000000001xxxxx001xxxxx0010011': {
            'old': 'foreach (i from 0 to (xlen - 1) by 1 in dec)',
            'new': """rs = x[rs];
result = xlen;
for (i = 0; i < xlen; i++) {
    if (rs[i] == 1) { result = i; break; }
}
x[rd] = result"""
        },
    }

    fixed_count = 0

    for inst in instructions:
        encoding = inst.get('encoding', '')
        pseudocode = inst.get('pseudocode', '')

        if encoding in fixes:
            # Check if this instruction still has the old Sail pattern
            if fixes[encoding]['old'] in pseudocode:
                inst['pseudocode'] = fixes[encoding]['new']
                fixed_count += 1
                print(f"✓ Fixed {inst.get('mnemonic')} ({inst.get('extension')}) - encoding {encoding}")

    # Save
    with open(instructions_file, 'w') as f:
        json.dump(instructions, f, indent=2)

    print(f"\n✓ Fixed {fixed_count} Sail-style instructions")
    return fixed_count


if __name__ == '__main__':
    print("="*70)
    print("FIXING SAIL-STYLE INSTRUCTIONS")
    print("="*70)
    print()

    count = fix_sail_instructions()

    print()
    print("="*70)
    print("COMPLETE")
    print("="*70)
