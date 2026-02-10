# =============================================================================
# RISC-V Sample Program: Loop Constructs
# =============================================================================
# Description: Demonstrates how to implement loops using branches
# Extension:   RV32I (Base Integer)
# Difficulty:  Beginner
#
# This program demonstrates:
#   - Counting loop (for loop equivalent)
#   - While loop pattern
#   - Do-while loop pattern
#   - Loop with early exit (break)
#
# Key Concept: RISC-V has no dedicated loop instructions.
# Loops are built using branches that jump backwards.
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.text
.globl _start

_start:
    # =================================================================
    # COUNTING LOOP (For Loop Pattern)
    # =================================================================
    # Equivalent C code:
    #   int sum = 0;
    #   for (int i = 1; i <= 5; i++) {
    #       sum += i;
    #   }
    # Expected result: sum = 1+2+3+4+5 = 15

    li      t0, 0               # t0 = sum = 0 (accumulator)
    li      t1, 1               # t1 = i = 1 (loop counter)
    li      t2, 5               # t2 = 5 (loop limit)

for_loop:
    # Loop body: add counter to sum
    add     t0, t0, t1          # sum += i

    # Increment counter
    addi    t1, t1, 1           # i++

    # Check loop condition and branch back if true
    ble     t1, t2, for_loop    # if (i <= 5) goto for_loop
                                # BLE is a pseudo-instruction for BGE with swapped operands

for_done:
    # t0 now contains 15 (sum of 1 to 5)
    mv      a0, t0              # Save result: a0 = 15

    # =================================================================
    # WHILE LOOP (Pre-test Loop)
    # =================================================================
    # Equivalent C code:
    #   int x = 100;
    #   int count = 0;
    #   while (x > 0) {
    #       x = x - 17;
    #       count++;
    #   }
    # How many times can we subtract 17 from 100? count = 6

    li      t3, 100             # t3 = x = 100
    li      t4, 0               # t4 = count = 0
    li      t5, 17              # t5 = decrement value

while_loop:
    # Test condition FIRST (pre-test loop)
    ble     t3, zero, while_done  # if (x <= 0) exit loop
                                  # Note: 'zero' is alias for x0

    # Loop body
    sub     t3, t3, t5          # x = x - 17
    addi    t4, t4, 1           # count++

    # Jump back to test
    j       while_loop          # Unconditional jump to loop start

while_done:
    mv      a1, t4              # Save result: a1 = 6 (count)
    mv      a2, t3              # a2 = final x value (-2)

    # =================================================================
    # DO-WHILE LOOP (Post-test Loop)
    # =================================================================
    # Equivalent C code:
    #   int n = 1;
    #   int result = 1;
    #   do {
    #       result = result * 2;
    #       n++;
    #   } while (n <= 4);
    # Result: 2^4 = 16

    li      t0, 1               # t0 = n = 1 (counter)
    li      t1, 1               # t1 = result = 1
    li      t2, 4               # t2 = limit

do_while:
    # Body executes at least once
    slli    t1, t1, 1           # result = result * 2 (left shift = multiply by 2)
    addi    t0, t0, 1           # n++

    # Test condition AFTER body (post-test loop)
    ble     t0, t2, do_while    # if (n <= 4) continue loop

do_while_done:
    mv      a3, t1              # Save result: a3 = 16

    # =================================================================
    # COUNTDOWN LOOP
    # =================================================================
    # Count down from 5 to 1
    # Equivalent C: for (int i = 5; i >= 1; i--) { ... }

    li      t0, 5               # t0 = i = 5 (start value)
    li      t1, 0               # t1 = product = 0 (we'll add i each time)

countdown:
    add     t1, t1, t0          # product += i
    addi    t0, t0, -1          # i-- (decrement)
    bgt     t0, zero, countdown # if (i > 0) continue
                                # BGT is pseudo for BLT with swapped args

countdown_done:
    mv      a4, t1              # Save result: a4 = 15 (5+4+3+2+1)

    # =================================================================
    # LOOP WITH EARLY EXIT (Break Pattern)
    # =================================================================
    # Find first multiple of 7 greater than 20
    # Equivalent C:
    #   int num = 1;
    #   while (true) {
    #       if (num % 7 == 0 && num > 20) break;
    #       num++;
    #   }

    li      t0, 1               # t0 = num = 1
    li      t1, 7               # t1 = 7 (divisor)
    li      t2, 20              # t2 = 20 (threshold)

search_loop:
    # We need to check if num is divisible by 7
    # Without division, we'll use a simpler approach: check known multiples
    # Actually, let's use repeated subtraction to find remainder

    mv      t3, t0              # t3 = copy of num for remainder calc

remainder_loop:
    blt     t3, t1, check_remainder  # if t3 < 7, we have the remainder
    sub     t3, t3, t1               # t3 -= 7
    j       remainder_loop

check_remainder:
    # t3 now contains num % 7
    bne     t3, zero, not_found      # if (num % 7 != 0) continue search
    ble     t0, t2, not_found        # if (num <= 20) continue search

    # Found it! Exit loop
    j       found

not_found:
    addi    t0, t0, 1           # num++
    j       search_loop         # Continue searching

found:
    mv      a5, t0              # Save result: a5 = 21 (first multiple of 7 > 20)

    # ----- End of Program -----
    ebreak

# =============================================================================
# Expected Final Register Values:
# =============================================================================
# Integer Registers:
#   a0 (x10) = 15                     # Sum of 1 to 5 (for loop)
#   a1 (x11) = 6                      # How many times 17 fits in 100 (while loop)
#   a2 (x12) = -2 (0xFFFFFFFE)        # Final value after subtracting (100 - 6*17 = -2)
#   a3 (x13) = 16                     # 2^4 from do-while loop
#   a4 (x14) = 15                     # Sum of countdown 5+4+3+2+1
#   a5 (x15) = 21                     # First multiple of 7 greater than 20
# =============================================================================
