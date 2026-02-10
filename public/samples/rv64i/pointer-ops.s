# =============================================================================
# RISC-V Sample Program: 64-bit Pointer Operations
# =============================================================================
# Description: Demonstrates 64-bit address manipulation and memory access
# Extension:   RV64I (64-bit Base Integer)
# Difficulty:  Intermediate
#
# This program demonstrates:
#   - 64-bit pointer arithmetic
#   - LD/SD (Load/Store Doubleword - 64 bits)
#   - LWU (Load Word Unsigned - zero extends to 64 bits)
#   - Struct-like memory access
#   - 64-bit array indexing
#
# Key Concept: In RV64I, pointers are 64 bits. This allows addressing
# much larger memory spaces (up to 2^64 bytes theoretically).
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.data
    .align  3                       # Align to 8-byte boundary for doublewords

# A 64-bit array (each element is 8 bytes)
array64:
    .dword  0x1111111111111111      # array64[0]
    .dword  0x2222222222222222      # array64[1]
    .dword  0x3333333333333333      # array64[2]
    .dword  0x4444444444444444      # array64[3]

# A struct-like memory layout
# struct { uint64_t id; uint32_t value; uint32_t flags; }
# Total size: 16 bytes
struct_data:
    .dword  0xDEADBEEFCAFEBABE      # id (8 bytes)
    .word   42                      # value (4 bytes)
    .word   0x0F                    # flags (4 bytes)

# Mixed-size data for type conversion demos
mixed_data:
    .word   0xFFFFFFFF              # 32-bit value (all 1s)
    .word   0x80000001              # 32-bit negative-looking value
    .dword  0x123456789ABCDEF0      # 64-bit value

# Buffer for writing
buffer64:
    .space  64                      # 64 bytes of uninitialized space

.text
.globl _start

_start:
    # =================================================================
    # 64-BIT LOAD AND STORE (LD/SD)
    # =================================================================

    la      s0, array64             # s0 = base address of 64-bit array

    ld      t0, 0(s0)               # t0 = array64[0] = 0x1111111111111111
                                    # LD: Load Doubleword (64 bits)

    ld      t1, 8(s0)               # t1 = array64[1] = 0x2222222222222222
                                    # Offset 8 bytes (size of doubleword)

    ld      t2, 16(s0)              # t2 = array64[2] = 0x3333333333333333

    # Store a 64-bit value
    la      s1, buffer64            # s1 = buffer address
    li      t3, 0xABCDEF0123456789  # t3 = value to store

    sd      t3, 0(s1)               # Store 64-bit value at buffer
                                    # SD: Store Doubleword

    ld      t4, 0(s1)               # t4 = load it back to verify
                                    # t4 should equal t3

    # =================================================================
    # 64-BIT ARRAY INDEXING
    # =================================================================
    # Access array64[i] where i is in a register
    # Address = base + (i * 8)

    li      a0, 2                   # a0 = index = 2

    slli    a1, a0, 3               # a1 = index * 8 (doubleword size)
                                    # Shift left by 3 = multiply by 8

    add     a2, s0, a1              # a2 = &array64[2]
    ld      a3, 0(a2)               # a3 = array64[2] = 0x3333333333333333

    # =================================================================
    # STRUCT ACCESS PATTERN
    # =================================================================
    # Accessing fields of a C-style struct in memory

    la      s2, struct_data         # s2 = pointer to struct

    # Access id field (offset 0, 8 bytes)
    ld      t5, 0(s2)               # t5 = struct.id = 0xDEADBEEFCAFEBABE

    # Access value field (offset 8, 4 bytes)
    lw      t6, 8(s2)               # t6 = struct.value = 42
                                    # LW sign-extends to 64 bits (but 42 is positive)

    # Access flags field (offset 12, 4 bytes)
    lw      a4, 12(s2)              # a4 = struct.flags = 0x0F

    # =================================================================
    # LWU vs LW: Zero Extension vs Sign Extension
    # =================================================================
    # This is crucial for correct 64-bit programming!

    la      s3, mixed_data          # s3 = address of mixed data

    lw      a5, 0(s3)               # a5 = load 0xFFFFFFFF with SIGN extension
                                    # Result: 0xFFFFFFFFFFFFFFFF (interpreted as -1)

    lwu     a6, 0(s3)               # a6 = load 0xFFFFFFFF with ZERO extension
                                    # Result: 0x00000000FFFFFFFF (4,294,967,295)

    # Another example with a value that has bit 31 set
    lw      a7, 4(s3)               # Load 0x80000001 with sign extension
                                    # Result: 0xFFFFFFFF80000001 (negative)

    lwu     s4, 4(s3)               # Load 0x80000001 with zero extension
                                    # Result: 0x0000000080000001 (positive)

    # =================================================================
    # POINTER ARITHMETIC WITH 64-BIT ADDRESSES
    # =================================================================

    la      s5, array64             # s5 = start of array
    li      s6, 4                   # s6 = array length

    # Calculate end pointer: end = start + (length * element_size)
    slli    s7, s6, 3               # s7 = length * 8
    add     s8, s5, s7              # s8 = end pointer (one past last element)

    # Iterate with pointers
    mv      s9, s5                  # s9 = current pointer
    li      s10, 0                  # s10 = sum (will overflow, but demonstrates concept)

ptr_sum_loop:
    bge     s9, s8, ptr_sum_done    # Exit if ptr >= end

    ld      s11, 0(s9)              # Load current element
    add     s10, s10, s11           # Add to sum

    addi    s9, s9, 8               # ptr += 8 (advance by one doubleword)
    j       ptr_sum_loop

ptr_sum_done:
    # s10 now contains sum of all 64-bit elements

    # =================================================================
    # COPYING 64-BIT DATA
    # =================================================================

    la      t0, array64             # t0 = source
    la      t1, buffer64            # t1 = destination
    addi    t1, t1, 16              # Start at buffer64 + 16

    # Copy array64[0] and array64[1] to buffer
    ld      t2, 0(t0)               # Load array64[0]
    sd      t2, 0(t1)               # Store to buffer+16

    ld      t2, 8(t0)               # Load array64[1]
    sd      t2, 8(t1)               # Store to buffer+24

    # =================================================================
    # ADDRESS MANIPULATION
    # =================================================================
    # Demonstrate extracting parts of a 64-bit address

    la      t3, struct_data         # t3 = some 64-bit address

    # Get lower 12 bits (page offset in typical VM systems)
    # Note: andi only supports 12-bit signed immediates (-2048 to 2047)
    # 0xFFF = 4095 is out of range, so we use a register
    li      t4, 0xFFF               # t4 = page offset mask
    and     t4, t3, t4              # t4 = address & 0xFFF

    # Get upper bits (page number)
    srli    t5, t3, 12              # t5 = address >> 12

    # ----- End of Program -----
    ebreak                          # Terminate execution for Spike testing

# =============================================================================
# Expected Final Register Values (64-bit):
# =============================================================================
# x5  (t0)  = address of array64 (source pointer for copy operation)
# x6  (t1)  = buffer64 + 16 (destination pointer after copy setup)
# x7  (t2)  = 0x2222222222222222  # Last copied value
# x28 (t3)  = address of struct_data (64-bit pointer)
# x29 (t4)  = lower 12 bits of struct_data address
# x30 (t5)  = upper bits of struct_data address (addr >> 12)
# x31 (t6)  = 0x000000000000002A  # struct.value = 42 (from LW)
# x10 (a0)  = 0x0000000000000002  # Array index = 2
# x11 (a1)  = 0x0000000000000010  # index * 8 = 16
# x12 (a2)  = array64 + 16 (pointer to array64[2])
# x13 (a3)  = 0x3333333333333333  # array64[2] via indexing
# x14 (a4)  = 0x000000000000000F  # struct.flags = 0x0F
# x15 (a5)  = 0xFFFFFFFFFFFFFFFF  # -1 (LW sign extended from 0xFFFFFFFF)
# x16 (a6)  = 0x00000000FFFFFFFF  # 4294967295 (LWU zero extended)
# x17 (a7)  = 0xFFFFFFFF80000001  # Sign extended negative (LW)
# x8  (s0)  = address of array64 (64-bit pointer)
# x9  (s1)  = address of buffer64 (64-bit pointer)
# x18 (s2)  = address of struct_data (64-bit pointer)
# x19 (s3)  = address of mixed_data (64-bit pointer)
# x20 (s4)  = 0x0000000080000001  # Zero extended positive (LWU)
# x21 (s5)  = address of array64 (start pointer)
# x22 (s6)  = 0x0000000000000004  # Array length = 4
# x23 (s7)  = 0x0000000000000020  # length * 8 = 32
# x24 (s8)  = array64 + 32 (end pointer, one past last element)
# x25 (s9)  = array64 + 32 (final pointer after loop)
# x26 (s10) = 0xAAAAAAAAAAAAAAAA  # Sum of array elements (wraps)
# x27 (s11) = 0x4444444444444444  # Last loaded array element in loop
#
# Memory Layout:
# buffer64 + 0:  0xABCDEF0123456789  (stored by SD)
# buffer64 + 16: 0x1111111111111111  (copied array64[0])
# buffer64 + 24: 0x2222222222222222  (copied array64[1])
#
# Key Learning Points:
# - LD/SD for 64-bit memory access (8 bytes at a time)
# - LWU vs LW: crucial difference for 64-bit code (zero vs sign extension)
# - Array indexing = base + (index * element_size), element_size=8 for dwords
# - Pointer arithmetic uses byte offsets, not element counts
# - Struct field access uses byte offsets from base pointer
# =============================================================================
