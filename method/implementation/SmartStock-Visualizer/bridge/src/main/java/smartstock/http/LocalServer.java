package smartstock.http;

import com.sun.net.httpserver.*;
import smartstock.anemone.EngineSession;
import smartstock.anemone.ScenarioWorkspace;
import smartstock.anemone.WorkbenchFacade;
import smartstock.state.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

public final class LocalServer implements AutoCloseable {
    private final HttpServer server;
    private final ExecutorService httpThreads = Executors.newFixedThreadPool(16);
    private final Path web;
    private final Map<String, EngineSession> sessions;
    private final Map<String, EventHub> hubs;
    private final Runnable requestShutdown;
    private final EngineDiagnostics diagnostics;
    private final ScenarioWorkspace scenarios;
    private final WorkbenchFacade workbench = new WorkbenchFacade();
    private final AtomicBoolean stopping = new AtomicBoolean();
    private final AtomicBoolean closed = new AtomicBoolean();
    private final String token = UUID.randomUUID().toString();
    private final Semaphore streams = new Semaphore(8);
    public LocalServer(int port, Path web, Map<String, EngineSession> sessions, Map<String, EventHub> hubs, Runnable requestShutdown, EngineDiagnostics diagnostics, ScenarioWorkspace scenarios) throws IOException {
        this.web = web.toRealPath(); this.sessions = sessions; this.hubs = hubs; this.requestShutdown = requestShutdown;
        this.diagnostics = diagnostics;
        this.scenarios = scenarios;
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 32);
        server.setExecutor(httpThreads); server.createContext("/", this::handle);
    }
    public int port() { return server.getAddress().getPort(); }
    public void start() { server.start(); }
    private void handle(HttpExchange x) throws IOException {
        boolean shutdownAfterResponse = false;
        try {
            String host = x.getRequestHeaders().getFirst("Host");
            String expected = "127.0.0.1:" + port();
            if (!expected.equals(host) && !("localhost:" + port()).equals(host)) { send(x, 403, "Hôte refusé"); return; }
            String origin = x.getRequestHeaders().getFirst("Origin");
            if (origin != null && !origin.equals("http://" + host)) { send(x, 403, "Origine refusée"); return; }
            x.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
            x.getResponseHeaders().set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
            String path = x.getRequestURI().getPath();
            if (path.equals("/api/workbench/events") && x.getRequestMethod().equals("GET")) {
                String query = x.getRequestURI().getRawQuery();
                if (query == null || !query.matches("workspaceId=[a-f0-9-]{36}")) { send(x, 400, "workspaceId requis"); return; }
                try { events(x, workbench.hub(query.substring("workspaceId=".length()))); }
                catch (IllegalArgumentException e) { send(x, 404, e.getMessage()); }
                return;
            }
            if (path.startsWith("/api/scenarios/") || path.startsWith("/api/workbench/")) {
                if (x.getRequestURI().getRawQuery() != null) { send(x, 400, "Parametres refuses"); return; }
                if (path.equals("/api/scenarios/templates") && x.getRequestMethod().equals("GET")) {
                    json(x, 200, scenarios.templates()); return;
                }
                if (!x.getRequestMethod().equals("POST")) { send(x, 405, "POST requis"); return; }
                if (!token.equals(x.getRequestHeaders().getFirst("X-SmartStock-Token"))) { send(x, 403, "Jeton requis"); return; }
                ByteArrayOutputStream body = new ByteArrayOutputStream();
                byte[] chunk = new byte[4096]; int n;
                while ((n = x.getRequestBody().read(chunk)) != -1) {
                    if (body.size() + n > 65536) { send(x, 413, "Scenario limite a 64 Kio"); return; }
                    body.write(chunk, 0, n);
                }
                try {
                    Map<String, String> fields = new LinkedHashMap<>();
                    for (String pair : new String(body.toByteArray(), StandardCharsets.UTF_8).split("&")) {
                        String[] parts = pair.split("=", 2);
                        if (parts.length != 2) throw new IllegalArgumentException("Corps formulaire requis");
                        String key = URLDecoder.decode(parts[0], "UTF-8");
                        if (fields.put(key, URLDecoder.decode(parts[1], "UTF-8")) != null) throw new IllegalArgumentException("Champ duplique");
                    }
                    if (path.startsWith("/api/workbench/")) json(x, 200, workbench.command(path.substring("/api/workbench/".length()), fields));
                    else json(x, 200, scenarios.command(path.substring("/api/scenarios/".length()), fields));
                } catch (ScenarioWorkspace.ParserFailure e) { json(x, 400, e.details); }
                catch (WorkbenchFacade.Failure e) { json(x, 400, e.details); }
                catch (IllegalArgumentException e) { send(x, 400, e.getMessage()); }
                catch (Exception e) { send(x, 409, e.toString()); }
                return;
            }
            if (path.equals("/api/diagnostics")) {
                if (!x.getRequestMethod().equals("GET")) { send(x, 405, "GET requis"); return; }
                if (x.getRequestURI().getRawQuery() != null) { send(x, 400, "Aucun argument autorisé"); return; }
                try { json(x, 200, diagnostics.snapshot()); }
                catch (Exception e) { json(x, 503, Collections.singletonMap("error", "Diagnostic runtime indisponible : " + e.getClass().getSimpleName())); }
                return;
            }
            String demo = "stock";
            String api = path;
            if (path.startsWith("/api/stock/")) api = "/api/" + path.substring("/api/stock/".length());
            if (path.startsWith("/api/temperature/")) { demo = "temperature"; api = "/api/" + path.substring("/api/temperature/".length()); }
            EngineSession session = sessions.get(demo);
            if (path.equals("/api/shutdown")) {
                if (!x.getRequestMethod().equals("POST")) { send(x, 405, "POST requis"); return; }
                if (!token.equals(x.getRequestHeaders().getFirst("X-SmartStock-Token"))) { send(x, 403, "Jeton requis"); return; }
                if (x.getRequestURI().getRawQuery() != null || x.getRequestBody().read() != -1) { send(x, 400, "Aucun argument autorisé"); return; }
                if (!stopping.compareAndSet(false, true)) { send(x, 409, "Arrêt en cours"); return; }
                json(x, 200, Collections.singletonMap("status", "stopping")); shutdownAfterResponse = true; return;
            }
            if (api.equals("/api/state") && x.getRequestMethod().equals("GET")) {
                Map<String, Object> result = new LinkedHashMap<>(session.state()); result.put("csrfToken", token);
                json(x, 200, result); return;
            }
            if (api.equals("/api/events") && x.getRequestMethod().equals("GET")) { events(x, hubs.get(demo)); return; }
            if (path.startsWith("/api/")) {
                Map<String, String> routes = new HashMap<>();
                routes.put("/api/initialize", "initialize"); routes.put("/api/reset", "reset");
                routes.put("/api/events/weight", "weight"); routes.put("/api/events/datamatrix", "datamatrix");
                routes.put("/api/run", "run"); routes.put("/api/step", "step");
                if (demo.equals("temperature")) { routes.remove("/api/events/weight"); routes.remove("/api/events/datamatrix"); routes.put("/api/apply", "apply"); }
                if (!routes.containsKey(api)) { send(x, 404, "Opération inconnue"); return; }
                if (!x.getRequestMethod().equals("POST")) { send(x, 405, "POST requis"); return; }
                if (!token.equals(x.getRequestHeaders().getFirst("X-SmartStock-Token"))) { send(x, 403, "Jeton requis"); return; }
                if (x.getRequestBody().read() != -1) { send(x, 400, "Cette opération ne reçoit aucun corps"); return; }
                String argument = null;
                String query = x.getRequestURI().getRawQuery();
                if (api.equals("/api/apply")) {
                    if (query == null || !query.matches("value=[0-9]{1,3}(\\.[0-9])?")) { send(x, 400, "Paramètre value requis, au dixième"); return; }
                    argument = query.substring(6);
                } else if (query != null) { send(x, 400, "Paramètres refusés"); return; }
                try { json(x, 200, session.command(routes.get(api), x.getRequestHeaders().getFirst("X-Command-Id"), argument)); }
                catch (ExecutionException e) { json(x, e.getCause() instanceof IllegalArgumentException ? 400 : 409, Collections.singletonMap("error", e.getCause().getMessage())); }
                catch (Exception e) { json(x, 500, Collections.singletonMap("error", "Commande interrompue")); }
                return;
            }
            if (!x.getRequestMethod().equals("GET")) { send(x, 405, "GET requis"); return; }
            if (path.equals("/")) path = "/index.html";
            Path file = web.resolve(path.substring(1)).normalize();
            if (!file.startsWith(web) || !Files.isRegularFile(file) || !file.toRealPath().startsWith(web)) { send(x, 404, "Introuvable"); return; }
            String ext = file.getFileName().toString();
            String mime = ext.endsWith(".html") ? "text/html" : ext.endsWith(".css") ? "text/css" : ext.endsWith(".js") ? "text/javascript" : ext.endsWith(".svg") ? "image/svg+xml" : null;
            if (mime == null) { send(x, 404, "Introuvable"); return; }
            byte[] bytes = Files.readAllBytes(file);
            x.getResponseHeaders().set("Content-Type", mime + "; charset=utf-8");
            x.getResponseHeaders().set("Cache-Control", "no-cache");
            x.sendResponseHeaders(200, bytes.length); x.getResponseBody().write(bytes);
        } finally { x.close(); if (shutdownAfterResponse) requestShutdown.run(); }
    }
    private void events(HttpExchange x, EventHub hub) throws IOException {
        if (!streams.tryAcquire()) { send(x, 503, "Trop de flux ouverts"); return; }
        long after = -1;
        try { String id = x.getRequestHeaders().getFirst("Last-Event-ID"); if (id != null) after = Long.parseLong(id); }
        catch (NumberFormatException ignored) {}
        BlockingQueue<EventHub.Event> queue = hub.subscribe(after);
        try {
            x.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
            x.getResponseHeaders().set("Cache-Control", "no-cache");
            x.sendResponseHeaders(200, 0);
            OutputStream out = x.getResponseBody();
            out.write("retry: 1000\n\n".getBytes(StandardCharsets.UTF_8)); out.flush();
            while (!Thread.currentThread().isInterrupted()) {
                EventHub.Event event = queue.poll(10, TimeUnit.SECONDS);
                String frame = event == null ? ": heartbeat\n\n" : "id: " + event.sequence + "\nevent: state\ndata: " + event.json + "\n\n";
                out.write(frame.getBytes(StandardCharsets.UTF_8)); out.flush();
            }
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        catch (IOException ignored) { /* Browser disconnected. */ }
        finally { hub.unsubscribe(queue); streams.release(); }
    }
    private void json(HttpExchange x, int status, Object value) throws IOException {
        x.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        x.getResponseHeaders().set("Cache-Control", "no-store");
        byte[] body = Json.encode(value).getBytes(StandardCharsets.UTF_8);
        x.sendResponseHeaders(status, body.length); x.getResponseBody().write(body);
    }
    private void send(HttpExchange x, int status, String message) throws IOException { json(x, status, Collections.singletonMap("error", message)); }
    @Override public void close() {
        if (!closed.compareAndSet(false, true)) return;
        server.stop(1); httpThreads.shutdownNow();
    }
}
