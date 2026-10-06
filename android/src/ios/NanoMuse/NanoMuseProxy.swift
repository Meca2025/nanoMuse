//
//  NanoMuseProxy.swift
//  nanoMuse
//
//  Settings → Network → HTTP proxy for own providers: one HTTP proxy, per device, that only
//  the requests to own-key providers and the ChatGPT plan go through. Never nanoMuse Cloud,
//  the hub, a computer on the LAN or anything else the app fetches.
//
//  URLSession has no per-host proxy switch, so the proxy reaches a session as a proxy
//  auto-configuration script in `connectionProxyDictionary`: the script answers "PROXY
//  host:port" for the provider hosts and "DIRECT" for every other one. The hosts are the
//  catalogue's base URLs (Resources/providers.json), the plan's (chatgpt.com,
//  auth.openai.com) and the custom base URLs of the provider instances a person added, minus
//  the relay's. `apply(to:)` is called where upstream builds a provider session; `session`
//  stands in for `URLSession.shared` on the sign-in and model-list paths. A proxy with a user
//  name and password gets the credentials from the shared credential storage.
//
//  Off by default. Nothing here is synced. The Android twin is io.github.nanomuse.net.OwnProviderProxy.
//

import Foundation

enum NanoMuseProxy {
    struct Config: Equatable, Sendable {
        var enabled = false
        var host = ""
        var port = 0
        var user = ""
        var password = ""

        /// Whether there is a proxy to use: on, with a host and a port.
        var usable: Bool { enabled && !host.trimmingCharacters(in: .whitespaces).isEmpty && (1...65535).contains(port) }
        var hasCredentials: Bool { !user.isEmpty }
        var address: String { host.contains(":") && !host.hasPrefix("[") ? "[\(host)]:\(port)" : "\(host):\(port)" }
    }

    private enum Keys {
        static let enabled = "nanomuse.proxy.enabled"
        static let host = "nanomuse.proxy.host"
        static let port = "nanomuse.proxy.port"
        static let user = "nanomuse.proxy.user"
        static let password = "nanomuse.proxy.password"
    }

    private static let lock = NSLock()
    private nonisolated(unsafe) static var cached: Config?
    private nonisolated(unsafe) static var instanceHosts: [String] = []
    private nonisolated(unsafe) static var relayHost = ""
    private nonisolated(unsafe) static var cachedSession: (config: Config, hosts: [String], session: URLSession)?

    // MARK: - The setting

    static func config() -> Config {
        lock.lock(); defer { lock.unlock() }
        if let c = cached { return c }
        let d = UserDefaults.standard
        let c = Config(
            enabled: d.bool(forKey: Keys.enabled),
            host: d.string(forKey: Keys.host) ?? "",
            port: d.integer(forKey: Keys.port),
            user: d.string(forKey: Keys.user) ?? "",
            password: d.string(forKey: Keys.password) ?? ""
        )
        cached = c
        return c
    }

    static func save(_ c: Config) {
        let d = UserDefaults.standard
        d.set(c.enabled, forKey: Keys.enabled)
        d.set(c.host.trimmingCharacters(in: .whitespaces), forKey: Keys.host)
        d.set(c.port, forKey: Keys.port)
        d.set(c.user, forKey: Keys.user)
        d.set(c.password, forKey: Keys.password)
        lock.lock()
        cached = Config(enabled: c.enabled, host: c.host.trimmingCharacters(in: .whitespaces), port: c.port, user: c.user, password: c.password)
        lock.unlock()
        storeCredentials(c)
    }

    /// The proxy's credentials in the shared storage, where a session without a delegate
    /// finds them for a 407; removed when there are none.
    private static func storeCredentials(_ c: Config) {
        guard c.usable else { return }
        let storage = URLCredentialStorage.shared
        for type in [NSURLProtectionSpaceHTTPSProxy, NSURLProtectionSpaceHTTPProxy] {
            let space = URLProtectionSpace(proxyHost: c.host, port: c.port, type: type, realm: nil, authenticationMethod: NSURLAuthenticationMethodHTTPBasic)
            if let existing = storage.defaultCredential(for: space) { storage.remove(existing, for: space) }
            if c.hasCredentials {
                storage.setDefaultCredential(URLCredential(user: c.user, password: c.password, persistence: .permanent), for: space)
            }
        }
    }

    // MARK: - The hosts

    /// Reads the provider instances' custom hosts and the relay's; on the main actor because
    /// the store is. Called at launch, when the Network page opens and when the setting is saved.
    @MainActor
    static func refreshHosts() {
        let relayInstance = NanoMuseCloud.instance?.id
        let hosts = ProviderConfigStore.shared.instances
            .filter { $0.id != relayInstance }
            .compactMap { $0.customBaseURL }
            .compactMap { hostOf($0) }
        let relay = hostOf(NanoMuseCloud.baseURL) ?? ""
        lock.lock()
        instanceHosts = hosts
        relayHost = relay
        lock.unlock()
    }

    private static let catalogueHosts: [String] = {
        guard let url = Bundle.main.url(forResource: "providers", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let providers = json["providers"] as? [[String: Any]] else { return [] }
        return providers.flatMap { p -> [String] in
            [p["base_url"] as? String, p["base_url_global"] as? String].compactMap { $0 }.compactMap(NanoMuseProxy.hostOf)
        }
    }()

    /// The hosts the proxy is used for: the plan's, the catalogue's, the instances' — never
    /// the relay's, never a LAN address.
    static func routedHosts() -> [String] {
        lock.lock()
        let instances = instanceHosts
        let relay = relayHost
        lock.unlock()
        var seen = Set<String>()
        var out: [String] = []
        for h in Array(NanoMuseProviderReach.planHosts).sorted() + catalogueHosts + instances {
            let host = h.lowercased()
            guard !host.isEmpty, host != relay, !isLocal(host), !seen.contains(host) else { continue }
            seen.insert(host)
            out.append(host)
        }
        return out
    }

    /// Whether a request to `host` goes through the proxy, with the configuration in force.
    static func routes(_ host: String?) -> Bool {
        guard let host, !host.isEmpty, config().usable else { return false }
        let h = host.lowercased()
        lock.lock()
        let relay = relayHost
        lock.unlock()
        if h == relay || isLocal(h) { return false }
        return routedHosts().contains { h == $0 || h.hasSuffix("." + $0) }
    }

    /// Whether `host` is the relay's (as `refreshHosts` last read it): a 413 or a bare 5xx from
    /// there is nanoMuse Cloud's refusal, not another provider's (NanoMuseRelayRefusal).
    static func isRelayHost(_ host: String) -> Bool {
        let h = host.lowercased()
        lock.lock()
        let relay = relayHost
        lock.unlock()
        return !relay.isEmpty && h == relay
    }

    static func isLocal(_ host: String) -> Bool {
        if host == "localhost" || host.hasSuffix(".local") || host.hasSuffix(".home.arpa") { return true }
        if host.hasPrefix("127.") || host.hasPrefix("10.") || host.hasPrefix("192.168.") || host.hasPrefix("169.254.") || host == "::1" { return true }
        if host.hasPrefix("172."), let second = Int(host.split(separator: ".").dropFirst().first ?? ""), (16...31).contains(second) { return true }
        if host.hasPrefix("100."), let second = Int(host.split(separator: ".").dropFirst().first ?? ""), (64...127).contains(second) { return true }
        if host.hasPrefix("fd") || host.hasPrefix("fe80") { return true }
        return false
    }

    static func hostOf(_ url: String) -> String? {
        let t = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let h = URL(string: t)?.host?.lowercased(), !h.isEmpty else { return nil }
        return h
    }

    // MARK: - The sessions

    /// The PAC script for `config` and `hosts`: the proxy for them, direct for the rest.
    static func pacScript(_ c: Config, hosts: [String]) -> String {
        let list = hosts.map { "\"\($0)\"" }.joined(separator: ",")
        return """
        function FindProxyForURL(url, host) {
          host = host.toLowerCase();
          var hosts = [\(list)];
          for (var i = 0; i < hosts.length; i++) {
            var h = hosts[i];
            if (host == h || host.substr(host.length - h.length - 1) == "." + h) return "PROXY \(c.address)";
          }
          return "DIRECT";
        }
        """
    }

    /// The proxy dictionary for a session, or nil when the proxy is off.
    static func proxyDictionary() -> [AnyHashable: Any]? {
        let c = config()
        guard c.usable else { return nil }
        return [
            "ProxyAutoConfigEnable": 1,
            "ProxyAutoConfigJavaScript": pacScript(c, hosts: routedHosts()),
        ]
    }

    /// Gives `configuration` the proxy, when it is on. Called where upstream builds a provider session.
    static func apply(to configuration: URLSessionConfiguration) {
        if let dict = proxyDictionary() { configuration.connectionProxyDictionary = dict }
    }

    /// `URLSession.shared` for the provider paths that used it: the shared one when the proxy
    /// is off, a session with the proxy when it is on (rebuilt when the setting changes).
    static var session: URLSession {
        let c = config()
        guard c.usable else { return .shared }
        let hosts = routedHosts()
        lock.lock(); defer { lock.unlock() }
        if let s = cachedSession, s.config == c, s.hosts == hosts { return s.session }
        let configuration = URLSessionConfiguration.default
        configuration.connectionProxyDictionary = [
            "ProxyAutoConfigEnable": 1,
            "ProxyAutoConfigJavaScript": pacScript(c, hosts: hosts),
        ]
        let s = URLSession(configuration: configuration)
        cachedSession = (c, hosts, s)
        return s
    }

    // MARK: - The Test row

    struct Probe: Sendable {
        var ok: Bool
        var status: Int
        var millis: Int
        var host: String
        var failure: NanoMuseProviderReach.Reach?
    }

    /// Fetches `url` through `c` (not through whatever is installed) and says what came
    /// back; a 2xx–4xx from the host counts as reached, since the point is the path, not the page.
    static func probe(_ c: Config, url: String) async -> Probe {
        let host = hostOf(url) ?? ""
        let started = Date()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 10
        configuration.timeoutIntervalForResource = 15
        configuration.connectionProxyDictionary = [
            "ProxyAutoConfigEnable": 1,
            "ProxyAutoConfigJavaScript": pacScript(c, hosts: [host]),
        ]
        let delegate = ProbeDelegate(config: c)
        let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        guard let u = URL(string: url) else { return Probe(ok: false, status: 0, millis: 0, host: host, failure: nil) }
        var request = URLRequest(url: u)
        request.setValue("nanoMuse", forHTTPHeaderField: "User-Agent")
        do {
            let (data, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let body = status == 403 ? String(data: data.prefix(4096), encoding: .utf8) ?? "" : ""
            let reach = NanoMuseProviderReach.fromHTTP(status: status, body: body, host: host, oauth: false)
            return Probe(ok: reach == nil && status < 500, status: status, millis: Int(Date().timeIntervalSince(started) * 1000), host: host, failure: reach)
        } catch {
            let text = error.localizedDescription + NanoMuseProviderReach.hostTag(error)
            let reach = NanoMuseProviderReach.classify(text, hintHost: host) ?? NanoMuseProviderReach.Reach(kind: .unreachable, host: host, detail: text)
            return Probe(ok: false, status: 0, millis: Int(Date().timeIntervalSince(started) * 1000), host: host, failure: reach)
        }
    }

    /// Answers the proxy's 407 with the configured credentials, once; never follows a redirect
    /// (the point is reaching the host, not the page).
    private final class ProbeDelegate: NSObject, URLSessionTaskDelegate, Sendable {
        let config: Config
        init(config: Config) { self.config = config }

        func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
            let space = challenge.protectionSpace
            if space.authenticationMethod == NSURLAuthenticationMethodHTTPBasic || space.authenticationMethod == NSURLAuthenticationMethodHTTPDigest,
               space.isProxy(), config.hasCredentials, challenge.previousFailureCount == 0 {
                return (.useCredential, URLCredential(user: config.user, password: config.password, persistence: .forSession))
            }
            return (.performDefaultHandling, nil)
        }

        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest) async -> URLRequest? {
            nil
        }
    }
}
