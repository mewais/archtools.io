# =============================================================================
# RISC-V Sample Program: Fibonacci Sequence
# =============================================================================
# Description: Computes Fibonacci numbers using iteration
# Extension:   RV32I (Base Integer)
# Difficulty:  Intermediate
#
# This program demonstrates:
#   - Classic algorithm implementation
#   - Loop with multiple state variables
#   - Register allocation strategy
#
# The Fibonacci sequence: 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, ...
# Each number is the sum of the two preceding ones.
# F(0)=0, F(1)=1, F(n)=F(n-1)+F(n-2)
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.text
.globl _start

_start:
    # =================================================================
    # ITERATIVE FIBONACCI
    # =================================================================
    # Calculate F(10) = 55
    #
    # Register allocation:
    # a0 = n (which Fibonacci number to compute)
    # t0 = F(i-2), the "two back" value
    # t1 = F(i-1), the "one back" value
    # t2 = F(i), the current value being computed
    # t3 = loop counter i

    li      a0, 10              # We want to compute F(10)

    # Handle base cases
    li      t0, 0               # t0 = F(0) = 0
    beq     a0, zero, fib_done  # If n==0, result is 0

    li      t1, 1               # t1 = F(1) = 1
    li      t3, 1               # i = 1
    beq     a0, t3, fib_base1   # If n==1, result is 1

    # General case: compute F(2) through F(n)
    li      t3, 2               # Start loop at i=2

fib_loop:
    # F(i) = F(i-1) + F(i-2)
    add     t2, t0, t1          # t2 = F(i-2) + F(i-1) = F(i)

    # Shift values for next iteration
    # F(i-2) <- F(i-1)
    # F(i-1) <- F(i)
    mv      t0, t1              # t0 = old t1 (shift one back becomes two back)
    mv      t1, t2              # t1 = new value (current becomes one back)

    # Increment counter and check loop condition
    addi    t3, t3, 1           # i++
    ble     t3, a0, fib_loop    # if (i <= n) continue loop

    # Result is in t1 (the most recent F(i-1) which is F(n))
    mv      a1, t1              # a1 = F(10) = 55
    j       fib_verify

fib_base1:
    mv      a1, t1              # a1 = F(1) = 1
    j       fib_verify

fib_done:
    mv      a1, t0              # a1 = F(0) = 0

fib_verify:
    # =================================================================
    # VERIFICATION: Compute first 8 Fibonacci numbers
    # =================================================================
    # Store F(0) through F(7) in registers a2-a7, s2-s3 for verification

    li      t0, 0               # F(0) = 0
    li      t1, 1               # F(1) = 1

    mv      a2, t0              # a2 = F(0) = 0
    mv      a3, t1              # a3 = F(1) = 1

    add     t2, t0, t1          # F(2) = 0 + 1 = 1
    mv      a4, t2              # a4 = F(2) = 1
    mv      t0, t1
    mv      t1, t2

    add     t2, t0, t1          # F(3) = 1 + 1 = 2
    mv      a5, t2              # a5 = F(3) = 2
    mv      t0, t1
    mv      t1, t2

    add     t2, t0, t1          # F(4) = 1 + 2 = 3
    mv      a6, t2              # a6 = F(4) = 3
    mv      t0, t1
    mv      t1, t2

    add     t2, t0, t1          # F(5) = 2 + 3 = 5
    mv      a7, t2              # a7 = F(5) = 5
    mv      t0, t1
    mv      t1, t2

    add     t2, t0, t1          # F(6) = 3 + 5 = 8
    mv      s2, t2              # s2 = F(6) = 8
    mv      t0, t1
    mv      t1, t2

    add     t2, t0, t1          # F(7) = 5 + 8 = 13
    mv      s3, t2              # s3 = F(7) = 13

    # =================================================================
    # BONUS: Find largest Fibonacci number that fits in a byte
    # =================================================================
    # F(n) < 256
    # Answer: F(13) = 233 (F(14) = 377 > 255)

    li      t0, 0               # F(i-2)
    li      t1, 1               # F(i-1)
    li      t3, 255             # Maximum byte value
    li      t4, 0               # Counter for which F(n) we found

byte_fib_loop:
    add     t2, t0, t1          # Next Fibonacci number
    bgt     t2, t3, byte_fib_done  # If > 255, we're done
    mv      t0, t1              # Shift
    mv      t1, t2              # New Fibonacci
    addi    t4, t4, 1           # Count
    j       byte_fib_loop

byte_fib_done:
    mv      s4, t1              # s4 = largest Fibonacci < 256 = 233
    mv      s5, t4              # s5 = loop iteration count = 12

    # ----- End of Program -----
    ebreak

# =============================================================================
# Expected Final Register Values:
# =============================================================================
# Integer Registers:
#   a0 (x10)  = 10                    # Input: which Fibonacci to compute
#   a1 (x11)  = 55                    # F(10) = 55
#   a2 (x12)  = 0                     # F(0)
#   a3 (x13)  = 1                     # F(1)
#   a4 (x14)  = 1                     # F(2)
#   a5 (x15)  = 2                     # F(3)
#   a6 (x16)  = 3                     # F(4)
#   a7 (x17)  = 5                     # F(5)
#   s2 (x18)  = 8                     # F(6)
#   s3 (x19)  = 13                    # F(7)
#   s4 (x20)  = 233                   # Largest Fibonacci that fits in a byte
#   s5 (x21)  = 12                    # Loop iteration count (F(13) found after 12 iterations)
#
# Fibonacci Sequence Reference:
# F(0)=0, F(1)=1, F(2)=1, F(3)=2, F(4)=3, F(5)=5
# F(6)=8, F(7)=13, F(8)=21, F(9)=34, F(10)=55
# F(11)=89, F(12)=144, F(13)=233, F(14)=377
# =============================================================================
