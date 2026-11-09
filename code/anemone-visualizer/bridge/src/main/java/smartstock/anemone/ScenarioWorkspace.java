package smartstock.anemone;

import ab_blackboard.ABBlackboard;
import ab_data.*;
import ab_parser.AnimBachSimulParser;
import ab_scene.ABSetOfScenes;
import ab_simulators.ABSimulExec;
import scala.Tuple2;
import java.nio.file.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** User experiments own their parser, AST and Blackboard, never a demo session.
 * Local trusted laboratory: bounds count calls to run_one, not internal recursion.
 */
public final class ScenarioWorkspace {
    private final Path root;
    private final Map<String, Trial> trials = new LinkedHashMap<>();
    public ScenarioWorkspace(Path root) { this.root = root; }
    public static final class ParserFailure extends Exception {
        public final Map<String,Object> details = new LinkedHashMap<>();
        ParserFailure(String phase, RuntimeException cause) {
            super(cause);
            details.put("error", cause.toString());
            details.put("phase", phase);
            details.put("parserClass", AnimBachSimulParser.class.getName());
            details.put("source", "anemone");
        }
    }
    private static final class Trial {
        final AnimBachSimulParser parser = new AnimBachSimulParser();
        final ABBlackboard bb = new ABBlackboard();
        final ABSetOfScenes scenes = new ABSetOfScenes();
        AB_AG ast;
        ABSimulExec engine;
        int steps;
        String status = "ready";
    }
    private String read(String file) throws IOException {
        return new String(Files.readAllBytes(root.resolve(file)), StandardCharsets.UTF_8).trim();
    }
    public List<Map<String,String>> templates() throws IOException {
        List<Map<String,String>> result = new ArrayList<>();
        result.add(template("empty", "Scenario vide", "", ""));
        result.add(template("stock", "Retrait DataMatrix + poids", read("anemone-scenarios/connected/definitions.anemone"),
            "tell(stock(compresse,40));tell(poids_change(compresse));tell(datamatrix_detecte(compresse));" + read("anemone-scenarios/connected/withdrawal.anemone")));
        result.add(template("temperature", "Regulation thermique", read("anemone-scenarios/temperature/definitions.anemone"),
            "tell(temperature(t270));" + read("anemone-scenarios/temperature/regulation.anemone")));
        return result;
    }
    private Map<String,String> template(String id, String label, String definitions, String agent) {
        Map<String,String> row = new LinkedHashMap<>();
        row.put("id", id); row.put("label", label); row.put("definitions", definitions); row.put("agent", agent); return row;
    }
    @SuppressWarnings("unchecked")
    public synchronized Map<String,Object> command(String action, Map<String,String> fields) throws Exception {
        String id = fields.get("sessionId");
        if (id != null) { try { UUID.fromString(id); } catch (RuntimeException e) { throw new IllegalArgumentException("Session UUID requise"); } }
        if (action.equals("release")) {
            if (id == null || trials.remove(id) == null) throw new IllegalArgumentException("Session inconnue");
            Map<String,Object> released = new LinkedHashMap<>(); released.put("released", id); return released;
        }
        if (action.equals("validate")) {
            String definitions = fields.getOrDefault("definitions", ""), agent = fields.getOrDefault("agent", "");
            if (definitions.length() + agent.length() > 32768) throw new IllegalArgumentException("Sources limitees a 32768 caracteres");
            if (id == null && trials.size() >= 16) throw new IllegalArgumentException("16 sessions maximum : reutiliser une session existante");
            if (id != null && !trials.containsKey(id)) throw new IllegalArgumentException("Session inconnue");
            Trial trial = new Trial();
            try {
                if (!definitions.trim().isEmpty()) {
                    scala.Tuple6<Object,Object,Object,Object,Object,Object> defs = trial.parser.parse_prgm(definitions);
                    if (defs._1() instanceof scala.collection.immutable.List) trial.bb.addDecls((scala.collection.immutable.List<AB_SET>) defs._1());
                    if (defs._3() instanceof scala.collection.immutable.List) trial.bb.addEqns((scala.collection.immutable.List<AB_MAP_EQ>) defs._3());
                    if (defs._4() instanceof scala.collection.immutable.List) trial.scenes.addSceneDecls((scala.collection.immutable.List<AB_SCENE_DEFN>) defs._4());
                    if (defs._5() instanceof scala.collection.immutable.List) trial.bb.addProcDecls((scala.collection.immutable.List<AB_Abs_Proc>) defs._5());
                    if (defs._6() instanceof scala.collection.immutable.List) trial.bb.addRuleDecls((scala.collection.immutable.List<AB_GEN_RULE>) defs._6());
                }
            } catch (RuntimeException e) { throw new ParserFailure("definitions", e); }
            try { trial.ast = trial.parser.parse_agent(agent); }
            catch (RuntimeException e) { throw new ParserFailure("agent", e); }
            trial.engine = new ABSimulExec(trial.ast, trial.bb, trial.scenes);
            if (id == null) id = UUID.randomUUID().toString();
            trials.put(id, trial); // Commit only after both parses succeed.
            return snapshot(id, trial);
        }
        if (!action.equals("step") && !action.equals("run")) throw new IllegalArgumentException("Operation inconnue");
        Trial t = trials.get(id);
        if (t == null) throw new IllegalArgumentException("Valider le scenario avant execution");
        int count = 1;
        if (action.equals("run")) {
            try { count = Integer.parseInt(fields.getOrDefault("steps", "16")); }
            catch (NumberFormatException e) { throw new IllegalArgumentException("Nombre de pas entier requis"); }
            if (count < 1 || count > 100) throw new IllegalArgumentException("Sequence bornee : 1 a 100 pas");
        }
        if (t.steps + count > 1000) throw new IllegalArgumentException("Limite de 1000 pas par validation");
        for (int i = 0; i < count && !(t.ast instanceof AB_AST_Empty_Agent); i++) {
            try {
                Tuple2<Object,AB_AG> result = t.engine.run_one(t.ast);
                t.ast = result._2(); t.steps++;
                t.status = !(Boolean) result._1() ? "blocked" : t.ast instanceof AB_AST_Empty_Agent ? "completed" : "paused";
                if (!(Boolean) result._1()) break;
            } catch (RuntimeException e) { t.status = "error"; Map<String,Object> state = snapshot(id,t); state.put("error", e.toString()); return state; }
        }
        return snapshot(id, t);
    }
    private Map<String,Object> snapshot(String id, Trial t) {
        Map<String,Object> s = new LinkedHashMap<>();
        s.put("source", "anemone"); s.put("parserClass", t.parser.getClass().getName());
        s.put("sessionId", id); s.put("executionStatus", t.status); s.put("executionStep", t.steps);
        s.put("remainingAgent", t.ast instanceof AB_AST_Empty_Agent ? "" : t.ast.ab_toString());
        List<Map<String,Object>> rows = new ArrayList<>();
        scala.collection.Iterator<Tuple2<AB_SI_ELM,Object>> it = t.bb.storeContents().iterator();
        while (it.hasNext()) { Tuple2<AB_SI_ELM,Object> e = it.next(); Map<String,Object> r = new LinkedHashMap<>(); r.put("term",e._1().ab_toString()); r.put("multiplicity",e._2()); rows.add(r); }
        rows.sort(Comparator.comparing(r -> r.get("term").toString())); s.put("blackboard", rows); return s;
    }
}
