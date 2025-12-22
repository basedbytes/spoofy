# spoofy

> **⚠️ Work in Progress**: This is a modernized fork of the original `spoof` project, updated for compatibility with modern macOS versions (Sequoia 15.4+, Tahoe 26+). This build is not stable and may contain bugs as we continue porting to newer environments. Use at your own risk.

### Easily spoof your MAC address in macOS, Windows, & Linux!

A Node.js utility for changing MAC addresses across different operating systems.

![anonymous](img/img.png)

## About This Fork

This repository is a fork of the original `spoof` project, updated to work with modern macOS versions where Apple has removed the `airport` CLI tool and introduced new WiFi driver restrictions.

### What's Changed

- **Modern macOS Support**: Fixed MAC spoofing for macOS Sequoia 15.4+ and Tahoe 26+
- **Removed `airport` dependency**: The deprecated `airport -z` command has been replaced with modern `networksetup` commands
- **Timing-sensitive MAC changes**: WiFi MAC addresses are now changed in the brief window after power-on but before network connection
- **Better error handling**: Ensures WiFi interface is always restored, even if MAC change fails
- **Cleaner codebase**: Removed deprecated code paths and unnecessary constants

## Installation

Clone this repository and install dependencies:

```bash
git clone https://github.com/basedbytes/spoofy.git
cd spoofy
npm install
```

You can then run the tool directly:

```bash
node bin/cmd.js --help
```

Or install it globally:

```bash
npm install -g .
```

## Instructions for Beginners

1. Install [Node.js](https://nodejs.org/) (it's a programming platform like Python, Java, etc.)

2. Open **Terminal**. On macOS, use Spotlight (⌘ + Space) to find it.

3. Clone and install this repository:

   ```bash
   git clone https://github.com/basedbytes/spoofy.git
   cd spoofy
   npm install
   npm install -g .
   ```

4. Now, print out all your network devices:

   ```bash
   spoof list
   ```

5. Find the device you want to change. Wi-Fi is usually called `en0` on modern Macs. Then run:

   ```bash
   sudo spoof randomize en0
   ```

   You may need to reconnect to your Wi-Fi network afterward. Your MAC address is now changed!

## Usage

You can always see up-to-date usage instructions by running `spoof --help`.

### List available devices

```bash
spoof list
```

Output:
```
- "Ethernet" on device "en4" with MAC address 70:56:51:BE:B3:00
- "Wi-Fi" on device "en0" with MAC address 70:56:51:BE:B3:01 currently set to 70:56:51:BE:B3:02
- "Bluetooth PAN" on device "en1"
```

### List only Wi-Fi devices

```bash
spoof list --wifi
```

### Randomize MAC address *(requires root)*

Using hardware port name:
```bash
sudo spoof randomize wi-fi
```

Or using device name:
```bash
sudo spoof randomize en0
```

### Set specific MAC address *(requires root)*

```bash
sudo spoof set 00:11:22:33:44:55 en0
```

### Reset to original MAC address *(requires root)*

```bash
sudo spoof reset wi-fi
```

**Note**: On macOS, restarting your computer will also reset your MAC address to the original hardware address.

## Platform Support

### macOS ✅
- ✅ **Fully supported** and tested on macOS Tahoe 26.2
- ✅ Works on macOS Sequoia 15.4+
- ⚠️ Older versions may work but are untested

### Linux 🚧
**Coming soon!** Linux support is planned but not yet implemented in this fork.

Running MAC change commands on Linux will display a "coming soon" message. You can still use `spoof list` to view network interfaces.

The upcoming Linux implementation will use modern `ip link` commands instead of the deprecated `ifconfig` tool.

### Windows 🚧
**Coming soon!** Windows support is planned but not yet implemented in this fork.

Running MAC change commands on Windows will display a "coming soon" message. You can still use `spoof list` to view network interfaces.

The upcoming Windows implementation will use PowerShell for more reliable adapter management.

## Known Issues

- WiFi will briefly disconnect when changing MAC address
- Some network restrictions or hardware may prevent MAC spoofing
- System Integrity Protection (SIP) must be enabled for this to work

## Troubleshooting

If you encounter errors:

1. Make sure you're running with `sudo` (required for network changes)
2. Ensure WiFi is turned on before attempting to change MAC
3. On modern macOS, you may need to reconnect to WiFi after the change
4. Try running `networksetup -detectnewhardware` if changes don't take effect

## Contributing

This is an active fork. Contributions, bug reports, and feature requests are welcome!

## License

MIT License (inherited from original project)

## Credits

Originally based on the `spoof` project. This fork maintains compatibility with modern operating systems.
