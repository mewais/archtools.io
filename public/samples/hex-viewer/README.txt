Hex Viewer Test Files
=====================

All files are 1024 bytes (1 KB) for consistent testing.

Float Files
-----------
floats-fp32-le.bin
  256 FP32 (32-bit) floats, little-endian
  First 10 values: 0.0, 1.0, -1.0, pi, e, 1e10, 1e-10, +inf, -inf, NaN
  Remaining: random floats in range [-1000, 1000]

floats-fp32-be.bin
  Same values as above but big-endian (for testing endianness swap)

floats-fp64-le.bin
  128 FP64 (64-bit) doubles, little-endian
  First 7 values: 0.0, 1.0, -1.0, pi, e, 1e100, 1e-100
  Remaining: random doubles

floats-fp16-le.bin
  512 FP16 (16-bit) half-precision floats, little-endian
  First 8 values: 0.0, 1.0, -1.0, 0.5, -0.5, 2.0, 0.25, 65504.0
  Remaining: random half floats in range [-100, 100]

Integer Files
-------------
integers-32bit-le.bin
  256 signed 32-bit integers, little-endian
  First 10 values: 0, 1, -1, 255, 256, 65535, 65536, 0x7FFFFFFF, -0x80000000, 0xDEADBEEF
  Remaining: random int32 values

integers-32bit-modified.bin
  Same as integers-32bit-le.bin but with 13 values changed (~5%)
  Use with integers-32bit-le.bin to test diff mode (95% similar)

Text Files
----------
ascii-text.bin
  1024 bytes of ASCII text with printable characters
  Contains lorem ipsum, RISC-V description, hex examples
  Padded with null bytes to reach 1024

Mixed Data
----------
mixed-data.bin
  Mixed binary data structure:
  - 4 bytes: "MIX1" magic header
  - 4 bytes: version (1)
  - 4 bytes: count of floats (64)
  - 4 bytes: count of ints (64)
  - 256 bytes: 64 FP32 floats (0.0, 1.5, 3.0, ...)
  - 256 bytes: 64 int32 values (0, 100, 200, ...)
  - 496 bytes: null padding

Diff Test Pair
--------------
diff-file-a.bin
  1024 bytes of random binary data

diff-file-b.bin
  Same as diff-file-a.bin but with 51 bytes changed (~5%)
  Use together in Diff mode to see highlighted differences
  (95% similar - ideal for diff testing)

