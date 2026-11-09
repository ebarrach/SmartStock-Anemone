package smartstock

import org.scalajs.dom
import scala.scalajs.js
import scala.scalajs.js.JSConverters._
import scala.concurrent.{ExecutionContext, Future}
import scala.util.control.NonFatal

final case class StoreTerm(term: String, multiplicity: Int)
final case class InteractiveAction(id: Int, label: String, path: Vector[Int])
final case class InteractiveState(agent: String, abbreviated: String, steps: Int, actions: Vector[InteractiveAction], stale: Boolean)
final case class AutonomousState(agent: String, abbreviated: String, status: String, steps: Int)
final case class DefinitionState(result: String, notice: String)
final case class ModelState(agent: String, formula: String, result: Option[Boolean], status: String, trace: Vector[String], traceAvailable: Boolean, depth: Int)
final case class RuleItem(id: Int, label: String)
final case class RuleState(items: Vector[RuleItem], status: String)
final case class WorkbenchState(workspaceId: String, sequence: Long, storeRevision: Long, store: Vector[StoreTerm], allStore: Vector[StoreTerm], filterActive: Boolean, displayFiltered: Boolean, filter: String, warning: String, interactive: InteractiveState, autonomous: AutonomousState, definitions: DefinitionState, model: ModelState, rules: RuleState, calls: Vector[String])
final case class BridgeFailure(field: String, operation: String, detail: String) extends RuntimeException(detail)

/** Typed boundary: Dynamic JSON is decoded here, never exposed to WorkbenchView.
  * Commands and SSE both carry the same workspace snapshot, never synthetic state.
  */
final class WorkbenchClient(onState: WorkbenchState => Unit, onConnection: (Boolean, String) => Unit)(implicit ec: ExecutionContext) {
  private var id: Option[String] = None
  private var token: Option[String] = None
  private var sequence = -1L
  private var stream: Option[dom.EventSource] = None
  private var timer: Option[Int] = None
  private var generation = 0
  private var closed = false

  private def json(path: String, options: js.Dynamic = js.Dynamic.literal()): Future[js.Dynamic] = {
    options.updateDynamic("signal")(js.Dynamic.global.AbortSignal.timeout(20000))
    js.Dynamic.global.fetch(path, options).asInstanceOf[js.Promise[js.Dynamic]].toFuture.flatMap { response =>
      response.json().asInstanceOf[js.Promise[js.Dynamic]].toFuture.flatMap { data =>
        if (response.ok.asInstanceOf[Boolean]) Future.successful(data)
        else Future.failed(BridgeFailure(str(data,"field"),str(data,"operation"),str(data,"error")))
      }
    }.recoverWith { case e =>
      e match { case _: BridgeFailure => ()
        case _ => onConnection(false,"Moteur Anemone indisponible · " + Option(e.getMessage).getOrElse(e.toString)) }
      Future.failed(e)
    }
  }
  private def csrf(): Future[String] = token.map(Future.successful).getOrElse(json("/api/state").map { d => val t=str(d,"csrfToken");token=Some(t);t })
  private def post(operation: String, fields: Seq[(String,String)] = Nil): Future[js.Dynamic] = {
    val requestedId=id
    csrf().flatMap { t =>
    val body=(Seq("request" -> "1") ++ fields ++ requestedId.toSeq.map("workspaceId" -> _)).map { case (k,v) => js.URIUtils.encodeURIComponent(k)+"="+js.URIUtils.encodeURIComponent(v) }.mkString("&")
    json("/api/workbench/" + operation, js.Dynamic.literal(method="POST",headers=js.Dynamic.literal("Content-Type"->"application/x-www-form-urlencoded","X-SmartStock-Token"->t),body=body))
  }
  }
  private def accept(state: WorkbenchState): WorkbenchState = {
    if (id.forall(_ != state.workspaceId)) { id=Some(state.workspaceId);sequence = -1 }
    if (!closed && state.sequence>sequence) { sequence=state.sequence;onState(state) }
    state
  }
  private def command(operation: String, fields: Seq[(String,String)] = Nil): Future[WorkbenchState] = {
    val born=generation
    post(operation,fields).map(decode).map(s=>if(born==generation)accept(s) else s)
  }
  def open(): Future[WorkbenchState] = {
    closed=false
    val f=if(id.isEmpty)command("create") else command("state")
    f.map { s =>
      if(timer.isEmpty)timer=Some(dom.window.setInterval(() => refresh().recover { case _ => () },3000))
      openStream();onConnection(true,"Vrai moteur · HTTP/SSE");s
    }
  }
  private def openStream(): Unit = if(id.nonEmpty && stream.isEmpty && !closed) {
    val born=generation
    val es=new dom.EventSource("/api/workbench/events?workspaceId="+id.get);stream=Some(es)
    es.addEventListener("state", (event: dom.Event) => if(!closed && born==generation) {
      try { accept(decode(js.JSON.parse(event.asInstanceOf[dom.MessageEvent].data.toString)));onConnection(true,"Vrai moteur · flux Blackboard connecté") }
      catch {case NonFatal(e) => onConnection(false,"Réponse du bridge invalide : "+e.getMessage)}
    })
    es.onerror=(_:dom.Event) => if(!closed && born==generation)onConnection(false,"Flux interrompu · resynchronisation HTTP, aucune simulation")
  }
  private def refresh(): Future[Unit] = if(closed || id.isEmpty)Future.successful(()) else command("state").map { _ => openStream();onConnection(true,"Vrai moteur · contexte synchronisé") }
  def reset(): Future[WorkbenchState] = {
    val release=if(id.isDefined)post("release").map(_=>()).recover {case _=>()} else Future.successful(())
    generation+=1;stream.foreach(_.close());stream=None;id=None;sequence = -1
    release.flatMap { _ => open() }
  }
  def close(): Unit = {closed=true;generation+=1;stream.foreach(_.close());stream=None;timer.foreach(dom.window.clearInterval);timer=None}
  def tell(term: String, multiplicity: String): Future[WorkbenchState] = command("tell",Seq("term"->term,"multiplicity"->multiplicity))
  def get(term: String, multiplicity: String): Future[WorkbenchState] = command("get",Seq("term"->term,"multiplicity"->multiplicity))
  def clear(): Future[WorkbenchState] = command("clear")
  def filter(text: String): Future[WorkbenchState] = command("filter",Seq("filter"->text))
  def unfilter(): Future[WorkbenchState] = command("unfilter")
  def definitions(text: String): Future[WorkbenchState] = command("definitions",Seq("definitions"->text))
  def submitInteractive(agent: String): Future[WorkbenchState] = command("interactive-submit",Seq("agent"->agent))
  def refreshInteractive(): Future[WorkbenchState] = command("interactive-refresh")
  def interactiveStep(actionId: Int): Future[WorkbenchState] = command("interactive-step",Seq("actionId"->actionId.toString))
  def submitAutonomous(agent: String): Future[WorkbenchState] = command("auto-submit",Seq("agent"->agent))
  def next(): Future[WorkbenchState] = command("auto-next")
  def run(steps: String): Future[WorkbenchState] = command("auto-run",Seq("steps"->steps))
  def submitModelAgent(agent: String): Future[WorkbenchState] = command("model-agent",Seq("agent"->agent))
  def submitFormula(formula: String): Future[WorkbenchState] = command("model-formula",Seq("formula"->formula))
  def modelCheck(): Future[WorkbenchState] = command("model-check")
  def simulateTrace(): Future[WorkbenchState] = command("model-trace")
  def refreshRules(): Future[WorkbenchState] = command("rules-refresh")
  def applyRule(id: Int): Future[WorkbenchState] = command("rules-apply",Seq("ruleId"->id.toString))
  def runRules(steps: String): Future[WorkbenchState] = command("rules-run",Seq("steps"->steps))

  private def str(d: js.Dynamic,k: String): String = if(d.selectDynamic(k)==null || js.isUndefined(d.selectDynamic(k))) "" else d.selectDynamic(k).toString
  private def num(d: js.Dynamic,k: String): Int = d.selectDynamic(k).asInstanceOf[Double].toInt
  private def flag(d: js.Dynamic,k: String): Boolean = d.selectDynamic(k).asInstanceOf[Boolean]
  private def array(d: js.Dynamic,k: String): Vector[js.Dynamic] = d.selectDynamic(k).asInstanceOf[js.Array[js.Dynamic]].toVector
  private def terms(d: js.Dynamic,k: String): Vector[StoreTerm] = array(d,k).map(t=>StoreTerm(str(t,"term"),num(t,"multiplicity")))
  private def decode(d: js.Dynamic): WorkbenchState = {
    require(str(d,"source")=="anemone","Source moteur inattendue")
    val i=d.interactive;val a=d.autonomous;val m=d.model
    WorkbenchState(str(d,"workspaceId"),num(d,"sequence").toLong,num(d,"storeRevision").toLong,terms(d,"store"),terms(d,"allStore"),flag(d,"filterActive"),flag(d,"displayFiltered"),str(d,"filter"),str(d,"warning"),
      InteractiveState(str(i,"agent"),str(i,"abbreviated"),num(i,"steps"),array(i,"actions").map(x=>InteractiveAction(num(x,"id"),str(x,"label"),x.path.asInstanceOf[js.Array[Int]].toVector)),flag(i,"stale")),
      AutonomousState(str(a,"agent"),str(a,"abbreviated"),str(a,"status"),num(a,"steps")),DefinitionState(str(d.definitions,"result"),str(d.definitions,"notice")),
      ModelState(str(m,"agent"),str(m,"formula"),if(m.result==null)None else Some(flag(m,"result")),str(m,"status"),m.trace.asInstanceOf[js.Array[String]].toVector,flag(m,"traceAvailable"),num(m,"depth")),
      RuleState(array(d.rules,"items").map(x=>RuleItem(num(x,"id"),str(x,"label"))),str(d.rules,"status")),d.calls.asInstanceOf[js.Array[String]].toVector)
  }
}
