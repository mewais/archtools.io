# =============================================================================
# RISC-V Sample Program: Branch Instructions
# =============================================================================
# Description: Demonstrates conditional branching and control flow
# Extension:   RV32I (Base Integer)
# Difficulty:  Beginner
#
# This program demonstrates:
#   - BEQ (Branch if Equal)
#   - BNE (Branch if Not Equal)
#   - BLT/BGE (Branch if Less Than / Greater or Equal) - signed
#   - BLTU/BGEU (Unsigned versions)
#   - JAL/JALR (Jump and Link)
#
# Key Concept: Branches change program flow based on conditions
# The PC (Program Counter) is modified to jump to a different instruction
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.text
.globl _start

_start:
    # ----- Setup: Initialize test values -----
    li      t0, 10              # t0 = 10
    li      t1, 10              # t1 = 10 (equal to t0)
    li      t2, 20              # t2 = 20 (greater than t0)
    li      t3, -5              # t3 = -5 (negative number)
    li      a0, 0               # a0 = counter for tracking which branches taken

    # =================================================================
    # BEQ: Branch if Equal
    # =================================================================
    # Format: BEQ rs1, rs2, label
    # If rs1 == rs2, jump to label; otherwise continue to next instruction

    beq     t0, t1, equal_case  # t0 == t1? Yes (both are 10), so JUMP
    addi    a0, a0, 100         # This is SKIPPED because branch was taken

equal_case:
    addi    a0, a0, 1           # a0 = 0 + 1 = 1 (branch was taken)

    # =================================================================
    # BNE: Branch if Not Equal
    # =================================================================
    # Format: BNE rs1, rs2, label
    # If rs1 != rs2, jump to label

    bne     t0, t2, not_equal   # t0 != t2? Yes (10 != 20), so JUMP
    addi    a0, a0, 100         # This is SKIPPED

not_equal:
    addi    a0, a0, 1           # a0 = 1 + 1 = 2

    # =================================================================
    # BLT: Branch if Less Than (Signed)
    # =================================================================
    # Format: BLT rs1, rs2, label
    # If rs1 < rs2 (signed comparison), jump to label

    blt     t0, t2, less_than   # t0 < t2? Yes (10 < 20), so JUMP
    addi    a0, a0, 100         # This is SKIPPED

less_than:
    addi    a0, a0, 1           # a0 = 2 + 1 = 3

    # Test with negative number (signed comparison)
    blt     t3, t0, neg_less    # t3 < t0? Yes (-5 < 10), so JUMP
    addi    a0, a0, 100         # SKIPPED

neg_less:
    addi    a0, a0, 1           # a0 = 3 + 1 = 4

    # =================================================================
    # BGE: Branch if Greater or Equal (Signed)
    # =================================================================
    # Format: BGE rs1, rs2, label
    # If rs1 >= rs2 (signed), jump to label

    bge     t2, t0, greater_eq  # t2 >= t0? Yes (20 >= 10), so JUMP
    addi    a0, a0, 100         # SKIPPED

greater_eq:
    addi    a0, a0, 1           # a0 = 4 + 1 = 5

    # Test equal case
    bge     t0, t1, equal_ge    # t0 >= t1? Yes (10 >= 10), so JUMP
    addi    a0, a0, 100         # SKIPPED

equal_ge:
    addi    a0, a0, 1           # a0 = 5 + 1 = 6

    # =================================================================
    # BLTU/BGEU: Unsigned Comparisons
    # =================================================================
    # Key difference: -5 as unsigned is 0xFFFFFFFB (a HUGE positive number)

    bltu    t0, t3, unsigned_lt # t0 < t3 unsigned? YES! 10 < 0xFFFFFFFB
    addi    a0, a0, 100         # SKIPPED (branch taken)

unsigned_lt:
    # Jumped here because 10 < huge_unsigned_number

    bgeu    t3, t0, unsigned_ge # t3 >= t0 unsigned? YES! 0xFFFFFFFB >= 10
    addi    a0, a0, 100         # SKIPPED

unsigned_ge:
    addi    a0, a0, 1           # a0 = 6 + 1 = 7

    # =================================================================
    # Branch NOT Taken Example
    # =================================================================
    # When condition is false, execution continues sequentially

    li      t4, 5
    li      t5, 10

    beq     t4, t5, skip_this   # t4 == t5? NO (5 != 10), DON'T jump
    addi    a0, a0, 1           # NOT skipped, a0 = 7 + 1 = 8

skip_this:
    # Continue here regardless

    # =================================================================
    # Unconditional Jump (J pseudo-instruction)
    # =================================================================
    # J is actually JAL x0, label (discard return address)

    j       end_program         # Always jump to end_program
    addi    a0, a0, 1000        # NEVER executed

unreachable:
    addi    a0, a0, 1000        # NEVER executed

end_program:
    # Final result in a0

    # ----- End of Program -----
    ebreak

# =============================================================================
# Expected Final Register Values:
# =============================================================================
# Integer Registers:
#   t0 (x5)  = 10                     # First comparison operand
#   t1 (x6)  = 10                     # Second comparison operand (equal to t0)
#   t2 (x7)  = 20                     # Third comparison operand
#   t3 (x28) = -5 (0xFFFFFFFB)        # Negative number for signed tests
#   t4 (x29) = 5                      # Fourth comparison operand
#   t5 (x30) = 10                     # Fifth comparison operand
#   a0 (x10) = 8                      # Count of successful branch tests
#
# Execution Flow:
# 1. BEQ taken (t0 == t1)        -> a0 = 1
# 2. BNE taken (t0 != t2)        -> a0 = 2
# 3. BLT taken (10 < 20)         -> a0 = 3
# 4. BLT taken (-5 < 10)         -> a0 = 4
# 5. BGE taken (20 >= 10)        -> a0 = 5
# 6. BGE taken (10 >= 10)        -> a0 = 6
# 7. BLTU taken (10 < huge)      -> a0 = 6 (no increment, branch taken)
# 8. BGEU taken (-5 unsigned)    -> a0 = 7
# 9. BEQ not taken (5 != 10)     -> a0 = 8
# 10. J taken to end
# =============================================================================
