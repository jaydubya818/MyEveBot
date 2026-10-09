import Foundation
import Security

// Secret input/output uses anonymous pipes, never command arguments or files.
let args = CommandLine.arguments
func fail(_ status: OSStatus) -> Never {
    FileHandle.standardError.write(Data("Keychain operation failed (\(status)).\n".utf8))
    exit(1)
}
guard args.count == 3, ["store", "read", "delete"].contains(args[1]),
      args[2].range(of: "^[a-zA-Z0-9_-]{1,80}$", options: .regularExpression) != nil else { fail(errSecParam) }
let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "com.myeve.sofie-local", kSecAttrAccount as String: args[2],
    kSecAttrSynchronizable as String: false]
switch args[1] {
case "store":
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard data.count >= 32 && data.count <= 256 else { fail(errSecParam) }
    var add = query
    add[kSecValueData as String] = data
    // Never overwrite an existing identity implicitly.
    let status = SecItemAdd(add as CFDictionary, nil)
    guard status == errSecSuccess else { fail(status) }
case "read":
    var read = query
    read[kSecReturnData as String] = true
    read[kSecMatchLimit as String] = kSecMatchLimitOne
    read[kSecUseAuthenticationUI as String] = kSecUseAuthenticationUIFail
    var result: CFTypeRef?
    let status = SecItemCopyMatching(read as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data else { fail(status) }
    FileHandle.standardOutput.write(data)
case "delete":
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else { fail(status) }
default: fail(errSecParam)
}
