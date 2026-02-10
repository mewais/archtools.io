# =============================================================================
# RISC-V Sample Program: Float Conversion Operations
# =============================================================================
# Description: Demonstrates conversions between integers and floats
# Extension:   RVF (Single-Precision Floating Point)
# Difficulty:  Intermediate
#
# This program demonstrates:
#   - FCVT.S.W: Convert signed int to float
#   - FCVT.S.WU: Convert unsigned int to float
#   - FCVT.W.S: Convert float to signed int
#   - FCVT.WU.S: Convert float to unsigned int
#   - Rounding modes and their effects
#
# Key Concept: Conversion changes the VALUE representation.
# FMV just copies bits without changing interpretation.
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.data
    .align  2
float_values:
    .float  3.7                     # Positive with fraction
    .float  -2.5                    # Negative with fraction
    .float  100.0                   # Exact integer value
    .float  0.999999                # Just under 1
    .float  2147483648.0            # 2^31 (overflow for signed int)
    .float  -0.5                    # Small negative
float_nan:
    .word   0x7FC00000              # Quiet NaN bit pattern
float_inf:
    .word   0x7F800000              # Positive infinity bit pattern

.text
.globl _start

_start:
    # =================================================================
    # ENABLE FLOATING-POINT UNIT
    # =================================================================
    # Before using any FP instructions, we must enable the FPU by
    # setting mstatus.FS to Initial (01) or higher.
    # mstatus.FS is bits [14:13], so we set bit 13 (value 0x2000).
    # We use gp (x3) as a temporary to avoid clobbering test registers.

    lui     gp, 0x2                 # gp = 0x2000 (bit 13)
    csrs    mstatus, gp             # Set mstatus.FS = Initial

    # =================================================================
    # INTEGER TO FLOAT CONVERSION (FCVT.S.W)
    # =================================================================
    # FCVT.S.W: Convert signed 32-bit integer to single-precision float

    li      t0, 42                  # t0 = 42 (integer)
    fcvt.s.w f0, t0                 # f0 = 42.0 (as float)
                                    # Exact conversion - 42 can be represented exactly

    li      t1, -100                # t1 = -100
    fcvt.s.w f1, t1                 # f1 = -100.0

    # Large integer - may lose precision
    li      t2, 16777217            # t2 = 2^24 + 1 = 16777217
    fcvt.s.w f2, t2                 # f2 = 16777216.0 (loses the +1!)
                                    # Single-precision has only 24 bits of mantissa
                                    # So 16777217 rounds to 16777216

    # =================================================================
    # UNSIGNED INTEGER TO FLOAT (FCVT.S.WU)
    # =================================================================

    li      t3, 0xFFFFFFFF          # t3 = max unsigned (4294967295)
    fcvt.s.wu f3, t3                # f3 = 4294967296.0 (approximately)
                                    # Converted as unsigned, not -1

    # Compare with signed conversion
    fcvt.s.w f4, t3                 # f4 = -1.0 (t3 interpreted as signed -1)

    # =================================================================
    # FLOAT TO INTEGER CONVERSION (FCVT.W.S)
    # =================================================================
    # FCVT.W.S: Convert float to signed 32-bit integer
    # Default rounding mode: round toward zero (truncation)

    la      t4, float_values
    flw     f5, 0(t4)               # f5 = 3.7

    fcvt.w.s.rtz t5, f5             # t5 = 3 (truncated toward zero)
                                    # Not 4! Rounding toward zero.

    flw     f6, 4(t4)               # f6 = -2.5
    fcvt.w.s.rtz t6, f6             # t6 = -2 (truncated toward zero)
                                    # Not -3! Truncation means toward zero.

    # =================================================================
    # ROUNDING MODES
    # =================================================================
    # RISC-V supports 5 rounding modes:
    # rne (0): Round to Nearest, ties to Even (default)
    # rtz (1): Round toward Zero (truncate)
    # rdn (2): Round Down (toward -infinity)
    # rup (3): Round Up (toward +infinity)
    # rmm (4): Round to Nearest, ties to Max Magnitude

    flw     f7, 0(t4)               # f7 = 3.7

    # Round to Nearest (ties to even)
    fcvt.w.s a0, f7, rne            # a0 = 4 (3.7 rounds to 4)

    # Round toward Zero (truncate)
    fcvt.w.s a1, f7, rtz            # a1 = 3 (truncate toward zero)

    # Round Down (toward -infinity)
    fcvt.w.s a2, f7, rdn            # a2 = 3 (floor)

    # Round Up (toward +infinity)
    fcvt.w.s a3, f7, rup            # a3 = 4 (ceiling)

    # Test with negative number
    flw     f8, 4(t4)               # f8 = -2.5

    fcvt.w.s a4, f8, rne            # a4 = -2 (ties to even: -2.5 -> -2)
    fcvt.w.s a5, f8, rtz            # a5 = -2 (toward zero)
    fcvt.w.s a6, f8, rdn            # a6 = -3 (toward -infinity)
    fcvt.w.s a7, f8, rup            # a7 = -2 (toward +infinity)

    # =================================================================
    # UNSIGNED FLOAT TO INTEGER (FCVT.WU.S)
    # =================================================================

    flw     f9, 8(t4)               # f9 = 100.0
    fcvt.wu.s s0, f9                # s0 = 100 (unsigned)

    # Negative float to unsigned - saturates to 0
    fcvt.wu.s s1, f8                # s1 = 0 (negative float -> 0 unsigned)

    # Large float to unsigned
    flw     f10, 16(t4)             # f10 = 2147483648.0 (2^31)
    fcvt.wu.s s2, f10               # s2 = 2147483648 (valid as unsigned)
    fcvt.w.s s3, f10                # s3 = 2147483647 (saturates to max signed)

    # =================================================================
    # OVERFLOW AND SPECIAL CASES
    # =================================================================

    # Float too large for int - saturates to MAX_INT or MIN_INT
    li      s4, 0x4F000000          # s4 = IEEE 754 for very large float
    fmv.w.x f11, s4                 # f11 = large float (about 2^31)

    fcvt.w.s s5, f11                # s5 = INT_MAX (saturates)

    # NaN converts to 0 (or implementation-defined)
    la      t0, float_nan
    lw      t1, 0(t0)
    fmv.w.x f12, t1                 # f12 = NaN
    fcvt.w.s s6, f12                # s6 = 0x7FFFFFFF (canonical NaN -> max int)

    # Infinity
    la      t0, float_inf
    lw      t1, 0(t0)
    fmv.w.x f13, t1                 # f13 = +infinity
    fcvt.w.s s7, f13                # s7 = INT_MAX (positive infinity saturates)

    # =================================================================
    # PRACTICAL EXAMPLE: Fixed-Point Simulation
    # =================================================================
    # Convert between fixed-point (integer with implicit decimal) and float
    # Using 8 fractional bits: 256 = 1.0

    li      s8, 640                 # s8 = 2.5 in 8.8 fixed point (2.5 * 256)
    fcvt.s.w f14, s8                # f14 = 640.0

    li      s9, 256                 # s9 = scale factor
    fcvt.s.w f15, s9                # f15 = 256.0

    fdiv.s  f16, f14, f15           # f16 = 640.0 / 256.0 = 2.5

    # Convert back to fixed point
    li      s10, 768                # s10 = 3.0 in fixed point (3 * 256)
    fcvt.s.w f17, s10               # f17 = 768.0
    fdiv.s  f18, f17, f15           # f18 = 3.0

    fadd.s  f19, f16, f18           # f19 = 2.5 + 3.0 = 5.5

    # Convert result back to fixed point
    fmul.s  f20, f19, f15           # f20 = 5.5 * 256 = 1408.0
    fcvt.w.s s11, f20               # s11 = 1408 (5.5 in 8.8 fixed point)

    # ----- End of Program -----
    ebreak                          # Terminate program for Spike

# =============================================================================
# Expected Final Register Values:
# =============================================================================
# Integer Registers:
#   gp (x3)  = 0x00002000          # FPU enable value (used at start)
#   t0 (x5)  = address             # Reused for float_inf address
#   t1 (x6)  = 0x7F800000          # Reused for +Inf bit pattern
#   t2 (x7)  = 16777217            # Large integer (2^24 + 1)
#   t3 (x28) = 0xFFFFFFFF          # Max unsigned / -1 signed
#   t4 (x29) = address             # Address of float_values
#   t5 (x30) = 3                   # 3.7 truncated toward zero
#   t6 (x31) = -2                  # -2.5 truncated toward zero
#   a0 (x10) = 4                   # 3.7 rounded to nearest
#   a1 (x11) = 3                   # 3.7 rounded toward zero
#   a2 (x12) = 3                   # 3.7 rounded down (floor)
#   a3 (x13) = 4                   # 3.7 rounded up (ceiling)
#   a4 (x14) = -2                  # -2.5 round to nearest (ties to even)
#   a5 (x15) = -2                  # -2.5 toward zero
#   a6 (x16) = -3                  # -2.5 toward -infinity (floor)
#   a7 (x17) = -2                  # -2.5 toward +infinity (ceiling)
#   s0 (x8)  = 100                 # 100.0 as unsigned int
#   s1 (x9)  = 0                   # negative float -> 0 unsigned (saturated)
#   s2 (x18) = 2147483648          # 2^31 as unsigned (0x80000000, valid)
#   s3 (x19) = 2147483647          # 2^31 as signed (saturated to INT_MAX)
#   s4 (x20) = 0x4F000000          # Large float bit pattern
#   s5 (x21) = 2147483647          # Large float saturated to INT_MAX
#   s6 (x22) = 0x7FFFFFFF          # NaN -> canonical max int
#   s7 (x23) = 2147483647          # +Infinity saturated to INT_MAX
#   s8 (x24) = 640                 # Fixed-point 2.5 (2.5 * 256)
#   s9 (x25) = 256                 # Fixed-point scale factor
#   s10 (x26) = 768                # Fixed-point 3.0 (3 * 256)
#   s11 (x27) = 1408               # Fixed-point 5.5 (5.5 * 256)
#
# FP Registers:
#   f0  (ft0) = 42.0        (0x42280000)           # Integer 42 converted
#   f1  (ft1) = -100.0      (0xC2C80000)           # Integer -100 converted
#   f2  (ft2) = 16777216.0  (0x4B800000)           # Large int (precision lost from 16777217)
#   f3  (ft3) = 4294967296.0 (0x4F800000)          # Max unsigned (0xFFFFFFFF) as float
#   f4  (ft4) = -1.0        (0xBF800000)           # 0xFFFFFFFF interpreted as signed -1
#   f5  (ft5) = 3.7         (0x406CCCCD)           # From memory
#   f6  (ft6) = -2.5        (0xC0200000)           # From memory
#   f7  (ft7) = 3.7         (0x406CCCCD)           # For rounding mode tests
#   f8  (fs0) = -2.5        (0xC0200000)           # For negative rounding tests
#   f9  (fs1) = 100.0       (0x42C80000)           # From memory
#   f10 (fa0) = 2147483648.0 (0x4F000000)          # 2^31 as float
#   f11 (fa1) = (large)     (0x4F000000)           # Very large float
#   f12 (fa2) = NaN         (0x7FC00000)           # Quiet NaN
#   f13 (fa3) = +Inf        (0x7F800000)           # Positive infinity
#   f14 (fa4) = 640.0       (0x44200000)           # Fixed-point 2.5 scaled
#   f15 (fa5) = 256.0       (0x43800000)           # Scale factor
#   f16 (fa6) = 2.5         (0x40200000)           # 640.0 / 256.0
#   f17 (fa7) = 768.0       (0x44400000)           # Fixed-point 3.0 scaled
#   f18 (fs2) = 3.0         (0x40400000)           # 768.0 / 256.0
#   f19 (fs3) = 5.5         (0x40B00000)           # 2.5 + 3.0
#   f20 (fs4) = 1408.0      (0x44B00000)           # 5.5 * 256
#
# Key Learning Points:
# - FCVT.S.W/WU: Integer to float (may lose precision for large values)
# - FCVT.W.S/WU.S: Float to integer (rounding mode matters!)
# - Rounding modes: rne, rtz, rdn, rup, rmm
# - Overflow saturates to INT_MAX/INT_MIN/0
# - W = signed, WU = unsigned
# - FPU must be enabled via mstatus.FS before use
# =============================================================================
