# =============================================================================
# RISC-V Sample Program: Single-Precision Floating Point Basics
# =============================================================================
# Description: Introduction to the F extension for single-precision floats
# Extension:   RVF (Single-Precision Floating Point)
# Difficulty:  Intermediate
#
# This program demonstrates:
#   - FLW/FSW (Load/Store float word)
#   - FADD.S, FSUB.S, FMUL.S, FDIV.S (arithmetic)
#   - FSQRT.S (square root)
#   - FMV.X.W, FMV.W.X (move between int and float registers)
#   - Floating-point comparisons
#
# Key Concepts:
# - RISC-V has 32 separate floating-point registers: f0-f31
# - Floats use IEEE 754 single-precision format (32 bits)
# - Integer and float registers are separate - use FMV to transfer
# - FPU must be enabled via mstatus.FS before use
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.data
    .align  2
# Single-precision float constants (IEEE 754 format)
float_pi:       .float  3.14159265      # Pi
float_e:        .float  2.71828182      # Euler's number
float_half:     .float  0.5             # 0.5
float_two:      .float  2.0             # 2.0
float_neg:      .float  -1.5            # Negative float
float_zero:     .float  0.0             # Zero
float_array:    .float  1.0, 2.0, 3.0, 4.0   # Array of floats
result_buffer:  .space  32              # Space for storing results

.text
.globl _start

_start:
    # =================================================================
    # ENABLE FLOATING-POINT UNIT
    # =================================================================
    # Before using any FP instructions, we must enable the FPU by
    # setting mstatus.FS to Initial (01) or higher.
    # mstatus.FS is bits [14:13], so we set bit 13 (value 0x2000).

    lui     s11, 0x2                # s11 = 0x2000 (bit 13)
    csrs    mstatus, s11            # Set mstatus.FS = Initial

    # =================================================================
    # LOADING FLOATING-POINT VALUES (FLW)
    # =================================================================
    # FLW loads a 32-bit float from memory into an f register

    la      t0, float_pi            # t0 = address of pi
    flw     f0, 0(t0)               # f0 = 3.14159265
                                    # FLW: Floating Load Word

    la      t1, float_e
    flw     f1, 0(t1)               # f1 = 2.71828182

    la      t2, float_half
    flw     f2, 0(t2)               # f2 = 0.5

    la      t3, float_two
    flw     f3, 0(t3)               # f3 = 2.0

    # =================================================================
    # FLOATING-POINT ADDITION (FADD.S)
    # =================================================================
    # FADD.S fd, fs1, fs2: fd = fs1 + fs2

    fadd.s  f4, f0, f1              # f4 = pi + e = 3.14159 + 2.71828 = 5.85987
                                    # Note: .S suffix means single-precision

    # =================================================================
    # FLOATING-POINT SUBTRACTION (FSUB.S)
    # =================================================================

    fsub.s  f5, f0, f1              # f5 = pi - e = 3.14159 - 2.71828 = 0.42331

    # =================================================================
    # FLOATING-POINT MULTIPLICATION (FMUL.S)
    # =================================================================

    fmul.s  f6, f0, f3              # f6 = pi * 2 = 6.28318 (approx 2*pi)

    fmul.s  f7, f0, f0              # f7 = pi * pi = 9.8696 (pi squared)

    # =================================================================
    # FLOATING-POINT DIVISION (FDIV.S)
    # =================================================================

    fdiv.s  f8, f0, f3              # f8 = pi / 2 = 1.5708 (pi/2)

    fdiv.s  f9, f1, f0              # f9 = e / pi = 0.865

    # =================================================================
    # SQUARE ROOT (FSQRT.S)
    # =================================================================

    flw     f10, 0(t3)              # f10 = 2.0
    fsqrt.s f11, f10                # f11 = sqrt(2) = 1.41421

    fsqrt.s f12, f7                 # f12 = sqrt(pi^2) = pi = 3.14159

    # =================================================================
    # FUSED MULTIPLY-ADD (FMADD.S)
    # =================================================================
    # FMADD.S fd, fs1, fs2, fs3: fd = (fs1 * fs2) + fs3
    # More accurate than separate MUL and ADD (single rounding)

    fmadd.s f13, f0, f3, f1         # f13 = (pi * 2) + e = 6.28318 + 2.71828 = 9.00146
                                    # Computed in one operation with single rounding

    # =================================================================
    # STORING FLOATING-POINT VALUES (FSW)
    # =================================================================

    la      t4, result_buffer       # t4 = address of result buffer
    fsw     f4, 0(t4)               # Store pi + e
    fsw     f6, 4(t4)               # Store 2*pi
    fsw     f11, 8(t4)              # Store sqrt(2)

    # =================================================================
    # FLOATING-POINT COMPARISONS
    # =================================================================
    # Results go to integer registers (0 or 1)

    flt.s   a0, f2, f0              # a0 = (0.5 < pi) ? 1 : 0
                                    # a0 = 1 (0.5 is less than pi)

    fle.s   a1, f0, f0              # a1 = (pi <= pi) ? 1 : 0
                                    # a1 = 1 (equal values)

    feq.s   a2, f0, f1              # a2 = (pi == e) ? 1 : 0
                                    # a2 = 0 (not equal)

    # =================================================================
    # SIGN MANIPULATION
    # =================================================================

    fneg.s  f14, f0                 # f14 = -pi = -3.14159
                                    # FNEG.S is pseudo for FSGNJN.S

    fabs.s  f15, f14                # f15 = |f14| = 3.14159
                                    # FABS.S is pseudo for FSGNJX.S

    # =================================================================
    # MOVING BETWEEN INTEGER AND FLOAT REGISTERS
    # =================================================================
    # The bit patterns are preserved, not converted!

    # Move float bits to integer register
    fmv.x.w a3, f0                  # a3 = bit pattern of pi (0x40490FDB)
                                    # This is NOT the integer 3!
                                    # It's the IEEE 754 encoding of pi

    # Move integer bits to float register
    li      a4, 0x40000000          # a4 = IEEE 754 encoding of 2.0
    fmv.w.x f16, a4                 # f16 = 2.0 (interpreted as float)

    # =================================================================
    # MIN AND MAX
    # =================================================================

    fmin.s  f17, f0, f1             # f17 = min(pi, e) = e = 2.71828
    fmax.s  f18, f0, f1             # f18 = max(pi, e) = pi = 3.14159

    # =================================================================
    # CLASSIFY FLOAT (for special values)
    # =================================================================
    # Returns a bitmask indicating the type of float

    fclass.s a5, f0                 # a5 = classification of pi
                                    # Bit 6 set = positive normal number

    la      t5, float_zero
    flw     f19, 0(t5)              # f19 = 0.0
    fclass.s a6, f19                # a6 = classification of 0.0
                                    # Bit 4 set = positive zero

    # =================================================================
    # COMPUTING CIRCLE AREA: A = pi * r^2
    # =================================================================

    flw     f20, 0(t3)              # f20 = r = 2.0 (radius)
    fmul.s  f21, f20, f20           # f21 = r^2 = 4.0
    fmul.s  f22, f0, f21            # f22 = pi * r^2 = 12.566 (circle area)

    # Store the result
    fsw     f22, 12(t4)             # Store circle area in buffer

    # ----- End of Program -----
    ebreak                          # Terminate program for Spike

# =============================================================================
# Expected Final Register Values:
# =============================================================================
# Integer Registers:
#   s11 (x27) = 0x00002000          # FPU enable value (used at start)
#   a0 (x10) = 1                    # 0.5 < pi (true)
#   a1 (x11) = 1                    # pi <= pi (true)
#   a2 (x12) = 0                    # pi == e (false)
#   a3 (x13) = 0x40490FDB           # IEEE 754 bits of pi
#   a4 (x14) = 0x40000000           # IEEE 754 bits for 2.0
#   a5 (x15) = 0x00000040           # fclass.s result for pi (bit 6: positive normal)
#   a6 (x16) = 0x00000010           # fclass.s result for 0.0 (bit 4: positive zero)
#
# FP Registers:
#   f0  (ft0) = 3.14159265 (0x40490FDB)          # Pi
#   f1  (ft1) = 2.71828182 (0x402DF854)          # e
#   f2  (ft2) = 0.5        (0x3F000000)
#   f3  (ft3) = 2.0        (0x40000000)
#   f4  (ft4) = 5.859875   (0x40BB8418)          # pi + e
#   f5  (ft5) = 0.423311   (0x3ED8BC38)          # pi - e
#   f6  (ft6) = 6.28318    (0x40C90FDB)          # 2*pi
#   f7  (ft7) = 9.869605   (0x411DE9E7)          # pi^2
#   f8  (fs0) = 1.5708     (0x3FC90FDB)          # pi/2
#   f9  (fs1) = 0.865256   (0x3F5D816A)          # e/pi
#   f10 (fa0) = 2.0        (0x40000000)
#   f11 (fa1) = 1.41421    (0x3FB504F3)          # sqrt(2)
#   f12 (fa2) = 3.14159    (0x40490FDB)          # sqrt(pi^2) = pi
#   f13 (fa3) = 9.001467   (0x41100602)          # (pi * 2) + e
#   f14 (fa4) = -3.14159   (0xC0490FDB)          # -pi
#   f15 (fa5) = 3.14159    (0x40490FDB)          # |pi|
#   f16 (fa6) = 2.0        (0x40000000)          # From integer bits
#   f17 (fa7) = 2.71828    (0x402DF854)          # min(pi, e) = e
#   f18 (fs2) = 3.14159    (0x40490FDB)          # max(pi, e) = pi
#   f19 (fs3) = 0.0        (0x00000000)          # Zero loaded for fclass
#   f20 (fs4) = 2.0        (0x40000000)          # Radius for circle calculation
#   f21 (fs5) = 4.0        (0x40800000)          # r^2
#   f22 (fs6) = 12.56637   (0x41490FDB)          # Area of circle with r=2
#
# Memory (result_buffer at t4, e.g., 0x2028):
#   +0:  0x40BB8418  5.859875 (pi + e)
#   +4:  0x40C90FDB  6.28318  (2*pi)
#   +8:  0x3FB504F3  1.41421  (sqrt(2))
#   +12: 0x41490FDB  12.56637 (circle area)
#
# Key Learning Points:
# - Floating-point uses separate f0-f31 registers
# - .S suffix indicates single-precision (32-bit)
# - FMV moves bits without conversion
# - FCVT (see float-convert.s) converts between int and float
# - FPU must be enabled via mstatus.FS before use
# =============================================================================
