// Import a downloaded GitHub App PEM without placing its contents in shell arguments or logs.
import Foundation
import Security

guard CommandLine.arguments.count == 2 else {
    fputs("Usage: swift import-github-app-key.swift /path/to/downloaded-app-key.pem\n", stderr)
    exit(2)
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let service = "myeve-golden-work-publisher"
let account = "jaydubya818"
do {
    let key = try Data(contentsOf: url)
    guard let text = String(data: key, encoding: .utf8),
          text.contains("-----BEGIN "), text.contains("PRIVATE KEY-----") else {
        throw NSError(domain: "GoldenWork", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "The selected file is not a GitHub App PEM private key."])
    }
    let query: [CFString: Any] = [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: service,
        kSecAttrAccount: account,
        kSecValueData: key,
    ]
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else {
        throw NSError(domain: "GoldenWork", code: Int(status),
                      userInfo: [NSLocalizedDescriptionKey: "Keychain import failed (status \(status)); no key file was removed."])
    }
    var result: CFTypeRef?
    let lookup: [CFString: Any] = [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: service,
        kSecAttrAccount: account,
        kSecReturnData: true,
        kSecMatchLimit: kSecMatchLimitOne,
    ]
    let lookupStatus = SecItemCopyMatching(lookup as CFDictionary, &result)
    guard lookupStatus == errSecSuccess, let returned = result as? Data, returned == key else {
        throw NSError(domain: "GoldenWork", code: Int(lookupStatus),
                      userInfo: [NSLocalizedDescriptionKey: "Keychain readback failed; downloaded key was kept."])
    }
    try FileManager.default.removeItem(at: url)
    print("GitHub App key stored in macOS Keychain and downloaded PEM removed.")
} catch {
    fputs("\(error.localizedDescription)\n", stderr)
    exit(1)
}
