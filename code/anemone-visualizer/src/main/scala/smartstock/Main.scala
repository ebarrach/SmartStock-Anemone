package smartstock

import com.raquo.laminar.api.L._
import org.scalajs.dom
import scala.scalajs.js
import scala.scalajs.js.JSConverters._
import scala.concurrent.{Future, ExecutionContext}
import scala.util.{Success, Failure}

/** Scala.js owns navigation, events, HTTP/SSE and rendering of live state.
  * Only explicitly selected Demo mode uses the preserved, independent teaching sources.
  */
object Main {
  implicit val ec: ExecutionContext = scala.scalajs.concurrent.QueueExecutionContext.timeouts()
  private def el(id: String) = dom.document.getElementById(id).asInstanceOf[dom.html.Element]
  private def text(id: String, s: Any): Unit = el(id).textContent = String.valueOf(s)
  private def inputValue(id: String) = el(id).asInstanceOf[dom.html.Input].value
  private def setValue(id: String, s: String): Unit = el(id).asInstanceOf[dom.html.Input].value = s
  private def hide(id: String, yes: Boolean): Unit = if (yes) el(id).setAttribute("hidden", "") else el(id).removeAttribute("hidden")
  private def toggle(id: String, cls: String, yes: Boolean): Unit = el(id).classList.toggle(cls, yes)
  private def nodes(selector: String): Seq[dom.html.Element] = {
    val list = dom.document.querySelectorAll(selector)
    (0 until list.length).map(i => list(i).asInstanceOf[dom.html.Element])
  }
  private def string(d: js.Dynamic, key: String): String = if (js.isUndefined(d.selectDynamic(key)) || d.selectDynamic(key) == null) "" else d.selectDynamic(key).toString
  private def number(d: js.Dynamic, key: String): Double = d.selectDynamic(key).asInstanceOf[Double]
  private def bool(d: js.Dynamic, key: String): Boolean = d.selectDynamic(key).asInstanceOf[Boolean]
  private def rows(d: js.Dynamic): Seq[js.Dynamic] = d.blackboard.asInstanceOf[js.Array[js.Dynamic]].toSeq
  private var workbench: Option[WorkbenchView] = None
  private var current = "stock"
  private var mode = "anemone"
  private var source: Option[RealSource] = None
  private var demo: js.Dynamic = null
  private val demos = scala.collection.mutable.Map.empty[String, js.Dynamic]
  private val modes = scala.collection.mutable.Map.empty[String, String]
  private var generation = 0
  private var pending = false
  private var automatic = false
  private var lastState: js.Dynamic = null
  private var lastQuantity: Option[String] = None
  private var lastSession = ""
  private var diagnosticsTimer: Option[Int] = None
  private val labels = Map("ready" -> "PRÊT", "running" -> "EN COURS", "paused" -> "EN PAUSE", "blocked" -> "EN ATTENTE", "completed" -> "TERMINÉ", "error" -> "ERREUR")

  private def request(path: String, options: js.Dynamic = js.Dynamic.literal()): Future[js.Dynamic] = {
    options.updateDynamic("signal")(js.Dynamic.global.AbortSignal.timeout(8000))
    js.Dynamic.global.fetch(path, options).asInstanceOf[js.Promise[js.Dynamic]].toFuture.flatMap { response =>
      response.json().asInstanceOf[js.Promise[js.Dynamic]].toFuture.flatMap { data =>
        if (response.ok.asInstanceOf[Boolean]) Future.successful(data)
        else Future.failed(new RuntimeException(string(data, "error")))
      }
    }
  }
  private def failure(e: Throwable): Unit = { hide("error", false); text("error", e.getMessage) }
  private def log(id: String, message: String): Unit = {
    val li = dom.document.createElement("li"); val time = dom.document.createElement("time"); val span = dom.document.createElement("span")
    time.textContent = new js.Date().toLocaleTimeString(); span.textContent = message
    li.appendChild(time); li.appendChild(span); el(id).insertBefore(li, el(id).firstChild)
    while (el(id).childElementCount > 70) el(id).removeChild(el(id).lastChild)
  }
  private def board(id: String, s: js.Dynamic): Unit = {
    el(id).textContent = ""
    rows(s).foreach { row =>
      val line = dom.document.createElement("div"); line.setAttribute("class", "term-row")
      val term = dom.document.createElement("span"); val count = dom.document.createElement("span")
      term.textContent = string(row, "term"); count.textContent = "[" + string(row, "multiplicity") + "]"
      line.appendChild(term); line.appendChild(count); el(id).appendChild(line)
    }
    if (rows(s).isEmpty) el(id).textContent = "Store vide"
  }
  private def animate(cls: String): Unit = {
    el("scene").classList.remove(cls); el("scene").offsetWidth; el("scene").classList.add(cls)
    dom.window.setTimeout(() => el("scene").classList.remove(cls), 2500)
  }
  private def controls(): Unit = {
    val status = if (lastState == null) "" else string(lastState, "executionStatus")
    nodes("[data-command], [data-temp-command]").foreach { b =>
      val c = Option(b.getAttribute("data-temp-command")).getOrElse(b.getAttribute("data-command"))
      b.asInstanceOf[dom.html.Button].disabled = pending || automatic || lastState == null ||
        (Set("run", "step").contains(c) && status == "running") ||
        (current == "temperature" && ((c == "apply" && Set("running", "paused").contains(status)) || (Set("run", "step").contains(c) && Set("completed", "error").contains(status))))
    }
    Seq("auto", "temp-auto").foreach(id => el(id).asInstanceOf[dom.html.Button].disabled = mode != "demo" || pending || automatic || lastState == null || status == "running")
    Seq("temp-number", "temp-slider").foreach(id => el(id).asInstanceOf[dom.html.Input].disabled = current == "temperature" && lastState == null)
    el("mode").asInstanceOf[dom.html.Select].disabled = automatic
  }
  private def update(s: js.Dynamic): Unit = {
    if (string(s, "source") != mode || !Set("stock", "temperature").contains(current)) return
    val temp = current == "temperature"
    val journal = if (temp) "temp-journal" else "journal"
    if (lastSession != string(s, "sessionId")) {
      lastSession = string(s, "sessionId"); lastQuantity = None; el(journal).textContent = ""
    }
    lastState = s
    log(journal, string(s, "message"))
    if (!js.isUndefined(s.observationGap) && bool(s, "observationGap")) log(journal, "Resynchronisation : des étapes intermédiaires peuvent manquer.")
    text("session-label", "Session " + lastSession.take(8) + " · #" + string(s, "sequence"))
    if (temp) {
      val temperature = f"${number(s, "temperature")}%.1f"
      text("temp-reading", temperature)
      if (string(s, "eventType") == "reset") { setValue("temp-number", temperature); setValue("temp-slider", temperature); text("temp-draft", temperature + " °C") }
      val power = if (s.fanPower == null) 0d else number(s, "fanPower")
      text("fan-power", if (s.fanPower == null) "—" else string(s, "fanPower"))
      el("fan-bar").style.width = power.toString + "%"
      // Presentation uses ONLY power returned by the selected source.
      nodes(".fan-rotor").foreach(_.style.animation = if (power == 0) "none" else s"scenario-spin ${100d / power}s linear infinite")
      toggle("temperature-view", "ventilating", power > 0)
      text("temp-status", labels.getOrElse(string(s, "executionStatus"), string(s, "executionStatus")))
      text("fan-state", if (s.fanPower == null) "En attente de décision" else if (power == 0) "Ventilation arrêtée" else "Régulation active")
      text("path-temperature", temperature + " °C"); text("path-power", if (s.fanPower == null) "—" else string(s, "fanPower") + " %")
      text("path-decision", if (bool(s.observations, "decisionReceived")) "Décision reçue" else "En attente")
      text("temp-step", "Pas moteur : " + string(s, "executionStep")); board("temp-blackboard", s)
      text("temp-term-count", s"${rows(s).size} TERMES"); text("temp-agent", Option(string(s, "remainingAgent")).filter(_.nonEmpty).getOrElse("Agent terminé."))
    } else {
      val quantity = string(s, "stock")
      text("stock", if (s.stock == null) "…" else quantity)
      text("stock-transition", if (s.stock == null) "Transition moteur · stock consommé" else lastQuantity.filter(_ != quantity).map(_ + " → " + quantity).getOrElse(if (mode == "anemone") "Valeur lue dans Anemone" else "Valeur simulée"))
      if (s.stock != null) lastQuantity = Some(quantity)
      val weight = bool(s.observations, "weightDetected"); val matrix = bool(s.observations, "dataMatrixDetected"); val confirmed = bool(s.observations, "withdrawalConfirmed")
      toggle("weight-card", "detected", weight); toggle("matrix-card", "detected", matrix); toggle("confirmation", "confirmed", confirmed)
      text("weight-label", if (weight) "Changement de poids détecté ✓" else "En attente…"); text("matrix-label", if (matrix) "Data Matrix détecté ✓" else "En attente…")
      text("confirmation-label", if (confirmed) "RETRAIT CONFIRMÉ ✓" else "En attente de validation")
      text("confirmation-detail", if (confirmed) string(s, "confirmationMultiplicity") + " confirmation(s) dans le store" else "L’agent Anemone prend la décision.")
      if (string(s, "eventType") == "datamatrix") animate("scanning")
      if (confirmed && string(s, "eventType") == "step") animate("withdraw")
      text("execution-status", labels.getOrElse(string(s, "executionStatus"), string(s, "executionStatus")))
      text("step-label", "Pas moteur : " + string(s, "executionStep"))
      text("narrative", if (string(s, "executionStatus") == "blocked") "Agent en attente · continuation conservée" else if (confirmed) "Retrait confirmé" else "Prête pour un nouveau retrait")
      board("blackboard", s); text("term-count", s"${rows(s).size} TERMES"); text("remaining-agent", Option(string(s, "remainingAgent")).filter(_.nonEmpty).getOrElse("Agent terminé."))
    }
    controls()
  }
  private def connection(ok: Boolean, message: String): Unit = {
    text("connection", message); toggle("mode-banner", "unavailable", !ok); hide("error", ok)
    if (!ok) text("error", "Moteur Anemone indisponible. Aucune simulation ne remplace ses données.")
  }
  private class RealSource(val api: String, val born: Int) {
    var closed = false
    var token = ""
    var sequence = -1d
    var engine = ""
    var stream: Option[dom.EventSource] = None
    def accept(s: js.Dynamic): Unit = if (!closed && born == generation) {
      require(string(s, "source") == "anemone", "Source moteur inattendue")
      if (string(s, "csrfToken").nonEmpty) token = string(s, "csrfToken")
      if (engine != string(s, "engineInstanceId")) { engine = string(s, "engineInstanceId"); sequence = -1 }
      if (number(s, "sequence") > sequence) {
        if (sequence >= 0 && number(s, "sequence") > sequence + 1) s.updateDynamic("observationGap")(true)
        sequence = number(s, "sequence"); update(s)
      }
    }
    def refresh(): Future[Unit] = request(api + "/state").map { s =>
      accept(s)
      if (!closed && born == generation) connection(true, "Vrai moteur · JVM persistante · Scala.js")
    }.recoverWith { case e => if (!closed && born == generation) connection(false, e.getMessage); Future.failed(e) }
    private def openStream(): Unit = if (!closed && stream.isEmpty) {
      val es = new dom.EventSource(api + "/events"); stream = Some(es)
      es.addEventListener("state", (e: dom.Event) => {
        if (!closed) try {
          accept(js.JSON.parse(e.asInstanceOf[dom.MessageEvent].data.toString))
          connection(true, "Flux du vrai moteur connecté · Scala.js")
        } catch { case scala.util.control.NonFatal(_) => connection(false, "Réponse moteur invalide") }
      })
      es.onerror = (_: dom.Event) => if (!closed) connection(false, "Flux interrompu · lecture HTTP de secours")
    }
    def connect(): Unit = { refresh().foreach(_ => openStream()) }
    val timer = dom.window.setInterval(() => {
      if (!closed) refresh().map(_ => openStream()).recover { case _ => () }
    }, 2500)
    def command(name: String, argument: String): Future[Unit] = {
      val ready = if (token.isEmpty) refresh() else Future.successful(())
      ready.flatMap { _ =>
        val path = Map("weight" -> "events/weight", "datamatrix" -> "events/datamatrix").getOrElse(name, name)
        val query = if (name == "apply") "?value=" + js.URIUtils.encodeURIComponent(argument) else ""
        request(api + "/" + path + query, js.Dynamic.literal(method = "POST", headers = js.Dynamic.literal("X-SmartStock-Token" -> token, "X-Command-Id" -> js.Dynamic.global.crypto.randomUUID()))).map(accept)
      }
    }
    def close(): Unit = { closed = true; dom.window.clearInterval(timer); stream.foreach(_.close()) }
  }
  private def issue(name: String, argument: String = ""): Future[Unit] = {
    if (mode == "anemone") source.map(_.command(name, argument)).getOrElse(Future.failed(new RuntimeException("Source absente")))
    else demo.command(name, if (argument.isEmpty) js.undefined else argument).asInstanceOf[js.Promise[js.Any]].toFuture.map(_ => ())
  }
  private def command(name: String): Unit = {
    if (pending) return
    val born = generation
    if (current == "temperature" && name == "apply" && !el("temp-number").asInstanceOf[dom.html.Input].reportValidity()) return
    pending = true; controls()
    issue(name, if (current == "temperature") inputValue("temp-number") else "").onComplete { r =>
      if (generation == born) { pending = false; r.failed.foreach(failure); controls() }
    }
  }
  private def navigate(id: String): Unit = {
    generation += 1; source.foreach(_.close()); source = None
    if (demo != null) demo.disconnect()
    diagnosticsTimer.foreach(dom.window.clearInterval); diagnosticsTimer = None
    current = id; mode = modes.getOrElse(id, "anemone"); pending = false; automatic = false; lastState = null; lastSession = ""; lastQuantity = None
    Seq("stock", "temperature", "diagnostics", "scenarios").foreach { name => hide(name + "-view", name != id); toggle("nav-" + name, "selected", name == id) }
    val system = Set("diagnostics", "scenarios").contains(id)
    nodes(".mode-control").foreach(e => if (system) e.setAttribute("hidden", "") else e.removeAttribute("hidden")); hide("mode-banner", system); hide("error", true)
    text("demo-eyebrow", Map("stock" -> "DÉMO 01 · GESTION INTELLIGENTE DU STOCK", "temperature" -> "DÉMO 02 · RÉGULATION DE TEMPÉRATURE", "diagnostics" -> "DIAGNOSTIC MOTEUR", "scenarios" -> "CRÉATION DE SCÉNARIOS")(id))
    text("demo-subtitle", if (id == "scenarios") "Définitions, agent et Blackboard isolé · vrai parseur JLAMP24" else "Laboratoire connecté · interface Scala.js")
    if (id == "diagnostics") { refreshDiagnostics(); diagnosticsTimer = Some(dom.window.setInterval(() => refreshDiagnostics(), 2000)) }
    else if (id != "scenarios") {
      setValue("mode", mode); toggle("mode-banner", "demo-mode", mode == "demo")
      text("mode-label", if (mode == "demo") "DEMO — DONNÉES SIMULÉES" else "ANEMONE — MOTEUR RÉEL")
      text("live-label", if (mode == "demo") "SIMULATION LOCALE" else "SOURCE JVM")
      val temp = id == "temperature"
      text(if (temp) "temp-board-title" else "blackboard-title", if (mode == "demo") "Blackboard simulé" else "Blackboard Anemone")
      text(if (temp) "temp-store-source" else "store-source", if (mode == "demo") "DEMO · données simulées" else "ABBlackboard.storeContents")
      text(if (temp) "fan-power" else "stock", "—")
      if (mode == "anemone") { val s = new RealSource(if (temp) "/api/temperature" else "/api", generation); source = Some(s); s.connect() }
      else {
        demo = demos.getOrElseUpdate(id, js.Dynamic.newInstance(if (temp) js.Dynamic.global.TemperatureDemoDataSource else js.Dynamic.global.DemoDataSource)(
          ((s: js.Dynamic) => update(s)): js.Function1[js.Dynamic, Unit], ((ok: Boolean, msg: String) => connection(ok, msg)): js.Function2[Boolean, String, Unit]))
        demo.connect()
      }
      controls()
    }
  }
  private def refreshDiagnostics(): Unit = {
    val born = generation
    request("/api/diagnostics").onComplete {
      case Success(d) if current == "diagnostics" && born == generation =>
        text("diagnostics-status", "ANEMONE — CONNECTÉ ✓ · observations du Bridge Java")
        hide("diagnostics-content", false); hide("diagnostics-error", true)
        text("diagnostics-runtime", "JVM " + string(d.runtime, "javaVersion") + " · " + string(d.runtime, "javaVendor"))
        text("diagnostics-classes", js.Dynamic.global.JSON.stringify(d.runtime.loadedClasses, null, 2).asInstanceOf[String])
        text("diagnostics-config", js.Dynamic.global.JSON.stringify(d.configuration, null, 2).asInstanceOf[String])
        text("diagnostics-sessions", "Appels run_one et AST avant/après :\n" + js.Dynamic.global.JSON.stringify(d.sessions, null, 2).asInstanceOf[String])
        text("diagnostics-scope", string(d, "scope"))
      case Failure(e) if current == "diagnostics" && born == generation => hide("diagnostics-content", true); hide("diagnostics-error", false); text("diagnostics-status", "DIAGNOSTIC INDISPONIBLE"); text("diagnostics-error", e.getMessage)
      case _ => ()
    }
  }
  private def automaticDemo(): Unit = {
    if (mode != "demo" || automatic) return
    val born = generation; automatic = true; controls()
    def delay(ms: Int): Future[Unit] = { val p = scala.concurrent.Promise[Unit](); dom.window.setTimeout(() => if (born == generation) p.success(()) else p.failure(new RuntimeException("Navigation")), ms); p.future }
    val run = if (current == "stock") for { _ <- issue("reset"); _ <- delay(650); _ <- issue("weight"); _ <- delay(650); _ <- issue("datamatrix"); _ <- delay(650); _ <- issue("run") } yield ()
    else Seq("20", "23", "25", "27", "30", "24").foldLeft(issue("reset"))((f, v) => f.flatMap(_ => delay(200)).flatMap(_ => issue("apply", v)).flatMap(_ => issue("run")))
    run.onComplete(r => if (born == generation) { automatic = false; r.failed.foreach(failure); controls() })
  }

  private val definitions = Var("")
  private val agent = Var("")
  private val editorStatus = Var("Choisir un modèle ou commencer avec un scénario vide.")
  private val editorBoard = Var("Blackboard vide")
  private val editorAst = Var("")
  private val valid = Var(false)
  private val editorBusy = Var(false)
  private var editorSession: Option[String] = None
  private var editorRevision = 0
  private var templates = Seq.empty[js.Dynamic]
  private def dirty(): Unit = { editorRevision += 1; valid.set(false); editorStatus.set("Sources modifiées : valider la syntaxe avant exécution.") }
  private def scenario(action: String): Unit = {
    val revision = editorRevision
    editorBusy.set(true)
    val fields = if (action == "validate") Seq("definitions" -> definitions.now(), "agent" -> agent.now()) else Seq("steps" -> inputValue("scenario-steps"))
    val all = fields ++ editorSession.toSeq.map("sessionId" -> _)
    val body = all.map { case (k,v) => js.URIUtils.encodeURIComponent(k) + "=" + js.URIUtils.encodeURIComponent(v) }.mkString("&")
    val operation = request("/api/state").flatMap { state =>
      request("/api/scenarios/" + action, js.Dynamic.literal(method = "POST", headers = js.Dynamic.literal("Content-Type" -> "application/x-www-form-urlencoded", "X-SmartStock-Token" -> state.csrfToken), body = body))
    }
    operation.onComplete { r =>
      editorBusy.set(false)
      if (editorRevision == revision) r match {
        case Success(s) =>
          editorSession = Some(string(s, "sessionId")); valid.set(true)
          editorStatus.set("ANEMONE · " + string(s, "parserClass") + " · session " + string(s, "sessionId").take(8) + " · " + string(s, "executionStatus") + " · pas " + string(s, "executionStep"))
          editorBoard.set(if (rows(s).isEmpty) "Blackboard vide" else rows(s).map(r => string(r,"term") + " [" + string(r,"multiplicity") + "]").mkString("\n"))
          editorAst.set(string(s, "remainingAgent"))
          if (string(s, "error").nonEmpty) { valid.set(false); editorStatus.set("Erreur du moteur : " + string(s, "error")) }
        case Failure(e) => valid.set(false); editorStatus.set("Erreur du parseur / moteur Anemone : " + e.getMessage)
      }
    }
  }
  private def releaseEditorSession(): Unit = {
    editorSession.foreach { id => request("/api/state").flatMap { state =>
      request("/api/scenarios/release", js.Dynamic.literal(method = "POST", headers = js.Dynamic.literal("X-SmartStock-Token" -> state.csrfToken), body = "sessionId=" + id))
    }.recover { case _ => js.Dynamic.literal() } }
  }
  private def editor(): Unit = {
    render(el("scenario-editor"), div(
      sectionTag(cls := "panel scenario-intro", span(cls := "eyebrow", "LABORATOIRE ANEMONE · SESSION INDÉPENDANTE"), h2("Création de scénarios"),
        p("Éditez les définitions et l’agent, validez avec le vrai parseur JLAMP24, puis observez chaque pas dans un Blackboard distinct des deux démos."),
        p(cls := "scenario-warning", "Repères Anémone : définitions / agent / Blackboard. Couleurs des sources JLAMP24 : descriptions roses, agent rouge, store bleu. Application originale non affichée ; disposition adaptée au Web."),
        div(cls := "scenario-tools", select(idAttr := "scenario-template", aria.label := "Scénario de départ", option(value := "empty", "Scénario vide"), option(value := "stock", "Retrait DataMatrix + poids"), option(value := "temperature", "Régulation thermique")),
          button(idAttr := "scenario-load", "Charger le modèle", disabled <-- editorBusy.signal, onClick --> { _ =>
            templates.find(t => string(t,"id") == inputValue("scenario-template")).foreach { t => releaseEditorSession(); definitions.set(string(t,"definitions")); agent.set(string(t,"agent")); editorSession = None; dirty(); editorBoard.set("Blackboard vide"); editorAst.set("") }
          }))),
      div(cls := "scenario-editors", div(cls := "panel", label(forId := "scenario-definitions", "01 / DÉFINITIONS · ensembles, équations, procédures"), textArea(idAttr := "scenario-definitions", spellCheck := false, value <-- definitions.signal, onInput.mapToValue --> { s => definitions.set(s); dirty() })),
        div(cls := "panel", label(forId := "scenario-agent", "02 / AGENT · primitives et composition"), textArea(idAttr := "scenario-agent", placeholder := "tell(custom(ok));get(custom(ok));tell(result(done))", spellCheck := false, value <-- agent.signal, onInput.mapToValue --> { s => agent.set(s); dirty() }))),
      div(cls := "scenario-tools", button(idAttr := "scenario-validate", cls := "primary", "Valider la syntaxe", disabled <-- editorBusy.signal, onClick --> (_ => scenario("validate"))),
        button(idAttr := "scenario-step", "Un pas →", disabled <-- valid.signal.combineWith(editorBusy.signal).map { case (v,b) => !v || b }, onClick --> (_ => scenario("step"))),
        label(forId := "scenario-steps", "Pas maximum"), input(idAttr := "scenario-steps", typ := "number", minAttr := "1", maxAttr := "100", value := "16"),
        button(idAttr := "scenario-run", "Exécuter la séquence bornée", disabled <-- valid.signal.combineWith(editorBusy.signal).map { case (v,b) => !v || b }, onClick --> (_ => scenario("run")))),
      sectionTag(cls := "panel scenario-results", p(idAttr := "scenario-status", cls := "scenario-status", role := "status", child.text <-- editorStatus.signal),
        h3("03 / BLACKBOARD OBTENU"), pre(idAttr := "scenario-blackboard", child.text <-- editorBoard.signal), h3("AGENT RESTANT"), pre(idAttr := "scenario-remaining", child.text <-- editorAst.signal))
    ))
    request("/api/scenarios/templates").onComplete {
      case Success(t) => templates = t.asInstanceOf[js.Array[js.Dynamic]].toSeq
      case Failure(e) => editorStatus.set("Modèles indisponibles : " + e.getMessage)
    }
  }
  private def waitStopped(attempts: Int): Future[Unit] = {
    request("/api/state").transformWith {
      case Failure(_) => Future.successful(())
      case Success(_) if attempts > 0 =>
        val p = scala.concurrent.Promise[Unit]()
        dom.window.setTimeout(() => p.success(()), 200)
        p.future.flatMap(_ => waitStopped(attempts - 1))
      case _ => Future.failed(new RuntimeException("Arrêt demandé mais fermeture du service non confirmée."))
    }
  }
  def main(args: Array[String]): Unit = {
    render(el("demo-navigation"), div(Seq(("stock","01","Gestion du stock"),("temperature","02","Régulation température"),("scenarios","03","Création de scénarios")).map { case (key,n,label) => button(idAttr := "nav-" + key, span(n), span(label), onClick --> (_ => navigate(key))) }))
    render(el("system-navigation"), button(idAttr := "nav-diagnostics", span("i"), span("Diagnostic moteur"), onClick --> (_ => navigate("diagnostics"))))
    nodes("[data-command]").foreach(b => b.addEventListener("click", (_: dom.Event) => command(b.getAttribute("data-command"))))
    nodes("[data-temp-command]").foreach(b => b.addEventListener("click", (_: dom.Event) => command(b.getAttribute("data-temp-command"))))
    el("mode").addEventListener("change", (_: dom.Event) => { modes(current) = inputValue("mode"); navigate(current) })
    Seq("temp-number", "temp-slider").foreach(id => el(id).addEventListener("input", (_: dom.Event) => {
      val v = inputValue(id); setValue(if (id == "temp-number") "temp-slider" else "temp-number", v); text("temp-draft", v + " °C")
    }))
    Seq(("< 22 °C", "0 %"),("22 à < 24 °C", "25 %"),("24 à < 26 °C", "50 %"),("26 à < 28 °C", "75 %"),("≥ 28 °C", "100 %")).foreach { case (range,power) => val li = dom.document.createElement("li"); li.textContent = range + " · " + power; el("threshold-list").appendChild(li) }
    Seq("auto", "temp-auto").foreach(id => el(id).addEventListener("click", (_: dom.Event) => automaticDemo()))
    el("diagnostics-refresh").addEventListener("click", (_: dom.Event) => refreshDiagnostics())
    el("quit-app").addEventListener("click", (_: dom.Event) => el("quit-dialog").asInstanceOf[js.Dynamic].showModal())
    el("quit-cancel").addEventListener("click", (_: dom.Event) => el("quit-dialog").asInstanceOf[js.Dynamic].close())
    el("quit-confirm").addEventListener("click", (_: dom.Event) => {
      el("quit-confirm").asInstanceOf[dom.html.Button].disabled = true
      request("/api/state").flatMap(s => request("/api/shutdown", js.Dynamic.literal(method = "POST", headers = js.Dynamic.literal("X-SmartStock-Token" -> s.csrfToken)))).flatMap { _ =>
        generation += 1; source.foreach(_.close()); workbench.foreach(_.close()); if (demo != null) demo.disconnect(); diagnosticsTimer.foreach(dom.window.clearInterval)
        waitStopped(15)
      }.onComplete {
        case Success(_) =>
          el("quit-dialog").asInstanceOf[js.Dynamic].close(); nodes(".shell, .sidebar").foreach(_.setAttribute("hidden", "")); hide("stopped-page", false)
          text("stopped-detail", "Bridge arrêté. Vous pouvez fermer cette fenêtre."); dom.window.close()
        case Failure(e) => el("quit-confirm").asInstanceOf[dom.html.Button].disabled = false; hide("quit-error", false); text("quit-error", e.getMessage)
      }
    })
    editor()
    workbench=Some(new WorkbenchView(el("workbench-root"),()=> (definitions.now(),agent.now())))
    el("scenario-workbench-tab").addEventListener("click", (_:dom.Event)=> {hide("scenario-editor",true);hide("workbench-root",false);workbench.foreach(_.open())})
    el("scenario-editor-tab").addEventListener("click", (_:dom.Event)=> {hide("scenario-editor",false);hide("workbench-root",true)})
    navigate("stock")
    dom.document.documentElement.setAttribute("data-interface", "scala-js-laminar")
  }
}
