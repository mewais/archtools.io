# =============================================================================
# RISC-V Sample Program: Vector Addition
# =============================================================================
# Description: Introduction to the V extension with simple vector addition
# Extension:   RVV (Vector Extension)
# Difficulty:  Advanced
#
# This program demonstrates:
#   - VSETVLI (Set Vector Length)
#   - VLE32.V / VSE32.V (Vector Load/Store)
#   - VADD.VV (Vector Add)
#   - Stripmine loop pattern for large arrays
#
# Key Concepts:
# - Vector registers (v0-v31) hold multiple elements
# - VSETVLI configures vector length based on available hardware
# - Stripmine pattern handles arrays of any size
# - One vector instruction operates on many elements simultaneously
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.data
    .align  4                       # Align to 16-byte boundary for vectors

# Source arrays (8 elements each)
array_a:
    .word   1, 2, 3, 4, 5, 6, 7, 8

array_b:
    .word   10, 20, 30, 40, 50, 60, 70, 80

# Destination array
array_c:
    .space  32                      # 8 words = 32 bytes

# Larger arrays for stripmine demo (16 elements)
large_a:
    .word   1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16

large_b:
    .word   100, 200, 300, 400, 500, 600, 700, 800
    .word   900, 1000, 1100, 1200, 1300, 1400, 1500, 1600

large_c:
    .space  64                      # 16 words = 64 bytes

.text
.globl _start

_start:
    # =================================================================
    # ENABLE VECTOR EXTENSION (Required for bare-metal execution)
    # =================================================================
    # Set VS (Vector State) bits in mstatus to enable vector instructions
    # VS bits are at positions 9:10, value 0x600 = Initial/Clean state
    li      t0, 0x600               # VS bits = Initial (01)
    csrs    mstatus, t0             # Enable vector extension

    # =================================================================
    # BASIC VECTOR ADDITION: C = A + B
    # =================================================================
    # This is the simplest vector operation pattern

    # ----- Step 1: Configure Vector Unit -----
    # VSETVLI rd, rs1, vtypei
    # rd: actual vector length (VL) that will be used
    # rs1: application vector length (AVL) - how many elements we want
    # vtypei: vector type (element width, etc.)

    li      t0, 8                   # t0 = 8 (we want to process 8 elements)

    vsetvli t1, t0, e32, m1, ta, ma
    # t1 = actual VL (may be <= 8 depending on hardware)
    # e32: element width = 32 bits
    # m1: LMUL = 1 (use 1 vector register per operand)
    # ta: tail agnostic (don't care about elements beyond VL)
    # ma: mask agnostic (don't care about masked-off elements)

    # If hardware supports VLEN >= 256, VL = 8
    # For smaller VLEN, VL < 8 and we'd need multiple iterations

    # ----- Step 2: Load Vectors -----
    la      a0, array_a             # a0 = address of A
    la      a1, array_b             # a1 = address of B
    la      a2, array_c             # a2 = address of C

    vle32.v v0, (a0)                # v0 = A[0:VL-1]
                                    # VLE32.V: Vector Load Element 32-bit
                                    # Loads VL consecutive 32-bit elements

    vle32.v v1, (a1)                # v1 = B[0:VL-1]

    # ----- Step 3: Vector Addition -----
    vadd.vv v2, v0, v1              # v2 = v0 + v1 (element-wise)
                                    # VADD.VV: Vector Add Vector-Vector
                                    # Each element: v2[i] = v0[i] + v1[i]

    # ----- Step 4: Store Result -----
    vse32.v v2, (a2)                # Store v2 to C
                                    # VSE32.V: Vector Store Element 32-bit

    # =================================================================
    # VERIFY RESULT
    # =================================================================
    # Load back one element to verify

    lw      a3, 0(a2)               # a3 = C[0] = 1 + 10 = 11
    lw      a4, 4(a2)               # a4 = C[1] = 2 + 20 = 22
    lw      a5, 28(a2)              # a5 = C[7] = 8 + 80 = 88

    # =================================================================
    # STRIPMINE LOOP: Handle Arrays Larger Than VL
    # =================================================================
    # Real-world arrays are often larger than what one vector register can hold
    # The stripmine pattern processes the array in chunks of VL elements

    la      a0, large_a             # a0 = pointer to A (will advance)
    la      a1, large_b             # a1 = pointer to B (will advance)
    la      a2, large_c             # a2 = pointer to C (will advance)
    li      t0, 16                  # t0 = n = total elements to process

stripmine_loop:
    # Set VL for this iteration
    # If remaining elements < max VL, use remaining; otherwise use max
    vsetvli t1, t0, e32, m1, ta, ma # t1 = min(remaining, max_VL)

    beqz    t1, stripmine_done      # Exit if VL = 0 (all done)

    # Load vectors
    vle32.v v4, (a0)                # v4 = A[i:i+VL-1]
    vle32.v v5, (a1)                # v5 = B[i:i+VL-1]

    # Add
    vadd.vv v6, v4, v5              # v6 = A + B

    # Store result
    vse32.v v6, (a2)                # C[i:i+VL-1] = v6

    # Update pointers
    # Advance by VL elements * 4 bytes per element
    slli    t2, t1, 2               # t2 = VL * 4
    add     a0, a0, t2              # A pointer += VL * 4
    add     a1, a1, t2              # B pointer += VL * 4
    add     a2, a2, t2              # C pointer += VL * 4

    # Update remaining count
    sub     t0, t0, t1              # remaining -= VL

    j       stripmine_loop

stripmine_done:
    # Verify stripmine result
    la      t3, large_c
    lw      a6, 0(t3)               # a6 = C[0] = 1 + 100 = 101
    lw      a7, 60(t3)              # a7 = C[15] = 16 + 1600 = 1616

    # =================================================================
    # VECTOR-SCALAR ADDITION
    # =================================================================
    # Add a scalar value to all elements of a vector

    li      t0, 8
    vsetvli t1, t0, e32, m1, ta, ma

    la      t2, array_a
    vle32.v v8, (t2)                # v8 = A

    li      t3, 100                 # t3 = scalar to add

    vadd.vx v9, v8, t3              # v9 = v8 + 100 (scalar broadcast)
                                    # VADD.VX: Vector Add Vector-Scalar (X register)
                                    # Each element: v9[i] = v8[i] + 100

    # v9 now contains: 101, 102, 103, 104, 105, 106, 107, 108

    # =================================================================
    # VECTOR WITH IMMEDIATE
    # =================================================================

    vadd.vi v10, v8, 5              # v10 = v8 + 5 (immediate)
                                    # VADD.VI: Vector Add Vector-Immediate
                                    # Immediate is sign-extended 5-bit (-16 to 15)

    # v10 now contains: 6, 7, 8, 9, 10, 11, 12, 13

    # ----- End of Program -----
    ebreak                          # Terminate execution

# =============================================================================
# Expected Final Register Values:
# =============================================================================
# Integer Registers:
# t0 (x5)   = 8                  # Last AVL requested
# t1 (x6)   = 8                  # Last VL (or hardware maximum VL)
# t2 (x7)   = 0x????????         # Address of array_a (set by la t2, array_a)
# t3 (x28)  = 0x????????         # 100 (scalar value for VADD.VX)
# a0 (x10)  = 0x????????         # Address after last large_a chunk
# a1 (x11)  = 0x????????         # Address after last large_b chunk
# a2 (x12)  = 0x????????         # Address after last large_c chunk
# a3 (x13)  = 11                 # array_c[0] = 1 + 10
# a4 (x14)  = 22                 # array_c[1] = 2 + 20
# a5 (x15)  = 88                 # array_c[7] = 8 + 80
# a6 (x16)  = 101                # large_c[0] = 1 + 100
# a7 (x17)  = 0x????????         # large_c[15] (may vary based on loop execution)
#
# Vector CSRs:
# vl        = 8                  # Last configured vector length
# vtype     = e32, m1, ta, ma    # Element width 32, LMUL=1
#
# Memory (array_c at data+36):
# [11, 22, 33, 44, 55, 66, 77, 88]
#
# Memory (large_c at data+136):
# [101, 202, 303, 404, 505, 606, 707, 808,
#  909, 1010, 1111, 1212, 1313, 1414, 1515, 1616]
#
# Vector Registers (final state, 32-bit elements):
# v0  = [1, 2, 3, 4, 5, 6, 7, 8, ...]           # array_a loaded
# v1  = [10, 20, 30, 40, 50, 60, 70, 80, ...]   # array_b loaded
# v2  = [11, 22, 33, 44, 55, 66, 77, 88, ...]   # A + B
# v4  = [1, 2, 3, 4, 5, 6, 7, 8, ...]           # large_a (last chunk)
# v5  = [900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, ...]  # large_b (last chunk)
# v6  = [909, 1010, 1111, 1212, 1313, 1414, 1515, 1616, ...]  # Last stripmine result
# v8  = [1, 2, 3, 4, 5, 6, 7, 8, ...]           # array_a reloaded
# v9  = [101, 102, 103, 104, 105, 106, 107, 108, ...]  # A + 100 (scalar)
# v10 = [6, 7, 8, 9, 10, 11, 12, 13, ...]       # A + 5 (immediate)
#
# Key Learning Points:
# - VSETVLI configures VL based on hardware capabilities
# - VLE/VSE for vector load/store (number indicates element size)
# - VADD.VV for vector-vector, VADD.VX for vector-scalar, VADD.VI for immediate
# - Stripmine loop handles arrays larger than one vector register
# - Vector instructions eliminate loop overhead for element operations
# =============================================================================
