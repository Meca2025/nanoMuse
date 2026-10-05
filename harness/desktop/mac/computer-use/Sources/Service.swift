// The routes: the bearer token first, then status, request, screenshot, execute, quit.

import CoreGraphics
import Foundation

final class Service {
    private let token: String
    private let version: String

    init(token: String, version: String) {
        self.token = token
        self.version = version
    }

    func handle(_ request: HTTPRequest) -> HTTPResponse {
        guard request.headers["authorization"] == "Bearer \(token)" else {
            return Service.failure(401, "unauthorized", "a bearer token is required")
        }
        let body: [String: Any]
        if request.body.isEmpty {
            body = [:]
        } else if let parsed = (try? JSONSerialization.jsonObject(with: request.body, options: [])) as? [String: Any] {
            body = parsed
        } else {
            return Service.failure(400, "bad_request", "the body must be a JSON object")
        }
        switch (request.method, request.path) {
        case ("GET", "/status"):
            return HTTPResponse(status: 200, body: status())
        case ("POST", "/request"):
            let what = body["what"] as? String ?? ""
            guard what == "screen" || what == "accessibility" else {
                return Service.failure(400, "bad_request", "`what` must be \"screen\" or \"accessibility\"")
            }
            Permissions.request(what)
            if body["pane"] as? Bool == true {
                Permissions.openPane(what)
            }
            return HTTPResponse(status: 200, body: status())
        case ("POST", "/screenshot"):
            return screenshot(body)
        case ("POST", "/execute"):
            return execute(body)
        case ("POST", "/quit"):
            // the answer goes out first; then the run loop ends
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                exit(0)
            }
            return HTTPResponse(status: 200, body: ["ok": true])
        default:
            return Service.failure(404, "not_found", "no route \(request.method) \(request.path)")
        }
    }

    private func status() -> [String: Any] {
        let mainDisplay = CGMainDisplayID()
        let bounds = CGDisplayBounds(mainDisplay)
        let pixelsWide = CGDisplayPixelsWide(mainDisplay)
        let scale = bounds.width > 0 ? Double(pixelsWide) / Double(bounds.width) : 1
        let display: [String: Any] = ["width": Int(bounds.width), "height": Int(bounds.height), "scale": scale]
        return [
            "screen": Permissions.screenGranted() ? "granted" : "denied",
            "accessibility": Permissions.accessibilityGranted(),
            "pid": Int(getpid()),
            "version": version,
            "display": display,
        ]
    }

    /// A JSON number as a whole number within bounds (nil when absent or not a number).
    private static func integer(_ value: Any?, min lower: Double, max upper: Double) -> Int? {
        guard let number = Service.number(value), number.isFinite else { return nil }
        return Int(Swift.min(upper, Swift.max(lower, number)))
    }

    private func screenshot(_ body: [String: Any]) -> HTTPResponse {
        guard Permissions.screenGranted() else {
            return Service.failure(403, "screen_denied", "Screen Recording is off for nanoMuse Computer Use")
        }
        let format = body["format"] as? String == "png" ? "png" : "jpeg"
        let quality = min(1, max(0.3, (Service.number(body["quality"]) ?? 80) / 100))
        let maxPixels = Service.integer(body["max_pixels"], min: 10_000, max: 50_000_000) ?? 2_000_000
        let width = Service.integer(body["width"], min: 0, max: 20_000)
        let height = Service.integer(body["height"], min: 0, max: 20_000)
        do {
            let shot = try Screenshot.take(width: width, height: height, maxPixels: maxPixels, format: format, quality: quality)
            let screen: [String: Any] = ["width": shot.screenWidth, "height": shot.screenHeight]
            return HTTPResponse(status: 200, body: [
                "base64": shot.data.base64EncodedString(),
                "mime": shot.mime,
                "width": shot.width,
                "height": shot.height,
                "screen": screen,
                "scale": shot.scale,
            ])
        } catch Screenshot.Failure.black {
            return Service.failure(403, "screen_denied", "the picture is black — Screen Recording is off for nanoMuse Computer Use")
        } catch {
            return Service.failure(500, "screenshot_failed", "no screenshot: \(error)")
        }
    }

    private func execute(_ body: [String: Any]) -> HTTPResponse {
        guard Permissions.accessibilityGranted() else {
            return Service.failure(403, "accessibility_denied", "Accessibility is off for nanoMuse Computer Use")
        }
        do {
            try Input.perform(body)
            return HTTPResponse(status: 200, body: ["ok": true, "note": ""])
        } catch Input.Failure.message(let text) {
            return Service.failure(400, "bad_action", text)
        } catch {
            return Service.failure(500, "action_failed", "\(error)")
        }
    }

    static func failure(_ status: Int, _ error: String, _ message: String) -> HTTPResponse {
        HTTPResponse(status: status, body: ["error": error, "message": message])
    }

    /// A JSON number (or a numeric string) as Double; nil for anything else.
    static func number(_ value: Any?) -> Double? {
        if let number = value as? NSNumber {
            return number.doubleValue
        }
        if let text = value as? String {
            return Double(text)
        }
        return nil
    }
}
