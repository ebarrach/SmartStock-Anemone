enablePlugins(ScalaJSPlugin)
name := "smartstock-anemone-visualizer"
scalaVersion := "2.13.18"
scalaJSUseMainModuleInitializer := true
libraryDependencies += "com.raquo" %%% "laminar" % "17.2.1"
Compile / fastLinkJS / scalaJSLinkerOutputDirectory := baseDirectory.value / "web" / "js" / "scalajs"


scalacOptions ++= Seq("-deprecation", "-feature", "-unchecked")
