package smartstock

import com.raquo.laminar.api.L._
import org.scalajs.dom
import scala.concurrent.{ExecutionContext,Future}
import scala.util.{Success,Failure}

/** Browser-only tools. Draft Vars and one typed client survive all local navigation. */
final class WorkbenchView(root: dom.Element, scenarioDraft: () => (String,String))(implicit ec: ExecutionContext) {
  private val page=Var("blackboard")
  private val state=Var(Option.empty[WorkbenchState])
  private val busy=Var(false)
  private val errors=Var(Map.empty[String,String])
  private val connection=Var("Contexte personnel · en attente de connexion")
  private val connected=Var(false)
  private val term=Var("t")
  private val multiplicity=Var("1")
  private val filterDraft=Var("t(?X,3), u(9)")
  private val interactiveDraft=Var("get(t);tell(done)")
  private val autonomousDraft=Var("get(t);tell(done)")
  private val definitionsDraft=Var("rule consume = +t --> -t,+done .")
  private val modelAgentDraft=Var("tell(goal)")
  private val formulaDraft=Var("Reach #goal > 0")
  private val interAbbrev=Var(false)
  private val autoAbbrev=Var(false)
  private val maxSteps=Var("100")
  private val ruleSteps=Var("100")
  private val selectedRule=Var(Option.empty[Int])
  private var opened=false
  private val client=new WorkbenchClient(s=> {
    state.set(Some(s))
    if(selectedRule.now().exists(i=> !s.rules.items.exists(_.id==i)))selectedRule.set(None)
  },(ok,message)=> {connected.set(ok);connection.set(message)})

  private val titles=Map("blackboard"->"Blackboard interactif","interactive"->"Agent interactif","autonomous"->"Agent autonome","definitions"->"Définitions","model"->"Model Checker","rules"->"Rule Checker")
  private def statusText(f: WorkbenchState=>String): Signal[String]=state.signal.map(_.map(f).getOrElse("—"))
  private def inactive(f: WorkbenchState=>Boolean): Signal[Boolean]=state.signal.combineWith(busy.signal).map {case(s,b)=>b || s.forall(f)}
  private def error(field: String): HtmlElement=p(idAttr:="wb-"+field+"-error",cls <-- errors.signal.map(m=>if(m.getOrElse(field,"").isEmpty)"wb-error wb-hidden" else "wb-error"),role:="alert",child.text <-- errors.signal.map(_.getOrElse(field,"")))
  private def execute(field: String)(operation: => Future[WorkbenchState]): Unit = {
    if(busy.now())return
    busy.set(true);errors.update(_ - field - "workspace")
    operation.onComplete {
      case Success(_) => busy.set(false)
      case Failure(e) => busy.set(false);val key=e match {case b:BridgeFailure if b.field.nonEmpty=>b.field;case _=>field}
        errors.update(_ + (key -> Option(e.getMessage).getOrElse(e.toString)))
    }
  }
  def open(tool: String = "blackboard"): Unit = {
    page.set(if(titles.contains(tool))tool else "blackboard")
    if(!opened){opened=true;execute("workspace")(client.open())}
  }
  def close(): Unit=client.close()
  private def go(tool: String): Unit={page.set(tool);if(tool=="rules")execute("rules")(client.refreshRules())}
  private def toolButton(tool: String,subtitle: String)=button(idAttr:="wb-open-"+tool,cls:="wb-launch wb-"+tool,onClick --> (_=>go(tool)),strong(titles(tool)),span(subtitle))
  private def back=button(cls:="wb-back",onClick --> (_=>go("blackboard")),"← Retour au Blackboard")
  private def frame(tool: String)(content: Modifier[HtmlElement]*): HtmlElement=sectionTag(idAttr:="wb-view-"+tool,cls <-- page.signal.map(p=>"wb-tool wb-"+tool+(if(p==tool)"" else " wb-hidden")),
    div(cls:="wb-tool-heading",div(span(cls:="eyebrow","ESPACE ANEMONE · MÊME CONTEXTE JVM"),h2(titles(tool))),back),content)
  private def commandButton(id: String,label: String,field: String)(op: => Future[WorkbenchState])=button(idAttr:=id,disabled <-- busy.signal,onClick --> (_=>execute(field)(op)),label)
  private def area(id: String,labelText: String,draft: Var[String]): HtmlElement=div(cls:="wb-field",label(forId:=id,labelText),textArea(idAttr:=id,spellCheck:=false,value <-- draft.signal,onInput.mapToValue --> draft.writer))
  private def currentAgent(id: String,kind: String,abbrev: Var[Boolean]): HtmlElement=div(cls:="wb-output",h3("Agent courant"),pre(idAttr:=id,child.text <-- state.signal.combineWith(abbrev.signal).map {case(s,short)=>s.map { x=>
    if(kind=="interactive") {if(short)x.interactive.abbreviated else x.interactive.agent} else {if(short)x.autonomous.abbreviated else x.autonomous.agent}
  }.getOrElse("Aucun agent soumis.")}))
  private def abbreviation(id: String,v: Var[Boolean])=label(cls:="wb-check",input(idAttr:=id,typ:="checkbox",checked <-- v.signal,onChange.mapToChecked --> v.writer),"Abbrev")
  private def boardView: HtmlElement=frame("blackboard")(
    div(cls:="wb-store-heading",h3("Current store"),commandButton("wb-clear","Clear","workspace")(client.clear())),
    div(cls:="wb-store",table(idAttr:="wb-store",thead(tr(th("Terme"),th("Multiplicité"))),tbody(children <-- state.signal.map(_.toVector.flatMap(_.store).map(t=>tr(td(code(t.term)),td(span(cls:="wb-count",t.multiplicity.toString)))))))),
    p(cls:="wb-empty",child.text <-- state.signal.map(s=>if(s.forall(_.store.isEmpty))"Store courant vide (ou aucun terme correspondant au filtre)." else "")),
    div(cls:="wb-form-row",div(cls:="wb-field wb-term-field",label(forId:="wb-term","si-term"),input(idAttr:="wb-term",value <-- term.signal,onInput.mapToValue --> term.writer)),
      div(cls:="wb-field wb-multiplicity",label(forId:="wb-multiplicity","Multiplicité"),input(idAttr:="wb-multiplicity",typ:="number",maxAttr:="1000",value <-- multiplicity.signal,onInput.mapToValue --> multiplicity.writer)),
      div(cls:="wb-actions",commandButton("wb-tell","Tell","term")(client.tell(term.now(),multiplicity.now())),commandButton("wb-get","Get","term")(client.get(term.now(),multiplicity.now())))),error("term"),
    p(cls:="wb-help","Tell/Get répètent l’opération native ; Get peut retirer moins d’occurrences que demandé. Une multiplicité ≤ 0 ne fait rien ; limite Web : 1000."),
    div(cls:="wb-form-row",div(cls:="wb-field wb-filter-field",label(forId:="wb-filter","Liste de filtres natifs"),input(idAttr:="wb-filter",value <-- filterDraft.signal,onInput.mapToValue --> filterDraft.writer)),div(cls:="wb-actions",commandButton("wb-filter-apply","Filter","filter")(client.filter(filterDraft.now())),commandButton("wb-unfilter","Unfilter","filter")(client.unfilter()))),error("filter"),
    p(idAttr:="wb-filter-state",cls:="wb-help",child.text <-- statusText(s=>if(s.displayFiltered)"Affichage filtré · le store réel reste intact." else if(s.filterActive)"Filtre conservé ; store complet réaffiché par l’opération native." else "Affichage complet · aucun filtre actif.")),
    p(idAttr:="wb-warning",cls:="wb-warning",role:="status",child.text <-- statusText(_.warning)),
    div(cls:="wb-tool-launchers",toolButton("interactive","Choisir une primitive exécutable"),toolButton("autonomous","Next et Run sur le store partagé"),toolButton("definitions","Ensembles, équations, scènes, procédures, règles"),toolButton("model","Agent, formule et trace native"),toolButton("rules","Règles activées et applicables")))
  private def interactiveView: HtmlElement=frame("interactive")(
    area("wb-interactive-source","Agent to be processed",interactiveDraft),error("interactive"),
    div(cls:="wb-actions",commandButton("wb-interactive-submit","Submit","interactive")(client.submitInteractive(interactiveDraft.now())),commandButton("wb-interactive-refresh","Refresh","interactive")(client.refreshInteractive()),abbreviation("wb-interactive-abbrev",interAbbrev)),
    currentAgent("wb-interactive-current","interactive",interAbbrev),
    p(idAttr:="wb-interactive-stale",cls:="wb-warning",child.text <-- statusText(s=>if(s.interactive.stale)"Le store a changé : Refresh recalcule les commandes exécutables." else "Commandes calculées par ag_first_steps, chemins fournis par le moteur.")),
    div(idAttr:="wb-interactive-actions",cls:="wb-actions",children <-- state.signal.map(_.toVector.flatMap(_.interactive.actions).map(a=>button(idAttr:="wb-action-"+a.id,disabled <-- inactive(_.interactive.stale),onClick --> (_=>execute("interactive")(client.interactiveStep(a.id))),a.label)))),
    p(cls:="wb-help",child.text <-- statusText(s=>if(s.interactive.actions.isEmpty)"Aucune commande exécutable. Modifier le store puis Refresh, ou soumettre un autre agent." else s"${s.interactive.steps} pas sélectionné(s).")))
  private def autonomousView: HtmlElement=frame("autonomous")(
    area("wb-autonomous-source","Agent to be processed",autonomousDraft),error("autonomous"),
    div(cls:="wb-actions",commandButton("wb-autonomous-submit","Submit","autonomous")(client.submitAutonomous(autonomousDraft.now())),abbreviation("wb-autonomous-abbrev",autoAbbrev)),
    currentAgent("wb-autonomous-current","autonomous",autoAbbrev),
    div(cls:="wb-actions",button(idAttr:="wb-next",disabled <-- inactive(s=>s.autonomous.agent.isEmpty||s.autonomous.status=="completed"),onClick --> (_=>execute("autonomous")(client.next())),"Next"),
      label(forId:="wb-auto-max","Pas maximum"),input(idAttr:="wb-auto-max",typ:="number",minAttr:="1",maxAttr:="100",value <-- maxSteps.signal,onInput.mapToValue --> maxSteps.writer),
      button(idAttr:="wb-run",disabled <-- inactive(s=>s.autonomous.agent.isEmpty||s.autonomous.status=="completed"),onClick --> (_=>execute("autonomous")(client.run(maxSteps.now()))),"Run")),
    p(idAttr:="wb-autonomous-status",cls:="wb-warning",child.text <-- statusText(s=>s.autonomous.status+s" · ${s.autonomous.steps} pas moteur")),
    p(cls:="wb-help","Run s’arrête sur agent terminé, blocage ou limite visible. Abbrev ne change que la présentation ; la case autonome native n’a pas de gestionnaire d’événement."))
  private def definitionsView: HtmlElement=frame("definitions")(
    area("wb-definitions-source","Set / map / scene / proc / rule descriptions",definitionsDraft),error("definitions"),
    div(cls:="wb-actions",commandButton("wb-definitions-submit","Submit","definitions")(client.definitions(definitionsDraft.now()))),
    div(cls:="wb-output",h3("Descriptions analysées"),pre(idAttr:="wb-definitions-result",child.text <-- statusText(_.definitions.result))),
    p(idAttr:="wb-definitions-notice",cls:="wb-help",child.text <-- statusText(_.definitions.notice)),
    p(cls:="wb-help","Les déclarations s’ajoutent au contexte partagé, sans vider le store. Une règle déclarée doit être activée par tellr(nom). Les primitives qui ouvrent des fenêtres Java sont refusées."))
  private def modelView: HtmlElement=frame("model")(
    div(cls:="wb-model-editors",div(area("wb-model-agent-source","Agent to be processed",modelAgentDraft),error("model"),commandButton("wb-model-agent-submit","Submit agent","model")(client.submitModelAgent(modelAgentDraft.now())),h3("Agent introduced"),pre(idAttr:="wb-model-agent-current",child.text <-- statusText(_.model.agent))),
      div(area("wb-formula-source","Formula to be processed",formulaDraft),error("formula"),commandButton("wb-formula-submit","Submit formule","formula")(client.submitFormula(formulaDraft.now())),h3("Formula introduced"),pre(idAttr:="wb-formula-current",child.text <-- statusText(_.model.formula)))),
    div(cls:="wb-actions",button(idAttr:="wb-model-check",disabled <-- inactive(s=>s.model.agent.isEmpty||s.model.formula.isEmpty),onClick --> (_=>execute("model")(client.modelCheck())),"Model Check"),
      button(idAttr:="wb-model-trace",disabled <-- inactive(s=> !s.model.traceAvailable),onClick --> (_=>execute("model")(client.simulateTrace())),"Simulate trace")),
    p(idAttr:="wb-model-status",cls:="wb-warning",role:="status",child.text <-- statusText(_.model.status)),
    div(cls:="wb-output",h3("Trace retournée par le moteur"),pre(idAttr:="wb-model-trace-result",child.text <-- statusText(s=>s.model.trace.zipWithIndex.map{case(t,i)=>s"${i+1}. $t"}.mkString("\n")))),
    p(cls:="wb-help","Le vérificateur partage le contexte, explore puis restaure le store. Simulate trace exécute la trace sur le store courant partagé. Une recherche bornée non établie n’est pas une preuve universelle. Profondeur native 15 pour Next/Until ; Reach utilise la borne interne 5000. Les stubs natifs multi/processus/règles ne sont pas présentés comme vérifiés."))
  private def rulesView: HtmlElement=frame("rules")(
    p(cls:="wb-help","Déclarer une règle dans Définitions puis l’activer avec tellr(nom) depuis un agent. Refresh énumère seulement les instances activées et actuellement applicables."),error("rules"),
    div(cls:="wb-actions",commandButton("wb-rules-refresh","Refresh","rules")(client.refreshRules())),
    div(idAttr:="wb-rules-list",cls:="wb-rule-list",children <-- state.signal.map(_.toVector.flatMap(_.rules.items).map(r=>label(input(idAttr:="wb-rule-"+r.id,typ:="radio",nameAttr:="wb-rule-choice",checked <-- selectedRule.signal.map(_.contains(r.id)),onChange --> (_=>selectedRule.set(Some(r.id)))),code(r.label))))),
    div(cls:="wb-actions",button(idAttr:="wb-rules-apply",disabled <-- selectedRule.signal.combineWith(busy.signal).map{case(i,b)=>b||i.isEmpty},onClick --> (_=>selectedRule.now().foreach(i=>execute("rules")(client.applyRule(i)))),"Apply Selected Rule"),
      label(forId:="wb-rule-max","Règles maximum"),input(idAttr:="wb-rule-max",typ:="number",minAttr:="1",maxAttr:="100",value <-- ruleSteps.signal,onInput.mapToValue --> ruleSteps.writer),
      commandButton("wb-rules-run","Run Rules","rules")(client.runRules(ruleSteps.now()))),
    p(idAttr:="wb-rules-status",cls:="wb-warning",role:="status",child.text <-- statusText(_.rules.status)),
    p(cls:="wb-help","Run Rules conserve le choix aléatoire natif entre règles applicables. Limite explicite ; aucune règle ni aucune correspondance n’est calculée dans le navigateur."))

  render(root,div(cls:="workbench",div(cls:="wb-header",div(span(cls:="eyebrow","JLAMP24 · OUTILS INTERACTIFS"),h2("L’espace Blackboard"),p("Un store partagé par vos cinq outils, séparé des démonstrations.")),
    div(cls:="wb-header-actions",button(idAttr:="wb-new",disabled <-- busy.signal,onClick --> (_=>execute("workspace")(client.reset())),"Nouvel espace · store vide"),
      button(idAttr:="wb-import",disabled <-- busy.signal,onClick --> { _=> val(d,a)=scenarioDraft();definitionsDraft.set(d);autonomousDraft.set(a);page.set("blackboard");execute("workspace"){
        client.reset().flatMap(s=>if(d.trim.nonEmpty)client.definitions(d) else Future.successful(s)).flatMap(s=>if(a.trim.nonEmpty)client.submitAutonomous(a) else Future.successful(s))
      } },"Importer le brouillon · espace neuf"))),
    p(idAttr:="wb-connection",cls <-- connected.signal.map(ok=>if(ok)"wb-connection" else "wb-connection wb-disconnected"),role:="status",child.text <-- connection.signal),
    p(idAttr:="wb-session",cls:="wb-session",child.text <-- statusText(s=>s"Espace ${s.workspaceId} · révision ${s.storeRevision} · #${s.sequence}")),error("workspace"),
    boardView,interactiveView,autonomousView,definitionsView,modelView,rulesView,
    detailsTag(cls:="wb-evidence",summaryTag("Derniers appels de façade au vrai moteur"),pre(idAttr:="wb-engine-calls",child.text <-- statusText(_.calls.mkString("\n"))))))
}
