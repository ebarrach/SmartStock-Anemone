package smartstock.anemone;

import ab_blackboard.ABBlackboard;
import ab_data.*;
import ab_parser.*;
import ab_scene.ABSetOfScenes;
import ab_simulators.*;
import scala.Tuple2;
import scala.Tuple3;
import smartstock.state.EventHub;
import smartstock.state.Json;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Thin headless adapter of JLAMP24's interactive blackboard and five native tools.
 * No grammar, executable-step selection, formula evaluation or rule matching lives here.
 * Each workspace lock serializes native operations, including temporary MC exploration.
 */
public final class WorkbenchFacade {
    private final Map<String, Workspace> spaces = new ConcurrentHashMap<>();
    public static final class Failure extends Exception {
        public final Map<String,Object> details;
        Failure(String field, String operation, Throwable cause) {
            super(cause);
            details = map("source","anemone","field",field,"operation",operation,
                "error",cause.toString(),"parserClass",AnimBachSimulParser.class.getName());
        }
    }
    private static final class Workspace {
        final String id = UUID.randomUUID().toString();
        final AnimBachSimulParser parser = new AnimBachSimulParser();
        final ABBlackboard bb = new ABBlackboard();
        final ABSetOfScenes scenes = new ABSetOfScenes();
        final ABRuleSimulExec rules = new ABRuleSimulExec(bb,scenes);
        final EventHub hub = new EventHub();
        AB_AG interactive, annotated, autonomous, modelAgent;
        ABSimulExec interEngine, autoEngine;
        AB_TEMP_FORMULA formula;
        ABSimulCheckLTS checker;
        scala.collection.immutable.List<AB_AG> trace = empty();
        scala.collection.immutable.List<AB_GEN_SPEC_RULE> applicable = empty();
        scala.collection.immutable.List<AB_VAR_SI_ELM> filters = empty();
        final List<Action> actions = new ArrayList<>();
        final List<String> calls = new ArrayList<>();
        boolean filterOn, displayFiltered;
        String filterText = "", warning = "Aucun avertissement", definitions = "", definitionNotice = "";
        String autoStatus = "empty", rulesStatus = "", mcStatus = "Non vérifié";
        Boolean mcResult;
        int autoSteps, interSteps;
        long sequence, storeRevision, actionRevision, traceRevision;
        void call(String method) { calls.add(method); }
    }
    private static final class Action {
        final scala.collection.immutable.List<Object> path;
        final String label;
        Action(scala.collection.immutable.List<Object> path,String label) { this.path=path;this.label=label; }
    }
    @SuppressWarnings("unchecked") private static <T> scala.collection.immutable.List<T> empty() { return (scala.collection.immutable.List<T>) scala.collection.immutable.List$.MODULE$.empty(); }
    private static Map<String,Object> map(Object... kv) {
        Map<String,Object> r=new LinkedHashMap<>();for(int i=0;i<kv.length;i+=2)r.put((String)kv[i],kv[i+1]);return r;
    }
    private Workspace space(String id) {
        Workspace w=spaces.get(id==null?"":id);
        if(w==null)throw new IllegalArgumentException("Espace inconnu : créer un Blackboard interactif.");return w;
    }
    public EventHub hub(String id) { return space(id).hub; }
    public Map<String,Object> command(String operation,Map<String,String> fields) throws Failure {
        String field=fieldFor(operation);
        try {
            if(operation.equals("create")) {
                synchronized(spaces) {
                    if(spaces.size()>=16)throw new IllegalArgumentException("16 espaces maximum ; fermer un espace avant d’en créer un autre.");
                    Workspace w=new Workspace();spaces.put(w.id,w);return publish(w);
                }
            }
            Workspace w=space(fields.get("workspaceId"));
            synchronized(w) {
                w.calls.clear();
                if(operation.equals("release")) { spaces.remove(w.id);return map("released",w.id); }
                execute(w,operation,fields);
                return publish(w);
            }
        } catch(RuntimeException e) { throw new Failure(field,operation,e); }
    }
    private static String fieldFor(String op) {
        if(op.equals("filter"))return "filter";
        if(op.equals("tell")||op.equals("get"))return "term";
        if(op.equals("definitions"))return "definitions";
        if(op.equals("model-formula"))return "formula";
        if(op.startsWith("model-"))return "model";
        if(op.startsWith("rules-"))return "rules";
        if(op.startsWith("interactive-"))return "interactive";
        if(op.startsWith("auto-"))return "autonomous";
        return "workspace";
    }
    private static String source(Map<String,String> f,String key) {
        String s=f.getOrDefault(key,"");if(s.length()>32768)throw new IllegalArgumentException("Source limitée à 32768 caractères.");return s;
    }
    private static int integer(Map<String,String> f,String key,int fallback,int min,int max) {
        int n;
        try { n=Integer.parseInt(f.getOrDefault(key,Integer.toString(fallback))); }
        catch(NumberFormatException e){throw new IllegalArgumentException("Entier requis pour "+key+".");}
        if(n<min||n>max)throw new IllegalArgumentException(key+" : valeur entre "+min+" et "+max+".");return n;
    }
    private void execute(Workspace w,String op,Map<String,String> f) {
        switch(op) {
        case "state": return;
        case "tell": case "get": {
            w.call("AnimBachSimulParser.parse_stinfo");AB_SI_ELM term=w.parser.parse_stinfo(source(f,"term"));
            int n=integer(f,"multiplicity",1,Integer.MIN_VALUE,1000),changed=0;
            for(int i=0;i<n;i++) {w.call("ABBlackboard."+op);if(op.equals("tell")?w.bb.tell(term):w.bb.get(term))changed++;}
            if(changed>0)w.storeRevision++;
            w.displayFiltered=w.filterOn;
            w.warning=op+" : "+Math.max(n,0)+" tentative(s), "+changed+" occurrence(s) modifiée(s).";
            return;
        }
        case "clear": w.call("ABBlackboard.clear_store");w.bb.clear_store();changed(w);return;
        case "filter": {
            w.call("AnimBachSimulParser.parse_var_stinfo");
            scala.collection.immutable.List<AB_VAR_SI_ELM> filters=w.parser.parse_var_stinfo(source(f,"filter"));
            w.filters=filters;w.filterText=source(f,"filter");w.filterOn=true;w.displayFiltered=true;w.warning="Aucun avertissement";return;
        }
        case "unfilter": w.filterOn=false;w.displayFiltered=false;w.warning="Aucun avertissement";return;
        case "definitions": install(w,source(f,"definitions"));return;
        case "interactive-submit": {
            w.call("AnimBachSimulParser.parse_agent");AB_AG a=w.parser.parse_agent(source(f,"agent"));guard(a,w,false,new HashSet<String>());
            ABSimulExec engine=new ABSimulExec(a,w.bb,w.scenes);engine.simulAsType(new AB_INTERACTIVE_SIMUL());
            w.interEngine=engine;w.interactive=a;w.interSteps=0;refreshInteractive(w);return;
        }
        case "interactive-refresh": require(w.interEngine!=null,"Soumettre un agent interactif.");refreshInteractive(w);return;
        case "interactive-step": {
            require(w.interEngine!=null,"Soumettre un agent interactif.");
            require(w.actionRevision==w.storeRevision,"Le store a changé : utiliser Refresh avant de sélectionner une commande.");
            require(!w.actions.isEmpty(),"Aucune commande exécutable : utiliser Refresh ou modifier le store.");
            guard(w.interactive,w,false,new HashSet<String>());
            int i=integer(f,"actionId",-1,0,w.actions.size()-1);
            Action selected=w.actions.get(i);
            w.call("ABSimulExec.run_selected");w.interactive=w.interEngine.run_selected(w.annotated,selected.path);w.interSteps++;
            changed(w);refreshInteractive(w);return;
        }
        case "auto-submit": {
            w.call("AnimBachSimulParser.parse_agent");AB_AG a=w.parser.parse_agent(source(f,"agent"));guard(a,w,false,new HashSet<String>());
            w.autonomous=a;w.autoEngine=new ABSimulExec(a,w.bb,w.scenes);w.autoEngine.simulAsType(new AB_AUTONOMOUS_SIMUL());w.autoSteps=0;w.autoStatus="ready";return;
        }
        case "auto-next": case "auto-run": {
            require(w.autoEngine!=null,"Soumettre un agent autonome.");
            int max=op.equals("auto-next")?1:integer(f,"steps",100,1,100);
            for(int i=0;i<max && !(w.autonomous instanceof AB_AST_Empty_Agent);i++) {
                guard(w.autonomous,w,false,new HashSet<String>());
                w.call("ABSimulExec.run_one");Tuple2<Object,AB_AG> result=w.autoEngine.run_one(w.autonomous);w.autoSteps++;
                if(!(Boolean)result._1()){w.autoStatus="blocked";break;}
                w.autonomous=result._2();changed(w);
                if(w.bb.ab_existRuleUE())drainRules(w,100);
                w.autoStatus=w.autonomous instanceof AB_AST_Empty_Agent?"completed":"paused";
            }
            if(op.equals("auto-run") && w.autoStatus.equals("paused"))w.autoStatus="limit";
            return;
        }
        case "model-agent": w.call("AnimBachSimulParser.parse_agent");{
            AB_AG a=w.parser.parse_agent(source(f,"agent"));guard(a,w,true,new HashSet<String>());w.modelAgent=a;resetModel(w);return;
        }
        case "model-formula": w.call("AnimBachSimulParser.parse_formula");{
            AB_TEMP_FORMULA formula=w.parser.parse_formula(source(f,"formula"));w.formula=formula;resetModel(w);return;
        }
        case "model-check": {
            require(w.modelAgent!=null&&w.formula!=null,"Soumettre l’agent et la formule séparément avant Model Check.");
            guard(w.modelAgent,w,true,new HashSet<String>());
            w.checker=new ABSimulCheckLTS(w.bb,w.scenes);
            scala.collection.immutable.Map<AB_SI_ELM,Object> saved=copyStore(w.bb);
            try {
                w.call("ABSimulCheckLTS.check_lts");
                Tuple3<Object,scala.collection.immutable.List<scala.collection.immutable.List<Object>>,scala.collection.immutable.List<AB_AG>> result=w.checker.check_lts(15,w.modelAgent,w.formula);
                w.mcResult=(Boolean)result._1();w.trace=result._3();w.traceRevision=w.storeRevision;
                w.mcStatus=w.mcResult?"Formula established":"Formula not established";
            } finally {w.bb.set_store(saved);}
            return;
        }
        case "model-trace": {
            require(w.checker!=null&&Boolean.TRUE.equals(w.mcResult)&&!w.trace.isEmpty(),"Aucune trace disponible : lancer Model Check avec une formule atteignable.");
            require(w.trace.size()<=1000,"Trace supérieure à 1000 primitives : simulation refusée.");
            scala.collection.Iterator<AB_AG> it=w.trace.iterator();int done=0,failed=0;
            while(it.hasNext()) {
                AB_AG a=it.next();require(a instanceof AB_AST_Primitive,"Trace native non primitive : adaptation indisponible.");
                AB_AST_Primitive p=(AB_AST_Primitive)a;guard(a,w,true,new HashSet<String>());
                w.call("ABSimulCheckLTS.exec_primitive");if(w.checker.exec_primitive(p.primitive(),p.prim_type()))done++;else failed++;
            }
            changed(w);w.mcStatus="Trace simulée : "+done+" primitive(s) réussie(s), "+failed+" refusée(s).";return;
        }
        case "rules-refresh": refreshRules(w);return;
        case "rules-apply": {
            require(!w.applicable.isEmpty(),"Aucune règle applicable : activer une règle puis utiliser Refresh.");
            int i=integer(f,"ruleId",-1,0,w.applicable.size()-1);
            AB_GEN_SPEC_RULE selected=w.applicable.apply(i);
            // Native UI may retain stale selections; reject one no longer applicable.
            w.call("ABRuleSimulExec.list_executable_rules");
            require(w.rules.list_executable_rules().contains(selected),"Règle devenue inapplicable : utiliser Refresh.");
            applyRule(w,selected);refreshRules(w);w.rulesStatus="Règle appliquée.";return;
        }
        case "rules-run": drainRules(w,integer(f,"steps",100,1,100));return;
        default: throw new IllegalArgumentException("Opération de façade inconnue : "+op);
        }
    }
    private static void require(boolean b,String s) {if(!b)throw new IllegalArgumentException(s);}
    private void changed(Workspace w) {w.storeRevision++;w.displayFiltered=false;w.warning=w.filterOn?"Store complet réaffiché comme dans redisplay_store natif ; filtre conservé pour Tell/Get.":"Aucun avertissement";}
    private void resetModel(Workspace w) {w.mcResult=null;w.mcStatus="Non vérifié";w.trace=empty();w.checker=null;}
    private void refreshInteractive(Workspace w) {
        guard(w.interactive,w,false,new HashSet<String>());
        w.call("ABSimulExec.ag_first_steps");w.annotated=w.interEngine.ag_first_steps(w.interactive,empty());
        w.actions.clear();collect(w.annotated,w.actions);w.actionRevision=w.storeRevision;
    }
    @SuppressWarnings("unchecked") private static void collect(AB_AG a,List<Action> result) {
        if(a instanceof scala.Product) {
            scala.Product p=(scala.Product)a;
            if(a.getClass().getSimpleName().startsWith("AB_Exec_")) {
                Object path=p.productElement(p.productArity()-1);
                if(path instanceof scala.collection.immutable.List)result.add(new Action((scala.collection.immutable.List<Object>)path,a.ab_toString()));return;
            }
            for(int i=0;i<p.productArity();i++)if(p.productElement(i) instanceof AB_AG)collect((AB_AG)p.productElement(i),result);
        }
    }
    /** Capability guard only: stops native GUI side effects / known checker stubs; no evaluation. */
    private static void guard(Object value,Workspace w,boolean model,Set<String> visited) {
        if(value instanceof AB_Prim_Type_Scene || value instanceof AB_Prim_Type_Proc)
            throw new IllegalArgumentException("Primitives scene/processus dynamiques indisponibles : le natif ouvre des fenêtres Java. Les appels de procédure ordinaires restent acceptés.");
        if(model && (value instanceof AB_Prim_Type_Multi || value instanceof AB_Prim_Type_Rule))
            throw new IllegalArgumentException("Model Checker natif : exec_multi_primitive/exec_rule_primitive sont des stubs. Aucun résultat simulé n’est exposé pour ces primitives.");
        if(value instanceof AB_AST_Proc_Call) {
            String name=((AB_AST_Proc_Call)value).pn();
            if(visited.add(name)&&w.bb.procDefined(name))guard(w.bb.procBody(name),w,model,visited);
        }
        if(value instanceof scala.Product) {
            scala.Product p=(scala.Product)value;for(int i=0;i<p.productArity();i++)guard(p.productElement(i),w,model,visited);
        } else if(value instanceof scala.collection.immutable.List) {
            scala.collection.Iterator<?> it=((scala.collection.immutable.List<?>)value).iterator();while(it.hasNext())guard(it.next(),w,model,visited);
        }
    }
    private void refreshRules(Workspace w) {w.call("ABRuleSimulExec.list_executable_rules");w.applicable=w.rules.list_executable_rules();}
    private void applyRule(Workspace w,AB_GEN_SPEC_RULE rule) {
        AB_SPEC_RULE r=(AB_SPEC_RULE)rule;
        scala.collection.Iterator<AB_SIGNED_SI_PN_ELM> it=r.post().iterator();
        while(it.hasNext())require(!(it.next() instanceof AB_SPC_ELM),"Règle avec création de processus Swing : application headless indisponible.");
        w.call("ABRuleSimulExec.exec_rule_selected");w.rules.exec_rule_selected(r);changed(w);
    }
    private void drainRules(Workspace w,int max) {
        Random random=new Random();int done=0;refreshRules(w);
        while(!w.applicable.isEmpty()&&done<max){applyRule(w,w.applicable.apply(random.nextInt(w.applicable.size())));done++;refreshRules(w);}
        w.rulesStatus=done+" règle(s) exécutée(s)"+(w.applicable.isEmpty()?" ; aucune règle applicable.":" ; limite atteinte, Run Rules peut continuer.");
    }
    @SuppressWarnings("unchecked") private void install(Workspace w,String definitions) {
        w.call("AnimBachSimulParser.parse_prgm");scala.Tuple6<Object,Object,Object,Object,Object,Object> d=w.parser.parse_prgm(definitions);
        StringBuilder result=new StringBuilder();
        if(d._1() instanceof scala.collection.immutable.List) {
            scala.collection.immutable.List<AB_SET> l=(scala.collection.immutable.List<AB_SET>)d._1();
            w.call("ABBlackboard.addDecls");w.bb.addDecls(l);result.append("Ensembles\n").append(new PrettyPrinterSetDefns().translate(l));
        }
        if(d._3() instanceof scala.collection.immutable.List) {
            scala.collection.immutable.List<AB_MAP_EQ> l=(scala.collection.immutable.List<AB_MAP_EQ>)d._3();
            w.call("ABBlackboard.addEqns");w.bb.addEqns(l);result.append("Équations\n").append(new PrettyPrinterEqnsDefns().translate((scala.collection.immutable.List)l));
        }
        if(d._4() instanceof scala.collection.immutable.List) {
            scala.collection.immutable.List<AB_SCENE_DEFN> l=(scala.collection.immutable.List<AB_SCENE_DEFN>)d._4();
            w.call("ABSetOfScenes.addSceneDecls");w.scenes.addSceneDecls(l);result.append("Scènes (déclarations, sans fenêtre)\n").append(new PrettyPrinterSceneDefns().translate(l));
        }
        if(d._5() instanceof scala.collection.immutable.List) {
            scala.collection.immutable.List<AB_Abs_Proc> l=(scala.collection.immutable.List<AB_Abs_Proc>)d._5();
            // Definitions may contain ordinary procedure calls; GUI primitives are checked at execution.
            w.call("ABBlackboard.addProcDecls");w.bb.addProcDecls(l);result.append("Procédures\n").append(new PrettyPrinterProcsDefns().translate(l));
        }
        if(d._6() instanceof scala.collection.immutable.List) {
            scala.collection.immutable.List<AB_GEN_RULE> l=(scala.collection.immutable.List<AB_GEN_RULE>)d._6();
            w.call("ABBlackboard.addRuleDecls");w.bb.addRuleDecls(l);result.append("Règles (déclarées ; activer avec tellr)\n").append(new PrettyPrinterRulesDefns().translate(l));
        }
        w.definitionNotice=d._2() instanceof String?"Le mot-clé map est accepté par le parseur natif, sans chargement associé dans l’interface JLAMP24.":"Types natifs : set/eset, map, eqn, scene, proc, rule.";
        w.definitions+=result.length()==0?"Définitions analysées ; aucune déclaration installée.\n":result.toString();
        resetModel(w);
    }
    private static scala.collection.immutable.Map<AB_SI_ELM,Object> copyStore(ABBlackboard bb) {
        scala.collection.immutable.Map<AB_SI_ELM,Object> copy=scala.collection.immutable.Map$.MODULE$.empty();
        scala.collection.Iterator<Tuple2<AB_SI_ELM,Object>> it=bb.storeContents().iterator();while(it.hasNext())copy=copy.$plus(it.next());return copy;
    }
    private static List<Map<String,Object>> terms(scala.collection.mutable.Map<AB_SI_ELM,Object> store) {
        List<Map<String,Object>> rows=new ArrayList<>();scala.collection.Iterator<Tuple2<AB_SI_ELM,Object>> it=store.iterator();
        while(it.hasNext()){Tuple2<AB_SI_ELM,Object> t=it.next();rows.add(map("term",t._1().ab_toString(),"multiplicity",t._2()));}
        rows.sort(Comparator.comparing(r->r.get("term").toString()));return rows;
    }
    private static String ast(AB_AG a) {return a==null?"":a instanceof AB_AST_Empty_Agent?"Empty agent":a.ab_toString();}
    private static String abbreviation(AB_AG a) {
        if(a instanceof AB_AST_SEQ_Agent)return "[ "+abbreviation(((AB_AST_SEQ_Agent)a).agi())+" ]; [ ... ]";
        if(a instanceof AB_AST_PARA_Agent)return "[ "+abbreviation(((AB_AST_PARA_Agent)a).agi())+" ] || [ "+abbreviation(((AB_AST_PARA_Agent)a).agii())+" ]";
        if(a instanceof AB_AST_CHOICE_Agent)return "[ "+abbreviation(((AB_AST_CHOICE_Agent)a).agi())+" ] + [ "+abbreviation(((AB_AST_CHOICE_Agent)a).agii())+" ]";
        return ast(a);
    }
    private Map<String,Object> publish(Workspace w) {
        List<Map<String,Object>> actions=new ArrayList<>();int i=0;
        for(Action a:w.actions){List<Object> path=new ArrayList<>();scala.collection.Iterator<Object> it=a.path.iterator();while(it.hasNext())path.add(it.next());actions.add(map("id",i++,"label",a.label,"path",path));}
        List<Map<String,Object>> rules=new ArrayList<>();i=0;scala.collection.Iterator<AB_GEN_SPEC_RULE> ri=w.applicable.iterator();while(ri.hasNext())rules.add(map("id",i++,"label",ri.next().ab_toString()));
        List<String> trace=new ArrayList<>();scala.collection.Iterator<AB_AG> ti=w.trace.iterator();while(ti.hasNext())trace.add(ti.next().ab_toString());
        if(w.displayFiltered)w.call("ABBlackboard.selectedStoreContents");else w.call("ABBlackboard.storeContents");
        Map<String,Object> s=map("source","anemone","workspaceId",w.id,"sequence",++w.sequence,"storeRevision",w.storeRevision,
            "store",terms(w.displayFiltered?w.bb.selectedStoreContents(w.filters):w.bb.storeContents()),"allStore",terms(w.bb.storeContents()),
            "filterActive",w.filterOn,"displayFiltered",w.displayFiltered,"filter",w.filterText,"warning",w.warning,
            "interactive",map("agent",ast(w.annotated),"abbreviated",abbreviation(w.annotated),"steps",w.interSteps,"actions",actions,"stale",w.actionRevision!=w.storeRevision),
            "autonomous",map("agent",ast(w.autonomous),"abbreviated",abbreviation(w.autonomous),"status",w.autoStatus,"steps",w.autoSteps),
            "definitions",map("result",w.definitions,"notice",w.definitionNotice),
            "model",map("agent",ast(w.modelAgent),"formula",w.formula==null?"":new PrettyPrinterFormula().translate(w.formula),"result",w.mcResult,"status",w.mcStatus,"trace",trace,"traceAvailable",Boolean.TRUE.equals(w.mcResult)&&!trace.isEmpty(),"traceStoreRevision",w.traceRevision,"depth",15),
            "rules",map("items",rules,"status",w.rulesStatus),"calls",new ArrayList<>(w.calls));
        w.hub.publish(new EventHub.Event(w.sequence,Json.encode(s)));return s;
    }
}
