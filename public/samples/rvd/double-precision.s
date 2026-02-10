# =============================================================================
# RISC-V Sample Program: Double-Precision Floating Point
# =============================================================================
# Description: Demonstrates the D extension for double-precision floats
# Extension:   RVD (Double-Precision Floating Point)
# Difficulty:  Advanced
#
# This program demonstrates:
#   - FLD/FSD (Load/Store double - 64 bits)
#   - FADD.D, FSUB.D, FMUL.D, FDIV.D (double arithmetic)
#   - FCVT.D.S, FCVT.S.D (single <-> double conversion)
#   - FCVT.D.W, FCVT.W.D (integer <-> double conversion)
#   - Precision comparison between single and double
#
# Key Concepts:
# - Double-precision: 64 bits (1 sign, 11 exponent, 52 mantissa)
# - Single-precision: 32 bits (1 sign, 8 exponent, 23 mantissa)
# - Doubles have ~15-16 decimal digits of precision vs ~7 for singles
# - FPU must be enabled via mstatus.FS before use
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.data
    .align  3                       # Align to 8-byte boundary for doubles

# Double-precision constants
double_pi:      .double 3.14159265358979323846  # Pi with more precision
double_e:       .double 2.71828182845904523536  # e with more precision
double_sqrt2:   .double 1.41421356237309504880  # sqrt(2)
double_one:     .double 1.0
double_small:   .double 0.0000000001            # Very small number
double_large:   .double 1.0e200                 # Very large number
double_2pow31:  .double 2147483648.0            # 2^31 as double (for RV32D compatibility)

# Single-precision for comparison
single_pi:      .float  3.14159265

# Storage - must be 8-byte aligned for double-precision stores (fsd)
    .align  3                       # Align to 8-byte boundary for result_buffer
result_buffer:  .space  64

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
    # LOADING DOUBLE-PRECISION VALUES (FLD)
    # =================================================================
    # FLD loads 64 bits from memory into a floating-point register
    # The f registers can hold either single or double precision

    la      t0, double_pi
    fld     f0, 0(t0)               # f0 = 3.14159265358979...
                                    # FLD: Floating Load Double

    la      t1, double_e
    fld     f1, 0(t1)               # f1 = 2.71828182845904...

    la      t2, double_sqrt2
    fld     f2, 0(t2)               # f2 = sqrt(2)

    la      t3, double_one
    fld     f3, 0(t3)               # f3 = 1.0

    # =================================================================
    # DOUBLE-PRECISION ARITHMETIC
    # =================================================================
    # All operations use .D suffix for double-precision

    fadd.d  f4, f0, f1              # f4 = pi + e = 5.8598744820488...
                                    # More digits than single-precision can hold!

    fsub.d  f5, f0, f1              # f5 = pi - e = 0.4233108251...

    fmul.d  f6, f0, f2              # f6 = pi * sqrt(2) = 4.4428829381...

    fdiv.d  f7, f0, f1              # f7 = pi / e = 1.1557273497...

    fsqrt.d f8, f6                  # f8 = sqrt(pi * sqrt(2)) = 2.1077...

    # =================================================================
    # PRECISION COMPARISON: SINGLE vs DOUBLE
    # =================================================================
    # Demonstrate the precision difference

    # Load single-precision pi and convert to double
    la      t4, single_pi
    flw     f9, 0(t4)               # f9 = single-precision pi

    # Convert single to double for comparison
    fcvt.d.s f10, f9                # f10 = single pi as double
                                    # f10 = 3.14159274101... (note the error)

    # Compute the difference between true pi and converted pi
    fsub.d  f11, f0, f10            # f11 = true_pi - single_pi
                                    # f11 = tiny error from single-precision

    # =================================================================
    # COMPUTING MORE DIGITS OF A RESULT
    # =================================================================
    # Compute pi^2 and compare precision

    # Double-precision: pi^2
    fmul.d  f12, f0, f0             # f12 = pi * pi (double) = 9.8696044010893...

    # Single-precision pi^2 then convert
    flw     f13, 0(t4)              # Reload single pi
    fmul.s  f14, f13, f13           # f14 = pi * pi (single)
    fcvt.d.s f15, f14               # f15 = single result as double
                                    # Compare f12 and f15 to see precision loss

    # =================================================================
    # INTEGER TO DOUBLE CONVERSION
    # =================================================================

    li      a0, 1000000             # a0 = 1 million
    fcvt.d.w f16, a0                # f16 = 1000000.0 (exact in double)

    li      a1, 123456789           # a1 = larger integer
    fcvt.d.w f17, a1                # f17 = 123456789.0 (exact in double)
                                    # Single would lose precision here!

    # Verify: convert back to integer
    fcvt.w.d a2, f17                # a2 = 123456789 (exact roundtrip)

    # =================================================================
    # DOUBLE TO INTEGER CONVERSION
    # =================================================================

    fld     f18, 0(t0)              # Reload pi
    fcvt.w.d a3, f18, rne           # a3 = 3 (pi rounded to nearest)
    fcvt.w.d a4, f18, rtz           # a4 = 3 (pi truncated)

    # Large double - load from memory for RV32D compatibility
    # Note: fmv.d.x is only available in RV64D, so we use fld instead
    la      t5, double_2pow31
    fld     f19, 0(t5)              # f19 = 2147483648.0 (2^31)

    # This would overflow signed int
    fcvt.wu.d a5, f19               # a5 = 2147483648 (valid as unsigned)

    # =================================================================
    # SINGLE <-> DOUBLE CONVERSION
    # =================================================================

    # Double to single (may lose precision)
    fcvt.s.d f20, f0                # f20 = pi as single (loses digits)

    # Single to double (no precision loss)
    fcvt.d.s f21, f20               # f21 = single pi as double

    # =================================================================
    # DOUBLE-PRECISION COMPARISONS
    # =================================================================

    flt.d   a6, f1, f0              # a6 = (e < pi) ? 1 : 0 = 1
    feq.d   a7, f0, f0              # a7 = (pi == pi) ? 1 : 0 = 1
    fle.d   s0, f0, f1              # s0 = (pi <= e) ? 1 : 0 = 0

    # =================================================================
    # PRACTICAL EXAMPLE: Numerical Stability
    # =================================================================
    # Computing (1 + small) - 1 in single vs double
    # This demonstrates why double precision matters for numerical work

    la      t6, double_small
    fld     f22, 0(t6)              # f22 = 0.0000000001 (10^-10)

    fadd.d  f23, f3, f22            # f23 = 1.0 + 10^-10 (double)
    fsub.d  f24, f23, f3            # f24 = (1 + small) - 1

    # In double: f24 should be very close to 10^-10
    # In single: would likely be 0 due to precision loss

    # =================================================================
    # STORING DOUBLE-PRECISION VALUES (FSD)
    # =================================================================

    la      s1, result_buffer
    fsd     f4, 0(s1)               # Store pi + e
    fsd     f12, 8(s1)              # Store pi^2
    fsd     f7, 16(s1)              # Store pi / e

    # =================================================================
    # FUSED MULTIPLY-ADD (FMADD.D)
    # =================================================================
    # Higher precision than separate operations

    fmadd.d f25, f0, f2, f1         # f25 = (pi * sqrt(2)) + e
                                    # = 4.4428829... + 2.71828...
                                    # = 7.16116...

    # =================================================================
    # WORKING WITH VERY LARGE NUMBERS
    # =================================================================
    # Double can handle much larger exponents

    la      t0, double_large
    fld     f26, 0(t0)              # f26 = 10^200

    # This would be infinity in single precision
    fmul.d  f27, f26, f3            # f27 = 10^200 * 1 (still valid)

    fsqrt.d f28, f26                # f28 = 10^100 (sqrt of 10^200)

    # ----- End of Program -----
    ebreak                          # Terminate execution for Spike

# =============================================================================
# Expected Final Register Values:
# =============================================================================
# Integer Registers (Modified):
# -----------------------------------------------------------------------------
# gp (x3)   = 0x00002000            # FPU enable value
# t0 (x5)   = address of double_large
# t1 (x6)   = address of double_e
# t2 (x7)   = address of double_sqrt2
# t3 (x28)  = address of double_one
# t4 (x29)  = address of single_pi
# t5 (x30)  = address of double_2pow31
# t6 (x31)  = address of double_small
# a0 (x10)  = 1000000               # 1 million
# a1 (x11)  = 123456789             # Large integer
# a2 (x12)  = 123456789             # Roundtrip conversion (fcvt.w.d f17)
# a3 (x13)  = 3                     # pi rounded to nearest (rne)
# a4 (x14)  = 3                     # pi truncated (rtz)
# a5 (x15)  = 2147483648            # 2^31 as unsigned (0x80000000)
# a6 (x16)  = 1                     # flt.d: e < pi (true)
# a7 (x17)  = 1                     # feq.d: pi == pi (true)
# s0 (x8)   = 0                     # fle.d: pi <= e (false)
# s1 (x9)   = address of result_buffer
#
# Floating-Point Registers (Double-Precision):
# -----------------------------------------------------------------------------
# f0  (ft0)  = 3.14159265358979323846  (0x400921FB54442D18) # Pi
# f1  (ft1)  = 2.71828182845904523536  (0x4005BF0A8B145769) # e
# f2  (ft2)  = 1.41421356237309504880  (0x3FF6A09E667F3BCD) # sqrt(2)
# f3  (ft3)  = 1.0                     (0x3FF0000000000000) # One
# f4  (ft4)  = 5.85987448204883847382  (0x40177082EFAC4240) # pi + e
# f5  (ft5)  = 0.42331082513074800310  (0x3FDB1786497EAD78) # pi - e
# f6  (ft6)  = 4.44288293815836523238  (0x4011C5831ADD62E4) # pi * sqrt(2)
# f7  (ft7)  = 1.15572734979092171791  (0x3FF27DDBF6271DBE) # pi / e
# f8  (fs0)  = 2.10781473051081206634  (0x4000DCCDF82C9163) # sqrt(pi*sqrt(2))
# f9  (fs1)  = 3.14159274101257324     (NaN-boxed single)   # single pi loaded
# f10 (fa0)  = 3.14159274101257324     (0x400921FB60000000) # fcvt.d.s from f9
# f11 (fa1)  = -8.74227801261895e-08   (0xBE7777A5D0000000) # pi - single_pi (error)
# f12 (fa2)  = 9.86960440108935861883  (0x4023BD3CC9BE45DE) # pi^2 (double)
# f13 (fa3)  = 3.14159274101257324     (NaN-boxed single)   # single pi reloaded
# f14 (fa4)  = 9.86960506439208984375  (NaN-boxed single)   # pi^2 (single precision)
# f15 (fa5)  = 9.86960506439208984375  (0x4023BD3CE0000000) # fcvt.d.s from f14
# f16 (fa6)  = 1000000.0               (0x412E848000000000) # 1 million as double
# f17 (fa7)  = 123456789.0             (0x419D6F3454000000) # Large int as double
# f18 (fs2)  = 3.14159265358979323846  (0x400921FB54442D18) # Pi reloaded
# f19 (fs3)  = 2147483648.0            (0x41E0000000000000) # 2^31 as double
# f20 (fs4)  = 3.14159274101257324     (NaN-boxed single)   # pi as single (fcvt.s.d)
# f21 (fs5)  = 3.14159274101257324     (0x400921FB60000000) # single pi as double
# f22 (fs6)  = 0.0000000001            (0x3DDB7CDFD9D7BDBB) # 10^-10
# f23 (fs7)  = 1.0000000001            (0x3FF000000006DF38) # 1 + 10^-10
# f24 (fs8)  = 1.00000008274e-10       (0x3DDB7CE000000000) # (1+small) - 1
# f25 (fs9)  = 7.16116476661741370620  (0x401CA50860678E99) # fmadd: pi*sqrt(2)+e
# f26 (fs10) = 1.0e+200                (0x6974E718D7D7625A) # Very large double
# f27 (fs11) = 1.0e+200                (0x6974E718D7D7625A) # 10^200 * 1
# f28 (ft8)  = 1.0e+100                (0x54B249AD2594C37D) # sqrt(10^200) = 10^100
#
# Memory (result_buffer at address 0x00002040, pointed by s1):
# -----------------------------------------------------------------------------
# Offset +0  (8 bytes): 5.85987448204883847382  # pi + e (f4)
# Offset +8  (8 bytes): 9.86960440108935861883  # pi^2 (f12)
# Offset +16 (8 bytes): 1.15572734979092171791  # pi / e (f7)
#
# Key Learning Points:
# -----------------------------------------------------------------------------
# - FLD/FSD: 64-bit double-precision load/store (8-byte aligned)
# - .D suffix: All double-precision FP operations
# - Precision: ~15-16 decimal digits (vs ~7 for single)
# - IEEE 754: 1 sign + 11 exponent + 52 mantissa bits
# - FCVT.D.S/FCVT.S.D: Precision conversion (note error in f11)
# - FCVT.D.W/FCVT.W.D: Integer conversion with rounding modes
# - Exponent range: 10^-308 to 10^308 (vs 10^-38 to 10^38 for single)
# - Numerical stability: f24 shows double can preserve 10^-10 precision
# - FMADD.D: Fused multiply-add for higher precision
# - RV32D note: fmv.d.x is only available in RV64D; use fld for RV32D
# - FPU must be enabled via mstatus.FS before use
# =============================================================================
