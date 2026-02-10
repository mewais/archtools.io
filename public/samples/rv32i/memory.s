# =============================================================================
# RISC-V Sample Program: Memory Operations
# =============================================================================
# Description: Demonstrates load and store instructions for memory access
# Extension:   RV32I (Base Integer)
# Difficulty:  Beginner
#
# This program demonstrates:
#   - LW/SW (Load/Store Word - 32 bits)
#   - LH/SH (Load/Store Halfword - 16 bits)
#   - LB/SB (Load/Store Byte - 8 bits)
#   - LHU/LBU (Unsigned load variants)
#   - Address calculation with offsets
#
# Key Concept: RISC-V is a load/store architecture.
# Arithmetic only works on registers - data must be loaded from memory first.
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.data
    # Reserve space for our data
    # Note: .data section starts at a known address (often 0x10000)
my_word:    .word   0x12345678      # 32-bit word
my_half:    .half   0xABCD          # 16-bit halfword
my_byte:    .byte   0x42            # 8-bit byte
            .align  2               # Align to 4-byte boundary
my_array:   .word   10, 20, 30, 40  # Array of 4 words
my_neg:     .half   -100            # Negative halfword for sign extension demo
            .align  2               # Align to 4-byte boundary for word access
my_buffer:  .space  16              # 16 bytes of uninitialized space

.text
.globl _start

_start:
    # ----- Setup: Get base address of data section -----
    la      s0, my_word             # s0 = address of my_word
                                    # LA (Load Address) is a pseudo-instruction

    # =================================================================
    # WORD OPERATIONS (32 bits)
    # =================================================================

    lw      t0, 0(s0)               # t0 = memory[s0 + 0] = 0x12345678
                                    # LW: Load Word from memory
                                    # Format: LW rd, offset(base)

    li      t1, 0xDEADBEEF          # t1 = value to store
    la      s1, my_buffer           # s1 = address of buffer
    sw      t1, 0(s1)               # memory[s1] = 0xDEADBEEF
                                    # SW: Store Word to memory

    lw      t2, 0(s1)               # t2 = load back what we stored
                                    # t2 should equal 0xDEADBEEF

    # =================================================================
    # HALFWORD OPERATIONS (16 bits)
    # =================================================================

    la      s2, my_half             # s2 = address of my_half
    lh      t3, 0(s2)               # t3 = load halfword (sign-extended)
                                    # 0xABCD -> 0xFFFFABCD (sign extended!)
                                    # Because bit 15 is 1, it's treated as negative

    lhu     t4, 0(s2)               # t4 = load halfword (zero-extended)
                                    # 0xABCD -> 0x0000ABCD
                                    # LHU: Unsigned - always zero extends

    li      t5, 0x1234              # t5 = halfword to store
    sh      t5, 4(s1)               # Store halfword at buffer+4
                                    # Only lower 16 bits are stored

    # =================================================================
    # BYTE OPERATIONS (8 bits)
    # =================================================================

    la      s3, my_byte             # s3 = address of my_byte
    lb      t6, 0(s3)               # t6 = load byte (sign-extended)
                                    # 0x42 -> 0x00000042 (positive, so same)

    li      a0, 0xFF                # a0 = 255 (0xFF)
    sb      a0, 8(s1)               # Store byte at buffer+8

    lb      a1, 8(s1)               # a1 = load byte (sign-extended)
                                    # 0xFF -> 0xFFFFFFFF (sign extended to -1)

    lbu     a2, 8(s1)               # a2 = load byte (zero-extended)
                                    # 0xFF -> 0x000000FF (255)

    # =================================================================
    # ARRAY ACCESS (Indexed Memory)
    # =================================================================

    la      s4, my_array            # s4 = base address of array
                                    # Array contains: [10, 20, 30, 40]

    lw      a3, 0(s4)               # a3 = array[0] = 10
    lw      a4, 4(s4)               # a4 = array[1] = 20 (offset = 1 * 4 bytes)
    lw      a5, 8(s4)               # a5 = array[2] = 30 (offset = 2 * 4 bytes)
    lw      a6, 12(s4)              # a6 = array[3] = 40 (offset = 3 * 4 bytes)

    # Calculate sum of array elements
    add     a7, a3, a4              # a7 = 10 + 20 = 30
    add     a7, a7, a5              # a7 = 30 + 30 = 60
    add     a7, a7, a6              # a7 = 60 + 40 = 100 (sum of array)

    # =================================================================
    # POINTER ARITHMETIC
    # =================================================================

    la      s5, my_array            # s5 = pointer to array start
    li      s6, 0                   # s6 = loop index
    li      s7, 0                   # s7 = running sum
    li      s8, 4                   # s8 = array length

ptr_loop:
    bge     s6, s8, ptr_done        # Exit if index >= length

    slli    s9, s6, 2               # s9 = index * 4 (word size)
    add     s10, s5, s9             # s10 = base + offset = &array[index]
    lw      s11, 0(s10)             # s11 = *s10 = array[index]
    add     s7, s7, s11             # sum += array[index]

    addi    s6, s6, 1               # index++
    j       ptr_loop

ptr_done:
    # s7 should also equal 100 (same as a7)

    # =================================================================
    # SIGN EXTENSION DEMONSTRATION
    # =================================================================

    la      s0, my_neg              # s0 = address of negative halfword (-100)

    lh      t0, 0(s0)               # t0 = -100 (sign extended to 32 bits)
                                    # Binary: 0xFFFFFF9C

    lhu     t1, 0(s0)               # t1 = 65436 (zero extended)
                                    # Binary: 0x0000FF9C
                                    # Same bits, but interpreted as unsigned!

    # ----- End of Program -----
    ebreak

# =============================================================================
# Expected Final Register Values:
# =============================================================================
# Integer Registers:
#   t0 (x5)   = -100 (0xFFFFFF9C)     # Sign-extended negative halfword
#   t1 (x6)   = 65436 (0x0000FF9C)    # Zero-extended same bits
#   t2 (x7)   = 3735928559 (0xDEADBEEF) # Loaded back stored word
#   t3 (x28)  = -21555 (0xFFFFABCD)   # Sign-extended halfword (negative)
#   t4 (x29)  = 43981 (0x0000ABCD)    # Zero-extended halfword
#   t5 (x30)  = 4660 (0x1234)         # Halfword value stored
#   t6 (x31)  = 66 (0x42)             # Byte (positive, same after sign-extend)
#   a0 (x10)  = 255 (0xFF)            # Byte to store
#   a1 (x11)  = -1 (0xFFFFFFFF)       # 0xFF sign-extended
#   a2 (x12)  = 255 (0xFF)            # 0xFF zero-extended
#   a3 (x13)  = 10                    # array[0]
#   a4 (x14)  = 20                    # array[1]
#   a5 (x15)  = 30                    # array[2]
#   a6 (x16)  = 40                    # array[3]
#   a7 (x17)  = 100                   # Sum of array
#   s7 (x23)  = 100                   # Sum via pointer loop
#
# Memory Layout after execution (my_buffer at 0x201C):
# my_buffer+0 (0x201C):  0xDEADBEEF (word)
# my_buffer+4 (0x2020):  0x1234 (halfword)
# my_buffer+8 (0x2024):  0xFF (byte)
# =============================================================================
