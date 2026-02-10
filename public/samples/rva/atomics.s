# =============================================================================
# RISC-V Sample Program: Atomic Memory Operations
# =============================================================================
# Description: Demonstrates the A extension for atomic operations
# Extension:   RVA (Atomic Instructions)
# Difficulty:  Advanced
#
# This program demonstrates:
#   - LR.W/SC.W (Load-Reserved / Store-Conditional)
#   - AMO operations (Atomic Memory Operations)
#   - AMOSWAP, AMOADD, AMOAND, AMOOR, AMOXOR
#   - AMOMIN, AMOMAX (signed), AMOMINU, AMOMAXU (unsigned)
#
# Key Concepts:
# - Atomic operations are indivisible - no other operation can intervene
# - Essential for multi-core/multi-threaded synchronization
# - LR/SC pattern for complex atomic sequences
# - AMO for single atomic read-modify-write operations
#
# Note: These operations are most meaningful in multi-core contexts.
# In a single-threaded simulator, they behave like regular operations.
#
# Based on RISC-V educational examples
# Licensed for educational use
# =============================================================================

.data
    .align  2
# Shared variables (in multi-threaded scenario)
counter:        .word   0               # Shared counter
lock_var:       .word   0               # Lock variable (0=free, 1=locked)
max_value:      .word   10              # For AMOMAX demo
min_value:      .word   100             # For AMOMIN demo
bitfield:       .word   0b10101010      # For bitwise atomics
swap_target:    .word   42              # For AMOSWAP demo

.text
.globl _start

_start:
    # =================================================================
    # LOAD-RESERVED / STORE-CONDITIONAL (LR.W / SC.W)
    # =================================================================
    # LR.W: Load word and reserve the address
    # SC.W: Store word only if reservation is still valid
    # If another core wrote to the address, SC fails (returns non-zero)
    #
    # Pattern for atomic increment:
    # retry:
    #   lr.w t0, (addr)     # Load and reserve
    #   addi t0, t0, 1      # Modify
    #   sc.w t1, t0, (addr) # Try to store
    #   bnez t1, retry      # If failed (t1 != 0), retry

    la      s0, counter             # s0 = address of counter

    # Atomic increment using LR/SC
lr_sc_retry:
    lr.w    t0, (s0)                # t0 = *counter, reserve address
                                    # LR.W: Load-Reserved Word

    addi    t0, t0, 1               # Increment

    sc.w    t1, t0, (s0)            # Try to store back
                                    # SC.W: Store-Conditional Word
                                    # t1 = 0 if success, non-zero if failed

    bnez    t1, lr_sc_retry         # Retry if store failed
                                    # (In single-threaded, always succeeds)

    # Now counter = 1

    # Do it again to make counter = 2
    lr.w    t0, (s0)
    addi    t0, t0, 1
    sc.w    t1, t0, (s0)
    bnez    t1, lr_sc_retry

    # Verify
    lw      a0, 0(s0)               # a0 = counter = 2

    # =================================================================
    # SPIN LOCK IMPLEMENTATION
    # =================================================================
    # A simple spin lock using LR/SC
    #
    # acquire_lock:
    #   li t0, 1
    # spin:
    #   lr.w t1, (lock)
    #   bnez t1, spin       # If locked, keep spinning
    #   sc.w t1, t0, (lock) # Try to acquire
    #   bnez t1, spin       # If failed, retry
    #   # Lock acquired!
    #
    # release_lock:
    #   sw zero, (lock)

    la      s1, lock_var            # s1 = address of lock

    # Acquire lock
    li      t2, 1                   # t2 = 1 (locked value)
spin_lock:
    lr.w    t3, (s1)                # Load lock state
    bnez    t3, spin_lock           # If already locked, spin
    sc.w    t3, t2, (s1)            # Try to acquire
    bnez    t3, spin_lock           # If failed, retry

    # Lock acquired! Do critical section work here...
    addi    a0, a0, 10              # a0 = 12 (inside "critical section")

    # Release lock
    sw      zero, 0(s1)             # Release: store 0

    # =================================================================
    # AMOSWAP.W (Atomic Swap)
    # =================================================================
    # AMOSWAP.W rd, rs2, (rs1): atomically swap memory with register
    # rd = old_value, memory = rs2

    la      s2, swap_target         # s2 = address of swap_target (contains 42)
    li      t4, 99                  # t4 = new value

    amoswap.w t5, t4, (s2)          # t5 = old value (42), memory = 99
                                    # Atomic: read and write happen together

    lw      a1, 0(s2)               # a1 = 99 (verify new value in memory)

    # =================================================================
    # AMOADD.W (Atomic Add)
    # =================================================================
    # AMOADD.W rd, rs2, (rs1): atomically add to memory
    # rd = old_value, memory = old_value + rs2

    la      s3, counter             # s3 = address of counter (currently 2)
    li      t6, 5                   # t6 = value to add

    amoadd.w a2, t6, (s3)           # a2 = old value (2), counter = 2 + 5 = 7
                                    # Returns the OLD value before addition

    lw      a3, 0(s3)               # a3 = 7 (verify new counter value)

    # =================================================================
    # AMOAND.W / AMOOR.W / AMOXOR.W (Atomic Bitwise)
    # =================================================================

    la      s4, bitfield            # s4 = address of bitfield (0b10101010)

    # Atomic AND (clear bits)
    li      t0, 0b11110000          # Mask to clear lower 4 bits
    amoand.w a4, t0, (s4)           # a4 = old (0xAA), memory = 0xAA & 0xF0 = 0xA0

    # Atomic OR (set bits)
    li      t0, 0b00001111          # Mask to set lower 4 bits
    amoor.w a5, t0, (s4)            # a5 = old (0xA0), memory = 0xA0 | 0x0F = 0xAF

    # Atomic XOR (toggle bits)
    li      t0, 0b11111111          # Toggle all bits
    amoxor.w a6, t0, (s4)           # a6 = old (0xAF), memory = 0xAF ^ 0xFF = 0x50

    lw      a7, 0(s4)               # a7 = 0x50 (verify final bitfield)

    # =================================================================
    # AMOMIN.W / AMOMAX.W (Atomic Min/Max - Signed)
    # =================================================================

    la      s5, max_value           # s5 = address of max_value (10)

    # Atomic max: store max(current, new)
    li      t0, 25                  # t0 = candidate value
    amomax.w s6, t0, (s5)           # s6 = old (10), memory = max(10, 25) = 25

    li      t0, 15                  # t0 = smaller candidate
    amomax.w s7, t0, (s5)           # s7 = old (25), memory = max(25, 15) = 25 (unchanged)

    la      s8, min_value           # s8 = address of min_value (100)

    # Atomic min: store min(current, new)
    li      t0, 50                  # t0 = smaller candidate
    amomin.w s9, t0, (s8)           # s9 = old (100), memory = min(100, 50) = 50

    li      t0, 75                  # t0 = larger candidate
    amomin.w s10, t0, (s8)          # s10 = old (50), memory = min(50, 75) = 50 (unchanged)

    # Verify
    lw      s11, 0(s5)              # s11 = 25 (max_value)
    lw      t1, 0(s8)               # t1 = 50 (min_value)

    # =================================================================
    # AMOMINU.W / AMOMAXU.W (Unsigned Min/Max)
    # =================================================================
    # Important when dealing with unsigned values

    # Reset for demo
    la      t2, max_value
    li      t3, 10
    sw      t3, 0(t2)               # Reset max_value to 10

    li      t0, 0xFFFFFFFF          # t0 = -1 signed, but max unsigned
    amomaxu.w t4, t0, (t2)          # Unsigned max: memory = max(10, 0xFFFFFFFF) = 0xFFFFFFFF

    # With signed AMOMAX, -1 would be less than 10!
    # With unsigned AMOMAXU, 0xFFFFFFFF is the maximum

    # =================================================================
    # PRACTICAL: Atomic Counter with Saturating Add
    # =================================================================
    # Increment counter but don't exceed a maximum
    # Note: Using gp (x3) and tp (x4) as scratch registers to preserve
    # t1 and t5 which hold important values from earlier operations

    la      gp, counter             # gp = address of counter (currently 7)
    li      tp, 100                 # tp = max allowed value

saturate_loop:
    lr.w    t0, (gp)                # Load current value
    bge     t0, tp, saturate_done   # If already at max, don't increment
    addi    t0, t0, 1               # Increment
    sc.w    t3, t0, (gp)            # Try to store (using t3 for result)
    bnez    t3, saturate_loop       # Retry if failed

saturate_done:
    lw      t2, 0(gp)               # t2 = 8 (counter after saturating add)

    # ----- End of Program -----
    ebreak                          # Terminate execution for Spike

# =============================================================================
# Expected Final Register Values:
# =============================================================================
# Integer Registers (with ABI names):
# a0  (x10) = 12              # Counter operations + critical section
# a1  (x11) = 99              # swap_target after AMOSWAP
# a2  (x12) = 2               # Old counter value before AMOADD
# a3  (x13) = 7               # Counter after AMOADD (2 + 5)
# a4  (x14) = 0xAA (170)      # Old bitfield before AMOAND
# a5  (x15) = 0xA0 (160)      # Old bitfield before AMOOR
# a6  (x16) = 0xAF (175)      # Old bitfield before AMOXOR
# a7  (x17) = 0x50 (80)       # Final bitfield value
# s6  (x22) = 10              # Old max_value before AMOMAX (with 25)
# s7  (x23) = 25              # Old max_value before AMOMAX (with 15)
# s9  (x25) = 100             # Old min_value before AMOMIN (with 50)
# s10 (x26) = 50              # Old min_value before AMOMIN (with 75)
# s11 (x27) = 25              # Final max_value
# t1  (x6)  = 50              # Final min_value
# t2  (x7)  = 8               # Counter after saturating add
# t4  (x29) = 10              # Old max_value before AMOMAXU (was reset to 10)
# t5  (x30) = 42              # Old swap_target value from AMOSWAP
#
# Memory (base address 0x00002000):
# 0x00002000 counter:     8
# 0x00002004 lock_var:    0 (released)
# 0x00002008 max_value:   0xFFFFFFFF (after unsigned max demo)
# 0x0000200C min_value:   50
# 0x00002010 bitfield:    0x50
# 0x00002014 swap_target: 99
#
# Key Learning Points:
# - LR/SC pattern for complex atomic operations
# - SC returns 0 on success, non-zero on failure
# - AMO operations return the OLD value
# - Use signed (AMOMIN/MAX) or unsigned (AMOMINU/MAXU) as appropriate
# - Atomics are essential for multi-core synchronization
# =============================================================================
