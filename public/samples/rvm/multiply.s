# =============================================================================
# RISC-V Sample Program: Multiplication Operations
# =============================================================================
# Description: Demonstrates the M extension multiplication instructions
# Extension:   RV32M / RV64M (Integer Multiply)
# Difficulty:  Intermediate
#
# This program demonstrates:
#   - MUL (multiply, lower 32 bits of result)
#   - MULH (multiply high, signed x signed)
#   - MULHU (multiply high, unsigned x unsigned)
#   - MULHSU (multiply high, signed x unsigned)
#
# Key Concept: Multiplying two 32-bit numbers can produce a 64-bit result.
# MUL gives the lower 32 bits, MULH variants give the upper 32 bits.
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.text
.globl _start

_start:
    # =================================================================
    # BASIC MULTIPLICATION (MUL)
    # =================================================================
    # MUL rd, rs1, rs2: rd = (rs1 * rs2)[31:0]
    # Returns lower 32 bits of the 64-bit product

    li      t0, 7                   # t0 = 7
    li      t1, 6                   # t1 = 6

    mul     t2, t0, t1              # t2 = 7 * 6 = 42
                                    # Simple multiplication, fits in 32 bits

    # Larger numbers
    li      t3, 1000                # t3 = 1000
    li      t4, 2000                # t4 = 2000

    mul     t5, t3, t4              # t5 = 1000 * 2000 = 2,000,000
                                    # Still fits in 32 bits

    # =================================================================
    # MULTIPLICATION OVERFLOW EXAMPLE
    # =================================================================
    # When the result doesn't fit in 32 bits

    li      a0, 0x10000             # a0 = 65536 (2^16)
    li      a1, 0x10000             # a1 = 65536 (2^16)

    mul     a2, a0, a1              # a2 = 2^16 * 2^16 = 2^32
                                    # But 2^32 doesn't fit in 32 bits!
                                    # a2 = 0 (lower 32 bits of 0x100000000)

    mulhu   a3, a0, a1              # a3 = upper 32 bits = 1
                                    # Full result: 0x00000001_00000000 = 2^32

    # =================================================================
    # FULL 64-BIT PRODUCT
    # =================================================================
    # To get the complete 64-bit result, use both MUL and MULH

    li      s0, 0x12345678          # s0 = 305,419,896
    li      s1, 0x0000ABCD          # s1 = 43,981

    mul     s2, s0, s1              # s2 = lower 32 bits of product
    mulhu   s3, s0, s1              # s3 = upper 32 bits (unsigned)

    # Full 64-bit result is: (s3 << 32) | s2

    # =================================================================
    # SIGNED MULTIPLICATION (MULH)
    # =================================================================
    # MULH: Both operands treated as signed

    li      t0, -10                 # t0 = -10 (signed)
    li      t1, 5                   # t1 = 5 (signed)

    mul     t2, t0, t1              # t2 = -10 * 5 = -50 (0xFFFFFFCE)
                                    # Lower 32 bits of signed product

    mulh    t3, t0, t1              # t3 = upper 32 bits of signed product
                                    # t3 = -1 (0xFFFFFFFF) for negative result

    # Verify: full 64-bit result is 0xFFFFFFFF_FFFFFFCE = -50

    # =================================================================
    # UNSIGNED MULTIPLICATION (MULHU)
    # =================================================================
    # MULHU: Both operands treated as unsigned

    li      t4, 0xFFFFFFFF          # t4 = max unsigned 32-bit (4,294,967,295)
    li      t5, 2                   # t5 = 2

    mul     t6, t4, t5              # t6 = lower 32 bits
                                    # 0xFFFFFFFF * 2 = 0x1FFFFFFFE
                                    # t6 = 0xFFFFFFFE (lower bits)

    mulhu   a4, t4, t5              # a4 = upper 32 bits
                                    # a4 = 1

    # =================================================================
    # MIXED SIGNED/UNSIGNED (MULHSU)
    # =================================================================
    # MULHSU: First operand signed, second unsigned
    # Useful for certain algorithms

    li      s4, -1                  # s4 = -1 (signed: 0xFFFFFFFF)
    li      s5, 2                   # s5 = 2 (unsigned)

    mulhsu  s6, s4, s5              # s6 = upper bits of (-1) * 2u
                                    # Treating -1 as signed and 2 as unsigned
                                    # Result: -2, so upper bits = -1 (0xFFFFFFFF)

    # Compare with treating both as unsigned
    mulhu   s7, s4, s5              # s7 = upper bits of 0xFFFFFFFF * 2
                                    # 0xFFFFFFFF * 2 = 0x1FFFFFFFE
                                    # s7 = 1 (very different from MULHSU!)

    # =================================================================
    # PRACTICAL EXAMPLE: Scaling a Value
    # =================================================================
    # Scale a value by a fraction: result = (value * numerator) / denominator
    # Example: scale 1000 by 75% = 1000 * 3 / 4 = 750

    li      a5, 1000                # a5 = value to scale
    li      a6, 3                   # a6 = numerator (75% = 3/4)
    li      a7, 4                   # a7 = denominator

    mul     s8, a5, a6              # s8 = 1000 * 3 = 3000

    # Division would require DIV instruction (next sample)
    # For now, we can use shift for power-of-2 division
    srai    s9, s8, 2               # s9 = 3000 / 4 = 750 (arithmetic shift right)
                                    # Note: This only works for power-of-2 divisors!

    # =================================================================
    # SQUARING A NUMBER
    # =================================================================

    li      s10, 12345              # s10 = number to square

    mul     s11, s10, s10           # s11 = 12345^2 = 152,399,025
                                    # Fits in 32 bits

    # ----- End of Program -----
    ebreak                          # Terminate execution

# =============================================================================
# Expected Final Register Values:
# =============================================================================
# t0  (x5)  = -10 (0xFFFFFFF6)       # Last value set
# t1  (x6)  = 5                      # Last value set
# t2  (x7)  = -50 (0xFFFFFFCE)       # -10 * 5 (final value overwrites 42)
# t3  (x28) = -1 (0xFFFFFFFF)        # MULH result: upper bits of -10 * 5
# t4  (x29) = 0xFFFFFFFF             # Max unsigned 32-bit
# t5  (x30) = 2                      # Last value set
# t6  (x31) = 0xFFFFFFFE             # (2^32-1) * 2 lower bits
# a0  (x10) = 0x10000                # 65536
# a1  (x11) = 0x10000                # 65536
# a2  (x12) = 0                      # 2^16 * 2^16 lower bits (overflow)
# a3  (x13) = 1                      # 2^16 * 2^16 upper bits
# a4  (x14) = 1                      # MULHU: upper bits of 0xFFFFFFFF * 2
# a5  (x15) = 1000                   # Value to scale
# a6  (x16) = 3                      # Numerator
# a7  (x17) = 4                      # Denominator
# s0  (x8)  = 0x12345678             # 305,419,896
# s1  (x9)  = 0x0000ABCD             # 43,981
# s2  (x18) = 0x89AB6618             # Lower 32 bits of 305419896 * 43981
# s3  (x19) = 0x00000C37             # Upper 32 bits of 305419896 * 43981
# s4  (x20) = -1 (0xFFFFFFFF)        # Signed -1
# s5  (x21) = 2                      # Unsigned 2
# s6  (x22) = -1 (0xFFFFFFFF)        # MULHSU: (-1) * 2u upper bits
# s7  (x23) = 1                      # MULHU: 0xFFFFFFFF * 2 upper bits
# s8  (x24) = 3000                   # 1000 * 3
# s9  (x25) = 750                    # 3000 / 4 (scaling result)
# s10 (x26) = 12345                  # Number to square
# s11 (x27) = 152399025 (0x09156CB1) # 12345^2
#
# Key Learning Points:
# - MUL gives lower 32 bits, MULH* give upper 32 bits
# - Use MULH + MUL to get full 64-bit product
# - MULHSU useful when mixing signed/unsigned (produces different results)
# - Full 64-bit result from s0*s1: 0x00000C37_89AB6618 = 13,432,782,872,088
# - For division operations, see the divide.s sample
# =============================================================================
