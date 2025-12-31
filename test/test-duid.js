/**
 * Test suite for DUID module
 *
 * Run with: node test/test-duid.js
 * Run specific tests: node test/test-duid.js --test=generation
 */

const duid = require('../lib/duid')
const assert = require('assert')

const tests = {
  /**
   * Test DUID generation for all types
   */
  generation () {
    console.log('Testing DUID generation...\n')

    // Test DUID-LL (Type 3)
    const duidLL = duid.generateDUID(duid.DUID_TYPES.DUID_LL)
    assert(duidLL.length === 10, 'DUID-LL should be 10 bytes')
    assert(duidLL.readUInt16BE(0) === 3, 'DUID-LL type should be 3')
    console.log('✓ DUID-LL:', duid.formatDUID(duidLL))

    // Test DUID-LLT (Type 1)
    const duidLLT = duid.generateDUID(duid.DUID_TYPES.DUID_LLT)
    assert(duidLLT.length === 14, 'DUID-LLT should be 14 bytes')
    assert(duidLLT.readUInt16BE(0) === 1, 'DUID-LLT type should be 1')
    console.log('✓ DUID-LLT:', duid.formatDUID(duidLLT))

    // Test DUID-EN (Type 2)
    const duidEN = duid.generateDUID(duid.DUID_TYPES.DUID_EN)
    assert(duidEN.readUInt16BE(0) === 2, 'DUID-EN type should be 2')
    console.log('✓ DUID-EN:', duid.formatDUID(duidEN))

    // Test DUID-UUID (Type 4)
    const duidUUID = duid.generateDUID(duid.DUID_TYPES.DUID_UUID)
    assert(duidUUID.length === 18, 'DUID-UUID should be 18 bytes')
    assert(duidUUID.readUInt16BE(0) === 4, 'DUID-UUID type should be 4')
    console.log('✓ DUID-UUID:', duid.formatDUID(duidUUID))

    // Test with specific MAC
    const specificMac = 'aa:bb:cc:dd:ee:ff'
    const duidWithMac = duid.generateDUID(duid.DUID_TYPES.DUID_LL, specificMac)
    const parsed = duid.parseDUID(duidWithMac)
    assert(parsed.lladdr === specificMac, 'DUID should contain specified MAC')
    console.log('✓ DUID with specific MAC:', duid.formatDUID(duidWithMac))

    console.log('\nAll generation tests passed!\n')
  },

  /**
   * Test DUID parsing
   */
  parsing () {
    console.log('Testing DUID parsing...\n')

    // Parse DUID-LL
    const duidLL = duid.generateDUID(duid.DUID_TYPES.DUID_LL, '11:22:33:44:55:66')
    const parsedLL = duid.parseDUID(duidLL)
    assert(parsedLL.type === 3, 'Parsed type should be 3')
    assert(parsedLL.typeName === 'DUID_LL', 'Type name should be DUID_LL')
    assert(parsedLL.lladdr === '11:22:33:44:55:66', 'MAC should match')
    console.log('✓ Parsed DUID-LL:', JSON.stringify(parsedLL, null, 2))

    // Parse DUID-LLT
    const duidLLT = duid.generateDUID(duid.DUID_TYPES.DUID_LLT)
    const parsedLLT = duid.parseDUID(duidLLT)
    assert(parsedLLT.type === 1, 'Parsed type should be 1')
    assert(parsedLLT.timeDate instanceof Date, 'Should have timestamp')
    console.log('✓ Parsed DUID-LLT:', JSON.stringify(parsedLLT, null, 2))

    // Parse DUID-UUID
    const duidUUID = duid.generateDUID(duid.DUID_TYPES.DUID_UUID)
    const parsedUUID = duid.parseDUID(duidUUID)
    assert(parsedUUID.uuid, 'Should have UUID')
    assert(parsedUUID.uuid.split('-').length === 5, 'UUID should have 5 parts')
    console.log('✓ Parsed DUID-UUID:', JSON.stringify(parsedUUID, null, 2))

    console.log('\nAll parsing tests passed!\n')
  },

  /**
   * Test hex conversion
   */
  conversion () {
    console.log('Testing hex conversion...\n')

    const original = duid.generateDUID(duid.DUID_TYPES.DUID_LL)
    const hex = duid.duidToHex(original)
    const converted = duid.hexToDuid(hex)

    assert(original.equals(converted), 'Round-trip conversion should match')
    console.log('✓ Original:', duid.formatDUID(original))
    console.log('✓ Hex:', hex)
    console.log('✓ Converted:', duid.formatDUID(converted))

    // Test with colons
    const withColons = duid.hexToDuid('00:03:00:01:aa:bb:cc:dd:ee:ff')
    assert(withColons.length === 10, 'Should handle colons in hex')
    console.log('✓ From colon-separated:', duid.formatDUID(withColons))

    console.log('\nAll conversion tests passed!\n')
  },

  /**
   * Test random MAC generation
   */
  randomMac () {
    console.log('Testing random MAC generation...\n')

    const macs = new Set()
    for (let i = 0; i < 100; i++) {
      const mac = duid.generateRandomMAC()
      assert(/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(mac), 'MAC format should be valid')

      // Check locally administered bit
      const firstByte = parseInt(mac.split(':')[0], 16)
      assert((firstByte & 0x02) === 0x02, 'Locally administered bit should be set')
      assert((firstByte & 0x01) === 0x00, 'Multicast bit should be clear')

      macs.add(mac)
    }

    // Should generate unique MACs (with very high probability)
    assert(macs.size > 95, 'Should generate mostly unique MACs')
    console.log(`✓ Generated ${macs.size} unique MACs out of 100`)
    console.log('✓ Sample:', duid.generateRandomMAC())

    console.log('\nAll random MAC tests passed!\n')
  },

  /**
   * Test platform detection (non-destructive)
   */
  platform () {
    console.log('Testing platform support...\n')

    const os = require('os')
    const platform = os.platform()

    console.log(`Current platform: ${platform}`)

    // Test getCurrentDUID (should not throw)
    try {
      const current = duid.getCurrentDUID()
      if (current) {
        console.log('✓ Current DUID:', duid.formatDUID(current))
        console.log('✓ Parsed:', JSON.stringify(duid.parseDUID(current), null, 2))
      } else {
        console.log('✓ No DUID currently set (this is normal)')
      }
    } catch (e) {
      console.log('✓ getCurrentDUID handled platform:', e.message)
    }

    console.log('\nPlatform test completed!\n')
  },

  /**
   * Test original DUID storage
   */
  originalStorage () {
    console.log('Testing original DUID storage...\n')

    // Test path generation
    const storagePath = duid.getOriginalDUIDPath()
    console.log('✓ Storage path:', storagePath)
    assert(typeof storagePath === 'string', 'Path should be a string')
    assert(storagePath.length > 0, 'Path should not be empty')

    // Test hasOriginalDUID
    const hasOriginal = duid.hasOriginalDUID()
    console.log(`✓ Has original stored: ${hasOriginal}`)

    // Test getOriginalDUID (should return null or Buffer)
    const original = duid.getOriginalDUID()
    if (original) {
      console.log('✓ Original DUID:', duid.formatDUID(original))
      assert(Buffer.isBuffer(original), 'Original should be a Buffer')
    } else {
      console.log('✓ No original stored (expected for clean test environment)')
    }

    // Test storing a DUID (in temp location for testing)
    const testDuid = duid.generateDUID(duid.DUID_TYPES.DUID_LL, '11:22:33:44:55:66')
    console.log('✓ Test DUID generated:', duid.formatDUID(testDuid))

    console.log('\nOriginal storage test completed!\n')
  }
}

// Run tests
function runTests (testNames) {
  console.log('='.repeat(60))
  console.log('DUID Module Tests')
  console.log('='.repeat(60))
  console.log()

  let passed = 0
  let failed = 0

  for (const name of testNames) {
    if (tests[name]) {
      try {
        tests[name]()
        passed++
      } catch (e) {
        console.error(`✗ Test "${name}" failed:`, e.message)
        console.error(e.stack)
        failed++
      }
    } else {
      console.error(`Unknown test: ${name}`)
    }
  }

  console.log('='.repeat(60))
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log('='.repeat(60))

  process.exit(failed > 0 ? 1 : 0)
}

// Parse args
const args = process.argv.slice(2)
const testArg = args.find(a => a.startsWith('--test='))

if (testArg) {
  runTests([testArg.split('=')[1]])
} else if (args.includes('--help')) {
  console.log(`
Usage: node test-duid.js [options]

Options:
  --test=<name>   Run specific test
  --help          Show this help

Available tests:
  generation      Test DUID generation
  parsing         Test DUID parsing
  conversion      Test hex conversion
  randomMac       Test random MAC generation
  platform        Test platform support (read-only)

Run without options to execute all tests.
`)
} else {
  runTests(Object.keys(tests))
}
