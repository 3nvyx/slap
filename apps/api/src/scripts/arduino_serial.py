"""Read the Arduino only; closing/reopening drops stale slap events."""
import sys
import serial

try:
    with serial.Serial(sys.argv[1], 115200, timeout=1, exclusive=True) as board:
        board.reset_input_buffer()
        print("USB connected", flush=True)
        while True:
            line = board.read_until(b"\n", size=256)
            if line.endswith(b"\n"):
                print(line.decode("utf-8", "replace").strip(), flush=True)
except (serial.SerialException, OSError) as error:
    print(error, file=sys.stderr)
    sys.exit(1)
