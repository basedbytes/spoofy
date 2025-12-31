/**
 * DUID (DHCP Unique Identifier) manipulation for DHCPv6
 * RFC 8415 - supports types 1-4 (LLT, EN, LL, UUID)
 */

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const platform = os.platform();

const DUID_TYPES = {
  DUID_LLT: 1,   // Link-layer + Time
  DUID_EN: 2,    // Enterprise Number
  DUID_LL: 3,    // Link-layer only
  DUID_UUID: 4   // UUID
};

const HW_TYPE_ETHERNET = 1;

function generateRandomMAC() {
  const bytes = [];
  for (let i = 0; i < 6; i++) {
    bytes.push(Math.floor(Math.random() * 256));
  }
  // Set locally administered bit, clear multicast bit
  bytes[0] = (bytes[0] | 0x02) & 0xFE;
  return bytes.map(b => b.toString(16).padStart(2, '0')).join(':');
}

function getCurrentMACAddress(iface) {
  if (!iface) {
    throw new Error('Interface name required');
  }

  try {
    if (platform === 'darwin' || platform === 'linux') {
      let output;
      if (platform === 'darwin') {
        output = execSync(`ifconfig ${iface}`, { encoding: 'utf8' });
        const match = output.match(/ether\s+([0-9a-f:]{17})/i);
        return match ? match[1] : null;
      } else {
        output = execSync(`ip link show ${iface}`, { encoding: 'utf8' });
        const match = output.match(/link\/ether\s+([0-9a-f:]{17})/i);
        return match ? match[1] : null;
      }
    } else if (platform === 'win32') {
      const output = execSync(
        `powershell -Command "Get-NetAdapter -Name '${iface}' | Select-Object -ExpandProperty MacAddress"`,
        { encoding: 'utf8' }
      ).trim();
      return output ? output.replace(/-/g, ':').toLowerCase() : null;
    }
  } catch (e) {
    // Fallback to os.networkInterfaces()
    const ifaces = os.networkInterfaces();
    for (const name in ifaces) {
      if (name.toLowerCase() === iface.toLowerCase()) {
        const info = ifaces[name].find(i => i.mac && i.mac !== '00:00:00:00:00:00');
        return info ? info.mac : null;
      }
    }
  }

  return null;
}

function generateDUID(type = DUID_TYPES.DUID_LL, mac = null) {
  const macAddr = mac || generateRandomMAC();
  const macBytes = macAddr.split(':').map(h => parseInt(h, 16));
  
  switch (type) {
    case DUID_TYPES.DUID_LLT: {
      // Type (2) + HW Type (2) + Time (4) + Link-layer (6) = 14 bytes
      const buf = Buffer.alloc(14);
      buf.writeUInt16BE(DUID_TYPES.DUID_LLT, 0);
      buf.writeUInt16BE(HW_TYPE_ETHERNET, 2);
      // Time since Jan 1, 2000 in seconds
      const epoch2000 = Math.floor((Date.now() / 1000) - 946684800);
      buf.writeUInt32BE(epoch2000, 4);
      macBytes.forEach((b, i) => buf.writeUInt8(b, 8 + i));
      return buf;
    }
    
    case DUID_TYPES.DUID_EN: {
      // Type (2) + Enterprise Number (4) + Identifier (variable)
      const identifier = Buffer.from(macAddr.replace(/:/g, ''), 'hex');
      const buf = Buffer.alloc(6 + identifier.length);
      buf.writeUInt16BE(DUID_TYPES.DUID_EN, 0);
      buf.writeUInt32BE(9, 2); // Enterprise number 9 = Cisco (example)
      identifier.copy(buf, 6);
      return buf;
    }
    
    case DUID_TYPES.DUID_LL: {
      // Type (2) + HW Type (2) + Link-layer (6) = 10 bytes
      const buf = Buffer.alloc(10);
      buf.writeUInt16BE(DUID_TYPES.DUID_LL, 0);
      buf.writeUInt16BE(HW_TYPE_ETHERNET, 2);
      macBytes.forEach((b, i) => buf.writeUInt8(b, 4 + i));
      return buf;
    }
    
    case DUID_TYPES.DUID_UUID: {
      // Type (2) + UUID (16) = 18 bytes
      const buf = Buffer.alloc(18);
      buf.writeUInt16BE(DUID_TYPES.DUID_UUID, 0);
      // Generate random UUID v4
      for (let i = 0; i < 16; i++) {
        buf.writeUInt8(Math.floor(Math.random() * 256), 2 + i);
      }
      // Set version (4) and variant bits
      buf[8] = (buf[8] & 0x0F) | 0x40;
      buf[10] = (buf[10] & 0x3F) | 0x80;
      return buf;
    }
    
    default:
      throw new Error(`Unknown DUID type: ${type}`);
  }
}

/**
 * Convert DUID buffer to hex string
 * @param {Buffer} duid 
 * @returns {string}
 */
function duidToHex(duid) {
  return duid.toString('hex').toUpperCase();
}

function hexToDuid(hex) {
  return Buffer.from(hex.replace(/[:\s]/g, ''), 'hex');
}

function formatDUID(duid) {
  const hex = duid.toString('hex');
  return hex.match(/.{2}/g).join(':').toUpperCase();
}

function syncDUID(iface, type = DUID_TYPES.DUID_LL) {
  const currentMac = getCurrentMACAddress(iface);
  if (!currentMac) {
    throw new Error(`Could not get MAC address for interface: ${iface}`);
  }
  const duid = generateDUID(type, currentMac);
  setDUID(duid, iface);
  return duid;
}

// Original DUID storage (persists across reboots)

function getOriginalDUIDPath() {
  switch (platform) {
    case 'darwin':
      return '/var/db/dhcpclient/DUID.original';
    case 'linux':
      const linuxPath = '/var/lib/spoofy';
      if (!fs.existsSync(linuxPath)) {
        try {
          fs.mkdirSync(linuxPath, { recursive: true, mode: 0o755 });
        } catch (e) {
          return path.join(os.homedir(), '.spoofy', 'duid.original');
        }
      }
      return path.join(linuxPath, 'duid.original');
    case 'win32':
      const winPath = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'spoofy');
      if (!fs.existsSync(winPath)) {
        try {
          fs.mkdirSync(winPath, { recursive: true });
        } catch (e) {
          return path.join(process.env.APPDATA || os.homedir(), 'spoofy', 'duid.original');
        }
      }
      return path.join(winPath, 'duid.original');
    default:
      return path.join(os.homedir(), '.spoofy', 'duid.original');
  }
}

// Store original DUID (only if not already stored)
function storeOriginalDUID(duid) {
  const originalPath = getOriginalDUIDPath();

  if (fs.existsSync(originalPath)) {
    return false;
  }
  const dir = path.dirname(originalPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Store with metadata
  const metadata = {
    duid: duid.toString('hex'),
    storedAt: new Date().toISOString(),
    platform: platform,
    hostname: os.hostname()
  };
  
  fs.writeFileSync(originalPath, JSON.stringify(metadata, null, 2));
  return true;
}

function getOriginalDUID() {
  const originalPath = getOriginalDUIDPath();
  
  if (!fs.existsSync(originalPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(originalPath, 'utf8');
    const metadata = JSON.parse(content);
    return Buffer.from(metadata.duid, 'hex');
  } catch (e) {
    // Try reading as raw binary (legacy format)
    try {
      return fs.readFileSync(originalPath);
    } catch (e2) {
      return null;
    }
  }
}

/**
 * Check if original DUID is stored
 * @returns {boolean}
 */
function hasOriginalDUID() {
  return fs.existsSync(getOriginalDUIDPath());
}

/**
 * Clear the stored original DUID
 * WARNING: This should rarely be used - only for testing or explicit user request
 * @returns {boolean}
 */
function clearOriginalDUID() {
  const originalPath = getOriginalDUIDPath();
  if (fs.existsSync(originalPath)) {
    fs.unlinkSync(originalPath);
    return true;
  }
  return false;
}

// macOS

const macos = {
  DUID_PATH: '/var/db/dhcpclient/DUID',

  getCurrentDUID() {
    try {
      if (fs.existsSync(this.DUID_PATH)) {
        return fs.readFileSync(this.DUID_PATH);
      }
      const result = execSync('defaults read /var/db/dhcpclient/DUID 2>/dev/null || true', {
        encoding: 'utf8'
      }).trim();
      if (result) {
        return hexToDuid(result);
      }
    } catch (e) {}
    return null;
  },
  
  /**
   * Backup original DUID (only once, preserves the true original)
   */
  backupOriginal() {
    const current = this.getCurrentDUID();
    if (current) {
      const stored = storeOriginalDUID(current);
      if (stored) {
        console.log('Original DUID stored for future restoration');
      }
      return true;
    }
    return false;
  },

  setDUID(duid, iface = null) {
    this.backupOriginal();
    if (iface) {
      try {
        execSync(`networksetup -setv6off "${iface}"`, { stdio: 'pipe' });
      } catch (e) {
        const hwPort = this.getHardwarePort(iface);
        if (hwPort) {
          execSync(`networksetup -setv6off "${hwPort}"`, { stdio: 'pipe' });
        }
      }
    }

    try {
      execSync('rm -f /var/db/dhcpclient/DUID*', { stdio: 'pipe' });
      execSync('rm -rf /var/db/dhcpclient/leases/*', { stdio: 'pipe' });
    } catch (e) {}

    const duidDir = path.dirname(this.DUID_PATH);
    if (!fs.existsSync(duidDir)) {
      fs.mkdirSync(duidDir, { recursive: true });
    }
    fs.writeFileSync(this.DUID_PATH, duid);
    if (iface) {
      try {
        execSync(`networksetup -setv6automatic "${iface}"`, { stdio: 'pipe' });
      } catch (e) {
        const hwPort = this.getHardwarePort(iface);
        if (hwPort) {
          execSync(`networksetup -setv6automatic "${hwPort}"`, { stdio: 'pipe' });
        }
      }
    }
    
    return true;
  },
  
  /**
   * Restore DUID to the original (pre-spoofing) value
   * @param {string} [iface] - Network interface
   * @returns {boolean|string} true if restored, false if no original, 'not_spoofed' if current matches original
   */
  restoreDUID(iface = null) {
    const original = getOriginalDUID();
    
    if (!original) {
      return false; // No original stored
    }
    
    // Check if we're already at original
    const current = this.getCurrentDUID();
    if (current && current.equals(original)) {
      return 'not_spoofed'; // Already at original
    }
    
    // Disable IPv6 temporarily
    if (iface) {
      try {
        execSync(`networksetup -setv6off "${iface}"`, { stdio: 'pipe' });
      } catch (e) {
        const hwPort = this.getHardwarePort(iface);
        if (hwPort) {
          execSync(`networksetup -setv6off "${hwPort}"`, { stdio: 'pipe' });
        }
      }
    }
    
    // Clear existing DHCP leases and DUID
    try {
      execSync('rm -f /var/db/dhcpclient/DUID', { stdio: 'pipe' });
      execSync('rm -rf /var/db/dhcpclient/leases/*', { stdio: 'pipe' });
    } catch (e) {}
    
    // Write original DUID back
    fs.writeFileSync(this.DUID_PATH, original);
    
    // Re-enable IPv6
    if (iface) {
      try {
        execSync(`networksetup -setv6automatic "${iface}"`, { stdio: 'pipe' });
      } catch (e) {
        const hwPort = this.getHardwarePort(iface);
        if (hwPort) {
          execSync(`networksetup -setv6automatic "${hwPort}"`, { stdio: 'pipe' });
        }
      }
    }
    
    return true;
  },
  
  /**
   * Reset DUID (remove spoofed DUID, system will regenerate)
   * Note: This generates a NEW DUID, not the original. Use restoreDUID() to get original back.
   */
  resetDUID(iface = null) {
    // Disable IPv6
    if (iface) {
      const hwPort = this.getHardwarePort(iface) || iface;
      try {
        execSync(`networksetup -setv6off "${hwPort}"`, { stdio: 'pipe' });
      } catch (e) {}
    }
    
    // Remove DUID file (but NOT the .original backup!)
    try {
      execSync('rm -f /var/db/dhcpclient/DUID', { stdio: 'pipe' });
    } catch (e) {}
    
    // Re-enable IPv6 (system will generate new DUID)
    if (iface) {
      const hwPort = this.getHardwarePort(iface) || iface;
      try {
        execSync(`networksetup -setv6automatic "${hwPort}"`, { stdio: 'pipe' });
      } catch (e) {}
    }
    
    return true;
  },
  
  /**
   * Get hardware port name from device name
   */
  getHardwarePort(device) {
    try {
      const output = execSync('networksetup -listallhardwareports', { encoding: 'utf8' });
      const lines = output.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`Device: ${device}`)) {
          // Previous line should be Hardware Port
          const portLine = lines[i - 1];
          const match = portLine.match(/Hardware Port: (.+)/);
          if (match) return match[1];
        }
      }
    } catch (e) {}
    return null;
  }
};

// =============================================================================
// Linux Implementation
// =============================================================================

const linux = {
  // Common DUID file locations
  SYSTEMD_DUID_PATH: '/etc/systemd/network',
  DHCLIENT_CONF: '/etc/dhcp/dhclient6.conf',
  MACHINE_ID: '/etc/machine-id',
  
  /**
   * Detect which DHCP client is in use
   */
  detectDHCPClient() {
    try {
      execSync('systemctl is-active systemd-networkd', { stdio: 'pipe' });
      return 'systemd';
    } catch (e) {}
    
    try {
      execSync('pgrep dhclient', { stdio: 'pipe' });
      return 'dhclient';
    } catch (e) {}
    
    try {
      execSync('pgrep NetworkManager', { stdio: 'pipe' });
      return 'networkmanager';
    } catch (e) {}
    
    return 'unknown';
  },
  
  /**
   * Get current DUID on Linux
   */
  getCurrentDUID() {
    const client = this.detectDHCPClient();
    
    switch (client) {
      case 'systemd': {
        try {
          const output = execSync('networkctl status 2>/dev/null | grep -i duid', {
            encoding: 'utf8'
          });
          const match = output.match(/DUID:\s*([0-9a-fA-F:]+)/i);
          if (match) {
            return hexToDuid(match[1]);
          }
        } catch (e) {}
        break;
      }
      
      case 'dhclient': {
        try {
          if (fs.existsSync(this.DHCLIENT_CONF)) {
            const content = fs.readFileSync(this.DHCLIENT_CONF, 'utf8');
            const match = content.match(/send\s+dhcp6\.client-id\s+([0-9a-fA-F:]+)/i);
            if (match) {
              return hexToDuid(match[1]);
            }
          }
        } catch (e) {}
        break;
      }
      
      case 'networkmanager': {
        try {
          const output = execSync('nmcli -g dhcp6.duid connection show', {
            encoding: 'utf8'
          });
          if (output.trim()) {
            return hexToDuid(output.trim());
          }
        } catch (e) {}
        break;
      }
    }
    
    return null;
  },
  
  /**
   * Backup original DUID (only once, preserves the true original)
   */
  backupOriginal() {
    const current = this.getCurrentDUID();
    if (current) {
      const stored = storeOriginalDUID(current);
      if (stored) {
        console.log('Original DUID stored for future restoration');
      }
      return true;
    }
    return false;
  },
  
  /**
   * Set DUID on Linux
   */
  setDUID(duid, iface = null) {
    // Store original DUID if this is the first time spoofing
    this.backupOriginal();
    
    const client = this.detectDHCPClient();
    const duidHex = formatDUID(duid).toLowerCase();
    
    switch (client) {
      case 'systemd': {
        // Create/modify network file for the interface
        const networkFile = iface 
          ? `${this.SYSTEMD_DUID_PATH}/${iface}.network`
          : `${this.SYSTEMD_DUID_PATH}/00-duid.network`;

        if (!fs.existsSync(this.SYSTEMD_DUID_PATH)) {
          fs.mkdirSync(this.SYSTEMD_DUID_PATH, { recursive: true });
        }
        
        // Raw DUID data (without colons)
        const rawDuid = duid.toString('hex');
        
        let content;
        if (iface) {
          content = `[Match]
Name=${iface}

[DHCPv6]
DUIDType=raw
DUIDRawData=${rawDuid}
`;
        } else {
          // System-wide DUID
          content = `[DHCPv6]
DUIDType=raw
DUIDRawData=${rawDuid}
`;
          fs.writeFileSync(`${this.SYSTEMD_DUID_PATH}/00-duid.conf`, content);
        }
        
        if (iface) {
          fs.writeFileSync(networkFile, content);
        }
        
        // Restart networkd
        try {
          execSync('systemctl restart systemd-networkd', { stdio: 'pipe' });
        } catch (e) {}
        
        return true;
      }
      
      case 'dhclient': {
        // Modify dhclient6.conf
        const confDir = path.dirname(this.DHCLIENT_CONF);
        if (!fs.existsSync(confDir)) {
          fs.mkdirSync(confDir, { recursive: true });
        }
        
        let content = '';
        if (fs.existsSync(this.DHCLIENT_CONF)) {
          content = fs.readFileSync(this.DHCLIENT_CONF, 'utf8');
          // Remove existing DUID line
          content = content.replace(/send\s+dhcp6\.client-id\s+[^;]+;/g, '');
        }
        
        content += `\nsend dhcp6.client-id ${duidHex};\n`;
        fs.writeFileSync(this.DHCLIENT_CONF, content);
        
        // Restart dhclient if running
        if (iface) {
          try {
            execSync(`dhclient -6 -r ${iface} 2>/dev/null || true`, { stdio: 'pipe' });
            execSync(`dhclient -6 ${iface} 2>/dev/null || true`, { stdio: 'pipe' });
          } catch (e) {}
        }
        
        return true;
      }
      
      case 'networkmanager': {
        if (iface) {
          // Get connection name for interface
          try {
            const connName = execSync(`nmcli -g GENERAL.CONNECTION device show ${iface}`, {
              encoding: 'utf8'
            }).trim();
            
            if (connName) {
              execSync(`nmcli connection modify "${connName}" ipv6.dhcp-duid ${duidHex}`, {
                stdio: 'pipe'
              });
              execSync(`nmcli connection down "${connName}" && nmcli connection up "${connName}"`, {
                stdio: 'pipe'
              });
            }
          } catch (e) {}
        }
        return true;
      }
      
      default:
        throw new Error('Could not detect DHCP client. Please configure DUID manually.');
    }
  },
  
  /**
   * Restore DUID to the original (pre-spoofing) value
   */
  restoreDUID(iface = null) {
    const original = getOriginalDUID();
    
    if (!original) {
      return false; // No original stored
    }
    
    // Check if we're already at original
    const current = this.getCurrentDUID();
    if (current && current.equals(original)) {
      return 'not_spoofed'; // Already at original
    }
    
    // Set the original DUID back
    const client = this.detectDHCPClient();
    const duidHex = formatDUID(original).toLowerCase();
    
    switch (client) {
      case 'systemd': {
        const rawDuid = original.toString('hex');
        const content = `[DHCPv6]
DUIDType=raw
DUIDRawData=${rawDuid}
`;
        fs.writeFileSync(`${this.SYSTEMD_DUID_PATH}/00-duid.conf`, content);
        try {
          execSync('systemctl restart systemd-networkd', { stdio: 'pipe' });
        } catch (e) {}
        break;
      }
      
      case 'dhclient': {
        const confDir = path.dirname(this.DHCLIENT_CONF);
        if (!fs.existsSync(confDir)) {
          fs.mkdirSync(confDir, { recursive: true });
        }
        
        let content = '';
        if (fs.existsSync(this.DHCLIENT_CONF)) {
          content = fs.readFileSync(this.DHCLIENT_CONF, 'utf8');
          content = content.replace(/send\s+dhcp6\.client-id\s+[^;]+;/g, '');
        }
        
        content += `\nsend dhcp6.client-id ${duidHex};\n`;
        fs.writeFileSync(this.DHCLIENT_CONF, content);
        
        if (iface) {
          try {
            execSync(`dhclient -6 -r ${iface} 2>/dev/null || true`, { stdio: 'pipe' });
            execSync(`dhclient -6 ${iface} 2>/dev/null || true`, { stdio: 'pipe' });
          } catch (e) {}
        }
        break;
      }
      
      case 'networkmanager': {
        if (iface) {
          try {
            const connName = execSync(`nmcli -g GENERAL.CONNECTION device show ${iface}`, {
              encoding: 'utf8'
            }).trim();
            
            if (connName) {
              execSync(`nmcli connection modify "${connName}" ipv6.dhcp-duid ${duidHex}`, {
                stdio: 'pipe'
              });
              execSync(`nmcli connection down "${connName}" && nmcli connection up "${connName}"`, {
                stdio: 'pipe'
              });
            }
          } catch (e) {}
        }
        break;
      }
    }
    
    return true;
  },
  
  /**
   * Reset DUID to system default (generates NEW DUID, not original)
   * Use restoreDUID() to get the original back
   */
  resetDUID(iface = null) {
    const client = this.detectDHCPClient();
    
    switch (client) {
      case 'systemd': {
        // Remove custom DUID configuration
        const files = [
          `${this.SYSTEMD_DUID_PATH}/00-duid.conf`,
          iface ? `${this.SYSTEMD_DUID_PATH}/${iface}.network` : null
        ].filter(Boolean);
        
        files.forEach(f => {
          if (fs.existsSync(f)) {
            fs.unlinkSync(f);
          }
        });
        
        try {
          execSync('systemctl restart systemd-networkd', { stdio: 'pipe' });
        } catch (e) {}
        break;
      }
      
      case 'dhclient': {
        if (fs.existsSync(this.DHCLIENT_CONF)) {
          let content = fs.readFileSync(this.DHCLIENT_CONF, 'utf8');
          content = content.replace(/send\s+dhcp6\.client-id\s+[^;]+;/g, '');
          fs.writeFileSync(this.DHCLIENT_CONF, content);
        }
        break;
      }
      
      case 'networkmanager': {
        if (iface) {
          try {
            const connName = execSync(`nmcli -g GENERAL.CONNECTION device show ${iface}`, {
              encoding: 'utf8'
            }).trim();
            
            if (connName) {
              // Reset to default (stable)
              execSync(`nmcli connection modify "${connName}" ipv6.dhcp-duid stable-llt`, {
                stdio: 'pipe'
              });
            }
          } catch (e) {}
        }
        break;
      }
    }
    
    return true;
  }
};

// =============================================================================
// Windows Implementation
// =============================================================================

const windows = {
  REGISTRY_PATH: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters',
  
  /**
   * Get current DUID on Windows
   */
  getCurrentDUID() {
    try {
      const output = execSync(
        `reg query "${this.REGISTRY_PATH}" /v Dhcpv6DUID 2>nul`,
        { encoding: 'utf8' }
      );
      
      // Parse REG_BINARY output
      const match = output.match(/Dhcpv6DUID\s+REG_BINARY\s+([0-9A-Fa-f]+)/);
      if (match) {
        return Buffer.from(match[1], 'hex');
      }
    } catch (e) {}
    return null;
  },
  
  /**
   * Backup original DUID (only once, preserves the true original)
   */
  backupOriginal() {
    const current = this.getCurrentDUID();
    if (current) {
      const stored = storeOriginalDUID(current);
      if (stored) {
        console.log('Original DUID stored for future restoration');
      }
      return true;
    }
    return false;
  },
  
  /**
   * Set DUID on Windows
   */
  setDUID(duid, iface = null) {
    // Store original DUID if this is the first time spoofing
    this.backupOriginal();
    
    const duidHex = duid.toString('hex').toUpperCase();
    
    // Set registry value
    try {
      execSync(
        `reg add "${this.REGISTRY_PATH}" /v Dhcpv6DUID /t REG_BINARY /d ${duidHex} /f`,
        { stdio: 'pipe' }
      );
    } catch (e) {
      throw new Error('Failed to set DUID. Make sure you are running as Administrator.');
    }
    
    // Restart IPv6 on the interface
    if (iface) {
      try {
        // Disable and re-enable IPv6
        execSync(`netsh interface ipv6 set interface "${iface}" disabled`, { stdio: 'pipe' });
        execSync(`netsh interface ipv6 set interface "${iface}" enabled`, { stdio: 'pipe' });
      } catch (e) {
        // Try PowerShell method
        try {
          execSync(
            `powershell -Command "Disable-NetAdapterBinding -Name '${iface}' -ComponentID ms_tcpip6; Enable-NetAdapterBinding -Name '${iface}' -ComponentID ms_tcpip6"`,
            { stdio: 'pipe' }
          );
        } catch (e2) {}
      }
    }
    
    return true;
  },
  
  /**
   * Restore DUID to the original (pre-spoofing) value
   */
  restoreDUID(iface = null) {
    const original = getOriginalDUID();
    
    if (!original) {
      return false; // No original stored
    }
    
    // Check if we're already at original
    const current = this.getCurrentDUID();
    if (current && current.equals(original)) {
      return 'not_spoofed'; // Already at original
    }
    
    const duidHex = original.toString('hex').toUpperCase();
    
    // Set registry value
    try {
      execSync(
        `reg add "${this.REGISTRY_PATH}" /v Dhcpv6DUID /t REG_BINARY /d ${duidHex} /f`,
        { stdio: 'pipe' }
      );
    } catch (e) {
      throw new Error('Failed to restore DUID. Make sure you are running as Administrator.');
    }
    
    // Restart IPv6 on the interface
    if (iface) {
      try {
        execSync(`netsh interface ipv6 set interface "${iface}" disabled`, { stdio: 'pipe' });
        execSync(`netsh interface ipv6 set interface "${iface}" enabled`, { stdio: 'pipe' });
      } catch (e) {
        try {
          execSync(
            `powershell -Command "Disable-NetAdapterBinding -Name '${iface}' -ComponentID ms_tcpip6; Enable-NetAdapterBinding -Name '${iface}' -ComponentID ms_tcpip6"`,
            { stdio: 'pipe' }
          );
        } catch (e2) {}
      }
    }
    
    return true;
  },
  
  /**
   * Reset DUID (delete registry key, system will regenerate)
   * Note: This generates a NEW DUID, not the original. Use restoreDUID() to get original back.
   */
  resetDUID(iface = null) {
    try {
      execSync(`reg delete "${this.REGISTRY_PATH}" /v Dhcpv6DUID /f`, { stdio: 'pipe' });
    } catch (e) {
      // May not exist
    }
    
    // Restart IPv6 to trigger regeneration
    if (iface) {
      try {
        execSync(`netsh interface ipv6 set interface "${iface}" disabled`, { stdio: 'pipe' });
        execSync(`netsh interface ipv6 set interface "${iface}" enabled`, { stdio: 'pipe' });
      } catch (e) {}
    }
    
    return true;
  },
  
  /**
   * List network adapters
   */
  listAdapters() {
    try {
      const output = execSync(
        'powershell -Command "Get-NetAdapter | Select-Object Name, InterfaceDescription, MacAddress, Status | ConvertTo-Json"',
        { encoding: 'utf8' }
      );
      return JSON.parse(output);
    } catch (e) {
      return [];
    }
  }
};

// =============================================================================
// Cross-platform API
// =============================================================================

/**
 * Get platform-specific implementation
 */
function getPlatformImpl() {
  switch (platform) {
    case 'darwin':
      return macos;
    case 'linux':
      return linux;
    case 'win32':
      return windows;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Get current DUID
 * @returns {Buffer|null}
 */
function getCurrentDUID() {
  return getPlatformImpl().getCurrentDUID();
}

/**
 * Set a new DUID
 * @param {Buffer|string} duid - DUID buffer or hex string
 * @param {string} [iface] - Network interface
 */
function setDUID(duid, iface = null) {
  const duidBuf = Buffer.isBuffer(duid) ? duid : hexToDuid(duid);
  return getPlatformImpl().setDUID(duidBuf, iface);
}

/**
 * Randomize DUID
 * @param {number} [type] - DUID type (default: DUID-LL)
 * @param {string} [iface] - Network interface
 * @param {string} [mac] - Optional MAC address to base DUID on
 */
function randomizeDUID(type = DUID_TYPES.DUID_LL, iface = null, mac = null) {
  const duid = generateDUID(type, mac);
  setDUID(duid, iface);
  return duid;
}

/**
 * Restore DUID from backup
 * @param {string} [iface] - Network interface
 */
function restoreDUID(iface = null) {
  return getPlatformImpl().restoreDUID(iface);
}

/**
 * Reset DUID to system default
 * @param {string} [iface] - Network interface
 */
function resetDUID(iface = null) {
  return getPlatformImpl().resetDUID(iface);
}

/**
 * Parse DUID buffer and return info
 * @param {Buffer} duid 
 * @returns {object}
 */
function parseDUID(duid) {
  if (!duid || duid.length < 2) {
    return { type: 'unknown', raw: duid };
  }
  
  const type = duid.readUInt16BE(0);
  const result = {
    type,
    typeName: Object.keys(DUID_TYPES).find(k => DUID_TYPES[k] === type) || 'unknown',
    raw: formatDUID(duid)
  };
  
  switch (type) {
    case DUID_TYPES.DUID_LLT:
      if (duid.length >= 14) {
        result.hwType = duid.readUInt16BE(2);
        result.time = duid.readUInt32BE(4);
        result.timeDate = new Date((result.time + 946684800) * 1000);
        result.lladdr = Array.from(duid.slice(8, 14))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(':');
      }
      break;
      
    case DUID_TYPES.DUID_EN:
      if (duid.length >= 6) {
        result.enterpriseNumber = duid.readUInt32BE(2);
        result.identifier = duid.slice(6).toString('hex');
      }
      break;
      
    case DUID_TYPES.DUID_LL:
      if (duid.length >= 10) {
        result.hwType = duid.readUInt16BE(2);
        result.lladdr = Array.from(duid.slice(4, 10))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(':');
      }
      break;
      
    case DUID_TYPES.DUID_UUID:
      if (duid.length >= 18) {
        const uuid = duid.slice(2, 18);
        result.uuid = [
          uuid.slice(0, 4).toString('hex'),
          uuid.slice(4, 6).toString('hex'),
          uuid.slice(6, 8).toString('hex'),
          uuid.slice(8, 10).toString('hex'),
          uuid.slice(10, 16).toString('hex')
        ].join('-');
      }
      break;
  }
  
  return result;
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  // Constants
  DUID_TYPES,
  
  // Generation
  generateDUID,
  generateRandomMAC,
  getCurrentMACAddress,

  // Conversion utilities
  duidToHex,
  hexToDuid,
  formatDUID,
  parseDUID,
  
  // Original DUID management
  getOriginalDUID,
  hasOriginalDUID,
  storeOriginalDUID,
  clearOriginalDUID,
  getOriginalDUIDPath,
  
  // Cross-platform API
  getCurrentDUID,
  setDUID,
  randomizeDUID,
  restoreDUID,
  resetDUID,
  syncDUID,
  
  // Platform-specific (for advanced use)
  platforms: {
    macos,
    linux,
    windows
  }
};
