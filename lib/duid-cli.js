#!/usr/bin/env node

const duid = require('./duid')
const os = require('os')

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log (msg, color = '') {
  console.log(color + msg + colors.reset)
}

function success (msg) {
  log('✓ ' + msg, colors.green)
}

function error (msg) {
  log('✗ ' + msg, colors.red)
}

function info (msg) {
  log('ℹ ' + msg, colors.cyan)
}

function printDUIDInfo (duidBuf) {
  if (!duidBuf) {
    info('No DUID currently set (system will generate on next DHCPv6 request)')
    return
  }

  const parsed = duid.parseDUID(duidBuf)

  console.log()
  log('Current DUID:', colors.bright)
  console.log(`  Raw:  ${parsed.raw}`)
  console.log(`  Type: ${parsed.typeName} (${parsed.type})`)

  if (parsed.lladdr) {
    console.log(`  Link-layer address: ${parsed.lladdr}`)
  }
  if (parsed.hwType !== undefined) {
    console.log(`  Hardware type: ${parsed.hwType} (${parsed.hwType === 1 ? 'Ethernet' : 'Other'})`)
  }
  if (parsed.timeDate) {
    console.log(`  Timestamp: ${parsed.timeDate.toISOString()}`)
  }
  if (parsed.uuid) {
    console.log(`  UUID: ${parsed.uuid}`)
  }
  if (parsed.enterpriseNumber !== undefined) {
    console.log(`  Enterprise Number: ${parsed.enterpriseNumber}`)
    console.log(`  Identifier: ${parsed.identifier}`)
  }
  console.log()
}

function checkPrivileges () {
  if (os.platform() === 'win32') {
    try {
      require('child_process').execSync('net session', { stdio: 'pipe' })
      return true
    } catch (e) {
      return false
    }
  } else {
    return process.getuid && process.getuid() === 0
  }
}

const commands = {
  list () {
    try {
      const current = duid.getCurrentDUID()
      printDUIDInfo(current)

      // Show original DUID status
      if (duid.hasOriginalDUID()) {
        const original = duid.getOriginalDUID()
        const isSpoofed = current && original && !current.equals(original)

        console.log(colors.bright + 'Original DUID Status:' + colors.reset)
        console.log(`  Stored: ${colors.green}Yes${colors.reset}`)
        console.log(`  Location: ${duid.getOriginalDUIDPath()}`)

        if (isSpoofed) {
          console.log(`  Status: ${colors.yellow}Currently spoofed${colors.reset}`)
          console.log(`  Original: ${duid.formatDUID(original)}`)
        } else if (current && original && current.equals(original)) {
          console.log(`  Status: ${colors.green}Using original DUID${colors.reset}`)
        }
        console.log()
      } else {
        console.log(colors.dim + 'No original DUID stored yet (will be saved on first spoof)' + colors.reset)
        console.log()
      }
    } catch (e) {
      error(`Failed to get DUID: ${e.message}`)
      process.exit(1)
    }
  },

  /**
   * Show current DUID (alias)
   */
  show () {
    this.list()
  },

  /**
   * Show/manage original DUID
   */
  original (args) {
    const subcommand = args[0] || 'show'

    switch (subcommand) {
      case 'show': {
        if (duid.hasOriginalDUID()) {
          const original = duid.getOriginalDUID()
          console.log()
          log('Original DUID (stored):', colors.bright)
          printDUIDInfo(original)
          console.log(`Storage location: ${duid.getOriginalDUIDPath()}`)
        } else {
          info('No original DUID stored yet.')
          info('The original will be automatically saved when you first spoof the DUID.')
        }
        break
      }

      case 'clear': {
        if (!checkPrivileges()) {
          error('This command requires root/administrator privileges')
          process.exit(1)
        }

        if (duid.hasOriginalDUID()) {
          // Confirm with user
          console.log()
          log('WARNING: This will delete the stored original DUID.', colors.yellow)
          log('You will not be able to restore to the original after this.', colors.yellow)
          console.log()

          // Check for --force flag
          if (!args.includes('--force')) {
            info('To confirm, run: spoofy duid original clear --force')
            process.exit(1)
          }

          duid.clearOriginalDUID()
          success('Original DUID storage cleared.')
        } else {
          info('No original DUID stored.')
        }
        break
      }

      case 'path': {
        console.log(duid.getOriginalDUIDPath())
        break
      }

      default:
        error(`Unknown subcommand: ${subcommand}`)
        info('Usage: spoofy duid original [show|clear|path]')
        process.exit(1)
    }
  },

  /**
   * Randomize DUID
   */
  randomize (args) {
    if (!checkPrivileges()) {
      error('This command requires root/administrator privileges')
      info('Try: sudo spoofy duid randomize [interface]')
      process.exit(1)
    }

    const iface = args[0] || null
    const typeArg = args.find(a => a.startsWith('--type='))
    let duidType = duid.DUID_TYPES.DUID_LL // Default

    if (typeArg) {
      const typeStr = typeArg.split('=')[1].toUpperCase()
      if (typeStr === 'LLT' || typeStr === '1') duidType = duid.DUID_TYPES.DUID_LLT
      else if (typeStr === 'EN' || typeStr === '2') duidType = duid.DUID_TYPES.DUID_EN
      else if (typeStr === 'LL' || typeStr === '3') duidType = duid.DUID_TYPES.DUID_LL
      else if (typeStr === 'UUID' || typeStr === '4') duidType = duid.DUID_TYPES.DUID_UUID
    }

    try {
      info(`Generating random DUID (type: ${Object.keys(duid.DUID_TYPES).find(k => duid.DUID_TYPES[k] === duidType)})...`)

      const newDuid = duid.randomizeDUID(duidType, iface)

      success('DUID changed successfully!')
      printDUIDInfo(newDuid)

      if (iface) {
        info(`Applied to interface: ${iface}`)
      }

      info('Note: You may need to renew your DHCPv6 lease for changes to take effect.')
      info('The original DUID has been backed up and can be restored with: spoofy duid restore')
    } catch (e) {
      error(`Failed to set DUID: ${e.message}`)
      process.exit(1)
    }
  },

  /**
   * Set specific DUID
   */
  set (args) {
    if (!checkPrivileges()) {
      error('This command requires root/administrator privileges')
      info('Try: sudo spoofy duid set <duid-hex> [interface]')
      process.exit(1)
    }

    if (args.length < 1) {
      error('Usage: spoofy duid set <duid-hex> [interface]')
      info('Example: spoofy duid set 00:03:00:01:aa:bb:cc:dd:ee:ff en0')
      process.exit(1)
    }

    const duidHex = args[0]
    const iface = args[1] || null

    try {
      const duidBuf = duid.hexToDuid(duidHex)

      info(`Setting DUID to: ${duid.formatDUID(duidBuf)}`)

      duid.setDUID(duidBuf, iface)

      success('DUID changed successfully!')
      printDUIDInfo(duidBuf)

      info('The original DUID has been backed up and can be restored with: spoofy duid restore')
    } catch (e) {
      error(`Failed to set DUID: ${e.message}`)
      process.exit(1)
    }
  },

  /**
   * Reset DUID to system default
   */
  reset (args) {
    if (!checkPrivileges()) {
      error('This command requires root/administrator privileges')
      info('Try: sudo spoofy duid reset [interface]')
      process.exit(1)
    }

    const iface = args[0] || null

    try {
      info('Resetting DUID to system default...')

      duid.resetDUID(iface)

      success('DUID reset successfully!')
      info('The system will generate a new DUID on the next DHCPv6 request.')
    } catch (e) {
      error(`Failed to reset DUID: ${e.message}`)
      process.exit(1)
    }
  },

  /**
   * Restore DUID to original (pre-spoofing) value
   */
  restore (args) {
    if (!checkPrivileges()) {
      error('This command requires root/administrator privileges')
      info('Try: sudo spoofy duid restore [interface]')
      process.exit(1)
    }

    const iface = args[0] || null

    // Check if original exists
    if (!duid.hasOriginalDUID()) {
      error('No original DUID stored.')
      info('The original DUID is automatically saved when you first use randomize or set.')
      info('If you have never spoofed the DUID, there is nothing to restore.')
      process.exit(1)
    }

    try {
      const result = duid.restoreDUID(iface)

      if (result === 'not_spoofed') {
        info('DUID is already set to the original value.')
        printDUIDInfo(duid.getCurrentDUID())
      } else if (result) {
        success('DUID restored to original!')
        printDUIDInfo(duid.getCurrentDUID())
        info('You may need to renew your DHCPv6 lease for changes to take effect.')
      } else {
        error('Failed to restore DUID')
      }
    } catch (e) {
      error(`Failed to restore DUID: ${e.message}`)
      process.exit(1)
    }
  },

  /**
   * Generate a DUID without applying it
   */
  generate (args) {
    const typeArg = args.find(a => a.startsWith('--type='))
    const macArg = args.find(a => a.startsWith('--mac='))

    let duidType = duid.DUID_TYPES.DUID_LL
    let mac = null

    if (typeArg) {
      const typeStr = typeArg.split('=')[1].toUpperCase()
      if (typeStr === 'LLT' || typeStr === '1') duidType = duid.DUID_TYPES.DUID_LLT
      else if (typeStr === 'EN' || typeStr === '2') duidType = duid.DUID_TYPES.DUID_EN
      else if (typeStr === 'LL' || typeStr === '3') duidType = duid.DUID_TYPES.DUID_LL
      else if (typeStr === 'UUID' || typeStr === '4') duidType = duid.DUID_TYPES.DUID_UUID
    }

    if (macArg) {
      mac = macArg.split('=')[1]
    }

    const generated = duid.generateDUID(duidType, mac)

    console.log()
    log('Generated DUID:', colors.bright)
    printDUIDInfo(generated)

    info('To apply this DUID, use:')
    console.log(`  sudo spoofy duid set ${duid.formatDUID(generated)} [interface]`)
    console.log()
  },

  sync (args) {
    if (!checkPrivileges()) {
      error('This command requires root/administrator privileges')
      info('Try: sudo spoofy duid sync <interface>')
      process.exit(1)
    }

    if (args.length < 1) {
      error('Usage: spoofy duid sync <interface> [--type=<type>]')
      info('Example: sudo spoofy duid sync en0 --type=LLT')
      process.exit(1)
    }

    const iface = args[0]
    const typeArg = args.find(a => a.startsWith('--type='))
    let duidType = duid.DUID_TYPES.DUID_LL

    if (typeArg) {
      const typeStr = typeArg.split('=')[1].toUpperCase()
      if (typeStr === 'LLT' || typeStr === '1') duidType = duid.DUID_TYPES.DUID_LLT
      else if (typeStr === 'EN' || typeStr === '2') duidType = duid.DUID_TYPES.DUID_EN
      else if (typeStr === 'LL' || typeStr === '3') duidType = duid.DUID_TYPES.DUID_LL
      else if (typeStr === 'UUID' || typeStr === '4') duidType = duid.DUID_TYPES.DUID_UUID
    }

    try {
      info(`Syncing DUID to current MAC address of ${iface}...`)

      const currentMac = duid.getCurrentMACAddress(iface)
      if (!currentMac) {
        error(`Could not get MAC address for interface: ${iface}`)
        info('Make sure the interface name is correct and the interface is up')
        process.exit(1)
      }

      console.log(`  Current MAC: ${currentMac}`)

      const newDuid = duid.syncDUID(iface, duidType)

      success('DUID synced to current MAC address!')
      printDUIDInfo(newDuid)

      info('The DUID now matches the current MAC address.')
      info('The original DUID has been backed up and can be restored with: spoofy duid restore')
    } catch (e) {
      error(`Failed to sync DUID: ${e.message}`)
      process.exit(1)
    }
  },

  help () {
    console.log(`
${colors.bright}spoofy duid${colors.reset} - DHCPv6 DUID spoofing utility

${colors.bright}COMMANDS:${colors.reset}
  list, show              Show current DUID and original status
  randomize [iface]       Generate and set a random DUID
  set <duid> [iface]      Set a specific DUID
  sync <iface>            ${colors.cyan}Sync DUID to current MAC address${colors.reset}
  restore [iface]         ${colors.green}Restore to the original (pre-spoofing) DUID${colors.reset}
  reset [iface]           Reset DUID (system generates NEW one, not original)
  generate                Generate a DUID (without applying)
  original [subcommand]   Manage stored original DUID
  help                    Show this help message

${colors.bright}ORIGINAL SUBCOMMANDS:${colors.reset}
  original show           Show the stored original DUID
  original path           Show storage path for original DUID
  original clear --force  Delete the stored original (use with caution!)

${colors.bright}OPTIONS:${colors.reset}
  --type=<type>           DUID type: LLT (1), EN (2), LL (3), UUID (4)
                          Default: LL
  --mac=<address>         MAC address to use for DUID generation

${colors.bright}EXAMPLES:${colors.reset}
  spoofy duid list
  sudo spoofy duid randomize en0
  sudo spoofy duid randomize eth0 --type=LLT
  sudo spoofy duid set 00:03:00:01:aa:bb:cc:dd:ee:ff
  sudo spoofy duid sync en0                   # Sync DUID to current MAC
  sudo spoofy duid restore                    # Restore original DUID
  sudo spoofy duid reset                      # Generate new system DUID
  spoofy duid generate --type=UUID
  spoofy duid original show

${colors.bright}DUID TYPES:${colors.reset}
  LLT (1)   Link-layer address + timestamp (most common)
  EN  (2)   Enterprise number + identifier
  LL  (3)   Link-layer address only
  UUID (4)  UUID-based identifier

${colors.bright}RESTORE vs RESET:${colors.reset}
  ${colors.green}restore${colors.reset}  - Returns to your ORIGINAL DUID (saved on first spoof)
  ${colors.yellow}reset${colors.reset}    - Deletes DUID, system generates a NEW random one

${colors.bright}TYPICAL WORKFLOW:${colors.reset}
  ${colors.cyan}sudo spoofy randomize en0${colors.reset}      # Spoof MAC first
  ${colors.cyan}sudo spoofy duid sync en0${colors.reset}      # Sync DUID to match spoofed MAC

  This ensures both layers show the same spoofed identity.

${colors.bright}ORIGINAL DUID STORAGE:${colors.reset}
  The first time you spoof, your original DUID is automatically saved.
  This allows you to restore it later with 'spoofy duid restore'.
  
  Storage locations:
    macOS:   /var/db/dhcpclient/DUID.original
    Linux:   /var/lib/spoofy/duid.original
    Windows: %PROGRAMDATA%\\spoofy\\duid.original

${colors.bright}NOTES:${colors.reset}
  - Requires root/administrator privileges for set/randomize/reset/restore
  - Changes persist until reboot (macOS) or service restart
  - On macOS, active DUID is stored in /var/db/dhcpclient/DUID
  - On Linux, location depends on DHCP client (systemd/dhclient/NetworkManager)
  - On Windows, DUID is stored in the registry
`)
  }
}

/**
 * Integration function to add DUID commands to existing spoofy CLI
 *
 * Add this to your existing bin/cmd.js:
 *
 *   const duidCommands = require('./duid-cli');
 *
 *   // In your command handler:
 *   if (command === 'duid') {
 *     duidCommands.run(process.argv.slice(3));
 *   }
 */
function run (args) {
  const command = args[0] || 'help'
  const commandArgs = args.slice(1)

  if (commands[command]) {
    commands[command](commandArgs)
  } else {
    error(`Unknown command: ${command}`)
    commands.help()
    process.exit(1)
  }
}

// Export for integration
module.exports = { run, commands }

// Run standalone if executed directly
if (require.main === module) {
  run(process.argv.slice(2))
}
