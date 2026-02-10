# =============================================================================
# RISC-V Sample Program: Vector Dot Product
# =============================================================================
# Description: Computes dot product using RVV vector reduction operations
# Extension:   RVV (Vector Extension)
# Difficulty:  Advanced
#
# This program demonstrates:
#   - VMUL.VV (Vector Multiply)
#   - VREDSUM.VS (Vector Reduction Sum)
#   - VMV.X.S (Move scalar from vector to integer register)
#   - Complete dot product: sum(A[i] * B[i])
#
# Key Concepts:
# - Vector multiplication for element-wise products
# - Reduction operations collapse a vector to a scalar
# - Combining vector operations for complex computations
# - The dot product is a fundamental operation in linear algebra
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.data
    .align  4

# Test vectors for dot product (8 elements)
vector_a:
    .word   1, 2, 3, 4, 5, 6, 7, 8

vector_b:
    .word   2, 2, 2, 2, 2, 2, 2, 2

# Expected: dot = 1*2 + 2*2 + 3*2 + 4*2 + 5*2 + 6*2 + 7*2 + 8*2
#         = 2 + 4 + 6 + 8 + 10 + 12 + 14 + 16 = 72

# Another test case
vec_x:
    .word   1, 2, 3, 4

vec_y:
    .word   4, 3, 2, 1

# Expected: 1*4 + 2*3 + 3*2 + 4*1 = 4 + 6 + 6 + 4 = 20

# Larger vectors for stripmine demo
large_x:
    .word   1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1  # 16 ones

large_y:
    .word   1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16

# Expected: sum of 1 to 16 = 136

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
    # BASIC DOT PRODUCT: result = sum(A[i] * B[i])
    # =================================================================

    # Configure vector unit
    li      t0, 8                   # Process 8 elements
    vsetvli t1, t0, e32, m1, ta, ma # VL = 8 (or hardware max)

    # Load vectors
    la      a0, vector_a
    la      a1, vector_b

    vle32.v v0, (a0)                # v0 = A = [1, 2, 3, 4, 5, 6, 7, 8]
    vle32.v v1, (a1)                # v1 = B = [2, 2, 2, 2, 2, 2, 2, 2]

    # Element-wise multiplication
    vmul.vv v2, v0, v1              # v2 = A * B (element-wise)
                                    # v2 = [2, 4, 6, 8, 10, 12, 14, 16]

    # Reduction sum: sum all elements of v2
    # VREDSUM.VS vd, vs2, vs1
    # vd[0] = vs1[0] + sum(vs2[0:VL-1])
    # We use v3 as the accumulator with initial value 0

    vmv.v.i v3, 0                   # v3[0] = 0 (initial sum)
                                    # VMV.V.I: Move immediate to all elements

    vredsum.vs v4, v2, v3           # v4[0] = 0 + sum(v2) = 72
                                    # VREDSUM.VS: Vector Reduction Sum
                                    # Result is in v4[0], other elements undefined

    # Extract scalar result
    vmv.x.s a2, v4                  # a2 = v4[0] = 72
                                    # VMV.X.S: Move scalar from vector to X register

    # =================================================================
    # SECOND DOT PRODUCT TEST
    # =================================================================

    li      t0, 4
    vsetvli t1, t0, e32, m1, ta, ma

    la      a0, vec_x
    la      a1, vec_y

    vle32.v v5, (a0)                # v5 = [1, 2, 3, 4]
    vle32.v v6, (a1)                # v6 = [4, 3, 2, 1]

    vmul.vv v7, v5, v6              # v7 = [4, 6, 6, 4]

    vmv.v.i v8, 0                   # Initialize accumulator
    vredsum.vs v9, v7, v8           # v9[0] = sum(v7) = 20

    vmv.x.s a3, v9                  # a3 = 20

    # =================================================================
    # STRIPMINE DOT PRODUCT FOR LARGE VECTORS
    # =================================================================
    # Accumulate partial sums across multiple iterations

    la      s0, large_x             # s0 = pointer to X
    la      s1, large_y             # s1 = pointer to Y
    li      s2, 16                  # s2 = n = total elements
    li      s3, 0                   # s3 = running sum (accumulator)

dot_stripmine:
    vsetvli t0, s2, e32, m1, ta, ma # t0 = VL for this iteration
    beqz    t0, dot_done            # Exit if VL = 0

    # Load vectors
    vle32.v v10, (s0)               # v10 = X chunk
    vle32.v v11, (s1)               # v11 = Y chunk

    # Element-wise multiply
    vmul.vv v12, v10, v11           # v12 = X * Y (chunk)

    # Reduce this chunk
    vmv.v.i v13, 0                  # Initial value for reduction
    vredsum.vs v14, v12, v13        # v14[0] = sum of products in chunk

    # Add to running sum
    vmv.x.s t1, v14                 # t1 = partial sum
    add     s3, s3, t1              # running_sum += partial_sum

    # Advance pointers
    slli    t2, t0, 2               # t2 = VL * 4
    add     s0, s0, t2              # X pointer += VL * 4
    add     s1, s1, t2              # Y pointer += VL * 4
    sub     s2, s2, t0              # remaining -= VL

    j       dot_stripmine

dot_done:
    mv      a4, s3                  # a4 = final dot product = 136

    # =================================================================
    # WEIGHTED SUM VARIANT
    # =================================================================
    # Compute sum(data[i] * weight) where weight is a scalar

    li      t0, 8
    vsetvli t1, t0, e32, m1, ta, ma

    la      a0, vector_a
    vle32.v v15, (a0)               # v15 = [1, 2, 3, 4, 5, 6, 7, 8]

    li      t2, 10                  # t2 = weight = 10

    vmul.vx v16, v15, t2            # v16 = data * 10 (scalar multiply)
                                    # v16 = [10, 20, 30, 40, 50, 60, 70, 80]

    vmv.v.i v17, 0
    vredsum.vs v18, v16, v17        # v18[0] = sum(v16) = 360

    vmv.x.s a5, v18                 # a5 = 360

    # =================================================================
    # MINIMUM AND MAXIMUM ELEMENT
    # =================================================================
    # Use reduction operations to find min/max

    li      t0, 8
    vsetvli t1, t0, e32, m1, ta, ma

    la      a0, vector_a
    vle32.v v19, (a0)               # v19 = [1, 2, 3, 4, 5, 6, 7, 8]

    # Find maximum
    # VREDMAX needs a starting value; we'll use a very small number
    li      t3, 0x80000000          # t3 = INT_MIN
    vmv.v.x v20, t3                 # v20[0] = INT_MIN

    vredmax.vs v21, v19, v20        # v21[0] = max(v19)
    vmv.x.s a6, v21                 # a6 = 8 (maximum element)

    # Find minimum
    li      t3, 0x7FFFFFFF          # t3 = INT_MAX
    vmv.v.x v22, t3                 # v22[0] = INT_MAX

    vredmin.vs v23, v19, v22        # v23[0] = min(v19)
    vmv.x.s a7, v23                 # a7 = 1 (minimum element)

    # =================================================================
    # SUM OF SQUARES: sum(A[i]^2)
    # =================================================================
    # Common operation for computing vector magnitude

    li      t0, 4
    vsetvli t1, t0, e32, m1, ta, ma

    la      a0, vec_x
    vle32.v v24, (a0)               # v24 = [1, 2, 3, 4]

    vmul.vv v25, v24, v24           # v25 = [1, 4, 9, 16] (squares)

    vmv.v.i v26, 0
    vredsum.vs v27, v25, v26        # v27[0] = 1 + 4 + 9 + 16 = 30

    vmv.x.s s4, v27                 # s4 = 30

    # ----- End of Program -----
    ebreak                          # Terminate execution

# =============================================================================
# Expected Final Register Values:
# =============================================================================
# Integer Registers:
# t0 (x5)   = 4                  # Last AVL requested
# t1 (x6)   = 4                  # Last VL (or hardware maximum VL)
# t2 (x7)   = 10                 # Scalar value used in weighted sum
# t3 (x28)  = 0x7FFFFFFF         # INT_MAX used for min reduction
# a0 (x10)  = 0x????????         # Address of vec_x (last load)
# a1 (x11)  = 0x????????         # Address of vec_y (last load)
# a2 (x12)  = 72                 # Dot product: vector_a . vector_b = 72
# a3 (x13)  = 20                 # Dot product: vec_x . vec_y = 20
# a4 (x14)  = 136                # Large dot product (sum of 1..16) = 136
# a5 (x15)  = 360                # Weighted sum: (1+2+...+8) * 10 = 360
# a6 (x16)  = 8                  # Maximum element in vector_a
# a7 (x17)  = 1                  # Minimum element in vector_a
# s0 (x8)   = 0x????????         # Address after last large_x chunk
# s1 (x9)   = 0x????????         # Address after last large_y chunk
# s2 (x18)  = 0                  # Remaining elements (loop done)
# s3 (x19)  = 136                # Running sum accumulator
# s4 (x20)  = 30                 # Sum of squares: 1^2 + 2^2 + 3^2 + 4^2 = 30
#
# Vector CSRs:
# vl        = 4                  # Last configured vector length
# vtype     = e32, m1, ta, ma    # Element width 32, LMUL=1
#
# Vector Registers (final state, 32-bit elements):
# v0  = [1, 2, 3, 4, 5, 6, 7, 8, ...]           # vector_a loaded
# v1  = [2, 2, 2, 2, 2, 2, 2, 2, ...]           # vector_b loaded
# v2  = [2, 4, 6, 8, 10, 12, 14, 16, ...]       # v0 * v1 (element-wise)
# v3  = [0, ...]                                # Zero vector for reduction
# v4  = [72, ?, ?, ...]                         # Reduction sum result (v4[0] = 72)
# v5  = [1, 2, 3, 4, ...]                       # vec_x loaded
# v6  = [4, 3, 2, 1, ...]                       # vec_y loaded
# v7  = [4, 6, 6, 4, ...]                       # v5 * v6 (element-wise)
# v8  = [0, ...]                                # Zero vector for reduction
# v9  = [20, ?, ?, ...]                         # Reduction sum result (v9[0] = 20)
# v10 = [9, 10, 11, 12, 13, 14, 15, 16, ...]    # large_x (last chunk)
# v11 = [9, 10, 11, 12, 13, 14, 15, 16, ...]    # large_y (last chunk)
# v12 = [81, 100, 121, 144, 169, 196, 225, 256, ...]  # v10 * v11 (last chunk)
# v13 = [0, ...]                                # Zero vector for reduction
# v14 = [1016, ?, ?, ...]                       # Last chunk sum (9*9 + ... + 16*16)
# v15 = [1, 2, 3, 4, 5, 6, 7, 8, ...]           # vector_a reloaded
# v16 = [10, 20, 30, 40, 50, 60, 70, 80, ...]   # v15 * 10 (scalar)
# v17 = [0, ...]                                # Zero vector for reduction
# v18 = [360, ?, ?, ...]                        # Weighted sum result
# v19 = [1, 2, 3, 4, 5, 6, 7, 8, ...]           # vector_a for min/max
# v20 = [0x80000000, ...]                       # INT_MIN for max reduction
# v21 = [8, ?, ?, ...]                          # Max reduction result
# v22 = [0x7FFFFFFF, ...]                       # INT_MAX for min reduction
# v23 = [1, ?, ?, ...]                          # Min reduction result
# v24 = [1, 2, 3, 4, ...]                       # vec_x for squares
# v25 = [1, 4, 9, 16, ...]                      # v24 * v24 (squares)
# v26 = [0, ...]                                # Zero vector for reduction
# v27 = [30, ?, ?, ...]                         # Sum of squares result
#
# Key Learning Points:
# - VMUL.VV for element-wise vector multiplication
# - VREDSUM.VS reduces vector to scalar (sum)
# - VREDMAX.VS / VREDMIN.VS for max/min reduction
# - VMV.X.S extracts scalar from vector element 0
# - VMV.V.I moves immediate to all vector elements
# - VMV.V.X broadcasts scalar register to all vector elements
# - Stripmine pattern accumulates partial sums for large arrays
# - Dot product = multiply + reduce (fundamental ML/graphics operation)
#
# Performance Note:
# In real hardware, vector operations can process many elements
# in parallel, making dot products much faster than scalar loops.
# =============================================================================
