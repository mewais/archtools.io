# =============================================================================
# RISC-V Sample Program: Arithmetic Operations
# =============================================================================
# Description: Demonstrates all RV32I arithmetic and logical operations
# Extension:   RV32I (Base Integer)
# Difficulty:  Beginner
#
# This program demonstrates:
#   - Addition and subtraction (ADD, SUB, ADDI)
#   - Logical operations (AND, OR, XOR)
#   - Shift operations (SLL, SRL, SRA)
#   - Comparison operations (SLT, SLTU)
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.text
.globl _start

_start:
    # ----- Setup: Load test values into registers -----
    li      t0, 25              # t0 = 25 (first operand)
    li      t1, 10              # t1 = 10 (second operand)
    li      t2, -5              # t2 = -5 (negative number for signed tests)

    # =================================================================
    # ADDITION AND SUBTRACTION
    # =================================================================

    add     t3, t0, t1          # t3 = t0 + t1 = 25 + 10 = 35
                                # ADD: Register-register addition

    sub     t4, t0, t1          # t4 = t0 - t1 = 25 - 10 = 15
                                # SUB: Register-register subtraction

    addi    t5, t0, 7           # t5 = t0 + 7 = 25 + 7 = 32
                                # ADDI: Add immediate (12-bit signed)
                                # Note: There is no SUBI - use negative immediate

    addi    t6, t0, -3          # t6 = t0 + (-3) = 25 - 3 = 22
                                # Subtraction via negative immediate

    # =================================================================
    # LOGICAL OPERATIONS (Bitwise)
    # =================================================================

    li      a0, 0b11110000      # a0 = 240 in binary: 11110000
    li      a1, 0b10101010      # a1 = 170 in binary: 10101010

    and     a2, a0, a1          # a2 = a0 AND a1 = 10100000 = 160
                                # AND: Bits are 1 only where BOTH inputs are 1

    or      a3, a0, a1          # a3 = a0 OR a1 = 11111010 = 250
                                # OR: Bits are 1 where EITHER input is 1

    xor     a4, a0, a1          # a4 = a0 XOR a1 = 01011010 = 90
                                # XOR: Bits are 1 where inputs DIFFER

    xori    a5, a0, 0xFF        # a5 = a0 XOR 0xFF = 00001111 = 15
                                # XOR with all 1s inverts the bits (NOT operation)

    andi    a6, a0, 0x0F        # a6 = a0 AND 0x0F = 0 (mask lower 4 bits)
                                # Useful for extracting bit fields

    ori     a7, a0, 0x0F        # a7 = a0 OR 0x0F = 11111111 = 255
                                # Useful for setting specific bits

    # =================================================================
    # SHIFT OPERATIONS
    # =================================================================

    li      s0, 8               # s0 = 8 = 0b00001000

    slli    s1, s0, 2           # s1 = s0 << 2 = 8 << 2 = 32
                                # SLL: Shift Left Logical - multiply by 2^n
                                # Each left shift doubles the value

    srli    s2, s0, 1           # s2 = s0 >> 1 = 8 >> 1 = 4
                                # SRL: Shift Right Logical - divide by 2^n
                                # Fills with zeros from the left

    li      s3, -16             # s3 = -16 = 0xFFFFFFF0

    srai    s4, s3, 2           # s4 = s3 >> 2 (arithmetic) = -4
                                # SRA: Shift Right Arithmetic
                                # Preserves the sign bit (fills with 1s for negative)

    srli    s5, s3, 2           # s5 = s3 >> 2 (logical) = 0x3FFFFFFC
                                # SRL on negative: fills with 0s, becomes positive!

    # =================================================================
    # COMPARISON OPERATIONS
    # =================================================================

    li      s6, 5               # s6 = 5
    li      s7, 10              # s7 = 10

    slt     s8, s6, s7          # s8 = (s6 < s7) ? 1 : 0 = 1
                                # SLT: Set Less Than (signed comparison)
                                # Result is 1 because 5 < 10

    slt     s9, s7, s6          # s9 = (s7 < s6) ? 1 : 0 = 0
                                # Result is 0 because 10 is NOT less than 5

    slti    s10, s6, 7          # s10 = (s6 < 7) ? 1 : 0 = 1
                                # SLTI: Compare with immediate

    sltu    s11, t2, s6         # s11 = (t2 < s6) unsigned ? 1 : 0 = 0
                                # SLTU: Unsigned comparison
                                # -5 as unsigned is a HUGE number (0xFFFFFFFB)
                                # So -5 unsigned > 5, result is 0

    # ----- End of Program -----
    ebreak

# =============================================================================
# Expected Final Register Values:
# =============================================================================
# Integer Registers:
#   t0 (x5)   = 25                    # Original operand
#   t1 (x6)   = 10                    # Original operand
#   t2 (x7)   = -5 (0xFFFFFFFB)       # Negative operand
#   t3 (x28)  = 35                    # 25 + 10
#   t4 (x29)  = 15                    # 25 - 10
#   t5 (x30)  = 32                    # 25 + 7
#   t6 (x31)  = 22                    # 25 - 3
#   a0 (x10)  = 240 (0xF0)            # Binary pattern
#   a1 (x11)  = 170 (0xAA)            # Binary pattern
#   a2 (x12)  = 160 (0xA0)            # AND result
#   a3 (x13)  = 250 (0xFA)            # OR result
#   a4 (x14)  = 90  (0x5A)            # XOR result
#   a5 (x15)  = 15  (0x0F)            # XOR with 0xFF (bit flip)
#   a6 (x16)  = 0                     # AND mask result
#   a7 (x17)  = 255 (0xFF)            # OR mask result
#   s0 (x8)   = 8                     # Shift test value
#   s1 (x9)   = 32                    # 8 << 2
#   s2 (x18)  = 4                     # 8 >> 1
#   s3 (x19)  = -16 (0xFFFFFFF0)      # Negative for arithmetic shift
#   s4 (x20)  = -4  (0xFFFFFFFC)      # Arithmetic right shift
#   s5 (x21)  = 1073741820 (0x3FFFFFFC) # Logical right shift of negative
#   s6 (x22)  = 5                     # Comparison operand
#   s7 (x23)  = 10                    # Comparison operand
#   s8 (x24)  = 1                     # 5 < 10 (true)
#   s9 (x25)  = 0                     # 10 < 5 (false)
#   s10 (x26) = 1                     # 5 < 7 (true)
#   s11 (x27) = 0                     # -5 unsigned > 5 (false for less than)
# =============================================================================
