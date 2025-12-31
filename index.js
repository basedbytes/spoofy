/*! spoof. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */
const cp = require('child_process')
const quote = require('shell-quote').quote
const zeroFill = require('zero-fill')
const duid = require('./lib/duid')

module.exports = {
  findInterface,
  findInterfaces,
  normalize,
  randomize,
  setInterfaceMAC,

  // DUID functionality
  duid: {
    DUID_TYPES: duid.DUID_TYPES,
    generateDUID: duid.generateDUID,
    getCurrentDUID: duid.getCurrentDUID,
    getCurrentMACAddress: duid.getCurrentMACAddress,
    setDUID: duid.setDUID,
    randomizeDUID: duid.randomizeDUID,
    restoreDUID: duid.restoreDUID,
    resetDUID: duid.resetDUID,
    syncDUID: duid.syncDUID,
    parseDUID: duid.parseDUID,
    formatDUID: duid.formatDUID,
    duidToHex: duid.duidToHex,
    hexToDuid: duid.hexToDuid,
    generateRandomMAC: duid.generateRandomMAC,
    hasOriginalDUID: duid.hasOriginalDUID,
    getOriginalDUID: duid.getOriginalDUID,
    getOriginalDUIDPath: duid.getOriginalDUIDPath,
    clearOriginalDUID: duid.clearOriginalDUID
  }
}

// MAC address regex: 00:00:00:00:00:00, 00-00-00-00-00-00, or 000000000000
const MAC_ADDRESS_RE =
  /([0-9A-F]{1,2})[:-]?([0-9A-F]{1,2})[:-]?([0-9A-F]{1,2})[:-]?([0-9A-F]{1,2})[:-]?([0-9A-F]{1,2})[:-]?([0-9A-F]{1,2})/i

// Cisco format: 0123.4567.89ab
const CISCO_MAC_ADDRESS_RE =
  /([0-9A-F]{0,4})\.([0-9A-F]{0,4})\.([0-9A-F]{0,4})/i

function findInterfaces (targets) {
  if (!targets) targets = []

  targets = targets.map((target) => target.toLowerCase())

  if (process.platform === 'darwin') {
    return findInterfacesDarwin(targets)
  } else if (process.platform === 'linux') {
    return findInterfacesLinux(targets)
  } else if (process.platform === 'win32') {
    return findInterfacesWin32(targets)
  }
}

function findInterfacesDarwin (targets) {
  // Parse networksetup output: port name, device, MAC address
  let output = cp.execSync('networksetup -listallhardwareports').toString()

  const details = []
  while (true) {
    const result = /(?:Hardware Port|Device|Ethernet Address): (.+)/.exec(
      output
    )
    if (!result || !result[1]) {
      break
    }
    details.push(result[1])
    output = output.slice(result.index + result[1].length)
  }

  const interfaces = []

  // Process in chunks of 3 (port, device, MAC)
  for (let i = 0; i < details.length; i += 3) {
    const port = details[i]
    const device = details[i + 1]
    let address = details[i + 2]

    address = MAC_ADDRESS_RE.exec(address.toUpperCase())
    if (address) {
      address = normalize(address[0])
    }

    const it = {
      address,
      currentAddress: getInterfaceMAC(device),
      device,
      port
    }

    if (targets.length === 0) {
      interfaces.push(it)
      continue
    }

    for (let j = 0; j < targets.length; j++) {
      const target = targets[j]
      if (target === port.toLowerCase() || target === device.toLowerCase()) {
        interfaces.push(it)
        break
      }
    }
  }

  return interfaces
}

function findInterfacesLinux (targets) {
  let output = cp.execSync('ifconfig', { stdio: 'pipe' }).toString()

  const details = []
  while (true) {
    const result = /(.*?)HWaddr(.*)/im.exec(output)
    if (!result || !result[1] || !result[2]) {
      break
    }
    details.push(result[1], result[2])
    output = output.slice(result.index + result[0].length)
  }

  const interfaces = []

  for (let i = 0; i < details.length; i += 2) {
    const s = details[i].split(':')

    let device, port
    if (s.length >= 2) {
      device = s[0].split(' ')[0]
      port = s[1].trim()
    }

    let address = details[i + 1].trim()
    if (address) {
      address = normalize(address)
    }

    const it = {
      address,
      currentAddress: getInterfaceMAC(device),
      device,
      port
    }

    if (targets.length === 0) {
      interfaces.push(it)
      continue
    }

    for (let j = 0; j < targets.length; j++) {
      const target = targets[j]
      if (target === port.toLowerCase() || target === device.toLowerCase()) {
        interfaces.push(it)
        break
      }
    }
  }

  return interfaces
}

function findInterfacesWin32 (targets) {
  const output = cp.execSync('ipconfig /all', { stdio: 'pipe' }).toString()

  const interfaces = []
  const lines = output.split('\n')
  let it = false
  for (let i = 0; i < lines.length; i++) {
    let result
    if (lines[i].substr(0, 1).match(/[A-Z]/)) {
      if (it) {
        if (targets.length === 0) {
          interfaces.push(it)
        } else {
          for (let j = 0; j < targets.length; j++) {
            const target = targets[j]
            if (
              target === it.port.toLowerCase() ||
              target === it.device.toLowerCase()
            ) {
              interfaces.push(it)
              break
            }
          }
        }
      }

      it = {
        port: '',
        device: ''
      }

      const result = /adapter (.+?):/.exec(lines[i])
      if (!result) {
        continue
      }

      it.device = result[1]
    }

    if (!it) {
      continue
    }
    result = /Physical Address.+?:(.*)/im.exec(lines[i])
    if (result) {
      it.address = normalize(result[1].trim())
      it.currentAddress = it.address
      continue
    }
    result = /description.+?:(.*)/im.exec(lines[i])
    if (result) {
      it.description = result[1].trim()
      continue
    }
  }
  return interfaces
}

function findInterface (target) {
  const interfaces = findInterfaces([target])
  return interfaces && interfaces[0]
}

function getInterfaceMAC (device) {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    let output
    try {
      output = cp
        .execSync(quote(['ifconfig', device]), { stdio: 'pipe' })
        .toString()
    } catch (err) {
      return null
    }

    const address = MAC_ADDRESS_RE.exec(output)
    return address && normalize(address[0])
  } else if (process.platform === 'win32') {
    console.error('No windows support for this method yet - PR welcome!')
  }
}

function setInterfaceMAC (device, mac, port) {
  if (!MAC_ADDRESS_RE.exec(mac)) {
    throw new Error(mac + ' is not a valid MAC address')
  }

  const isWirelessPort = port && port.toLowerCase() === 'wi-fi'

  if (process.platform === 'darwin') {
    let macChangeError = null

    if (isWirelessPort) {
      // WiFi MAC change requires timing: power off → on → change before auto-join
      // (macOS Sequoia 15.4+, Tahoe 26+)
      try {
        cp.execSync(quote(['networksetup', '-setairportpower', device, 'off']))
        cp.execSync(quote(['networksetup', '-setairportpower', device, 'on']))
        cp.execFileSync('ifconfig', [device, 'ether', mac])
      } catch (err) {
        macChangeError = err
      }

      try {
        cp.execSync(quote(['networksetup', '-detectnewhardware']))
      } catch (err) {}
    } else {
      try {
        cp.execFileSync('ifconfig', [device, 'down'])
      } catch (err) {
        macChangeError = new Error(
          'Unable to bring interface down: ' + err.message
        )
      }

      if (!macChangeError) {
        try {
          cp.execFileSync('ifconfig', [device, 'ether', mac])
        } catch (err) {
          macChangeError = err
        }
      }

      try {
        cp.execFileSync('ifconfig', [device, 'up'])
      } catch (err) {
        if (!macChangeError) {
          macChangeError = new Error(
            'Unable to bring interface up: ' + err.message
          )
        }
      }
    }

    if (macChangeError) {
      throw new Error(
        'Unable to change MAC address: ' + macChangeError.message
      )
    }
  } else if (process.platform === 'linux') {
    throw new Error(
      'Modern Linux support coming soon! This fork currently only supports macOS. See https://github.com/basedbytes/spoofy for updates.'
    )
  } else if (process.platform === 'win32') {
    throw new Error(
      'Modern Windows support coming soon! This fork currently only supports macOS. See https://github.com/basedbytes/spoofy for updates.'
    )
  }
}

function randomize (localAdmin) {
  // Use VM vendor prefixes to avoid collisions
  const vendors = [
    [0x00, 0x05, 0x69], // VMware
    [0x00, 0x50, 0x56], // VMware
    [0x00, 0x0c, 0x29], // VMware
    [0x00, 0x16, 0x3e], // Xen
    [0x00, 0x03, 0xff], // Microsoft Hyper-V, Virtual Server, Virtual PC
    [0x00, 0x1c, 0x42], // Parallels
    [0x00, 0x0f, 0x4b], // Virtual Iron 4
    [0x08, 0x00, 0x27] // Sun Virtual Box
  ]

  const windowsPrefixes = ['D2', 'D6', 'DA', 'DE']
  const vendor = vendors[random(0, vendors.length - 1)]

  if (process.platform === 'win32') {
    vendor[0] = parseInt(windowsPrefixes[random(0, 3)], 16)
  }

  const mac = [
    vendor[0],
    vendor[1],
    vendor[2],
    random(0x00, 0x7f),
    random(0x00, 0xff),
    random(0x00, 0xff)
  ]

  if (localAdmin) {
    mac[0] |= 2 // Set locally administered bit
  }

  return mac
    .map((byte) => zeroFill(2, byte.toString(16)))
    .join(':')
    .toUpperCase()
}

// Normalize MAC address to 00:00:00:00:00:00 format
function normalize (mac) {
  let m = CISCO_MAC_ADDRESS_RE.exec(mac)
  if (m) {
    const halfwords = m.slice(1)
    mac = halfwords
      .map((halfword) => {
        return zeroFill(4, halfword)
      })
      .join('')
    return chunk(mac, 2).join(':').toUpperCase()
  }

  m = MAC_ADDRESS_RE.exec(mac)
  if (m) {
    const bytes = m.slice(1)
    return bytes
      .map((byte) => zeroFill(2, byte))
      .join(':')
      .toUpperCase()
  }
}

function chunk (str, n) {
  const arr = []
  for (let i = 0; i < str.length; i += n) {
    arr.push(str.slice(i, i + n))
  }
  return arr
}

function random (min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}
