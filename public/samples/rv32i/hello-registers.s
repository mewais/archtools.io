# =============================================================================
# RISC-V Sample Program: Hello Registers
# =============================================================================
# Description: Introduction to RISC-V registers and basic data movement
# Extension:   RV32I (Base Integer)
# Difficulty:  Beginner
#
# This program demonstrates:
#   - Loading immediate values into registers
#   - Copying values between registers
#   - Understanding the x0 (zero) register
#   - Using ABI register names (t0-t6, a0-a7, s0-s11)
#   - Building larger constants with LUI + ADDI
#   - A practical mini-program: converting seconds to hours:minutes:seconds
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.text
.globl _start

_start:
    # =================================================================
    # PART 1: Loading Immediate Values
    # =================================================================
    # The LI (Load Immediate) pseudo-instruction loads a constant
    # RISC-V has 32 general-purpose registers: x0-x31
    # x0 is special: it ALWAYS contains zero and ignores writes

    li      x1, 42              # Load the value 42 into register x1
                                # x1 is also called 'ra' (return address)

    li      x2, 100             # Load 100 into x2 (also called 'sp')
                                # Note: In real programs, x2 is the stack pointer

    li      x3, -15             # Load negative number -15 into x3
                                # RISC-V uses two's complement for negatives

    # =================================================================
    # PART 2: The Zero Register (x0)
    # =================================================================
    # x0 is hardwired to zero - writing to it has no effect

    li      x0, 999             # Try to load 999 into x0
                                # This does NOTHING - x0 stays 0

    add     x4, x0, x0          # x4 = x0 + x0 = 0 + 0 = 0
                                # Using x0 to create a zero value

    # =================================================================
    # PART 3: Register-to-Register Copy
    # =================================================================
    # The MV (Move) pseudo-instruction copies one register to another
    # MV rd, rs is actually: ADDI rd, rs, 0

    mv      x5, x1              # Copy x1 (42) into x5
                                # x5 now contains 42

    mv      x6, x3              # Copy x3 (-15) into x6
                                # x6 now contains -15

    # =================================================================
    # PART 4: Building Larger Values
    # =================================================================
    # LUI (Load Upper Immediate) loads a 20-bit value into upper bits
    # Useful for building 32-bit constants

    lui     x7, 0x12345         # Load 0x12345 into upper 20 bits of x7
                                # x7 = 0x12345000 (lower 12 bits are zero)

    addi    x7, x7, 0x678       # Add 0x678 to complete the value
                                # x7 = 0x12345678

    # =================================================================
    # PART 5: Using ABI Register Names
    # =================================================================
    # Registers have conventional names (ABI names):
    # t0-t6: temporaries (caller-saved)
    # a0-a7: function arguments and return values
    # s0-s11: saved registers (callee-saved)

    li      t0, 10              # t0 = x5 = 10 (temporary)
    li      t1, 20              # t1 = x6 = 20 (temporary)
    li      a0, 7               # a0 = x10 = 7 (argument register)
    li      s0, 255             # s0 = x8 = 255 (saved register)

    # =================================================================
    # PART 6: Mini-Program: Convert Seconds to H:M:S
    # =================================================================
    # Given total_seconds, compute hours, minutes, and remaining seconds
    # This demonstrates practical register usage and basic arithmetic
    #
    # Example: 3725 seconds = 1 hour, 2 minutes, 5 seconds

    # Input: total seconds
    li      a0, 3725            # a0 = total seconds (1h 2m 5s)

    # Constants we need
    li      t0, 3600            # t0 = seconds per hour
    li      t1, 60              # t1 = seconds per minute

    # ----- Calculate hours -----
    # hours = total_seconds / 3600
    # We will use repeated subtraction (no M extension yet)

    mv      t2, a0              # t2 = remaining seconds (copy of input)
    li      a1, 0               # a1 = hours counter

hours_loop:
    blt     t2, t0, hours_done  # if remaining < 3600, done with hours
    sub     t2, t2, t0          # remaining -= 3600
    addi    a1, a1, 1           # hours++
    j       hours_loop

hours_done:
    # a1 = hours = 1
    # t2 = remaining seconds after removing hours = 125

    # ----- Calculate minutes -----
    # minutes = remaining / 60

    li      a2, 0               # a2 = minutes counter

minutes_loop:
    blt     t2, t1, minutes_done    # if remaining < 60, done with minutes
    sub     t2, t2, t1              # remaining -= 60
    addi    a2, a2, 1               # minutes++
    j       minutes_loop

minutes_done:
    # a2 = minutes = 2
    # t2 = remaining seconds = 5

    # ----- Store remaining seconds -----
    mv      a3, t2              # a3 = remaining seconds = 5

    # =================================================================
    # PART 7: Verify with Different Values
    # =================================================================
    # Let's convert 7384 seconds (2h 3m 4s)

    li      s1, 7384            # s1 = new total seconds

    mv      t2, s1              # t2 = remaining
    li      s2, 0               # s2 = hours

verify_hours:
    blt     t2, t0, verify_hours_done
    sub     t2, t2, t0
    addi    s2, s2, 1
    j       verify_hours

verify_hours_done:
    li      s3, 0               # s3 = minutes

verify_minutes:
    blt     t2, t1, verify_minutes_done
    sub     t2, t2, t1
    addi    s3, s3, 1
    j       verify_minutes

verify_minutes_done:
    mv      s4, t2              # s4 = remaining seconds

    # =================================================================
    # PART 8: Compute Total Back (Verification)
    # =================================================================
    # Recompute: total = hours * 3600 + minutes * 60 + seconds

    # For our first conversion (1h 2m 5s):
    mv      t3, a1              # t3 = hours = 1
    mv      t4, a2              # t4 = minutes = 2
    mv      t5, a3              # t5 = seconds = 5

    # hours * 3600 (using repeated addition since no MUL)
    li      t6, 0               # t6 = hours_in_seconds

mult_hours:
    beqz    t3, mult_hours_done
    add     t6, t6, t0          # t6 += 3600
    addi    t3, t3, -1          # hours--
    j       mult_hours

mult_hours_done:
    # t6 = 3600

    # minutes * 60
    li      s5, 0               # s5 = minutes_in_seconds

mult_minutes:
    beqz    t4, mult_minutes_done
    add     s5, s5, t1          # s5 += 60
    addi    t4, t4, -1          # minutes--
    j       mult_minutes

mult_minutes_done:
    # s5 = 120

    # Total = hours_in_seconds + minutes_in_seconds + seconds
    add     s6, t6, s5          # s6 = 3600 + 120 = 3720
    add     s6, s6, t5          # s6 = 3720 + 5 = 3725

    # s6 should equal our original input a0 = 3725

    # ----- End of Program -----
    ebreak

# =============================================================================
# Expected Final Register Values:
# =============================================================================
# Integer Registers:
#   x0           = 0                  # Always zero (hardwired)
#   x1 (ra)      = 42                 # Test value loaded into ra
#   x2 (sp)      = 100                # Test value (normally stack pointer)
#   x3 (gp)      = -15 (0xFFFFFFF1)   # Negative test value
#   x4 (tp)      = 0                  # Result of x0 + x0
#   x5 (t0)      = 3600               # Seconds per hour constant
#   x6 (t1)      = 60                 # Seconds per minute constant
#   x7 (t2)      = 4                  # Final remaining seconds from second conversion (7384s = 2h 3m 4s)
#   x8 (s0/fp)   = 255                # Test value
#   x10 (a0)     = 3725               # Original total seconds input
#   x11 (a1)     = 1                  # Hours from first conversion
#   x12 (a2)     = 2                  # Minutes from first conversion
#   x13 (a3)     = 5                  # Seconds from first conversion
#   s1 (x9)      = 7384               # Second conversion input
#   s2 (x18)     = 2                  # Hours from second conversion
#   s3 (x19)     = 3                  # Minutes from second conversion
#   s4 (x20)     = 4                  # Seconds from second conversion
#   s5 (x21)     = 120                # Minutes in seconds (2 * 60)
#   s6 (x22)     = 3725               # Recomputed total (verification)
#   t5 (x30)     = 5                  # Seconds from first conversion (copied from a3)
#   t6 (x31)     = 3600               # Hours in seconds (1 * 3600)
#
# Time Conversion Results:
# First:  3725 seconds = 1h 2m 5s
# Second: 7384 seconds = 2h 3m 4s
# Verification: s6 = 3725 (matches a0)
#
# Key Learning Points:
# - x0 always reads as 0 and ignores writes
# - LI is a pseudo-instruction (assembler expands it)
# - MV is also a pseudo (ADDI rd, rs, 0)
# - ABI names (t0, a0, s0, etc.) are aliases for x registers
# - LUI + ADDI pattern builds 32-bit constants
# - Without M extension, we use loops for multiply/divide
# =============================================================================
