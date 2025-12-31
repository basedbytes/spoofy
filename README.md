# spoofy

[![npm version](https://img.shields.io/npm/v/spoofy)](https://www.npmjs.com/package/spoofy)
[![license](https://img.shields.io/npm/l/spoofy)](LICENSE)

> **⚠️ Work in Progress**: This is a modernized fork of the original `spoof` project, updated for compatibility with modern macOS (Sequoia 15.4+, Tahoe 26+). **Currently only macOS is fully supported.** Modern Windows and Linux support is planned but not yet implemented.

### Easily spoof your MAC address and DUID on macOS!

A Node.js utility for changing MAC addresses and DHCPv6 DUIDs. Currently focused on reliable macOS support with Windows and Linux support coming soon.

## About This Fork

This repository is a fork of the original `spoof` project, updated to work with modern macOS versions where Apple has removed the `airport` CLI tool and introduced new WiFi driver restrictions.

### What's Changed

- **Modern macOS Support**: Fixed MAC spoofing for macOS Sequoia 15.4+ and Tahoe 26+
- **DUID Spoofing**: Added DHCPv6 DUID spoofing with automatic original preservation
- **Removed `airport` dependency**: The deprecated `airport -z` command has been replaced with modern `networksetup` commands
- **Timing-sensitive MAC changes**: WiFi MAC addresses are now changed in the brief window after power-on but before network connection
- **Better error handling**: Ensures WiFi interface is always restored, even if MAC change fails
- **Cleaner codebase**: Removed deprecated code paths and unnecessary constants

## Installation

### From npm

```bash
npm install -g spoofy
```

### From source

```bash
git clone https://github.com/basedbytes/spoofy.git
cd spoofy
npm install
npm install -g .
```

## Quick Start

List network interfaces:
```bash
spoofy list
```

Randomize MAC address (WiFi is typically `en0` on macOS):
```bash
sudo spoofy randomize en0
```

**Note:** WiFi will disconnect briefly and may need to reconnect to networks.

## Usage

You can always see up-to-date usage instructions by running `spoofy --help`.

### List available devices

```bash
spoofy list
```

Output:

```
- "Ethernet" on device "en4" with MAC address 70:56:51:BE:B3:00
- "Wi-Fi" on device "en0" with MAC address 70:56:51:BE:B3:01 currently set to 70:56:51:BE:B3:02
- "Bluetooth PAN" on device "en1"
```

### List only Wi-Fi devices

```bash
spoofy list --wifi
```

### Randomize MAC address _(requires root)_

Using hardware port name:

```bash
sudo spoofy randomize wi-fi
```

Or using device name:

```bash
sudo spoofy randomize en0
```

### Set specific MAC address _(requires root)_

```bash
sudo spoofy set 00:11:22:33:44:55 en0
```

### Reset to original MAC address _(requires root)_

```bash
sudo spoofy reset wi-fi
```

**Note**: On macOS, restarting your computer will also reset your MAC address to the original hardware address.

## DUID Spoofing (DHCPv6)

spoofy also supports DHCPv6 DUID (DHCP Unique Identifier) spoofing for complete IPv6 network identity management.

### What is a DUID?

A DUID (DHCP Unique Identifier) is used in DHCPv6 to uniquely identify a client on IPv6 networks. Unlike MAC addresses which identify network interfaces, DUIDs identify DHCP clients across all interfaces and persist across reboots.

### Key Feature: Original DUID Preservation

The first time you spoof your DUID, your **original DUID is automatically saved** to:
- macOS: `/var/db/dhcpclient/DUID.original`
- Linux: `/var/lib/spoofy/duid.original` *(planned)*
- Windows: `%PROGRAMDATA%\spoofy\duid.original` *(planned)*

This allows you to **restore to your pre-spoofing state** at any time using `spoofy duid restore`.

### Show current DUID

```bash
spoofy duid list
```

### Randomize DUID _(requires root)_

Generate and set a random DUID (automatically saves your original on first use):

```bash
sudo spoofy duid randomize en0
```

You can specify the DUID type:

```bash
sudo spoofy duid randomize en0 --type=LLT
```

### Set specific DUID _(requires root)_

```bash
sudo spoofy duid set 00:03:00:01:aa:bb:cc:dd:ee:ff en0
```

### Sync DUID to current MAC _(requires root)_

Match DUID to the current MAC address of an interface (useful after MAC spoofing):

```bash
sudo spoofy duid sync en0
```

With specific type:

```bash
sudo spoofy duid sync en0 --type=LLT
```

**Typical workflow for complete identity spoofing:**

```bash
sudo spoofy randomize en0      # Spoof MAC first
sudo spoofy duid sync en0      # Then sync DUID to match
```

This ensures both layers show the same spoofed identity on IPv6 networks.

### Restore to original DUID _(requires root)_

Return to your original (pre-spoofing) DUID:

```bash
sudo spoofy duid restore en0
```

### Reset DUID _(requires root)_

Delete current DUID and let the system generate a NEW random one:

```bash
sudo spoofy duid reset en0
```

**Important**: `reset` generates a NEW DUID, while `restore` returns to your ORIGINAL.

### DUID Types

| Type | Name | Description |
|------|------|-------------|
| 1 | DUID-LLT | Link-layer address + timestamp (most common) |
| 2 | DUID-EN | Enterprise number + identifier |
| 3 | DUID-LL | Link-layer address only (default) |
| 4 | DUID-UUID | UUID-based identifier |

### Programmatic Usage

```javascript
const spoofy = require('spoofy');

// Get current DUID
const current = spoofy.duid.getCurrentDUID();
console.log('Current DUID:', spoofy.duid.formatDUID(current));

// Parse DUID info
const info = spoofy.duid.parseDUID(current);
console.log('Type:', info.typeName);
console.log('MAC:', info.lladdr);

// Check if original is stored
if (spoofy.duid.hasOriginalDUID()) {
  const original = spoofy.duid.getOriginalDUID();
  console.log('Original DUID:', spoofy.duid.formatDUID(original));
}

// Generate a random DUID
const newDuid = spoofy.duid.generateDUID(spoofy.duid.DUID_TYPES.DUID_LL);
console.log('Generated:', spoofy.duid.formatDUID(newDuid));

// Set DUID (requires root) - automatically saves original on first call
spoofy.duid.setDUID(newDuid, 'en0');

// Randomize DUID
spoofy.duid.randomizeDUID(spoofy.duid.DUID_TYPES.DUID_LLT, 'en0');

// Sync DUID to current MAC address
spoofy.duid.syncDUID('en0', spoofy.duid.DUID_TYPES.DUID_LL);

// Restore to original DUID
spoofy.duid.restoreDUID('en0');
```

### Combined MAC + DUID Spoofing

For complete identity change on IPv6 networks, you should change both MAC and DUID.

**Recommended workflow using sync:**

```bash
sudo spoofy randomize en0      # Spoof MAC first
sudo spoofy duid sync en0      # Sync DUID to match spoofed MAC
```

The `sync` command automatically matches the DUID to your current (spoofed) MAC address.

**Alternative - randomize both separately:**

```bash
sudo spoofy randomize en0
sudo spoofy duid randomize en0
```

**Manual sync for advanced use:**

When using DUID-LL or DUID-LLT types, the DUID includes the MAC address. For consistent spoofing, ensure the MAC in your DUID matches your spoofed MAC:

```javascript
const spoofy = require('spoofy');

// Spoof MAC
const newMac = '00:11:22:33:44:55';
spoofy.setInterfaceMAC('en0', newMac, 'Wi-Fi');

// Create matching DUID
const duid = spoofy.duid.generateDUID(spoofy.duid.DUID_TYPES.DUID_LL, newMac);
spoofy.duid.setDUID(duid, 'en0');
```

## Platform Support

### macOS ✅

- ✅ **Fully supported** and tested on macOS Tahoe 26.2
- ✅ Works on macOS Sequoia 15.4+
- ⚠️ Older versions may work but are untested

### Linux 🚧

**Coming soon!** Linux support is planned but not yet implemented in this fork.

Running MAC change commands on Linux will display a "coming soon" message. You can still use `spoofy list` to view network interfaces.

The upcoming Linux implementation will use modern `ip link` commands instead of the deprecated `ifconfig` tool.

### Windows 🚧

**Coming soon!** Windows support is planned but not yet implemented in this fork.

Running MAC change commands on Windows will display a "coming soon" message. You can still use `spoofy list` to view network interfaces.

The upcoming Windows implementation will use PowerShell for more reliable adapter management.

## Known Issues

- WiFi will briefly disconnect when changing MAC address
- Some network restrictions or hardware may prevent MAC spoofing
- Requires sudo/root privileges for all MAC address and DUID changes
- DUID changes may require DHCPv6 lease renewal to take effect

## Troubleshooting

If you encounter errors:

1. Make sure you're running with `sudo` (required for network changes)
2. Ensure WiFi is turned on before attempting to change MAC
3. On modern macOS, you may need to reconnect to WiFi after the change
4. Try running `networksetup -detectnewhardware` if changes don't take effect
5. For DUID changes, you may need to disable/re-enable IPv6 or renew DHCPv6 lease

## Contributing

This is an active fork. Contributions, bug reports, and feature requests are welcome!

## License

MIT License (inherited from original project)

## Credits

Originally based on the `spoof` project. This fork maintains compatibility with modern operating systems.
