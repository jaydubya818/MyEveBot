import Foundation
import AppKit
import ApplicationServices
import CoreGraphics
import ScreenCaptureKit

func respond(_ value: [String: Any]) throws {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
}
func fail(_ message: String) -> Never {
    fputs(message + "\n", stderr)
    exit(1)
}
if CommandLine.arguments.count != 2 { fail("Expected one operation.") }
if CommandLine.arguments[1] == "status" {
    try respond(["accessibility": AXIsProcessTrusted(), "screenRecording": CGPreflightScreenCaptureAccess()])
    exit(0)
}
let input = try JSONSerialization.jsonObject(with: Data(CommandLine.arguments[1].utf8)) as! [String: Any]
let operation = input["operation"] as! String
if operation == "screenshot" {
    guard CGPreflightScreenCaptureAccess() else { fail("Screen Recording permission is required for the Sofie Local helper.") }
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    guard let display = content.displays.first(where: { $0.displayID == CGMainDisplayID() }) else { fail("Main display unavailable. Unlock the Mac and try again.") }
    let filter = SCContentFilter(display: display, excludingWindows: [])
    let configuration = SCStreamConfiguration()
    configuration.width = display.width
    configuration.height = display.height
    configuration.showsCursor = true
    let image: CGImage = try await withCheckedThrowingContinuation { continuation in
        SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration, completionHandler: { image, error in
            if let image = image { continuation.resume(returning: image) }
            else { continuation.resume(throwing: error ?? NSError(domain: "SofieLocal", code: 1)) }
        })
    }
    let bounds = CGDisplayBounds(CGMainDisplayID())
    let width = Int(bounds.width), height = Int(bounds.height)
    guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fail("Cannot create image context.") }
    context.draw(image, in: CGRect(x:0,y:0,width:width,height:height))
    let bitmap = NSBitmapImageRep(cgImage: context.makeImage()!)
    guard let png = bitmap.representation(using:.png, properties:[:]), png.count <= 2500000 else { fail("Screenshot exceeds the transfer limit.") }
    try respond(["image":png.base64EncodedString(),"width":width,"height":height,"scale":1])
    exit(0)
}
guard AXIsProcessTrusted() else { fail("Accessibility permission is required for the Sofie Local helper.") }
let source = CGEventSource(stateID:.hidSystemState)
func key(_ code: CGKeyCode, _ flags: CGEventFlags = []) {
    for down in [true,false] {
        let event = CGEvent(keyboardEventSource:source,virtualKey:code,keyDown:down)!
        event.flags = flags; event.post(tap:.cghidEventTap)
    }
}
switch operation {
case "click":
    let point = CGPoint(x:input["x"] as! Int,y:input["y"] as! Int)
    guard CGDisplayBounds(CGMainDisplayID()).contains(point) else { fail("Coordinates are outside the main display.") }
    for kind in [CGEventType.leftMouseDown,CGEventType.leftMouseUp] {
        CGEvent(mouseEventSource:source,mouseType:kind,mouseCursorPosition:point,mouseButton:.left)!.post(tap:.cghidEventTap)
    }
case "type":
    for character in (input["text"] as! String) {
        let chunk = Array(String(character).utf16)
        for down in [true,false] {
            let event = CGEvent(keyboardEventSource:source,virtualKey:0,keyDown:down)!
            event.keyboardSetUnicodeString(stringLength:chunk.count,unicodeString:chunk)
            event.post(tap:.cghidEventTap)
        }
    }
case "key":
    let name = input["key"] as! String
    let codes: [String:CGKeyCode] = ["Return":36,"Tab":48,"Escape":53,"BackSpace":51,"Up":126,"Down":125,"Left":123,"Right":124,"Cmd+a":0,"Cmd+c":8,"Cmd+v":9,"Cmd+s":1,"Cmd+l":37,"Cmd+w":13]
    guard let code = codes[name] else { fail("Unsupported key.") }
    key(code,name.hasPrefix("Cmd+") ? .maskCommand : [])
case "scroll":
    CGEvent(scrollWheelEvent2Source:source,units:.line,wheelCount:1,wheel1:Int32(input["amount"] as! Int),wheel2:0,wheel3:0)!.post(tap:.cghidEventTap)
default: fail("Unsupported desktop operation.")
}
try respond(["dispatched":true,"operation":operation,"verification":"Inspect a fresh screenshot before claiming the intended UI result."])
