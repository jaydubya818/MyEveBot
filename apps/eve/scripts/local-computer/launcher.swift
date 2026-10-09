import Foundation
import Dispatch
import Darwin

// Stable app identity for macOS privacy attribution; credentials stay in Keychain.
// The worker lives outside the bundle so updates do not rebuild this identity.
let arguments = CommandLine.arguments
guard arguments.count == 3 else { exit(64) }
let child = Process()
child.executableURL = URL(fileURLWithPath: arguments[1])
child.arguments = [arguments[2]]
child.standardInput = FileHandle.nullDevice
child.standardOutput = FileHandle.standardOutput
child.standardError = FileHandle.standardError
signal(SIGTERM, SIG_IGN)
signal(SIGINT, SIG_IGN)
let queue = DispatchQueue(label: "com.myeve.sofie-local.shutdown")
let signals = [SIGTERM, SIGINT].map { number -> DispatchSourceSignal in
    let source = DispatchSource.makeSignalSource(signal: number, queue: queue)
    source.setEventHandler { if child.isRunning { child.terminate() } }
    source.resume()
    return source
}
do {
    try child.run()
    child.waitUntilExit()
    exit(child.terminationReason == .uncaughtSignal ? 1 : child.terminationStatus)
} catch {
    FileHandle.standardError.write(Data("Sofie Local worker could not start.\n".utf8))
    exit(1)
}
