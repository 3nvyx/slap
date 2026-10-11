"""Read the Arduino only; closing/reopening drops stale slap events."""
import os
import sys
import serial

# The API that started this helper. If it goes away without stopping the helper (a dev restart, a crash),
# the helper must exit too, or it keeps the serial port locked and the next API cannot open it.
parent = os.getppid()

try:
    with serial.Serial(sys.argv[1], 115200, timeout=1, exclusive=True) as board:
        board.reset_input_buffer()
        print("USB connected", flush=True)
        while os.getppid() == parent:
            line = board.read_until(b"\n", size=256)
            if line.endswith(b"\n"):
                print(line.decode("utf-8", "replace").strip(), flush=True)
except (serial.SerialException, OSError) as error:
    print(error, file=sys.stderr)
    sys.exit(1)
