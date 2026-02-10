# =============================================================================
# RISC-V Sample Program: 64-bit Arithmetic
# =============================================================================
# Description: Demonstrates RV64I 64-bit integer operations
# Extension:   RV64I (64-bit Base Integer)
# Difficulty:  Intermediate
#
# This program demonstrates:
#   - 64-bit register operations
#   - Word operations on 64-bit registers (ADDIW, SLLIW, etc.)
#   - Large number handling
#   - Sign extension behavior in 64-bit mode
#
# Key Concept: In RV64I, all registers are 64 bits wide.
# The "W" suffix instructions operate on the lower 32 bits
# and sign-extend the result to 64 bits.
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.text
.globl _start

_start:
    # =================================================================
    # LOADING 64-BIT VALUES
    # =================================================================
    # Loading large constants requires multiple instructions

    # Load a 64-bit value: 0x123456789ABCDEF0
    # This demonstrates how LUI + ADDI can build constants

    li      t0, 0x123456789ABCDEF0  # Load full 64-bit value
                                    # The assembler expands this to multiple instructions

    li      t1, 0xFFFFFFFF          # t1 = 4,294,967,295 (max 32-bit unsigned)
                                    # In 64-bit: 0x00000000FFFFFFFF

    li      t2, -1                  # t2 = -1 = 0xFFFFFFFFFFFFFFFF (all 64 bits set)

    # =================================================================
    # 64-BIT ADDITION
    # =================================================================

    li      a0, 0x80000000          # a0 = 2^31 (2,147,483,648)
    li      a1, 0x80000000          # a1 = 2^31

    add     a2, a0, a1              # a2 = 2^31 + 2^31 = 2^32 = 0x100000000
                                    # This would overflow in 32-bit, but works in 64-bit!
                                    # a2 = 4,294,967,296

    # =================================================================
    # WORD OPERATIONS (32-bit on 64-bit registers)
    # =================================================================
    # The "W" suffix means operate on lower 32 bits, sign-extend result

    li      t3, 0x7FFFFFFF          # t3 = max positive 32-bit signed (2^31 - 1)

    addiw   t4, t3, 1               # t4 = t3 + 1, 32-bit operation
                                    # 0x7FFFFFFF + 1 = 0x80000000 in 32 bits
                                    # Sign-extended to 64 bits: 0xFFFFFFFF80000000
                                    # This is -2147483648 (overflow!)

    addw    t5, t3, t3              # t5 = t3 + t3, 32-bit
                                    # Results in overflow (treated as signed)

    # Compare with full 64-bit operation
    add     t6, t3, t3              # t6 = 0xFFFFFFFE (no overflow in 64-bit)
                                    # t6 = 4,294,967,294

    # =================================================================
    # 64-BIT SHIFTS
    # =================================================================

    li      s0, 1                   # s0 = 1

    slli    s1, s0, 32              # s1 = 1 << 32 = 0x100000000 = 2^32
                                    # This is impossible in RV32I!

    slli    s2, s0, 63              # s2 = 1 << 63 = 0x8000000000000000
                                    # This is the minimum 64-bit signed value

    li      s3, -1                  # s3 = 0xFFFFFFFFFFFFFFFF

    srli    s4, s3, 32              # s4 = logical right shift by 32
                                    # s4 = 0x00000000FFFFFFFF

    srai    s5, s3, 32              # s5 = arithmetic right shift by 32
                                    # s5 = 0xFFFFFFFFFFFFFFFF (sign preserved)

    # =================================================================
    # WORD SHIFTS (32-bit)
    # =================================================================

    li      s6, 0x12345678          # s6 = test value

    slliw   s7, s6, 4               # s7 = (s6 << 4) in 32 bits, sign extended
                                    # 0x23456780, sign extended to 64 bits

    srliw   s8, s6, 4               # s8 = (s6 >> 4) logical, 32-bit
                                    # 0x01234567

    sraiw   s9, s6, 4               # s9 = (s6 >> 4) arithmetic, 32-bit
                                    # Since bit 31 is 0, same as SRLIW

    # Negative number example
    # Load 0xF0000000 and sign-extend it to 64 bits
    # We use LUI to load the upper 20 bits, then ADDIW to sign-extend
    lui     s10, 0xF0000            # s10 = 0x00000000F0000000
    addiw   s10, s10, 0             # ADDIW sign-extends 32-bit result to 64 bits
                                    # s10 = 0xFFFFFFFFF0000000 (negative in 64-bit)

    sraiw   s11, s10, 4             # s11 = arithmetic shift, sign extends within 32 bits
                                    # then sign extends to 64 bits

    # =================================================================
    # SUBTRACTION AND COMPARISON
    # =================================================================

    li      a3, 0x100000000         # a3 = 2^32
    li      a4, 1                   # a4 = 1

    sub     a5, a4, a3              # a5 = 1 - 2^32 = -0xFFFFFFFF
                                    # Negative number in 64 bits

    # 64-bit comparison
    slt     a6, a5, zero            # a6 = (a5 < 0) ? 1 : 0
                                    # a6 = 1 (a5 is negative)

    sltu    a7, a5, a3              # a7 = (a5 < a3) unsigned?
                                    # a5 unsigned is a huge positive number
                                    # a7 = 0 (false)

    # =================================================================
    # WORKING WITH UPPER AND LOWER HALVES
    # =================================================================

    li      t0, 0xDEADBEEF12345678  # t0 = 64-bit test value

    # Extract lower 32 bits
    slli    t1, t0, 32              # Shift left to clear upper bits
    srli    t1, t1, 32              # Shift right to get lower 32 bits
                                    # t1 = 0x12345678

    # Extract upper 32 bits
    srli    t2, t0, 32              # Just shift right
                                    # t2 = 0xDEADBEEF

    # ----- End of Program -----
    ebreak                          # Terminate execution for Spike testing

# =============================================================================
# Expected Final Register Values (64-bit):
# =============================================================================
# x5  (t0)  = 0xDEADBEEF12345678  # Test value
# x6  (t1)  = 0x0000000012345678  # Lower 32 bits extracted
# x7  (t2)  = 0x00000000DEADBEEF  # Upper 32 bits extracted
# x28 (t3)  = 0x000000007FFFFFFF  # 2^31 - 1
# x29 (t4)  = 0xFFFFFFFF80000000  # ADDIW overflow, sign-extended
# x30 (t5)  = 0xFFFFFFFFFFFFFFFE  # ADDW overflow, sign-extended
# x31 (t6)  = 0x00000000FFFFFFFE  # Full 64-bit ADD (no overflow)
# x10 (a0)  = 0x0000000080000000  # 2^31
# x11 (a1)  = 0x0000000080000000  # 2^31
# x12 (a2)  = 0x0000000100000000  # 2^32 (no overflow in 64-bit)
# x13 (a3)  = 0x0000000100000000  # 2^32
# x14 (a4)  = 0x0000000000000001  # 1
# x15 (a5)  = 0xFFFFFFFF00000001  # 1 - 2^32 (negative)
# x16 (a6)  = 0x0000000000000001  # a5 < 0 is true
# x17 (a7)  = 0x0000000000000000  # a5 unsigned NOT < a3
# x8  (s0)  = 0x0000000000000001  # 1
# x9  (s1)  = 0x0000000100000000  # 1 << 32
# x18 (s2)  = 0x8000000000000000  # 1 << 63 (min signed 64-bit)
# x19 (s3)  = 0xFFFFFFFFFFFFFFFF  # -1
# x20 (s4)  = 0x00000000FFFFFFFF  # -1 >> 32 logical
# x21 (s5)  = 0xFFFFFFFFFFFFFFFF  # -1 >> 32 arithmetic
# x22 (s6)  = 0x0000000012345678  # Test value for word shifts
# x23 (s7)  = 0x0000000023456780  # SLLIW result
# x24 (s8)  = 0x0000000001234567  # SRLIW result
# x25 (s9)  = 0x0000000001234567  # SRAIW result (positive)
# x26 (s10) = 0xFFFFFFFFF0000000  # Negative value (sign extended)
# x27 (s11) = 0xFFFFFFFFFF000000  # SRAIW on negative value
#
# Key Learning Points:
# - RV64I allows working with values > 2^32
# - "W" suffix operations truncate to 32 bits then sign-extend
# - Shifts can go up to 63 positions in 64-bit mode
# - Be careful with signed vs unsigned interpretations
# =============================================================================
