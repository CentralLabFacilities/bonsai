package de.unibi.citec.clf.bonsai.documentation

import java.nio.file.Files
import java.nio.file.Path
import kotlin.system.exitProcess

/**
 * Fast IntelliJ post-build step.
 *
 * IntelliJ may recreate .class files and therefore remove the generated
 * @SkillDocumentation annotation. This program reads the current JavaDoc/KDoc
 * directly from the module sources and restores the annotation.
 *
 * No Dokka, Maven build, cache or initial installation is required.
 *
 * Arguments:
 *   0: module/project directory
 *   1: compiled classes directory
 */
object SkillDocumentationInjector {

    @JvmStatic
    fun main(args: Array<String>) {
        if (args.size != 2) {
            System.err.println(
                "Usage: SkillDocumentationInjector " +
                        "<projectDir> <classesDir>"
            )
            exitProcess(2)
        }

        val projectDir = Path.of(args[0])
            .toAbsolutePath()
            .normalize()

        val classesDir = Path.of(args[1])
            .toAbsolutePath()
            .normalize()

        if (!Files.isDirectory(projectDir)) {
            System.err.println(
                "Skill documentation injector: " +
                        "project directory does not exist: $projectDir"
            )
            exitProcess(2)
        }

        if (!Files.isDirectory(classesDir)) {
            System.err.println(
                "Skill documentation injector: " +
                        "classes directory does not exist: $classesDir"
            )
            exitProcess(2)
        }

        val sourceDocs =
            SkillDocumentationSupport
                .readSourceDocumentation(projectDir)

        var updated = 0
        var unchanged = 0
        var removed = 0
        var missingClass = 0

        sourceDocs.forEach { doc ->
            val classFile =
                SkillDocumentationSupport.classFileFor(
                    classesDir = classesDir,
                    binaryName = doc.binaryName
                )

            if (!Files.exists(classFile)) {
                missingClass++
                return@forEach
            }

            if (doc.description.isBlank()) {
                if (
                    SkillDocumentationSupport
                        .removeAnnotation(classFile)
                ) {
                    removed++
                } else {
                    unchanged++
                }

                return@forEach
            }

            if (
                SkillDocumentationSupport.ensureAnnotation(
                    classFile = classFile,
                    description = doc.description
                )
            ) {
                updated++
            } else {
                unchanged++
            }
        }

        println(
            "Skill documentation injector: " +
                    "$updated updated, " +
                    "$removed removed, " +
                    "$unchanged unchanged, " +
                    "$missingClass class files skipped."
        )
    }
}
