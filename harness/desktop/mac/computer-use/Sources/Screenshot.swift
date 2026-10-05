// The picture of the main display: CGDisplayCreateImage at the display's physical size,
// scaled down in a CGContext, encoded with ImageIO through NSBitmapImageRep. No
// ScreenCaptureKit: CGDisplayCreateImage is deprecated from macOS 15 but still works, and it
// needs no asynchronous stream; the deployment target (12) keeps the deprecation quiet.

import AppKit
import CoreGraphics
import Foundation

struct Shot {
    let data: Data
    let mime: String
    let width: Int
    let height: Int
    /// The display in points — the space the pointer moves in.
    let screenWidth: Int
    let screenHeight: Int
    /// Physical pixels per point of the display.
    let scale: Double
}

enum Screenshot {
    enum Failure: Error {
        case noImage
        case black
        case encoding
    }

    /// A channel below this in every sampled pixel means a black picture.
    private static let blackLevel: UInt8 = 8

    /// Exactly `width`×`height` when both are given; otherwise the display's pixels, scaled
    /// down to at most `maxPixels` (the model never needs more than about 2 Mpx).
    static func take(width: Int?, height: Int?, maxPixels: Int, format: String, quality: Double) throws -> Shot {
        let display = CGMainDisplayID()
        guard let image = CGDisplayCreateImage(display) else { throw Failure.noImage }
        if isBlack(image) { throw Failure.black }
        let bounds = CGDisplayBounds(display)
        let scale = bounds.width > 0 ? Double(image.width) / Double(bounds.width) : 1
        var targetWidth = image.width
        var targetHeight = image.height
        if let width = width, let height = height, width > 0, height > 0 {
            targetWidth = width
            targetHeight = height
        } else if image.width * image.height > maxPixels {
            let factor = (Double(maxPixels) / Double(image.width * image.height)).squareRoot()
            targetWidth = max(1, Int(Double(image.width) * factor))
            targetHeight = max(1, Int(Double(image.height) * factor))
        }
        let scaled = try targetWidth == image.width && targetHeight == image.height ? image : resize(image, width: targetWidth, height: targetHeight)
        let representation = NSBitmapImageRep(cgImage: scaled)
        let png = format == "png"
        let properties: [NSBitmapImageRep.PropertyKey: Any] = png ? [:] : [.compressionFactor: quality]
        guard let data = representation.representation(using: png ? .png : .jpeg, properties: properties) else { throw Failure.encoding }
        return Shot(data: data, mime: png ? "image/png" : "image/jpeg", width: scaled.width, height: scaled.height, screenWidth: Int(bounds.width), screenHeight: Int(bounds.height), scale: scale)
    }

    private static func resize(_ image: CGImage, width: Int, height: Int) throws -> CGImage {
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            throw Failure.encoding
        }
        context.interpolationQuality = .high
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        guard let scaled = context.makeImage() else { throw Failure.encoding }
        return scaled
    }

    /// Whether the picture is black all over, judged on a 64×36 sample of it (what a process
    /// without Screen Recording can get from some capture paths).
    static func isBlack(_ image: CGImage) -> Bool {
        let width = 64
        let height = 36
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            return false
        }
        context.interpolationQuality = .low
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        guard let pixels = context.data else { return false }
        let bytes = pixels.assumingMemoryBound(to: UInt8.self)
        for offset in stride(from: 0, to: width * height * 4, by: 4) {
            if bytes[offset] >= blackLevel || bytes[offset + 1] >= blackLevel || bytes[offset + 2] >= blackLevel {
                return false
            }
        }
        return true
    }
}
