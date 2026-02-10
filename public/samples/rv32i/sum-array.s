# =============================================================================
# RISC-V Sample Program: Sum Array Elements
# =============================================================================
# Description: Demonstrates array traversal and accumulation patterns
# Extension:   RV32I (Base Integer)
# Difficulty:  Intermediate
#
# This program demonstrates:
#   - Array access patterns in assembly
#   - Pointer-based vs index-based iteration
#   - Common loop idioms for array processing
#   - Finding min/max values
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.data
    .align  2                       # Align to 4-byte boundary
numbers:
    .word   15, 42, 8, 23, 4, 16, 31, 7, 55, 12
                                    # Array of 10 integers
    .equ    ARRAY_LEN, 10           # Array length constant

.text
.globl _start

_start:
    # =================================================================
    # METHOD 1: Index-Based Array Sum
    # =================================================================
    # This approach uses an index variable and calculates addresses
    #
    # Equivalent C code:
    #   int sum = 0;
    #   for (int i = 0; i < ARRAY_LEN; i++) {
    #       sum += numbers[i];
    #   }

    la      s0, numbers             # s0 = base address of array
    li      s1, ARRAY_LEN           # s1 = array length (10)

    li      t0, 0                   # t0 = i (loop index)
    li      t1, 0                   # t1 = sum accumulator

index_loop:
    bge     t0, s1, index_done      # Exit if i >= length

    # Calculate address: &numbers[i] = base + (i * 4)
    slli    t2, t0, 2               # t2 = i * 4 (word size)
    add     t3, s0, t2              # t3 = &numbers[i]
    lw      t4, 0(t3)               # t4 = numbers[i]

    # Accumulate
    add     t1, t1, t4              # sum += numbers[i]

    # Next iteration
    addi    t0, t0, 1               # i++
    j       index_loop

index_done:
    mv      a0, t1                  # a0 = sum = 213

    # =================================================================
    # METHOD 2: Pointer-Based Array Sum
    # =================================================================
    # This approach increments a pointer through the array
    # More efficient: no multiplication needed each iteration
    #
    # Equivalent C code:
    #   int sum = 0;
    #   int *ptr = numbers;
    #   int *end = numbers + ARRAY_LEN;
    #   while (ptr < end) {
    #       sum += *ptr++;
    #   }

    la      t0, numbers             # t0 = ptr (current position)
    li      t1, ARRAY_LEN           # Calculate end address
    slli    t1, t1, 2               # t1 = ARRAY_LEN * 4
    la      t2, numbers
    add     t2, t2, t1              # t2 = end = numbers + (len * 4)
    li      t3, 0                   # t3 = sum accumulator

ptr_loop:
    bge     t0, t2, ptr_done        # Exit if ptr >= end

    lw      t4, 0(t0)               # t4 = *ptr (load current element)
    add     t3, t3, t4              # sum += *ptr

    addi    t0, t0, 4               # ptr++ (advance by word size)
    j       ptr_loop

ptr_done:
    mv      a1, t3                  # a1 = sum = 213 (should match a0)

    # =================================================================
    # FIND MINIMUM VALUE
    # =================================================================
    # Equivalent C code:
    #   int min = numbers[0];
    #   for (int i = 1; i < ARRAY_LEN; i++) {
    #       if (numbers[i] < min) min = numbers[i];
    #   }

    la      t0, numbers
    lw      t1, 0(t0)               # t1 = min = numbers[0]
    addi    t0, t0, 4               # Start from second element

    li      t2, 1                   # i = 1 (already processed element 0)

min_loop:
    bge     t2, s1, min_done        # Exit if i >= length

    lw      t3, 0(t0)               # t3 = numbers[i]
    bge     t3, t1, min_skip        # Skip if numbers[i] >= min

    mv      t1, t3                  # min = numbers[i] (found smaller)

min_skip:
    addi    t0, t0, 4               # Advance pointer
    addi    t2, t2, 1               # i++
    j       min_loop

min_done:
    mv      a2, t1                  # a2 = min = 4

    # =================================================================
    # FIND MAXIMUM VALUE
    # =================================================================
    # Similar to minimum, but use opposite comparison

    la      t0, numbers
    lw      t1, 0(t0)               # t1 = max = numbers[0]
    addi    t0, t0, 4

    li      t2, 1                   # i = 1

max_loop:
    bge     t2, s1, max_done

    lw      t3, 0(t0)               # t3 = numbers[i]
    ble     t3, t1, max_skip        # Skip if numbers[i] <= max

    mv      t1, t3                  # max = numbers[i]

max_skip:
    addi    t0, t0, 4
    addi    t2, t2, 1
    j       max_loop

max_done:
    mv      a3, t1                  # a3 = max = 55

    # =================================================================
    # COUNT ELEMENTS GREATER THAN THRESHOLD
    # =================================================================
    # Count how many elements are > 20
    #
    # Equivalent C code:
    #   int count = 0;
    #   for (int i = 0; i < ARRAY_LEN; i++) {
    #       if (numbers[i] > threshold) count++;
    #   }

    li      t5, 20                  # t5 = threshold
    la      t0, numbers
    li      t1, 0                   # t1 = count
    li      t2, 0                   # t2 = i

count_loop:
    bge     t2, s1, count_done

    lw      t3, 0(t0)               # t3 = numbers[i]
    ble     t3, t5, count_skip      # Skip if numbers[i] <= threshold

    addi    t1, t1, 1               # count++

count_skip:
    addi    t0, t0, 4
    addi    t2, t2, 1
    j       count_loop

count_done:
    mv      a4, t1                  # a4 = count of elements > 20
                                    # Elements > 20: 42, 23, 31, 55 = 4

    # =================================================================
    # COMPUTE AVERAGE (Integer Division by Shifting)
    # =================================================================
    # We can't divide without M extension, but we can approximate
    # For educational purposes: sum/length where length is 10
    # We'll use repeated subtraction (very inefficient!)

    mv      t0, a0                  # t0 = sum = 213
    li      t1, 0                   # t1 = quotient
    li      t2, 10                  # t2 = divisor (array length)

div_loop:
    blt     t0, t2, div_done        # Exit if remainder < divisor
    sub     t0, t0, t2              # remainder -= divisor
    addi    t1, t1, 1               # quotient++
    j       div_loop

div_done:
    mv      a5, t1                  # a5 = average = 21 (213 / 10)
    mv      a6, t0                  # a6 = remainder = 3

    # ----- End of Program -----
    ebreak

# =============================================================================
# Expected Final Register Values:
# =============================================================================
# Integer Registers:
#   a0 (x10)  = 213                   # Sum of array (index method)
#   a1 (x11)  = 213                   # Sum of array (pointer method) - should match
#   a2 (x12)  = 4                     # Minimum value in array
#   a3 (x13)  = 55                    # Maximum value in array
#   a4 (x14)  = 4                     # Count of elements > 20 (42, 23, 31, 55)
#   a5 (x15)  = 21                    # Average (integer: 213 / 10)
#   a6 (x16)  = 3                     # Remainder (213 mod 10)
#   s0 (x8)   = <address>             # Address of numbers array
#   s1 (x9)   = 10                    # Array length
#
# Array contents: [15, 42, 8, 23, 4, 16, 31, 7, 55, 12]
# Sum verification: 15+42+8+23+4+16+31+7+55+12 = 213
# =============================================================================
