# =============================================================================
# RISC-V Sample Program: Division and Remainder Operations
# =============================================================================
# Description: Demonstrates the M extension division instructions
# Extension:   RV32M / RV64M (Integer Division)
# Difficulty:  Intermediate
#
# This program demonstrates:
#   - DIV (signed division)
#   - DIVU (unsigned division)
#   - REM (signed remainder)
#   - REMU (unsigned remainder)
#   - Edge cases: division by zero, overflow
#
# Key Concept: RISC-V division is well-defined for all inputs,
# including division by zero (no exceptions, returns defined values).
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.text
.globl _start

_start:
    # =================================================================
    # BASIC SIGNED DIVISION (DIV)
    # =================================================================
    # DIV rd, rs1, rs2: rd = rs1 / rs2 (signed, truncated toward zero)

    li      t0, 42                  # t0 = dividend
    li      t1, 7                   # t1 = divisor

    div     t2, t0, t1              # t2 = 42 / 7 = 6

    # Division with remainder
    li      t3, 17                  # t3 = 17
    li      t4, 5                   # t4 = 5

    div     t5, t3, t4              # t5 = 17 / 5 = 3 (truncated)
    rem     t6, t3, t4              # t6 = 17 % 5 = 2 (remainder)

    # Verify: dividend = quotient * divisor + remainder
    # 17 = 3 * 5 + 2 = 15 + 2 = 17 (correct!)

    # =================================================================
    # NEGATIVE NUMBER DIVISION
    # =================================================================
    # RISC-V truncates toward zero (like C99)

    li      a0, -17                 # a0 = -17
    li      a1, 5                   # a1 = 5

    div     a2, a0, a1              # a2 = -17 / 5 = -3 (truncated toward zero)
                                    # Not -4! Truncates toward zero.

    rem     a3, a0, a1              # a3 = -17 % 5 = -2
                                    # Remainder has same sign as dividend

    # Verify: -17 = -3 * 5 + (-2) = -15 - 2 = -17 (correct!)

    # Another case: positive dividend, negative divisor
    li      a4, 17                  # a4 = 17
    li      a5, -5                  # a5 = -5

    div     a6, a4, a5              # a6 = 17 / -5 = -3

    rem     a7, a4, a5              # a7 = 17 % -5 = 2
                                    # Remainder has sign of dividend (positive)

    # Both negative
    li      s0, -17                 # s0 = -17
    li      s1, -5                  # s1 = -5

    div     s2, s0, s1              # s2 = -17 / -5 = 3 (positive)
    rem     s3, s0, s1              # s3 = -17 % -5 = -2

    # =================================================================
    # UNSIGNED DIVISION (DIVU/REMU)
    # =================================================================
    # Treats operands as unsigned values

    li      t0, 0xFFFFFFFF          # t0 = max unsigned (4,294,967,295)
    li      t1, 0x10000             # t1 = 65536 (2^16)

    divu    t2, t0, t1              # t2 = 4294967295 / 65536 = 65535 (0xFFFF)
                                    # Unsigned division gives large positive result

    remu    t3, t0, t1              # t3 = 4294967295 % 65536 = 65535

    # Compare with signed division of same bit pattern
    div     t4, t0, t1              # t4 = -1 / 65536 = 0 (signed: -1 is tiny)
                                    # Very different result!

    # =================================================================
    # DIVISION BY ZERO
    # =================================================================
    # RISC-V defines behavior (no trap/exception):
    # - DIV by zero: returns -1 (all bits set)
    # - DIVU by zero: returns max unsigned (all bits set)
    # - REM by zero: returns dividend
    # - REMU by zero: returns dividend

    li      s4, 100                 # s4 = dividend
    li      s5, 0                   # s5 = 0 (divisor)

    div     s6, s4, s5              # s6 = 100 / 0 = -1 (0xFFFFFFFF)
                                    # Defined behavior, no exception!

    divu    s7, s4, s5              # s7 = 100 /u 0 = 0xFFFFFFFF
                                    # Max unsigned value

    rem     s8, s4, s5              # s8 = 100 % 0 = 100
                                    # Returns dividend unchanged

    remu    s9, s4, s5              # s9 = 100 %u 0 = 100

    # =================================================================
    # OVERFLOW CASE
    # =================================================================
    # Only one overflow case in signed division:
    # MIN_INT / -1 = would be MAX_INT + 1 (overflow)
    # RISC-V returns MIN_INT for this case

    li      s10, 0x80000000         # s10 = MIN_INT (-2,147,483,648)
    li      s11, -1                 # s11 = -1

    div     t5, s10, s11            # t5 = MIN_INT / -1 = MIN_INT
                                    # Mathematical result would overflow
                                    # Returns MIN_INT instead

    rem     t6, s10, s11            # t6 = MIN_INT % -1 = 0
                                    # Remainder is 0 (no fractional part)

    # =================================================================
    # PRACTICAL EXAMPLE: Converting Seconds to Minutes:Seconds
    # =================================================================

    li      a0, 3725                # a0 = 3725 seconds (input)

    li      a1, 60                  # a1 = 60 (seconds per minute)

    div     a2, a0, a1              # a2 = 3725 / 60 = 62 minutes
    rem     a3, a0, a1              # a3 = 3725 % 60 = 5 seconds

    # Result: 3725 seconds = 62 minutes, 5 seconds
    # (or 1 hour, 2 minutes, 5 seconds)

    # =================================================================
    # PRACTICAL EXAMPLE: Extracting Digits
    # =================================================================
    # Extract individual decimal digits from a number

    li      t0, 12345               # t0 = number to extract digits from
    li      t1, 10                  # t1 = base 10

    # Extract ones digit
    rem     a4, t0, t1              # a4 = 12345 % 10 = 5

    # Get remaining number
    div     t0, t0, t1              # t0 = 12345 / 10 = 1234

    # Extract tens digit
    rem     a5, t0, t1              # a5 = 1234 % 10 = 4

    # Get remaining
    div     t0, t0, t1              # t0 = 1234 / 10 = 123

    # Extract hundreds digit
    rem     a6, t0, t1              # a6 = 123 % 10 = 3

    # And so on...
    # Result: digits are 5, 4, 3, ... (reverse order)

    # ----- End of Program -----
    ebreak                          # Terminate execution

# =============================================================================
# Expected Final Register Values:
# =============================================================================
# t0  (x5)  = 123                    # Final value after digit extraction
# t1  (x6)  = 10                     # Base 10 for digit extraction
# t2  (x7)  = 0xFFFF                 # DIVU: 0xFFFFFFFF / 0x10000 = 65535
# t3  (x28) = 0xFFFF                 # REMU: 0xFFFFFFFF % 0x10000 = 65535
# t4  (x29) = 0                      # DIV: -1 / 65536 = 0 (signed)
# t5  (x30) = 0x80000000             # MIN_INT / -1 = MIN_INT (overflow)
# t6  (x31) = 0                      # MIN_INT % -1 = 0
# a0  (x10) = 3725                   # Seconds input for time conversion
# a1  (x11) = 60                     # Seconds per minute
# a2  (x12) = 62                     # 3725 / 60 = 62 minutes (final value)
# a3  (x13) = 5                      # 3725 % 60 = 5 seconds (final value)
# a4  (x14) = 5                      # Ones digit of 12345
# a5  (x15) = 4                      # Tens digit of 12345
# a6  (x16) = 3                      # Hundreds digit of 12345 (final value)
# a7  (x17) = 2                      # 17 % -5 = 2
# s0  (x8)  = -17 (0xFFFFFFEF)       # Negative dividend
# s1  (x9)  = -5 (0xFFFFFFFB)        # Negative divisor
# s2  (x18) = 3                      # -17 / -5 = 3
# s3  (x19) = -2 (0xFFFFFFFE)        # -17 % -5 = -2
# s4  (x20) = 100                    # Dividend for division by zero tests
# s5  (x21) = 0                      # Zero divisor
# s6  (x22) = -1 (0xFFFFFFFF)        # DIV: 100 / 0 = -1
# s7  (x23) = 0xFFFFFFFF             # DIVU: 100 / 0 = max unsigned
# s8  (x24) = 100                    # REM: 100 % 0 = 100 (dividend)
# s9  (x25) = 100                    # REMU: 100 % 0 = 100 (dividend)
# s10 (x26) = 0x80000000             # MIN_INT (-2,147,483,648)
# s11 (x27) = -1 (0xFFFFFFFF)        # Divisor for overflow test
#
# Key Learning Points:
# - DIV truncates toward zero (not floor like some languages)
# - REM sign follows dividend sign
# - Division by zero returns -1 (DIV) or 0xFFFFFFFF (DIVU), no exception
# - Remainder by zero returns the dividend unchanged
# - MIN_INT / -1 returns MIN_INT (only overflow case in signed division)
# - DIVU/REMU treat values as unsigned (very different results for negative patterns)
# =============================================================================
